/**
 * FileTreeView - 递归目录树组件
 * 用于显示远程文件系统的目录结构
 */
import * as React from 'react';
import { View, Pressable, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Octicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { FileIcon } from '@/components/FileIcon';
import { Typography } from '@/constants/Typography';
import type { TreeNode } from '@/sync/ops';

interface FileTreeViewProps {
    /** 目录树数据 */
    tree: TreeNode | null;
    /** 是否正在加载根节点 */
    isLoading?: boolean;
    /** 正在加载子目录的路径集合 */
    loadingPaths?: Set<string>;
    /** 当前选中的文件路径 */
    selectedPath?: string | null;
    /** 文件点击回调 */
    onFileSelect?: (node: TreeNode) => void;
    /** 文件长按回调（用于显示上下文菜单） */
    onFileLongPress?: (node: TreeNode) => void;
    /** 目录展开/折叠回调 */
    onDirectoryToggle?: (node: TreeNode, isExpanded: boolean) => void;
    /** 初始展开的目录路径列表 */
    initialExpandedPaths?: string[];
    /** 最大显示深度 */
    maxDepth?: number;
}

interface TreeNodeItemProps {
    node: TreeNode;
    depth: number;
    selectedPath?: string | null;
    expandedPaths: Set<string>;
    loadingPaths?: Set<string>;
    onFileSelect?: (node: TreeNode) => void;
    onFileLongPress?: (node: TreeNode) => void;
    onToggleExpand: (node: TreeNode) => void;
    maxDepth: number;
}

/**
 * 单个树节点组件
 */
const TreeNodeItem = React.memo(({
    node,
    depth,
    selectedPath,
    expandedPaths,
    loadingPaths,
    onFileSelect,
    onFileLongPress,
    onToggleExpand,
    maxDepth,
}: TreeNodeItemProps) => {
    const { theme } = useUnistyles();
    const isDirectory = node.type === 'directory';
    const isExpanded = expandedPaths.has(node.path);
    const isLoading = loadingPaths?.has(node.path);
    const isSelected = selectedPath === node.path;
    const hasChildren = isDirectory && node.children && node.children.length > 0;
    const canExpand = isDirectory && depth < maxDepth;

    const handlePress = React.useCallback(() => {
        if (isDirectory) {
            if (canExpand) {
                onToggleExpand(node);
            }
        } else {
            onFileSelect?.(node);
        }
    }, [isDirectory, canExpand, node, onToggleExpand, onFileSelect]);

    const handleLongPress = React.useCallback(() => {
        onFileLongPress?.(node);
    }, [node, onFileLongPress]);

    // 缩进量，每层 16px
    const indentWidth = depth * 16;

    return (
        <>
            <Pressable
                onPress={handlePress}
                onLongPress={handleLongPress}
                style={[
                    styles.nodeContainer,
                    isSelected && { backgroundColor: '#374151', borderLeftWidth: 2, borderLeftColor: '#4ADE80' },
                ]}
            >
                {/* 缩进 */}
                <View style={{ width: indentWidth }} />

                {/* 展开/折叠图标或正在加载图标 */}
                <View style={styles.chevronContainer}>
                    {isLoading ? (
                        <ActivityIndicator size={10} color={theme.colors.textSecondary} />
                    ) : (canExpand ? (
                        <Octicons
                            name={isExpanded ? 'chevron-down' : 'chevron-right'}
                            size={12}
                            color={theme.colors.textSecondary}
                        />
                    ) : null)}
                </View>

                {/* 文件/文件夹图标 */}
                <View style={styles.iconContainer}>
                    {isDirectory ? (
                        <Octicons
                            name={isExpanded ? 'file-directory-open-fill' : 'file-directory-fill'}
                            size={16}
                            color={isSelected ? '#4ADE80' : "#54aeff"}
                        />
                    ) : (
                        <FileIcon fileName={node.name} size={16} />
                    )}
                </View>

                {/* 文件名 */}
                <Text
                    style={[
                        styles.nodeName,
                        { color: isSelected ? '#E5E7EB' : theme.colors.text },
                        isSelected && { fontWeight: '600' },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                >
                    {node.name}
                </Text>

                {/* 文件大小（可选） */}
                {!isDirectory && node.size !== undefined && node.size > 0 && (
                    <Text style={[styles.fileSize, { color: theme.colors.textSecondary }]}>
                        {formatFileSize(node.size)}
                    </Text>
                )}
            </Pressable>

            {/* 子节点（如果展开） */}
            {isExpanded && hasChildren && node.children?.map((child) => (
                <TreeNodeItem
                    key={child.path}
                    node={child}
                    depth={depth + 1}
                    selectedPath={selectedPath}
                    expandedPaths={expandedPaths}
                    loadingPaths={loadingPaths}
                    onFileSelect={onFileSelect}
                    onFileLongPress={onFileLongPress}
                    onToggleExpand={onToggleExpand}
                    maxDepth={maxDepth}
                />
            ))}
        </>
    );
});

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * FileTreeView 主组件
 */
export const FileTreeView = React.memo(({
    tree,
    isLoading = false,
    loadingPaths,
    selectedPath,
    onFileSelect,
    onFileLongPress,
    onDirectoryToggle,
    initialExpandedPaths = [],
    maxDepth = 10,
}: FileTreeViewProps) => {
    const { theme } = useUnistyles();

    // 管理展开状态
    const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(
        () => new Set(initialExpandedPaths)
    );

    // 切换目录展开状态
    const handleToggleExpand = React.useCallback((node: TreeNode) => {
        setExpandedPaths((prev) => {
            const newSet = new Set(prev);
            const isExpanding = !newSet.has(node.path);
            if (isExpanding) {
                newSet.add(node.path);
            } else {
                newSet.delete(node.path);
            }
            // 通知外部
            onDirectoryToggle?.(node, isExpanding);
            return newSet;
        });
    }, [onDirectoryToggle]);

    // 加载状态
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
                    加载中...
                </Text>
            </View>
        );
    }

    // 空状态
    if (!tree) {
        return (
            <View style={styles.emptyContainer}>
                <Octicons name="file-directory" size={32} color={theme.colors.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                    无法加载目录
                </Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: theme.colors.groupped.background }]}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
        >
            {/* 如果根节点是目录，显示其子节点；否则显示根节点本身 */}
            {tree.type === 'directory' && tree.children ? (
                tree.children.map((child) => (
                    <TreeNodeItem
                        key={child.path}
                        node={child}
                        depth={0}
                        selectedPath={selectedPath}
                        expandedPaths={expandedPaths}
                        loadingPaths={loadingPaths}
                        onFileSelect={onFileSelect}
                        onFileLongPress={onFileLongPress}
                        onToggleExpand={handleToggleExpand}
                        maxDepth={maxDepth}
                    />
                ))
            ) : (
                <TreeNodeItem
                    node={tree}
                    depth={0}
                    selectedPath={selectedPath}
                    expandedPaths={expandedPaths}
                    loadingPaths={loadingPaths}
                    onFileSelect={onFileSelect}
                    onFileLongPress={onFileLongPress}
                    onToggleExpand={handleToggleExpand}
                    maxDepth={maxDepth}
                />
            )}
        </ScrollView>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    contentContainer: {
        paddingVertical: 4,
    },
    nodeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 8,
        minHeight: 32,
    },
    chevronContainer: {
        width: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        width: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
    },
    nodeName: {
        flex: 1,
        ...Typography.default(),
        fontSize: 13,
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    },
    fileSize: {
        fontSize: 11,
        marginLeft: 8,
        ...Typography.default(),
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    loadingText: {
        marginTop: 8,
        fontSize: 14,
        ...Typography.default(),
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyText: {
        marginTop: 8,
        fontSize: 14,
        textAlign: 'center',
        ...Typography.default(),
    },
}));

export default FileTreeView;
