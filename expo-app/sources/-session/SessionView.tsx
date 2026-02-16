import { AgentContentView } from '@/components/AgentContentView';
import { AgentInput } from '@/components/AgentInput';
import { getSuggestions } from '@/components/autocomplete/suggestions';
import { ChatHeaderView } from '@/components/ChatHeaderView';
import { ChatList } from '@/components/ChatList';
import { Deferred } from '@/components/Deferred';
import { EmptyMessages } from '@/components/EmptyMessages';
import { RemoteFileSystemPanel } from '@/components/RemoteFileSystemPanel';
import { FileEditor } from '@/components/FileEditor';
import { VoiceAssistantStatusBar } from '@/components/VoiceAssistantStatusBar';
import { useDraft } from '@/hooks/useDraft';
import { Modal } from '@/modal';
import { voiceHooks } from '@/realtime/hooks/voiceHooks';
import { startRealtimeSession, stopRealtimeSession } from '@/realtime/RealtimeSession';
import { gitStatusSync } from '@/sync/gitStatusSync';
import { machineSpawnNewSession, sessionAbort } from '@/sync/ops';
import { storage, useIsDataReady, useLocalSetting, useRealtimeStatus, useSessionMessages, useSessionUsage, useSetting } from '@/sync/storage';
import { useSession } from '@/sync/storage';
import { Session } from '@/sync/storageTypes';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { tracking, trackMessageSent } from '@/track';
import { isRunningOnMac } from '@/utils/platform';
import { useDeviceType, useHeaderHeight, useIsLandscape, useIsTablet } from '@/utils/responsive';
import { formatPathRelativeToHome, getSessionAvatarId, getSessionName, useSessionStatus } from '@/utils/sessionUtils';
import { isVersionSupported, MINIMUM_CLI_VERSION } from '@/utils/versionUtils';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { useMemo } from 'react';
import { ActivityIndicator, Animated, Dimensions, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnistyles } from 'react-native-unistyles';

const resolveAgentType = (flavor?: string | null): 'claude' | 'codex' | 'gemini' => {
    if (flavor === 'codex' || flavor === 'gpt' || flavor === 'openai') return 'codex';
    if (flavor === 'gemini') return 'gemini';
    return 'claude';
};

export const SessionView = React.memo((props: { id: string; switchPath?: string }) => {
    const sessionId = props.id;
    const switchPath = props.switchPath;
    const router = useRouter();
    const session = useSession(sessionId);
    const isDataReady = useIsDataReady();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const headerHeight = useHeaderHeight();
    const realtimeStatus = useRealtimeStatus();
    const isTablet = useIsTablet();

    // Compute header props based on session state
    const headerProps = useMemo(() => {
        if (!isDataReady) {
            // Loading state - show empty header
            return {
                title: '',
                subtitle: undefined,
                avatarId: undefined,
                onAvatarPress: undefined,
                isConnected: false,
                flavor: null
            };
        }

        if (!session) {
            // Deleted state - show deleted message in header
            return {
                title: t('errors.sessionDeleted'),
                subtitle: undefined,
                avatarId: undefined,
                onAvatarPress: undefined,
                isConnected: false,
                flavor: null
            };
        }

        // Normal state - show session info
        const isConnected = session.presence === 'online';
        return {
            title: getSessionName(session),
            subtitle: session.metadata?.path ? formatPathRelativeToHome(session.metadata.path, session.metadata?.homeDir) : undefined,
            avatarId: getSessionAvatarId(session),
            onAvatarPress: () => router.push(`/session/${sessionId}/info`),
            isConnected: isConnected,
            flavor: session.metadata?.flavor || null,
            tintColor: isConnected ? '#000' : '#8E8E93'
        };
    }, [session, isDataReady, sessionId, router]);

    return (
        <>
            {/* Status bar shadow for landscape mode */}
            {isLandscape && deviceType === 'phone' && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: safeArea.top,
                    backgroundColor: theme.colors.surface,
                    zIndex: 1000,
                    shadowColor: theme.colors.shadow.color,
                    shadowOffset: {
                        width: 0,
                        height: 2,
                    },
                    shadowOpacity: theme.colors.shadow.opacity,
                    shadowRadius: 3,
                    elevation: 5,
                }} />
            )}

            {/* Header - always shown on desktop/Mac, hidden in landscape mode only on actual phones */}
            {!(isLandscape && deviceType === 'phone' && Platform.OS !== 'web') && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000
                }}>
                    <ChatHeaderView
                        {...headerProps}
                        onBackPress={() => router.back()}
                    />
                    {/* Voice status bar below header - not on tablet (shown in sidebar) */}
                    {!isTablet && realtimeStatus !== 'disconnected' && (
                        <VoiceAssistantStatusBar variant="full" />
                    )}
                </View>
            )}

            {/* Content based on state */}
            <View style={{
                flex: 1,
                backgroundColor: theme.colors.groupped.background,
                paddingTop: !(isLandscape && deviceType === 'phone' && Platform.OS !== 'web')
                    ? safeArea.top + headerHeight + (!isTablet && realtimeStatus !== 'disconnected' ? 48 : 0)
                    : 0
            }}>
                {!isDataReady ? (
                    // Loading state
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                ) : !session ? (
                    // Deleted state
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="trash-outline" size={48} color={theme.colors.textSecondary} />
                        <Text style={{ color: theme.colors.text, fontSize: 20, marginTop: 16, fontWeight: '600' }}>{t('errors.sessionDeleted')}</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>{t('errors.sessionDeletedDescription')}</Text>
                    </View>
                ) : (
                    // Normal session view
                    <SessionViewLoaded key={sessionId} sessionId={sessionId} session={session} switchPath={switchPath} />
                )}
            </View>
        </>
    );
});


