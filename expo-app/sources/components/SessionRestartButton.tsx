import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { RoundButton } from '@/components/RoundButton';
import { useAllMachines } from '@/sync/storage';
import { Session } from '@/sync/storageTypes';
import { t } from '@/text';
import { Modal } from '@/modal';
import { tracking } from '@/track/tracking';
import { reactivateSession, SessionReactivateMode } from '@/utils/sessionReactivation';

export default function SessionRestartButton({ session }: { session: Session }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const activeMachines = useAllMachines();

    if (!session.metadata?.path) {
        return null;
    }

    const handleReactivateWithMode = async (mode: SessionReactivateMode) => {
        setLoading(true);

        try {
            const { sessionId, usedFallback } = await reactivateSession({
                session,
                activeMachines,
                mode,
            });

            if (tracking) {
                tracking.capture('Session Spawned', {
                    from: mode === 'continue-original' ? 'restart_button_continue' : 'restart_button_template',
                });
            }

            if (usedFallback) {
                Modal.alert(
                    t('sessionInfo.reactivateContinueUnavailableTitle'),
                    t('sessionInfo.reactivateContinueUnavailableMessage'),
                    [{
                        text: t('common.ok'),
                        onPress: () => router.replace(`/session/${sessionId}`)
                    }]
                );
                return;
            }

            router.replace(`/session/${sessionId}`);
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : t('newSession.failedToStart');
            Modal.alert(t('common.error'), errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleRestart = async () => {
        Modal.alert(
            t('sessionInfo.reactivateSession'),
            t('sessionInfo.reactivateSessionChooseAction'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('sessionInfo.reactivateContinueOriginal'),
                    onPress: () => void handleReactivateWithMode('continue-original')
                },
                {
                    text: t('sessionInfo.reactivateFromTemplate'),
                    onPress: () => void handleReactivateWithMode('new-from-template')
                }
            ]
        );
    };

    return (
        <View style={{ marginTop: 16, width: '100%', maxWidth: 280 }}>
            <RoundButton
                title={t('sessionInfo.reactivateSession')}
                action={handleRestart}
                loading={loading}
            />
        </View>
    );
}
