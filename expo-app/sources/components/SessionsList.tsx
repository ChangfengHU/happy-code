import React from 'react';
import { View, Pressable, FlatList, Platform, ActivityIndicator, TextInput } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Text } from '@/components/StyledText';
import { usePathname } from 'expo-router';
import { SessionListViewItem } from '@/sync/storage';
import { Ionicons } from '@expo/vector-icons';
import { getSessionName, useSessionStatus, getSessionSubtitle, getSessionAvatarId, getSessionModelName } from '@/utils/sessionUtils';
import { Avatar } from './Avatar';
import { ActiveSessionsGroup } from './ActiveSessionsGroup';
import { ActiveSessionsGroupCompact } from './ActiveSessionsGroupCompact';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSetting } from '@/sync/storage';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { Typography } from '@/constants/Typography';
import { Session } from '@/sync/storageTypes';
import { StatusDot } from './StatusDot';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useIsTablet } from '@/utils/responsive';
import { requestReview } from '@/utils/requestReview';
import { UpdateBanner } from './UpdateBanner';
import { layout } from './layout';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { t } from '@/text';
import { useRouter } from 'expo-router';
import { Item } from './Item';
import { ItemGroup } from './ItemGroup';
import { useHappyAction } from '@/hooks/useHappyAction';
import { sessionDelete, sessionKill } from '@/sync/ops';
import { useAllMachines, storage } from '@/sync/storage';
import { HappyError } from '@/utils/errors';
import { Modal } from '@/modal';
import { apiSocket } from '@/sync/apiSocket';
import { sync } from '@/sync/sync';
import { reactivateSession, SessionReactivateMode } from '@/utils/sessionReactivation';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'stretch',
        backgroundColor: theme.colors.groupped.background,
    },
    contentContainer: {
        flex: 1,
        maxWidth: layout.maxWidth,
    },
    headerSection: {
        backgroundColor: theme.colors.groupped.background,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 8,
    },
    headerText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.groupped.sectionTitle,
        letterSpacing: 0.1,
        ...Typography.default('semiBold'),
    },
    projectGroup: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.colors.surface,
    },
    projectGroupTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    projectGroupSubtitle: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    sessionItem: {
        height: 88,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
    },
    sessionItemContainer: {
        marginHorizontal: 16,
        marginBottom: 1,
        overflow: 'hidden',
    },
    sessionItemFirst: {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    sessionItemLast: {
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
    },
    sessionItemSingle: {
        borderRadius: 12,
    },
    sessionItemContainerFirst: {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    sessionItemContainerLast: {
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        marginBottom: 12,
    },
    sessionItemContainerSingle: {
        borderRadius: 12,
        marginBottom: 12,
    },
    sessionItemSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    sessionContent: {
        flex: 1,
        marginLeft: 16,
        justifyContent: 'center',
    },
    sessionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    sessionTitle: {
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
        ...Typography.default('semiBold'),
    },
    sessionTitleConnected: {
        color: theme.colors.text,
    },
    sessionTitleDisconnected: {
        color: theme.colors.textSecondary,
    },
    sessionSubtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginBottom: 4,
        ...Typography.default(),
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusDotContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 16,
        marginTop: 2,
        marginRight: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
        ...Typography.default(),
    },
    avatarContainer: {
        position: 'relative',
        width: 48,
        height: 48,
    },
    draftIconContainer: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    draftIconOverlay: {
        color: theme.colors.textSecondary,
    },
    artifactsSection: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: theme.colors.groupped.background,
    },
    swipeAction: {
        width: 112,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.status.error,
    },
    swipeActionText: {
        marginTop: 4,
        fontSize: 12,
        color: '#FFFFFF',
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
    hoverActionsContainer: {
        position: 'absolute',
        right: 8,
        top: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
        padding: 4,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
        opacity: 0,
        pointerEvents: 'none',
        transitionProperty: 'opacity',
        transitionDuration: '150ms',
        transitionTimingFunction: 'ease-out',
    },
    hoverActionsVisible: {
        opacity: 1,
        pointerEvents: 'auto',
    },
    actionButton: {
        width: 28,
        height: 28,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonPressed: {
        backgroundColor: theme.colors.divider,
    },
    actionButtonDestructive: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    actionButtonDestructivePressed: {
        backgroundColor: 'rgba(239, 68, 68, 0.3)',
    },
    actionButtonIcon: {
        color: theme.colors.textSecondary,
    },
    actionButtonIconDestructive: {
        color: '#ef4444',
    },
    titleInput: {
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
        color: 'inherit',
        padding: 0,
        margin: 0,
        ...Typography.default('semiBold'),
    },
}));

