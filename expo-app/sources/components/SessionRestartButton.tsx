import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { RoundButton } from '@/components/RoundButton';
import { machineSpawnNewSession } from '@/sync/ops';
import { useAllMachines, useAllSessions } from '@/sync/storage';
import { t } from '@/text';
import { Modal } from '@/modal';
import { tracking } from '@/track/tracking';

export default function SessionRestartButton({ session }: { session: any }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const activeMachines = useAllMachines();
    const activeSessions = useAllSessions().filter(s => s.active);

    // Parse path and machineId from metadata
    let directory = '';
    let machineId = '';
    let meta: any = null;

    try {
        if (session.metadata) {
            if (typeof session.metadata === 'string') {
                meta = JSON.parse(session.metadata);
            } else {
                meta = session.metadata;
            }
        }
    } catch (e) {
        // ignore parse error
    }

    if (meta) {
        if (meta.path) directory = meta.path;
        if (meta.machineId) machineId = meta.machineId;
    }

    if (!directory || !machineId) {
        return null;
    }

    const handleRestart = async () => {
        setLoading(true);
        let targetMachineId = machineId;

        try {
            // Check if original machine is active
            const isOriginalActive = activeMachines.some(m => m.id === targetMachineId);

            if (!isOriginalActive) {
                // Fallback 1: Use the most recent active machine
                if (activeMachines.length > 0) {
                    targetMachineId = activeMachines[0].id;
                }
                // Fallback 2: Check active sessions for a valid machine ID
                else {
                    const fallbackSession = activeSessions.find(s => s.metadata && s.metadata.machineId);
                    if (fallbackSession && fallbackSession.metadata && fallbackSession.metadata.machineId) {
                        targetMachineId = fallbackSession.metadata.machineId;
                    } else {
                        const debugInfo = `M:${activeMachines.length}, S:${activeSessions.length}`;
                        Modal.alert(t('common.error'), `No active machines found. Please ensure your terminal is running 'happy'. (${debugInfo})`);
                        setLoading(false);
                        return;
                    }
                }
            }

            const result = await machineSpawnNewSession({
                machineId: targetMachineId,
                directory
            });

            if (result.type === 'success') {
                if (tracking) {
                    tracking.capture('Session Spawned', { from: 'restart_button' });
                }
                router.replace(`/session/${result.sessionId}`);
            } else if (result.type === 'requestToApproveDirectoryCreation') {
                const confirmed = await Modal.confirm(
                    'Confirm',
                    `The directory "${result.directory}" does not exist. Do you want to create it?`
                );

                if (confirmed) {
                    setLoading(true);
                    try {
                        const retryResult = await machineSpawnNewSession({
                            machineId: targetMachineId,
                            directory,
                            approvedNewDirectoryCreation: true
                        });
                        if (retryResult.type === 'success') {
                            if (tracking) {
                                tracking.capture('Session Spawned', { from: 'restart_button_retry' });
                            }
                            router.replace(`/session/${retryResult.sessionId}`);
                        } else if (retryResult.type === 'error') {
                            Modal.alert(t('common.error'), retryResult.errorMessage);
                        }
                    } catch (e) {
                        Modal.alert(t('common.error'), "Failed to create directory and spawn session.");
                    } finally {
                        setLoading(false);
                    }
                } else {
                    setLoading(false);
                }
                return;
            } else if (result.type === 'error') {
                const debugMsg = `${result.errorMessage}\n(Target Machine: ${targetMachineId.substring(0, 8)}...)`;
                Modal.alert(t('common.error'), debugMsg);
            }
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "Failed to restart session.";
            // Add machine ID to error message for debugging
            const debugMsg = `${errorMessage}\n(Target Machine: ${targetMachineId.substring(0, 8)}...)`;
            Modal.alert(t('common.error'), debugMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={{ marginTop: 16, width: '100%', maxWidth: 280 }}>
            <RoundButton
                title={"Reactivate Session"}
                action={handleRestart}
                loading={loading}
            />
        </View>
    );
}
