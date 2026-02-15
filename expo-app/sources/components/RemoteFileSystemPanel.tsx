/**
 * RemoteFileSystemPanel - 远程文件系统侧边面板
 * 可折叠的文件浏览器面板，用于在会话页面右侧显示
 */
import * as React from 'react';
import { View, Pressable, TextInput, Platform, Animated, PanResponder, Dimensions } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Octicons, Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { FileTreeView } from '@/components/FileTreeView';
import { Typography } from '@/constants/Typography';
import { sessionListDirectory, sessionRipgrep, type TreeNode } from '@/sync/ops';
import { t } from '@/text';
import { GitPanel } from '@/components/GitPanel';

interface RemoteFileSystemPanelProps {
    /** 会话 ID */
    sessionId: string;
    /** 工作目录路径 */
    workDir: string;
    /** 是否展开 */
    isExpanded?: boolean;
    /** 展开状态变化回调 */
    onExpandedChange?: (expanded: boolean) => void;
    /** 文件选择回调 */
    onFileSelect?: (path: string, node: TreeNode) => void;
    /** 面板宽度 */
    panelWidth?: number;
}

interface SearchResult {
    path: string;
    line: number;
    text: string;
}

/**
 * RemoteFileSystemPanel 主组件
 */
export const RemoteFileSystemPanel = React.memo(({
    sessionId,
    workDir,
    isExpanded = true,
    onExpandedChange,
    onFileSelect,
    panelWidth = 320,
}: RemoteFileSystemPanelProps) => {
    const { theme } = useUnistyles();

    // 状态管理
    const [tree, setTree] = React.useState<TreeNode | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [loadingPaths, setLoadingPaths] = React.useState<Set<string>>(new Set());
    const [error, setError] = React.useState<string | null>(null);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);
    const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
    const [activeTab, setActiveTab] = React.useState<'files' | 'search' | 'git'>('files');
    const [currentWidth, setCurrentWidth] = React.useState(panelWidth);
    const widthRef = React.useRef(panelWidth);

    // 动画值
    const animatedWidth = React.useRef(new Animated.Value(panelWidth)).current;

    // 同步外部宽度变化
    React.useEffect(() => {
        if (isExpanded) {
            animatedWidth.setValue(panelWidth);
            widthRef.current = panelWidth;
            setCurrentWidth(panelWidth);
        }
    }, [panelWidth]);

    // 处理展开/收起
    React.useEffect(() => {
        Animated.timing(animatedWidth, {
            toValue: isExpanded ? currentWidth : 0,
            duration: 200,
            useNativeDriver: false,
        }).start();
    }, [isExpanded]); // 移除 activeWidth 依赖，避免循环

    const screenWidth = Dimensions.get('window').width;

    // 使用 Ref 存储拖拽起始宽度，避免闭包捕获过期 state
    const dragStartWidthRef = React.useRef(0);

    const panResponder = React.useMemo(
        () => PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                // 只有水平移动 > 3px 才开始拖拽，避免误触
                return Math.abs(gestureState.dx) > 3;
            },
            onPanResponderGrant: () => {
                // 以当前 Ref 中的真实宽度为基准（不依赖 state）
                dragStartWidthRef.current = widthRef.current;
            },
            onPanResponderMove: (_, gestureState) => {
                // 面板在右侧，向左拖动 (dx < 0) 增加宽度
                const maxWidth = screenWidth * 0.85;
                const minWidth = 200;
                // 基于拖拽起始宽度计算，不依赖 state
                const newWidth = Math.max(minWidth, Math.min(maxWidth, dragStartWidthRef.current - gestureState.dx));
                animatedWidth.setValue(newWidth);
                // 实时更新 Ref，确保连续拖拽的一致性
                widthRef.current = newWidth;
            },
            onPanResponderRelease: () => {
                // 拖拽结束，同步 Ref 中的最终宽度到 State
                const finalWidth = widthRef.current;
                setCurrentWidth(finalWidth);
            },
        }),
        [screenWidth] // 只在屏幕宽度变化时重建
    );

    // 更新树结构的辅助函数
    const updateTreeWithChildren = React.useCallback((root: TreeNode, path: string, children: TreeNode[]): TreeNode => {
        if (root.path === path) {
            return { ...root, children };
        }
        if (root.children) {
            return {
                ...root,
                children: root.children.map(c => updateTreeWithChildren(c, path, children))
            };
        }
        return root;
    }, []);

    // 加载目录内容
    const loadDirectoryTree = React.useCallback(async () => {
        if (!sessionId || !workDir) return;

        setIsLoading(true);
        setError(null);

        try {
            // 使用 sessionListDirectory 加载根目录
            const response = await sessionListDirectory(sessionId, workDir);

            // 增加 null 防御检查
            if (!response) {
                setError('服务器返回数据为空，请检查连接');
                return;
            }

            if (response.success && response.entries) {
                const rootNode: TreeNode = {
                    name: workDir === '/' ? '/' : workDir.split('/').pop() || workDir,
                    path: workDir,
                    type: 'directory',
                    children: response.entries.map(entry => ({
                        name: entry.name,
                        path: `${workDir === '/' ? '' : workDir}/${entry.name}`,
                        type: entry.type === 'directory' ? 'directory' : 'file',
                        size: entry.size,
                        modified: entry.modified,
                        children: entry.type === 'directory' ? [] : undefined
                    }))
                };
                setTree(rootNode);
            } else {
                setError(response.error || '加载目录失败');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载目录失败');
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, workDir]);

    // 处理文件夹展开
    const handleDirectoryToggle = React.useCallback(async (node: TreeNode, isExpanded: boolean) => {
        if (!isExpanded || (node.children && node.children.length > 0)) return;

        setLoadingPaths(prev => {
            const newSet = new Set(prev);
            newSet.add(node.path);
            return newSet;
        });

        try {
            const response = await sessionListDirectory(sessionId, node.path);

            if (response && response.success && response.entries) {
                const children: TreeNode[] = response.entries.map(entry => ({
                    name: entry.name,
                    path: `${node.path === '/' ? '' : node.path}/${entry.name}`,
                    type: entry.type === 'directory' ? 'directory' : 'file',
                    size: entry.size,
                    modified: entry.modified,
                    children: entry.type === 'directory' ? [] : undefined
                }));

                setTree(currentTree => {
                    if (!currentTree) return null;
                    return updateTreeWithChildren(currentTree, node.path, children);
                });
            }
        } catch (err) {
            console.error('Failed to load subdirectories:', err);
        } finally {
            setLoadingPaths(prev => {
                const newSet = new Set(prev);
                newSet.delete(node.path);
                return newSet;
            });
        }
    }, [sessionId, updateTreeWithChildren]);

    // 初始加载
    React.useEffect(() => {
        if (isExpanded && !tree) {
            loadDirectoryTree();
        }
    }, [isExpanded, tree, loadDirectoryTree]);

    // 搜索文件
    const handleSearch = React.useCallback(async () => {
        if (!searchQuery.trim() || !sessionId) return;

        setIsSearching(true);
        setSearchResults([]);

        try {
            const response = await sessionRipgrep(
                sessionId,
                ['-l', '--max-count=50', searchQuery],
                workDir
            );

            if (response.success && response.stdout) {
                const paths = response.stdout.split('\n').filter(Boolean);
                setSearchResults(paths.map(path => ({
                    path,
                    line: 0,
                    text: '',
                })));
            }
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, sessionId, workDir]);

    // 搜索输入防抖
    React.useEffect(() => {
        if (activeTab !== 'search' || !searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const timer = setTimeout(handleSearch, 500);
        return () => clearTimeout(timer);
    }, [searchQuery, activeTab, handleSearch]);

    // 处理文件选择
    const handleFileSelect = React.useCallback((node: TreeNode) => {
        setSelectedPath(node.path);
        onFileSelect?.(node.path, node);
    }, [onFileSelect]);

    // 处理搜索结果点击
    const handleSearchResultPress = React.useCallback((result: SearchResult) => {
        setSelectedPath(result.path);
        onFileSelect?.(result.path, {
            name: result.path.split('/').pop() || result.path,
            path: result.path,
            type: 'file',
        });
    }, [onFileSelect]);

    // 切换展开状态
    const toggleExpanded = React.useCallback(() => {
        onExpandedChange?.(!isExpanded);
    }, [isExpanded, onExpandedChange]);

    // 刷新目录
    const handleRefresh = React.useCallback(() => {
        setTree(null);
        loadDirectoryTree();
    }, [loadDirectoryTree]);

    // 收起状态 - 只显示边缘按钮
    if (!isExpanded) {
        return (
            <Pressable
                onPress={toggleExpanded}
                style={[
                    styles.collapsedButton,
                    { backgroundColor: theme.colors.surfaceHigh },
                ]}
            >
                <Ionicons name="folder-outline" size={20} color={theme.colors.textSecondary} />
            </Pressable>
        );
    }

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    width: animatedWidth,
                    backgroundColor: theme.colors.groupped.background,
                    borderLeftWidth: 1,
                    borderLeftColor: theme.colors.divider,
                },
            ]}
        >
            {/* 拖拽调整大小的手柄 */}
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

            {/* 头部 */}
            <View style={[styles.header, { borderBottomColor: theme.colors.divider }]}>
                <View style={styles.headerTitle}>
                    <Octicons name="file-directory" size={16} color={theme.colors.textLink} />
                    <Text style={[styles.headerText, { color: theme.colors.text }]}>
                        {t('remoteFs.title')}
                    </Text>
                </View>
                <View style={styles.headerActions}>
                    <Pressable onPress={handleRefresh} style={styles.headerButton} hitSlop={8}>
                        <Ionicons name="refresh" size={18} color={theme.colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={toggleExpanded} style={styles.headerButton} hitSlop={8}>
                        <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
            </View>

            {/* Tab 栏 */}
            <View style={[styles.tabBar, { borderBottomColor: theme.colors.divider }]}>
                <Pressable
                    onPress={() => setActiveTab('files')}
                    style={[
                        styles.tab,
                        activeTab === 'files' && { borderBottomColor: theme.colors.textLink },
                    ]}
                >
                    <Text
                        style={[
                            styles.tabText,
                            { color: activeTab === 'files' ? theme.colors.textLink : theme.colors.textSecondary },
                        ]}
                    >
                        {t('remoteFs.files')}
                    </Text>
                </Pressable>
                <Pressable
                    onPress={() => setActiveTab('search')}
                    style={[
                        styles.tab,
                        activeTab === 'search' && { borderBottomColor: theme.colors.textLink },
                    ]}
                >
                    <Text
                        style={[
                            styles.tabText,
                            { color: activeTab === 'search' ? theme.colors.textLink : theme.colors.textSecondary },
                        ]}
                    >
                        {t('remoteFs.search')}
                    </Text>
                </Pressable>
                <Pressable
                    onPress={() => setActiveTab('git')}
                    style={[
                        styles.tab,
                        activeTab === 'git' && { borderBottomColor: theme.colors.textLink },
                    ]}
                >
                    <Octicons
                        name="git-branch"
                        size={14}
                        color={activeTab === 'git' ? theme.colors.textLink : theme.colors.textSecondary}
                        style={{ marginRight: 4 }}
                    />
                    <Text
                        style={[
                            styles.tabText,
                            { color: activeTab === 'git' ? theme.colors.textLink : theme.colors.textSecondary },
                        ]}
                    >
                        Git
                    </Text>
                </Pressable>
            </View>

            {/* 搜索框（仅在搜索 Tab 显示） */}
            {activeTab === 'search' && (
                <View style={[styles.searchContainer, { borderBottomColor: theme.colors.divider }]}>
                    <View style={[styles.searchInput, { backgroundColor: theme.colors.input.background }]}>
                        <Octicons name="search" size={14} color={theme.colors.textSecondary} />
                        <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder={t('remoteFs.searchPlaceholder')}
                            placeholderTextColor={theme.colors.input.placeholder}
                            style={[styles.searchTextInput, { color: theme.colors.text }]}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="search"
                            onSubmitEditing={handleSearch}
                        />
                        {searchQuery.length > 0 && (
                            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                                <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
                            </Pressable>
                        )}
                    </View>
                </View>
            )}

            {/* 内容区域 */}
            <View style={styles.content}>
                {activeTab === 'files' ? (
                    error ? (
                        <View style={styles.errorContainer}>
                            <Octicons name="alert" size={24} color={theme.colors.deleteAction} />
                            <Text style={[styles.errorText, { color: theme.colors.deleteAction }]}>
                                {error}
                            </Text>
                            <Pressable
                                onPress={handleRefresh}
                                style={[styles.retryButton, { backgroundColor: theme.colors.textLink }]}
                            >
                                <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <FileTreeView
                            tree={tree}
                            isLoading={isLoading}
                            loadingPaths={loadingPaths}
                            selectedPath={selectedPath}
                            onFileSelect={handleFileSelect}
                            onDirectoryToggle={handleDirectoryToggle}
                            initialExpandedPaths={tree ? [tree.path] : []}
                            maxDepth={10}
                        />
                    )
                ) : activeTab === 'search' ? (
                    // 搜索结果
                    <View style={styles.searchResults}>
                        {isSearching ? (
                            <View style={styles.loadingContainer}>
                                <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
                                    {t('remoteFs.searching')}
                                </Text>
                            </View>
                        ) : searchResults.length === 0 && searchQuery ? (
                            <View style={styles.emptyContainer}>
                                <Octicons name="search" size={24} color={theme.colors.textSecondary} />
                                <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                                    {t('remoteFs.noResults')}
                                </Text>
                            </View>
                        ) : (
                            searchResults.map((result, index) => (
                                <Pressable
                                    key={`${result.path}-${index}`}
                                    onPress={() => handleSearchResultPress(result)}
                                    style={[
                                        styles.searchResultItem,
                                        selectedPath === result.path && { backgroundColor: theme.colors.textLink + '20' },
                                    ]}
                                >
                                    <Octicons name="file" size={14} color={theme.colors.textSecondary} />
                                    <Text
                                        style={[styles.searchResultText, { color: theme.colors.text }]}
                                        numberOfLines={1}
                                        ellipsizeMode="middle"
                                    >
                                        {result.path.replace(workDir + '/', '')}
                                    </Text>
                                </Pressable>
                            ))
                        )}
                    </View>
                ) : (
                    // Git Panel
                    <GitPanel
                        sessionId={sessionId}
                        workDir={workDir}
                    />
                )}
            </View>
        </Animated.View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        height: '100%',
        overflow: 'hidden',
    },
    collapsedButton: {
        position: 'absolute',
        right: 0,
        top: 20,
        padding: 8,
        borderTopLeftRadius: 8,
        borderBottomLeftRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: -2, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
        zIndex: 100,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    headerTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerText: {
        fontSize: 14,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerButton: {
        padding: 4,
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    tab: {
        paddingVertical: 10,
        marginRight: 20,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    searchContainer: {
        padding: 12,
        borderBottomWidth: 1,
    },
    searchInput: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        gap: 8,
    },
    searchTextInput: {
        flex: 1,
        fontSize: 13,
        padding: 0,
        height: 20,
    },
    content: {
        flex: 1,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        gap: 16,
    },
    errorText: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        ...Typography.default(),
    },
    retryButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    searchResults: {
        flex: 1,
    },
    loadingContainer: {
        padding: 24,
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 13,
        ...Typography.default(),
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        gap: 12,
        opacity: 0.5,
    },
    emptyText: {
        fontSize: 14,
        ...Typography.default(),
    },
    searchResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 10,
    },
    searchResultText: {
        fontSize: 13,
        flex: 1,
        ...Typography.default(),
    },
}));