export function SessionsList() {
    const styles = stylesheet;
    const safeArea = useSafeAreaInsets();
    const data = useVisibleSessionListViewData();
    const pathname = usePathname();
    const isTablet = useIsTablet();
    const navigateToSession = useNavigateToSession();
    const compactSessionView = useSetting('compactSessionView');
    const router = useRouter();
    const selectable = isTablet;
    const experiments = useSetting('experiments');
    const dataWithSelected = selectable ? React.useMemo(() => {
        return data?.map(item => ({
            ...item,
            selected: pathname.startsWith(`/session/${item.type === 'session' ? item.session.id : ''}`)
        }));
    }, [data, pathname]) : data;

    // Request review
    React.useEffect(() => {
        if (data && data.length > 0) {
            requestReview();
        }
    }, [data && data.length > 0]);

    // Early return if no data yet
    if (!data) {
        return (
            <View style={styles.container} />
        );
    }

    const keyExtractor = React.useCallback((item: SessionListViewItem & { selected?: boolean }, index: number) => {
        switch (item.type) {
            case 'header': return `header-${item.title}-${index}`;
            case 'active-sessions': return 'active-sessions';
            case 'project-group': return `project-group-${item.machine.id}-${item.displayPath}-${index}`;
            case 'session': return `session-${item.session.id}`;
        }
    }, []);

    const renderItem = React.useCallback(({ item, index }: { item: SessionListViewItem & { selected?: boolean }, index: number }) => {
        switch (item.type) {
            case 'header':
                return (
                    <View style={styles.headerSection}>
                        <Text style={styles.headerText}>
                            {item.title}
                        </Text>
                    </View>
                );

            case 'active-sessions':
                // Extract just the session ID from pathname (e.g., /session/abc123/file -> abc123)
                let selectedId: string | undefined;
                if (isTablet && pathname.startsWith('/session/')) {
                    const parts = pathname.split('/');
                    selectedId = parts[2]; // parts[0] is empty, parts[1] is 'session', parts[2] is the ID
                }

                const ActiveComponent = compactSessionView ? ActiveSessionsGroupCompact : ActiveSessionsGroup;
                return (
                    <ActiveComponent
                        sessions={item.sessions}
                        selectedSessionId={selectedId}
                    />
                );

            case 'project-group':
                return (
                    <View style={styles.projectGroup}>
                        <Text style={styles.projectGroupTitle}>
                            {item.displayPath}
                        </Text>
                        <Text style={styles.projectGroupSubtitle}>
                            {item.machine.metadata?.displayName || item.machine.metadata?.host || item.machine.id}
                        </Text>
                    </View>
                );

            case 'session':
                // Determine card styling based on position within date group
                const prevItem = index > 0 && dataWithSelected ? dataWithSelected[index - 1] : null;
                const nextItem = index < (dataWithSelected?.length || 0) - 1 && dataWithSelected ? dataWithSelected[index + 1] : null;

                const isFirst = prevItem?.type === 'header';
                const isLast = nextItem?.type === 'header' || nextItem == null || nextItem?.type === 'active-sessions';
                const isSingle = isFirst && isLast;

                return (
                    <SessionItem
                        session={item.session}
                        selected={item.selected}
                        isFirst={isFirst}
                        isLast={isLast}
                        isSingle={isSingle}
                    />
                );
        }
    }, [pathname, dataWithSelected, compactSessionView]);


    // Remove this section as we'll use FlatList for all items now


    const HeaderComponent = React.useCallback(() => {
        return (
            <UpdateBanner />
        );
    }, []);

    // Footer removed - all sessions now shown inline

    return (
        <View style={styles.container}>
            <View style={styles.contentContainer}>
                <FlatList
                    data={dataWithSelected}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={{ paddingBottom: safeArea.bottom + 128, maxWidth: layout.maxWidth }}
                    ListHeaderComponent={HeaderComponent}
                />
            </View>
        </View>
    );
}

