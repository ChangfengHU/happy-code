/**
 * Copilot CLI Entry Point
 *
 * Main entry point for running the GitHub Copilot CLI agent through Happy CLI.
 * Manages agent lifecycle, session state, and communication with the Happy server.
 */

import { render } from 'ink';
import React from 'react';
import { randomUUID } from 'node:crypto';

import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { initialMachineMetadata } from '@/daemon/run';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { MessageBuffer } from '@/ui/ink/messageBuffer';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { stopCaffeinate } from '@/utils/caffeinate';
import { connectionState } from '@/utils/serverConnectionErrors';
import { setupOfflineReconnection } from '@/utils/setupOfflineReconnection';

import { createCopilotBackend } from '@/agent/factories/copilot';
import type { AgentBackend, AgentMessage } from '@/agent';
import { AgentDisplay } from '@/ui/ink/AgentDisplay';
import type { PermissionMode } from '@/api/types';
import { getUserContentText, getUserContentImages, type UserImageContent } from '@/api/types';

type CopilotMode = {
    permissionMode: PermissionMode;
    model?: string;
};

type QueuedCopilotMessage = {
    text: string;
    images: UserImageContent[];
};

function combineQueuedCopilotMessages(messages: QueuedCopilotMessage[]): QueuedCopilotMessage {
    return {
        text: messages.map((m) => m.text).filter(Boolean).join('\n'),
        images: messages.flatMap((m) => m.images),
    };
}

/**
 * Main entry point for the copilot command with ink UI
 */
