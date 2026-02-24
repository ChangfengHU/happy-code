import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@/sync/storageTypes';
import { Avatar } from '@/components/Avatar';
import { getSessionName, getSessionSubtitle, getSessionAvatarId } from '@/utils/sessionUtils';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { useOpenTerminal } from '@/hooks/useOpenTerminal';
import { useUnistyles as useUnistylesImport } from 'react-native-unistyles';

interface SessionCardProps {
    session: Session;
    onPress: (sessionId: string) => void;
    style?: any;
}

const styles = StyleSheet.create((theme) => ({
    sessionCard: {
        backgroundColor: theme.colors.surface,
        paddingVertical: 12,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sessionLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    sessionContent: {
        flex: 1,
        marginLeft: 12,
    },
    sessionTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.text,
        marginBottom: 2,
        ...Typography.default('semiBold'),
    },
    sessionSubtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    actionsContainer: {
        flexDirection: 'row',
        gap: 8,
        marginLeft: 8,
    },
    iconButton: {
        padding: 8,
        borderRadius: 8,
    },
    iconButtonActive: {
        backgroundColor: 'rgba(0, 122, 255, 0.1)',
    },
}));

export const SessionCard: React.FC<SessionCardProps> = ({ session, onPress, style }) => {
    const { theme } = useUnistyles();
    const { open: openTerminal } = useOpenTerminal();
    const [isOpeningTerminal, setIsOpeningTerminal] = React.useState(false);

    const sessionName = getSessionName(session);
    const sessionSubtitle = getSessionSubtitle(session);
    const avatarId = getSessionAvatarId(session);

    const handleOpenTerminal = React.useCallback(async (e: any) => {
        e.stopPropagation();
        setIsOpeningTerminal(true);
        try {
            await openTerminal({
                path: session.metadata?.path,
                shell: session.metadata?.os === 'win32' ? 'pwsh' : 'zsh'
            });
        } catch (error) {
            console.error('Failed to open terminal:', error);
        } finally {
            setIsOpeningTerminal(false);
        }
    }, [session, openTerminal]);

    return (
        <Pressable
            style={[styles.sessionCard, style]}
            onPress={() => onPress(session.id)}
        >
            <View style={styles.sessionLeft}>
                <Avatar id={avatarId} size={48} flavor={session.metadata?.flavor} />
                <View style={styles.sessionContent}>
                    <Text style={styles.sessionTitle} numberOfLines={1}>
                        {sessionName}
                    </Text>
                    <Text style={styles.sessionSubtitle} numberOfLines={1}>
                        {sessionSubtitle}
                    </Text>
                </View>
            </View>

            <View style={styles.actionsContainer}>
                {/* Terminal Icon Button - Open Shell */}
                <Pressable
                    style={[
                        styles.iconButton,
                        isOpeningTerminal && styles.iconButtonActive
                    ]}
                    onPress={handleOpenTerminal}
                    disabled={isOpeningTerminal}
                >
                    <Ionicons
                        name="terminal"
                        size={20}
                        color={isOpeningTerminal ? theme.colors.text : theme.colors.textSecondary}
                    />
                </Pressable>

                {/* Agent Icon - Display as badge */}
                {session.metadata?.flavor && (
                    <View style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: theme.colors.groupped.background,
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}>
                        <Text style={{
                            fontSize: 16,
                            fontWeight: 'bold'
                        }}>
                            {getAgentEmoji(session.metadata.flavor)}
                        </Text>
                    </View>
                )}
            </View>
        </Pressable>
    );
};

function getAgentEmoji(flavor?: string): string {
    if (!flavor) return '🤖';
    
    if (flavor === 'copilot' || flavor === 'github-copilot') return '🤖';
    if (flavor === 'codex' || flavor === 'gpt' || flavor === 'openai') return '⚙️';
    if (flavor === 'gemini') return '✨';
    
    return '🔨'; // claude and default
}