// Sub-component that handles session message logic
const SessionItem = React.memo(({ session, selected, isFirst, isLast, isSingle }: {
    session: Session;
    selected?: boolean;
    isFirst?: boolean;
    isLast?: boolean;
    isSingle?: boolean;
}) => {
    const styles = stylesheet;
    const sessionStatus = useSessionStatus(session);
    const modelName = getSessionModelName(session);
    const sessionName = getSessionName(session, { withModelPrefix: true });
    const sessionSubtitle = getSessionSubtitle(session);
    const navigateToSession = useNavigateToSession();
    const isTablet = useIsTablet();
    const swipeableRef = React.useRef<Swipeable | null>(null);
    const swipeEnabled = Platform.OS !== 'web';
    const isWeb = Platform.OS === 'web';
    const activeMachines = useAllMachines();

    const [archivingSession, performArchive] = useHappyAction(async () => {
        const result = await sessionKill(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
    });

    const [deletingSession, performDelete] = useHappyAction(async () => {
        const result = await sessionDelete(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToDeleteSession'), false);
        }
    });

    const handleArchive = React.useCallback(() => {
        swipeableRef.current?.close();
        Modal.confirm(
            t('sessionInfo.archiveSession'),
            t('sessionInfo.archiveSessionConfirm'),
            {
                cancelText: t('common.cancel'),
                confirmText: t('sessionInfo.archiveSession'),
                destructive: true
            }
        ).then((confirmed) => {
            if (confirmed) {
                performArchive();
            }
        });
    }, [performArchive]);

    const reactivateModeRef = React.useRef<SessionReactivateMode>('new-from-template');
    const [reactivatingSession, performReactivate] = useHappyAction(async () => {
        try {
            const { sessionId, usedFallback } = await reactivateSession({
                session,
                activeMachines,
                mode: reactivateModeRef.current,
            });

            if (usedFallback) {
                Modal.alert(
                    t('sessionInfo.reactivateContinueUnavailableTitle'),
                    t('sessionInfo.reactivateContinueUnavailableMessage'),
                    [{
                        text: t('common.ok'),
                        onPress: () => navigateToSession(sessionId)
                    }]
                );
                return;
            }

            navigateToSession(sessionId);
        } catch (error) {
            throw new HappyError(
                error instanceof Error ? error.message : t('newSession.failedToStart'),
                false
            );
        }
    });

    const handleReactivate = React.useCallback(() => {
        swipeableRef.current?.close();
        Modal.alert(
            t('sessionInfo.reactivateSession'),
            t('sessionInfo.reactivateSessionChooseAction'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('sessionInfo.reactivateContinueOriginal'),
                    onPress: () => {
                        reactivateModeRef.current = 'continue-original';
                        performReactivate();
                    }
                },
                {
                    text: t('sessionInfo.reactivateFromTemplate'),
                    onPress: () => {
                        reactivateModeRef.current = 'new-from-template';
                        performReactivate();
                    }
                }
            ]
        );
    }, [performReactivate]);

    const handleDelete = React.useCallback(() => {
        swipeableRef.current?.close();
        Modal.confirm(
            t('sessionInfo.deleteSession'),
            t('sessionInfo.deleteSessionWarning'),
            {
                cancelText: t('common.cancel'),
                confirmText: t('sessionInfo.deleteSession'),
                destructive: true
            }
        ).then((confirmed) => {
            if (confirmed) {
                performDelete();
            }
        });
    }, [performDelete]);

    // Hover state for web
    const [isHovered, setIsHovered] = React.useState(false);

    // Renaming state
    const [isRenaming, setIsRenaming] = React.useState(false);
    const [editingName, setEditingName] = React.useState('');
    const inputRef = React.useRef<TextInput>(null);

    // Double click detection
    const lastClickTimeRef = React.useRef(0);
    const DOUBLE_CLICK_DELAY = 300; // ms

    const avatarId = React.useMemo(() => {
        return getSessionAvatarId(session);
    }, [session]);

    // Handle click on title - detect double click for renaming
    const handleTitleClick = React.useCallback(() => {
        if (!isWeb) return;

        const now = Date.now();
        const timeSinceLastClick = now - lastClickTimeRef.current;

        if (timeSinceLastClick < DOUBLE_CLICK_DELAY) {
            // Double click detected
            const currentName = getSessionName(session, { withModelPrefix: false });
            setEditingName(currentName);
            setIsRenaming(true);
            // Focus input after state update
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
            lastClickTimeRef.current = 0; // Reset
        } else {
            // Single click - let it propagate to navigation
            lastClickTimeRef.current = now;
        }
    }, [isWeb, session]);

    // Handle rename save
    const handleRenameSave = React.useCallback(async () => {
        const currentName = getSessionName(session, { withModelPrefix: false });
        if (editingName === currentName) {
            setIsRenaming(false);
            return;
        }

        try {
            const sessionEncryption = sync.encryption.getSessionEncryption(session.id);
            if (!sessionEncryption) {
                throw new Error('Session encryption not found');
            }

            // Get current metadata
            const currentMetadata = session.metadata || {};
            const newMetadata = { ...currentMetadata, name: editingName };

            // Encrypt new metadata
            const encryptedMetadata = await sessionEncryption.encryptRaw(newMetadata);

            // Send update via socket
            const result = await apiSocket.emitWithAck<{
                result: 'success' | 'version-mismatch' | 'error';
                version?: number;
                metadata?: string;
            }>('update-metadata', {
                sid: session.id,
                metadata: encryptedMetadata,
                expectedVersion: session.metadataVersion
            });

            if (result.result === 'success') {
                setIsRenaming(false);
            } else if (result.result === 'version-mismatch') {
                // Version mismatch - the metadata was updated elsewhere
                setIsRenaming(false);
            } else {
                // Error
                setIsRenaming(false);
            }
        } catch (error) {
            console.error('Failed to rename session:', error);
            setIsRenaming(false);
        }
    }, [editingName, session.id, session.metadata, session.metadataVersion]);

    // Handle rename cancel
    const handleRenameCancel = React.useCallback(() => {
        setIsRenaming(false);
        const currentName = getSessionName(session, { withModelPrefix: false });
        setEditingName(currentName);
    }, [session]);

    // Handle key press in input
    const handleKeyPress = React.useCallback((e: any) => {
        if (e.nativeEvent.key === 'Enter') {
            handleRenameSave();
        } else if (e.nativeEvent.key === 'Escape') {
            handleRenameCancel();
        }
    }, [handleRenameSave, handleRenameCancel]);

    const itemContent = (
        <View
            style={[
                styles.sessionItem,
                selected && styles.sessionItemSelected,
                isSingle ? styles.sessionItemSingle :
                    isFirst ? styles.sessionItemFirst :
                        isLast ? styles.sessionItemLast : {},
                isWeb && { position: 'relative' }
            ]}
            onPointerEnter={isWeb ? () => setIsHovered(true) : undefined}
            onPointerLeave={isWeb ? () => setIsHovered(false) : undefined}
        >
            <Pressable
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                onPressIn={() => {
                    if (isRenaming) return;
                    if (isTablet) {
                        navigateToSession(session.id);
                    }
                }}
                onPress={() => {
                    if (isRenaming) return;
                    if (!isTablet) {
                        navigateToSession(session.id);
                    }
                }}
            >
                <View style={styles.avatarContainer}>
                    <Avatar id={avatarId} size={48} monochrome={!sessionStatus.isConnected} flavor={session.metadata?.flavor} />
                    {session.draft && (
                        <View style={styles.draftIconContainer}>
                            <Ionicons
                                name="create-outline"
                                size={12}
                                style={styles.draftIconOverlay}
                            />
                        </View>
                    )}
                </View>
                <View style={styles.sessionContent}>
                    {/* Title line */}
                    <View style={styles.sessionTitleRow}>
                        {isRenaming && isWeb ? (
                            <TextInput
                                ref={inputRef}
                                style={[
                                    styles.titleInput,
                                    sessionStatus.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                                ]}
                                value={editingName}
                                onChangeText={setEditingName}
                                onKeyPress={handleKeyPress}
                                onBlur={handleRenameSave}
                                selectTextOnFocus
                                numberOfLines={1}
                            />
                        ) : (
                            <Pressable
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    handleTitleClick();
                                }}
                                style={({ pressed }) => [
                                    { flex: 1 },
                                    pressed && { opacity: 0.7 }
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.sessionTitle,
                                        sessionStatus.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                                    ]}
                                    numberOfLines={1}
                                >
                                    {sessionName}
                                </Text>
                            </Pressable>
                        )}
                    </View>

                    {/* Subtitle line */}
                    <Text style={styles.sessionSubtitle} numberOfLines={1}>
                        {sessionSubtitle}
                    </Text>

                    {/* Status line with dot */}
                    <View style={styles.statusRow}>
                        <View style={styles.statusDotContainer}>
                            <StatusDot color={sessionStatus.statusDotColor} isPulsing={sessionStatus.isPulsing} />
                        </View>
                        <Text style={[
                            styles.statusText,
                            { color: sessionStatus.statusColor }
                        ]}>
                            {sessionStatus.statusText}
                        </Text>
                    </View>
                </View>
            </Pressable>

            {/* Hover actions for web */}
            {isWeb && (
                <View style={[styles.hoverActionsContainer, isHovered && styles.hoverActionsVisible]}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.actionButton,
                            pressed && styles.actionButtonPressed
                        ]}
                        onPress={session.active ? handleArchive : handleReactivate}
                        disabled={archivingSession || reactivatingSession}
                        hitSlop={4}
                    >
                        {archivingSession || reactivatingSession ? (
                            <ActivityIndicator size="small" color={styles.actionButtonIcon.color} />
                        ) : (
                            <Ionicons
                                name={session.active ? "pause-circle-outline" : "play-outline"}
                                size={16}
                                style={styles.actionButtonIcon}
                            />
                        )}
                    </Pressable>
                    <Pressable
                        style={({ pressed }) => [
                            styles.actionButton,
                            styles.actionButtonDestructive,
                            pressed && styles.actionButtonDestructivePressed
                        ]}
                        onPress={handleDelete}
                        disabled={deletingSession}
                        hitSlop={4}
                    >
                        {deletingSession ? (
                            <ActivityIndicator size="small" color={styles.actionButtonIconDestructive.color} />
                        ) : (
                            <Ionicons
                                name="trash-outline"
                                size={16}
                                style={styles.actionButtonIconDestructive}
                            />
                        )}
                    </Pressable>
                </View>
            )}
        </View>
    );

    const containerStyles = [
        styles.sessionItemContainer,
        isSingle ? styles.sessionItemContainerSingle :
            isFirst ? styles.sessionItemContainerFirst :
                isLast ? styles.sessionItemContainerLast : {}
    ];

    if (!swipeEnabled) {
        return (
            <View style={containerStyles}>
                {itemContent}
            </View>
        );
    }

    const renderRightActions = () => (
        <Pressable
            style={styles.swipeAction}
            onPress={session.active ? handleArchive : handleReactivate}
            disabled={archivingSession || reactivatingSession}
        >
            {archivingSession || reactivatingSession ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
                <Ionicons name={session.active ? "pause-circle-outline" : "play-outline"} size={20} color="#FFFFFF" />
            )}
            <Text style={styles.swipeActionText} numberOfLines={2}>
                {archivingSession || reactivatingSession ? t('common.loading') : (session.active ? t('sessionInfo.archiveSession') : t('sessionInfo.reactivateSession'))}
            </Text>
        </Pressable>
    );

    return (
        <View style={containerStyles}>
            <Swipeable
                ref={swipeableRef}
                renderRightActions={renderRightActions}
                overshootRight={false}
                enabled={!archivingSession}
            >
                {itemContent}
            </Swipeable>
        </View>
    );
});