function SessionViewLoaded({ sessionId, session, switchPath }: { sessionId: string, session: Session, switchPath?: string }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const isTablet = useIsTablet();
    const [message, setMessage] = React.useState('');
    const [isSwitchingPath, setIsSwitchingPath] = React.useState(false);
    const realtimeStatus = useRealtimeStatus();
    const { messages, isLoaded } = useSessionMessages(sessionId);
    const acknowledgedCliVersions = useLocalSetting('acknowledgedCliVersions');
    const recentMachinePaths = useSetting('recentMachinePaths');

    // Check if CLI version is outdated and not already acknowledged
    const cliVersion = session.metadata?.version;
    const machineId = session.metadata?.machineId;
    const isCliOutdated = cliVersion && !isVersionSupported(cliVersion, MINIMUM_CLI_VERSION);
    const isAcknowledged = machineId && acknowledgedCliVersions[machineId] === cliVersion;
    const shouldShowCliWarning = isCliOutdated && !isAcknowledged;
    // Get permission mode from session object, default to 'default'
    const permissionMode = session.permissionMode || 'default';
    const isCodexSession = session.metadata?.flavor === 'codex';
    // Get model mode from session object - for Gemini sessions use explicit model, default to gemini-3-pro
    const isGeminiSession = session.metadata?.flavor === 'gemini';
    const modelMode = session.modelMode || (isGeminiSession ? 'gemini-3-pro' : 'default');
    const codexReasoningEffort = session.codexReasoningEffort || 'medium';
    const sessionStatus = useSessionStatus(session);
    const sessionUsage = useSessionUsage(sessionId);
    const alwaysShowContextSize = useSetting('alwaysShowContextSize');
    const experiments = useSetting('experiments');
    const lastHandledSwitchPathRef = React.useRef<string | null>(null);

    // 远程文件系统面板状态
    const [isFilePanelExpanded, setIsFilePanelExpanded] = React.useState(false);
    const [selectedFilePath, setSelectedFilePath] = React.useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = React.useState<string>('');
    const showFilePanel = isTablet || Platform.OS === 'web';

    // Use draft hook for auto-saving message drafts
    const { clearDraft } = useDraft(sessionId, message, setMessage);

    // Handle dismissing CLI version warning
    const handleDismissCliWarning = React.useCallback(() => {
        if (machineId && cliVersion) {
            storage.getState().applyLocalSettings({
                acknowledgedCliVersions: {
                    ...acknowledgedCliVersions,
                    [machineId]: cliVersion
                }
            });
        }
    }, [machineId, cliVersion, acknowledgedCliVersions]);

    // Function to update permission mode
    const updatePermissionMode = React.useCallback((mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'read-only' | 'safe-yolo' | 'yolo') => {
        storage.getState().updateSessionPermissionMode(sessionId, mode);
    }, [sessionId]);

    // Function to update model mode (for Gemini/Codex sessions)
    const updateModelMode = React.useCallback((mode: 'default' | 'gemini-3-pro' | 'gemini-3-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gpt-5.3-codex' | 'gpt-5.2-codex' | 'gpt-5.2' | 'gpt-5.1-codex-max' | 'gpt-5.1-codex-mini') => {
        storage.getState().updateSessionModelMode(sessionId, mode);
    }, [sessionId]);
    const updateCodexReasoningEffort = React.useCallback((effort: 'low' | 'medium' | 'high' | 'xhigh') => {
        storage.getState().updateSessionCodexReasoningEffort(sessionId, effort);
    }, [sessionId]);

    const handleSwitchPath = React.useCallback(async (pathToUse: string) => {
        const machineId = session.metadata?.machineId;
        if (!machineId) {
            Modal.alert(t('common.error'), t('newSession.noMachineSelected'));
            return;
        }

        const trimmedPath = pathToUse.trim();
        if (!trimmedPath) {
            return;
        }

        if (session.metadata?.path === trimmedPath) {
            return;
        }

        setIsSwitchingPath(true);

        const spawnSession = async (approvedNewDirectoryCreation?: boolean): Promise<string | null> => {
            const result = await machineSpawnNewSession({
                machineId,
                directory: trimmedPath,
                approvedNewDirectoryCreation,
                agent: resolveAgentType(session.metadata?.flavor),
                model: session.modelMode && session.modelMode !== 'default' ? session.modelMode : undefined,
                reasoningEffort: isCodexSession ? codexReasoningEffort : undefined
            });

            if (result.type === 'success') {
                return result.sessionId;
            }

            if (result.type === 'requestToApproveDirectoryCreation') {
                const confirmed = await Modal.confirm(
                    t('newSession.directoryDoesNotExist'),
                    t('newSession.createDirectoryConfirm', { directory: result.directory })
                );
                if (confirmed) {
                    return spawnSession(true);
                }
                return null;
            }

            if (result.type === 'error') {
                Modal.alert(t('common.error'), result.errorMessage);
                return null;
            }

            return null;
        };

        try {
            const newSessionId = await spawnSession(false);
            if (newSessionId) {
                const updatedPaths = [
                    { machineId, path: trimmedPath },
                    ...recentMachinePaths.filter(entry => entry.machineId !== machineId)
                ].slice(0, 10);
                sync.applySettings({ recentMachinePaths: updatedPaths });

                if (session.permissionMode) {
                    storage.getState().updateSessionPermissionMode(newSessionId, session.permissionMode);
                }
                if (session.modelMode) {
                    storage.getState().updateSessionModelMode(newSessionId, session.modelMode);
                }
                if (session.codexReasoningEffort) {
                    storage.getState().updateSessionCodexReasoningEffort(newSessionId, session.codexReasoningEffort);
                }

                router.replace(`/session/${newSessionId}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : t('newSession.failedToStart');
            Modal.alert(t('common.error'), message);
        } finally {
            setIsSwitchingPath(false);
        }
    }, [recentMachinePaths, router, session.codexReasoningEffort, session.metadata?.flavor, session.metadata?.machineId, session.metadata?.path, session.modelMode, session.permissionMode]);

    React.useEffect(() => {
        const trimmedPath = typeof switchPath === 'string' ? switchPath.trim() : '';
        if (!trimmedPath) {
            return;
        }
        if (lastHandledSwitchPathRef.current === trimmedPath) {
            return;
        }
        lastHandledSwitchPathRef.current = trimmedPath;

        handleSwitchPath(trimmedPath).finally(() => {
            if (typeof (router as any).setParams === 'function') {
                (router as any).setParams({ path: undefined });
            }
        });
    }, [handleSwitchPath, router, switchPath]);

    // Memoize header-dependent styles to prevent re-renders
    const headerDependentStyles = React.useMemo(() => ({
        contentContainer: {
            flex: 1
        },
        flatListStyle: {
            marginTop: 0 // No marginTop needed since header is handled by parent
        },
    }), []);


    // Handle microphone button press - memoized to prevent button flashing
    const handleMicrophonePress = React.useCallback(async () => {
        if (realtimeStatus === 'connecting') {
            return; // Prevent actions during transitions
        }
        if (realtimeStatus === 'disconnected' || realtimeStatus === 'error') {
            try {
                const initialPrompt = voiceHooks.onVoiceStarted(sessionId);
                await startRealtimeSession(sessionId, initialPrompt);
                tracking?.capture('voice_session_started', { sessionId });
            } catch (error) {
                console.error('Failed to start realtime session:', error);
                Modal.alert(t('common.error'), t('errors.voiceSessionFailed'));
                tracking?.capture('voice_session_error', { error: error instanceof Error ? error.message : 'Unknown error' });
            }
        } else if (realtimeStatus === 'connected') {
            await stopRealtimeSession();
            tracking?.capture('voice_session_stopped');

            // Notify voice assistant about voice session stop
            voiceHooks.onVoiceStopped();
        }
    }, [realtimeStatus, sessionId]);

    // Memoize mic button state to prevent flashing during chat transitions
    const micButtonState = useMemo(() => ({
        onMicPress: handleMicrophonePress,
        isMicActive: realtimeStatus === 'connected' || realtimeStatus === 'connecting'
    }), [handleMicrophonePress, realtimeStatus]);

    // Trigger session visibility and initialize git status sync
    React.useLayoutEffect(() => {

        // Trigger session sync
        sync.onSessionVisible(sessionId);


        // Initialize git status sync for this session
        gitStatusSync.getSync(sessionId);
    }, [sessionId, realtimeStatus]);

    let content = (
        <>
            <Deferred>
                {messages.length > 0 && (
                    <ChatList session={session} />
                )}
            </Deferred>
        </>
    );
    const placeholder = messages.length === 0 ? (
        <>
            {isLoaded ? (
                <EmptyMessages session={session} />
            ) : (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            )}
        </>
    ) : null;

    const canSwitchPath = !!session.metadata?.machineId && !!session.metadata?.path && !isSwitchingPath;
    const displayPath = session.metadata?.path
        ? formatPathRelativeToHome(session.metadata.path, session.metadata?.homeDir)
        : undefined;

    const input = (
        <AgentInput
            placeholder={t('session.inputPlaceholder')}
            value={message}
            onChangeText={setMessage}
            sessionId={sessionId}
            permissionMode={permissionMode}
            onPermissionModeChange={updatePermissionMode}
            modelMode={modelMode as any}
            onModelModeChange={updateModelMode as any}
            reasoningEffort={isCodexSession ? codexReasoningEffort : undefined}
            onReasoningEffortChange={isCodexSession ? updateCodexReasoningEffort : undefined}
            metadata={session.metadata}
            connectionStatus={{
                text: sessionStatus.statusText,
                color: sessionStatus.statusColor,
                dotColor: sessionStatus.statusDotColor,
                isPulsing: sessionStatus.isPulsing
            }}
            onSend={() => {
                if (message.trim()) {
                    setMessage('');
                    clearDraft();
                    sync.sendMessage(sessionId, message);
                    trackMessageSent();
                }
            }}
            onMicPress={micButtonState.onMicPress}
            isMicActive={micButtonState.isMicActive}
            onAbort={() => sessionAbort(sessionId)}
            showAbortButton={sessionStatus.state === 'thinking' || sessionStatus.state === 'waiting'}
            onFileViewerPress={experiments ? () => router.push(`/session/${sessionId}/files`) : undefined}
            currentPath={canSwitchPath ? displayPath : undefined}
            onPathClick={canSwitchPath ? () => {
                router.push(`/session/${sessionId}/pick/path`);
            } : undefined}
            // Autocomplete configuration
            autocompletePrefixes={['@', '/']}
            autocompleteSuggestions={(query) => getSuggestions(sessionId, query)}
            usageData={sessionUsage ? {
                inputTokens: sessionUsage.inputTokens,
                outputTokens: sessionUsage.outputTokens,
                cacheCreation: sessionUsage.cacheCreation,
                cacheRead: sessionUsage.cacheRead,
                contextSize: sessionUsage.contextSize
            } : session.latestUsage ? {
                inputTokens: session.latestUsage.inputTokens,
                outputTokens: session.latestUsage.outputTokens,
                cacheCreation: session.latestUsage.cacheCreation,
                cacheRead: session.latestUsage.cacheRead,
                contextSize: session.latestUsage.contextSize
            } : undefined}
            alwaysShowContextSize={alwaysShowContextSize}
        />
    );


    return (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.groupped.background }}>
            {/* CLI Version Warning Overlay - Subtle centered pill */}
            {shouldShowCliWarning && !(isLandscape && deviceType === 'phone') && (
                <Pressable
                    onPress={handleDismissCliWarning}
                    style={{
                        position: 'absolute',
                        top: 8, // Position at top of content area (padding handled by parent)
                        alignSelf: 'center',
                        backgroundColor: '#FFF3CD',
                        borderRadius: 100, // Fully rounded pill
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        flexDirection: 'row',
                        alignItems: 'center',
                        zIndex: 998, // Below voice bar but above content
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 4,
                        elevation: 4,
                    }}
                >
                    <Ionicons name="warning-outline" size={14} color="#FF9500" style={{ marginRight: 6 }} />
                    <Text style={{
                        fontSize: 12,
                        color: '#856404',
                        fontWeight: '600'
                    }}>
                        {t('sessionInfo.cliVersionOutdated')}
                    </Text>
                    <Ionicons name="close" size={14} color="#856404" style={{ marginLeft: 8 }} />
                </Pressable>
            )}

            {/* Main content area - no padding since header is overlay */}
            <View style={{
                flexBasis: 0,
                flexGrow: 1,
                backgroundColor: theme.colors.groupped.background,
                paddingBottom: safeArea.bottom + ((isRunningOnMac() || Platform.OS === 'web') ? 32 : 0)
            }}>
                <AgentContentView
                    content={content}
                    input={input}
                    placeholder={placeholder}
                />
            </View >

            {/* Back button for landscape phone mode when header is hidden */}
            {
                isLandscape && deviceType === 'phone' && (
                    <Pressable
                        onPress={() => router.back()}
                        style={{
                            position: 'absolute',
                            top: safeArea.top + 8,
                            left: 16,
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: `rgba(${theme.dark ? '28, 23, 28' : '255, 255, 255'}, 0.9)`,
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...Platform.select({
                                ios: {
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 4,
                                },
                                android: {
                                    elevation: 2,
                                }
                            }),
                        }}
                        hitSlop={15}
                    >
                        <Ionicons
                            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                            size={Platform.select({ ios: 28, default: 24 })}
                            color="#000"
                        />
                    </Pressable>
                )
            }

            {/* 远程文件系统面板 - 仅在平板/Web端显示 */}
            {showFilePanel && (
                <>
                    <RemoteFileSystemPanel
                        sessionId={sessionId}
                        workDir={session.metadata?.path || '.'}
                        isExpanded={isFilePanelExpanded}
                        onExpandedChange={setIsFilePanelExpanded}
                        onFileSelect={(path, node) => {
                            setSelectedFilePath(path);
                            setSelectedFileName(node.name);
                        }}
                        panelWidth={280}
                    />

                    {/* 文件编辑器 - 当选择了文件时显示，可拖拽调整宽度 */}
                    {selectedFilePath && (
                        <ResizableFileEditorPanel
                            sessionId={sessionId}
                            filePath={selectedFilePath}
                            fileName={selectedFileName}
                            onClose={() => {
                                setSelectedFilePath(null);
                                setSelectedFileName('');
                            }}
                        />
                    )}
                </>
            )}
        </View>
    )
}

/**
 * ResizableFileEditorPanel - 可拖拽调整宽度的文件编辑器面板
 * 左侧边缘可拖拽，和文件夹面板的拖拽体验一致
 */
function ResizableFileEditorPanel({
    sessionId,
    filePath,
    fileName,
    onClose,
}: {
    sessionId: string;
    filePath: string;
    fileName: string;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const DEFAULT_WIDTH = 480;
    const MIN_WIDTH = 280;

    const screenWidth = Dimensions.get('window').width;
    const maxWidth = screenWidth * 0.6;

    // 宽度状态
    const [currentWidth, setCurrentWidth] = React.useState(DEFAULT_WIDTH);
    const widthRef = React.useRef(DEFAULT_WIDTH);
    const animatedWidth = React.useRef(new Animated.Value(DEFAULT_WIDTH)).current;
    const dragStartWidthRef = React.useRef(0);

    const panResponder = React.useMemo(
        () => PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                // 只有水平移动 > 3px 才开始拖拽
                return Math.abs(gestureState.dx) > 3;
            },
            onPanResponderGrant: () => {
                dragStartWidthRef.current = widthRef.current;
            },
            onPanResponderMove: (_, gestureState) => {
                // 文件编辑器在右侧，向左拖动 (dx < 0) 增加宽度
                const newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, dragStartWidthRef.current - gestureState.dx));
                animatedWidth.setValue(newWidth);
                widthRef.current = newWidth;
            },
            onPanResponderRelease: () => {
                const finalWidth = widthRef.current;
                setCurrentWidth(finalWidth);
            },
        }),
        [maxWidth, animatedWidth]
    );

    return (
        <Animated.View
            style={{
                width: animatedWidth,
                height: '100%',
                borderLeftWidth: 1,
                borderLeftColor: theme.colors.divider,
                overflow: 'hidden',
            }}
        >
            {/* 左侧拖拽调整宽度的手柄 */}
            <View
                {...panResponder.panHandlers}
                style={{
                    position: 'absolute',
                    left: -4,
                    top: 0,
                    bottom: 0,
                    width: 12,
                    zIndex: 100,
                    cursor: 'col-resize' as any,
                }}
            />

            <FileEditor
                sessionId={sessionId}
                filePath={filePath}
                fileName={fileName}
                onClose={onClose}
            />
        </Animated.View>
    );
}