export async function runCopilot(opts: {
    credentials: Credentials;
    startedBy?: 'daemon' | 'terminal';
}): Promise<void> {
    const sessionTag = randomUUID();

    // Set backend for offline warnings
    connectionState.setBackend('Copilot');

    const api = await ApiClient.create(opts.credentials);

    //
    // Machine
    //
    const settings = await readSettings();
    const machineId = settings?.machineId;
    if (!machineId) {
        console.error(`[START] No machine ID found in settings.`);
        process.exit(1);
    }
    await api.getOrCreateMachine({
        machineId,
        metadata: initialMachineMetadata
    });

    //
    // Create session
    //
    const { state, metadata } = createSessionMetadata({
        flavor: 'copilot',
        machineId,
        startedBy: opts.startedBy
    });
    const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });

    let session: import('@/api/apiSession').ApiSessionClient;

    const { session: initialSession, reconnectionHandle } = setupOfflineReconnection({
        api,
        sessionTag,
        metadata,
        state,
        response,
        onSessionSwap: (newSession) => {
            session = newSession;
        }
    });
    session = initialSession;

    // Report to daemon
    if (response) {
        try {
            logger.debug(`[START] Reporting session ${response.id} to daemon`);
            const result = await notifyDaemonSessionStarted(response.id, metadata);
            if (result.error) {
                logger.debug(`[START] Failed to report to daemon:`, result.error);
            }
        } catch (error) {
            logger.debug('[START] Failed to report to daemon:', error);
        }
    }

    const messageQueue = new MessageQueue2<CopilotMode, QueuedCopilotMessage>((mode) => hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
    }), null, combineQueuedCopilotMessages);

    // Default permission mode: yolo (as requested)
    let currentPermissionMode: PermissionMode = 'yolo';
    let currentModel: string | undefined = undefined;

    session.onUserMessage((message) => {
        // Resolve permission mode override from message meta
        if (message.meta?.permissionMode) {
            const validModes: PermissionMode[] = ['default', 'read-only', 'safe-yolo', 'yolo'];
            if (validModes.includes(message.meta.permissionMode as PermissionMode)) {
                currentPermissionMode = message.meta.permissionMode as PermissionMode;
            }
        }

        // Resolve model override
        if (message.meta?.model) {
            currentModel = message.meta.model;
        }

        const userText = getUserContentText(message.content);
        const userImages = getUserContentImages(message.content);

        if (!userText.trim() && userImages.length === 0) {
            return;
        }

        const mode: CopilotMode = {
            permissionMode: currentPermissionMode,
            model: currentModel,
        };
        messageQueue.push({ text: userText, images: userImages }, mode);
    });

    let thinking = false;
    session.keepAlive(thinking, 'remote');
    const keepAliveInterval = setInterval(() => {
        session.keepAlive(thinking, 'remote');
    }, 2000);

    let shouldExit = false;
    let isResponseInProgress = false;
    let copilotBackend!: AgentBackend;
    let abortController = new AbortController();

    const sendReady = () => {
        session.sendSessionEvent({ type: 'ready' });
    };

    const emitReadyIfIdle = (): boolean => {
        if (shouldExit) return false;
        if (thinking) return false;
        if (isResponseInProgress) return false;
        if (messageQueue.size() > 0) return false;
        sendReady();
        return true;
    };

    async function handleAbort() {
        logger.debug('[Copilot] Abort requested');
        session.sendAgentMessage('copilot', {
            type: 'turn_aborted',
            id: randomUUID(),
        });
        try {
            abortController.abort();
            messageQueue.reset();
        } catch (error) {
            logger.debug('[Copilot] Error during abort:', error);
        } finally {
            abortController = new AbortController();
        }
    }

    const handleKillSession = async () => {
        logger.debug('[Copilot] Kill session requested');
        await handleAbort();
        try {
            session.updateMetadata((currentMetadata) => ({
                ...currentMetadata,
                lifecycleState: 'archived',
                lifecycleStateSince: Date.now(),
                archivedBy: 'cli',
                archiveReason: 'User terminated'
            }));
            session.sendSessionDeath();
            await session.flush();
            await session.close();
            stopCaffeinate();
            happyServer.stop();
            if (copilotBackend) {
                await copilotBackend.dispose();
            }
            logger.debug('[Copilot] Session termination complete, exiting');
            process.exit(0);
        } catch (error) {
            logger.debug('[Copilot] Error during session termination:', error);
            process.exit(1);
        }
    };

    session.rpcHandlerManager.registerHandler('abort', handleAbort);
    registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);

    //
    // Initialize Ink UI
    //
    const messageBuffer = new MessageBuffer();
    const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
    let inkInstance: ReturnType<typeof render> | null = null;

    if (hasTTY) {
        console.clear();
        const DisplayComponent = () => {
            return React.createElement(AgentDisplay, {
                messageBuffer,
                agent: 'copilot',
                logPath: process.env.DEBUG ? logger.getLogPath() : undefined,
                currentModel: currentModel || 'copilot',
                onExit: async () => {
                    logger.debug('[copilot]: Exiting agent via Ctrl-C');
                    shouldExit = true;
                    await handleAbort();
                }
            });
        };

        inkInstance = render(React.createElement(DisplayComponent), {
            exitOnCtrlC: false,
            patchConsole: false
        });
    }

    if (hasTTY) {
        process.stdin.resume();
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.setEncoding('utf8');
    }

    //
    // Start Happy MCP server and create Copilot backend
    //
    const happyServer = await startHappyServer(session);

    // Create initial Copilot backend
    copilotBackend = await createCopilotBackend({
        cwd: process.cwd(),
        mcpServerUrl: happyServer.url,
        permissionMode: currentPermissionMode,
        model: currentModel,
    });

    function setupCopilotMessageHandler(backend: AgentBackend): void {
        backend.onMessage((msg: AgentMessage) => {
            switch (msg.type) {
                case 'model-output':
                    if (msg.textDelta) {
                        if (!isResponseInProgress) {
                            messageBuffer.removeLastMessage('system');
                            messageBuffer.addMessage(msg.textDelta, 'assistant');
                            isResponseInProgress = true;
                        } else {
                            messageBuffer.updateLastMessage(msg.textDelta, 'assistant');
                        }
                    }
                    break;

                case 'status':
                    if (msg.status === 'running') {
                        thinking = true;
                        session.keepAlive(thinking, 'remote');
                        session.sendAgentMessage('copilot', {
                            type: 'task_started',
                            id: randomUUID(),
                        });
                        messageBuffer.addMessage('Thinking...', 'system');
                    } else if (msg.status === 'idle' || msg.status === 'stopped') {
                        thinking = false;
                        session.keepAlive(thinking, 'remote');
                        isResponseInProgress = false;
                        emitReadyIfIdle();
                    } else if (msg.status === 'error') {
                        thinking = false;
                        session.keepAlive(thinking, 'remote');
                        isResponseInProgress = false;
                        const detail = msg.detail ? String(msg.detail) : 'Unknown error';
                        messageBuffer.addMessage(`Error: ${detail}`, 'status');
                        session.sendAgentMessage('copilot', {
                            type: 'turn_aborted',
                            id: randomUUID(),
                        });
                    }
                    break;

                case 'tool-call': {
                    const toolArgs = msg.args ? JSON.stringify(msg.args).substring(0, 100) : '';
                    messageBuffer.addMessage(`Executing: ${msg.toolName}${toolArgs ? ` ${toolArgs}` : ''}`, 'tool');
                    session.sendAgentMessage('copilot', {
                        type: 'tool-call',
                        name: msg.toolName,
                        callId: msg.callId,
                        input: msg.args,
                        id: randomUUID(),
                    });
                    break;
                }

                case 'tool-result': {
                    session.sendAgentMessage('copilot', {
                        type: 'tool-result',
                        callId: msg.callId,
                        output: msg.result,
                        id: randomUUID(),
                    });
                    break;
                }

                default:
                    logger.debug(`[Copilot] Unhandled message type: ${(msg as any).type}`);
            }
        });
    }

    setupCopilotMessageHandler(copilotBackend);

    // Start the backend session
    await copilotBackend.startSession();

    // Emit ready when idle
    emitReadyIfIdle();

    //
    // Main message processing loop
    //
    while (!shouldExit) {
        const result = await messageQueue.waitForMessagesAndGetAsString(abortController.signal);
        if (!result || shouldExit) break;

        const { message: payload, mode } = result;
        isResponseInProgress = false;
        thinking = true;
        session.keepAlive(thinking, 'remote');

        try {
            session.sendAgentMessage('copilot', {
                type: 'task_started',
                id: randomUUID(),
            });
            messageBuffer.addMessage('Thinking...', 'system');

            await copilotBackend.sendPrompt(randomUUID(), payload.text);

            // Wait for response to complete
            if (copilotBackend.waitForResponseComplete) {
                await copilotBackend.waitForResponseComplete(120000);
            }

        } catch (error: any) {
            if (error?.name === 'AbortError') {
                logger.debug('[Copilot] Message processing aborted');
            } else {
                logger.debug('[Copilot] Error processing message:', error);
                const errorMsg = error instanceof Error ? error.message : String(error);
                messageBuffer.addMessage(`Error: ${errorMsg}`, 'status');
                session.sendAgentMessage('copilot', {
                    type: 'turn_aborted',
                    id: randomUUID(),
                });
            }
        } finally {
            thinking = false;
            session.keepAlive(thinking, 'remote');
            isResponseInProgress = false;
            emitReadyIfIdle();
        }
    }

    // Cleanup
    clearInterval(keepAliveInterval);
    if (reconnectionHandle) {
        reconnectionHandle.cancel();
    }
    if (inkInstance) {
        inkInstance.unmount();
    }
    
    // Reset terminal state
    if (hasTTY) {
        if (process.stdin.isTTY) {
            try { 
                process.stdin.setRawMode(false); 
            } catch { /* ignore */ }
        }
    }
}
