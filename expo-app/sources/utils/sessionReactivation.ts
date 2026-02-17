import { apiSocket } from '@/sync/apiSocket';
import { machineSpawnNewSession } from '@/sync/ops';
import { storage } from '@/sync/storage';
import { Machine, Session } from '@/sync/storageTypes';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { Modal } from '@/modal';
import { delay } from '@/utils/time';

export type SessionReactivateMode = 'continue-original' | 'new-from-template';

export function resolveSessionAgentType(flavor?: string | null): 'claude' | 'codex' | 'gemini' {
    if (flavor === 'codex' || flavor === 'gpt' || flavor === 'openai') {
        return 'codex';
    }
    if (flavor === 'gemini') {
        return 'gemini';
    }
    return 'claude';
}

export function canContinueOriginalSession(session: Session): boolean {
    const agent = resolveSessionAgentType(session.metadata?.flavor);
    if (agent === 'claude') {
        return Boolean(session.metadata?.claudeSessionId);
    }
    if (agent === 'codex') {
        return Boolean(session.metadata?.codexSessionId);
    }
    return false;
}

function resolveResumeSessionId(session: Session): string | undefined {
    const agent = resolveSessionAgentType(session.metadata?.flavor);
    if (agent === 'claude') {
        return session.metadata?.claudeSessionId;
    }
    if (agent === 'codex') {
        return session.metadata?.codexSessionId;
    }
    return undefined;
}

async function copySessionNameToNewSession(sourceSession: Session, newSessionId: string): Promise<void> {
    const sourceName = sourceSession.metadata?.name?.trim();
    if (!sourceName) {
        return;
    }

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const targetSession = storage.getState().sessions[newSessionId];
        const sessionEncryption = sync.encryption.getSessionEncryption(newSessionId);

        if (!targetSession || !sessionEncryption) {
            try {
                await sync.refreshSessions();
            } catch {
                // best effort
            }
            await delay(120);
            continue;
        }

        const nextMetadata = {
            ...(targetSession.metadata || {}),
            name: sourceName,
        };

        const encryptedMetadata = await sessionEncryption.encryptRaw(nextMetadata);
        const result = await apiSocket.emitWithAck<{
            result: 'success' | 'version-mismatch' | 'error';
        }>('update-metadata', {
            sid: newSessionId,
            metadata: encryptedMetadata,
            expectedVersion: targetSession.metadataVersion,
        });

        if (result.result === 'success') {
            return;
        }
        if (result.result === 'error') {
            return;
        }

        // Version mismatch: refresh and retry with the newest metadata version.
        try {
            await sync.refreshSessions();
        } catch {
            // best effort
        }
        await delay(120);
    }
}

function applyLocalSessionPreferences(sourceSession: Session, newSessionId: string): void {
    if (sourceSession.permissionMode) {
        storage.getState().updateSessionPermissionMode(newSessionId, sourceSession.permissionMode);
    }
    if (sourceSession.modelMode) {
        storage.getState().updateSessionModelMode(newSessionId, sourceSession.modelMode);
    }
    if (sourceSession.codexReasoningEffort) {
        storage.getState().updateSessionCodexReasoningEffort(newSessionId, sourceSession.codexReasoningEffort);
    }
}

function copySessionHistoryToNewSession(sourceSessionId: string, newSessionId: string): void {
    storage.getState().copySessionMessagesForReactivation(sourceSessionId, newSessionId);
}

export async function reactivateSession({
    session,
    activeMachines,
    mode,
}: {
    session: Session;
    activeMachines: Machine[];
    mode: SessionReactivateMode;
}): Promise<{ sessionId: string; usedFallback: boolean }> {
    const directory = session.metadata?.path;
    const sourceMachineId = session.metadata?.machineId;
    let targetMachineId = sourceMachineId;

    if (!directory) {
        throw new Error(t('newSession.noPathSelected'));
    }

    if (!targetMachineId) {
        if (activeMachines.length === 0) {
            throw new Error(t('newSession.noMachinesFound'));
        }
        targetMachineId = activeMachines[0].id;
    }

    if (sourceMachineId) {
        const isOriginalMachineActive = activeMachines.some((machine) => machine.id === sourceMachineId);
        if (!isOriginalMachineActive) {
            if (activeMachines.length === 0) {
                throw new Error(t('newSession.noMachinesFound'));
            }
            targetMachineId = activeMachines[0].id;
        }
    }

    const machineChanged = targetMachineId !== sourceMachineId;
    const agent = resolveSessionAgentType(session.metadata?.flavor);
    let usedFallback = false;
    let resumeSessionId: string | undefined;

    if (mode === 'continue-original') {
        if (!machineChanged && canContinueOriginalSession(session)) {
            resumeSessionId = resolveResumeSessionId(session);
        } else {
            usedFallback = true;
        }
    }

    const spawnSession = async (approvedNewDirectoryCreation: boolean): Promise<string | null> => {
        const result = await machineSpawnNewSession({
            machineId: targetMachineId,
            directory,
            approvedNewDirectoryCreation,
            agent,
            model: session.modelMode && session.modelMode !== 'default' ? session.modelMode : undefined,
            reasoningEffort: agent === 'codex' ? (session.codexReasoningEffort || undefined) : undefined,
            resumeSessionId,
        });

        if (result.type === 'success') {
            return result.sessionId;
        }

        if (result.type === 'requestToApproveDirectoryCreation') {
            const confirmed = await Modal.confirm(
                t('newSession.directoryDoesNotExist'),
                t('newSession.createDirectoryConfirm', { directory: result.directory }),
                {
                    cancelText: t('common.cancel'),
                    confirmText: t('common.create'),
                }
            );

            if (!confirmed) {
                return null;
            }

            return spawnSession(true);
        }

        if (result.type === 'error') {
            throw new Error(result.errorMessage);
        }

        return null;
    };

    const newSessionId = await spawnSession(false);
    if (!newSessionId) {
        throw new Error(t('newSession.failedToStart'));
    }

    try {
        await sync.refreshSessions();
    } catch {
        // Best effort: local preference copy can still succeed if the session is already in state.
    }

    applyLocalSessionPreferences(session, newSessionId);
    if (resumeSessionId) {
        copySessionHistoryToNewSession(session.id, newSessionId);
    }
    await copySessionNameToNewSession(session, newSessionId);

    return { sessionId: newSessionId, usedFallback };
}
