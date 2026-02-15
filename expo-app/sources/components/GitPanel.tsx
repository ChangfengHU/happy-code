/**
 * GitPanel - Git 版本控制面板
 * 内嵌双栏布局：左侧文件列表 + 右侧 Diff 预览
 * 参考 WaveTerm / record-anytime-plugin 的双面板设计
 */
import * as React from 'react';
import { View, Pressable, TextInput, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Octicons, Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { CodeHighlighter } from '@/components/CodeHighlighter';

import { apiSocket } from '@/sync/apiSocket';

// 定义简单的 Git 接口
async function gitStatus(sessionId: string, workDir: string) {
    // 使用 bash 执行 git status --porcelain
    const cmd = `cd "${workDir}" && git status --porcelain`;
    try {
        const response = await apiSocket.sessionRPC<any, any>(sessionId, 'bash', { command: cmd });
        return response;
    } catch (e) {
        console.error('Git status failed', e);
        return { success: false, error: String(e) };
    }
}

async function gitDiff(sessionId: string, workDir: string, filePath: string) {
    const cmd = `cd "${workDir}" && git diff HEAD -- "${filePath}"`;
    try {
        const response = await apiSocket.sessionRPC<any, any>(sessionId, 'bash', { command: cmd });
        return response;
    } catch (e) {
        console.error('Git diff failed', e);
        return { success: false, error: String(e) };
    }
}

async function gitCommit(sessionId: string, workDir: string, message: string) {
    // 简单实现：git add . && git commit -m "message"
    const escapedMessage = message.replace(/"/g, '\\"');
    const cmd = `cd "${workDir}" && git add . && git commit -m "${escapedMessage}"`;
    try {
        const response = await apiSocket.sessionRPC<any, any>(sessionId, 'bash', { command: cmd });
        return response;
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

async function gitPull(sessionId: string, workDir: string) {
    const cmd = `cd "${workDir}" && git pull`;
    try {
        const response = await apiSocket.sessionRPC<any, any>(sessionId, 'bash', { command: cmd });
        return response;
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

async function gitPush(sessionId: string, workDir: string) {
    const cmd = `cd "${workDir}" && git push`;
    try {
        const response = await apiSocket.sessionRPC<any, any>(sessionId, 'bash', { command: cmd });
        return response;
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

// 读取文件内容（用于 untracked 文件）
async function catFile(sessionId: string, workDir: string, filePath: string) {
    const cmd = `cd "${workDir}" && cat "${filePath}"`;
    try {
        const response = await apiSocket.sessionRPC<any, any>(sessionId, 'bash', { command: cmd });
        if (response.success && response.stdout) {
            return { success: true, content: response.stdout };
        }
        return { success: false, error: response.error || 'Empty file or read failed' };
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

interface GitFile {
    status: string;
    path: string;
    label: string;
}

interface GitPanelProps {
    sessionId: string;
    workDir: string;
    onClose?: () => void;
}

// 获取状态对应的图标和颜色
function getStatusInfo(status: string) {
    const s = status.trim();
    if (s === 'M' || s === 'MM') return { icon: 'diff-modified' as const, color: '#e5c07b', label: '修改' };
    if (s === 'A') return { icon: 'diff-added' as const, color: '#98c379', label: '新增' };
    if (s === 'D') return { icon: 'diff-removed' as const, color: '#e06c75', label: '删除' };
    if (s === 'R') return { icon: 'diff-renamed' as const, color: '#61afef', label: '重命名' };
    if (s === '??') return { icon: 'plus' as const, color: '#56b6c2', label: '未跟踪' };
    if (s === 'UU') return { icon: 'alert' as const, color: '#e06c75', label: '冲突' };
    return { icon: 'file' as const, color: '#abb2bf', label: s };
}

// 获取文件名（不含路径）
function getFileName(filePath: string) {
    return filePath.split('/').pop() || filePath;
}

// 获取文件夹路径
function getDirPath(filePath: string) {
    const parts = filePath.split('/');
    if (parts.length <= 1) return '';
    return parts.slice(0, -1).join('/');
}

export const GitPanel = React.memo(({ sessionId, workDir, onClose }: GitPanelProps) => {
    const { theme } = useUnistyles();

    const [files, setFiles] = React.useState<GitFile[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [selectedFile, setSelectedFile] = React.useState<GitFile | null>(null);
    const [diffContent, setDiffContent] = React.useState<string>('');
    const [isLoadingDiff, setIsLoadingDiff] = React.useState(false);
    const [commitMessage, setCommitMessage] = React.useState('');
    const [isCommitting, setIsCommitting] = React.useState(false);
    // 是否显示 Diff 预览面板
    const [showPreview, setShowPreview] = React.useState(false);

    // 获取 Git 根目录
    async function getGitRoot(sessionId: string, workDir: string) {
        const cmd = `cd "${workDir}" && git rev-parse --show-toplevel`;
        try {
            const response = await apiSocket.sessionRPC<any, any>(sessionId, 'bash', { command: cmd });
            if (response.success && response.stdout) {
                return response.stdout.trim();
            }
        } catch (e) {
            console.error('Failed to get git root', e);
        }
        return workDir; // Fallback
    }

    const [gitRoot, setGitRoot] = React.useState<string | null>(null);

    // 初始化：获取 Git Root
    React.useEffect(() => {
        let isMounted = true;
        getGitRoot(sessionId, workDir).then(root => {
            if (isMounted) {
                setGitRoot(root);
            }
        });
        return () => { isMounted = false; };
    }, [sessionId, workDir]);

    // 加载状态
    const loadStatus = React.useCallback(async () => {
        if (!gitRoot) return;
        setIsLoading(true);
        try {
            const res = await gitStatus(sessionId, gitRoot);
            if (res.success && res.stdout !== undefined) {
                const lines = (res.stdout as string).split('\n').filter(Boolean);
                const parsed: GitFile[] = lines.map(line => {
                    const status = line.substring(0, 2);
                    const path = line.substring(3);
                    return { status, path, label: `${status.trim()} ${path}` };
                });
                setFiles(parsed);
                // 如果当前选中的文件不在列表里了，清空选择
                if (selectedFile && !parsed.find(f => f.path === selectedFile.path)) {
                    setSelectedFile(null);
                    setDiffContent('');
                    setShowPreview(false);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, gitRoot, selectedFile]);

    React.useEffect(() => {
        if (gitRoot) {
            loadStatus();
        }
    }, [gitRoot]);

    // 加载 Diff 并显示预览
    React.useEffect(() => {
        if (!selectedFile || !gitRoot) return;

        const loadDiff = async () => {
            setIsLoadingDiff(true);
            setDiffContent('');
            setShowPreview(true);

            try {
                // 如果是 Untracked 文件 (??), 显示完整内容
                if (selectedFile.status.trim() === '??') {
                    const res = await catFile(sessionId, gitRoot, selectedFile.path);
                    if (res.success) {
                        const content = res.content || '';
                        // 模拟 diff 输出：给每一行加上 +
                        const fakeDiff = content.split('\n').map((line: string) => `+${line}`).join('\n');
                        setDiffContent(fakeDiff || '(空的新文件)');
                    } else {
                        setDiffContent(`读取文件失败: ${res.error}`);
                    }
                } else {
                    const res = await gitDiff(sessionId, gitRoot, selectedFile.path);
                    if (res.success) {
                        setDiffContent(res.stdout || '(无差异或二进制文件)');
                    } else {
                        setDiffContent(`加载 diff 失败: ${res.error}`);
                    }
                }
            } catch (e) {
                setDiffContent('加载 diff 失败');
            } finally {
                setIsLoadingDiff(false);
            }
        };
        loadDiff();
    }, [selectedFile, sessionId, gitRoot]);

    // 关闭预览
    const closePreview = () => {
        setShowPreview(false);
        setSelectedFile(null);
        setDiffContent('');
    };

    // 提交
    const handleCommit = async () => {
        if (!commitMessage.trim() || !gitRoot) return;
        setIsCommitting(true);
        try {
            const res = await gitCommit(sessionId, gitRoot, commitMessage);
            if (res.success) {
                setCommitMessage('');
                loadStatus();
                setSelectedFile(null);
                setDiffContent('');
                setShowPreview(false);
            } else {
                Alert.alert('提交失败', res.error || '未知错误');
            }
        } finally {
            setIsCommitting(false);
        }
    };

    const handlePull = async () => {
        if (!gitRoot) return;
        setIsLoading(true);
        await gitPull(sessionId, gitRoot);
        loadStatus();
    };

    const handlePush = async () => {
        if (!gitRoot) return;
        setIsLoading(true);
        await gitPush(sessionId, gitRoot);
        loadStatus();
    };

    // 统计变更
    const stats = React.useMemo(() => {
        let modified = 0, added = 0, deleted = 0, untracked = 0;
        files.forEach(f => {
            const s = f.status.trim();
            if (s === 'M' || s === 'MM') modified++;
            else if (s === 'A') added++;
            else if (s === 'D') deleted++;
            else if (s === '??') untracked++;
        });
        return { modified, added, deleted, untracked, total: files.length };
    }, [files]);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.groupped.background }]}>
            {/* 工具栏 */}
            <View style={[styles.toolbar, { borderBottomColor: theme.colors.divider }]}>
                <Pressable onPress={loadStatus} style={styles.iconButton}>
                    <Ionicons name="refresh" size={16} color={theme.colors.textSecondary} />
                </Pressable>

                {/* 变更统计 */}
                {stats.total > 0 && (
                    <View style={styles.statsRow}>
                        {stats.modified > 0 && (
                            <View style={styles.statBadge}>
                                <Text style={[styles.statText, { color: '#e5c07b' }]}>
                                    ~{stats.modified}
                                </Text>
                            </View>
                        )}
                        {stats.added > 0 && (
                            <View style={styles.statBadge}>
                                <Text style={[styles.statText, { color: '#98c379' }]}>
                                    +{stats.added}
                                </Text>
                            </View>
                        )}
                        {stats.deleted > 0 && (
                            <View style={styles.statBadge}>
                                <Text style={[styles.statText, { color: '#e06c75' }]}>
                                    -{stats.deleted}
                                </Text>
                            </View>
                        )}
                        {stats.untracked > 0 && (
                            <View style={styles.statBadge}>
                                <Text style={[styles.statText, { color: '#56b6c2' }]}>
                                    ?{stats.untracked}
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                <View style={styles.spacer} />
                <Pressable onPress={handlePull} style={styles.iconButton}>
                    <Octicons name="arrow-down" size={16} color={theme.colors.textSecondary} />
                    <Text style={[styles.btnText, { color: theme.colors.textSecondary }]}>Pull</Text>
                </Pressable>
                <Pressable onPress={handlePush} style={styles.iconButton}>
                    <Octicons name="arrow-up" size={16} color={theme.colors.textSecondary} />
                    <Text style={[styles.btnText, { color: theme.colors.textSecondary }]}>Push</Text>
                </Pressable>
            </View>

            {/* 主内容区：双栏布局 */}
            <View style={styles.mainContent}>
                {/* 左栏：文件列表 */}
                <View style={[
                    styles.fileListPane,
                    showPreview && styles.fileListPaneNarrow,
                    { borderRightColor: showPreview ? '#1f1f1f' : 'transparent' }
                ]}>
                    {isLoading ? (
                        <ActivityIndicator size="small" style={{ margin: 20 }} />
                    ) : files.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Octicons name="check-circle" size={24} color={theme.colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                                工作区干净，无变更
                            </Text>
                        </View>
                    ) : (
                        <ScrollView style={styles.fileScrollView}>
                            {files.map(file => {
                                const statusInfo = getStatusInfo(file.status);
                                const isSelected = selectedFile?.path === file.path;
                                const fileName = getFileName(file.path);
                                const dirPath = getDirPath(file.path);

                                return (
                                    <Pressable
                                        key={file.path}
                                        style={[
                                            styles.fileItem,
                                            isSelected && styles.fileItemSelected,
                                        ]}
                                        onPress={() => setSelectedFile(file)}
                                    >
                                        {/* 选中指示条 */}
                                        {isSelected && (
                                            <View style={[styles.selectionIndicator, { backgroundColor: statusInfo.color }]} />
                                        )}

                                        {/* 状态图标 */}
                                        <Octicons
                                            name={statusInfo.icon}
                                            size={14}
                                            color={statusInfo.color}
                                            style={styles.fileStatusIcon}
                                        />

                                        {/* 文件信息 */}
                                        <View style={styles.fileInfo}>
                                            <Text
                                                style={[styles.fileName, { color: statusInfo.color }]}
                                                numberOfLines={1}
                                            >
                                                {fileName}
                                            </Text>
                                            {dirPath ? (
                                                <Text
                                                    style={styles.fileDirPath}
                                                    numberOfLines={1}
                                                >
                                                    {dirPath}
                                                </Text>
                                            ) : null}
                                        </View>

                                        {/* 状态标签 */}
                                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
                                            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                                                {file.status.trim()}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>

                {/* 右栏：Diff 预览 */}
                {showPreview && (
                    <View style={styles.previewPane}>
                        {/* 预览头部 */}
                        <View style={styles.previewHeader}>
                            <View style={styles.previewTitleRow}>
                                <Octicons name="diff" size={14} color="#9cdcfe" />
                                <Text style={styles.previewFileName} numberOfLines={1}>
                                    {selectedFile ? getFileName(selectedFile.path) : ''}
                                </Text>
                                {selectedFile && (
                                    <View style={[
                                        styles.previewBadge,
                                        { backgroundColor: getStatusInfo(selectedFile.status).color + '25' }
                                    ]}>
                                        <Text style={[
                                            styles.previewBadgeText,
                                            { color: getStatusInfo(selectedFile.status).color }
                                        ]}>
                                            {getStatusInfo(selectedFile.status).label}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <Pressable onPress={closePreview} style={styles.previewCloseBtn}>
                                <Ionicons name="close" size={16} color="#666" />
                            </Pressable>
                        </View>

                        {/* 预览路径 */}
                        {selectedFile && (
                            <View style={styles.previewPathBar}>
                                <Text style={styles.previewPath} numberOfLines={1}>
                                    {selectedFile.path}
                                </Text>
                            </View>
                        )}

                        {/* Diff 内容 */}
                        <ScrollView style={styles.previewBody}>
                            {isLoadingDiff ? (
                                <View style={styles.previewLoading}>
                                    <ActivityIndicator size="small" color="#9cdcfe" />
                                    <Text style={styles.previewLoadingText}>正在加载差异...</Text>
                                </View>
                            ) : diffContent ? (
                                <View style={styles.diffContainer}>
                                    <CodeHighlighter
                                        code={diffContent}
                                        language="diff"
                                        fontSize={12}
                                    />
                                </View>
                            ) : (
                                <View style={styles.previewEmpty}>
                                    <Text style={styles.previewEmptyText}>选择文件查看差异</Text>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                )}
            </View>

            {/* 提交区域 */}
            <View style={[styles.commitArea, { borderTopColor: theme.colors.divider }]}>
                <TextInput
                    style={[styles.commitInput, {
                        backgroundColor: theme.colors.input.background,
                        color: theme.colors.text,
                        borderColor: theme.colors.divider
                    }]}
                    placeholder="输入提交信息..."
                    placeholderTextColor={theme.colors.input.placeholder}
                    value={commitMessage}
                    onChangeText={setCommitMessage}
                />
                <Pressable
                    style={[
                        styles.commitButton,
                        { backgroundColor: commitMessage ? theme.colors.textLink : theme.colors.surfaceHigh }
                    ]}
                    onPress={handleCommit}
                    disabled={!commitMessage || isCommitting}
                >
                    {isCommitting ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={[styles.commitBtnText, { color: commitMessage ? '#fff' : theme.colors.textSecondary }]}>
                            Commit
                        </Text>
                    )}
                </Pressable>
            </View>
        </View>
    );
});

const styles = StyleSheet.create(theme => ({
    container: {
        flex: 1,
    },
    toolbar: {
        flexDirection: 'row',
        padding: 8,
        borderBottomWidth: 1,
        alignItems: 'center',
    },
    iconButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 6,
        gap: 4,
    },
    btnText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    spacer: {
        flex: 1,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginLeft: 8,
    },
    statBadge: {
        paddingHorizontal: 4,
    },
    statText: {
        fontSize: 11,
        fontWeight: 'bold',
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    },

    // 主内容区 - 双栏布局
    mainContent: {
        flex: 1,
        flexDirection: 'row',
    },

    // 左栏：文件列表
    fileListPane: {
        flex: 1,
        minWidth: 0,
    },
    fileListPaneNarrow: {
        width: '45%',
        flex: 0,
        borderRightWidth: 1,
    },
    fileScrollView: {
        flex: 1,
    },
    fileItem: {
        flexDirection: 'row',
        paddingVertical: 6,
        paddingHorizontal: 10,
        alignItems: 'center',
        gap: 8,
        borderLeftWidth: 2,
        borderLeftColor: 'transparent',
    },
    fileItemSelected: {
        backgroundColor: '#1f2933',
    },
    selectionIndicator: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 2,
    },
    fileStatusIcon: {
        width: 16,
        flexShrink: 0,
    },
    fileInfo: {
        flex: 1,
        minWidth: 0,
    },
    fileName: {
        fontSize: 13,
        fontWeight: '500',
        ...Typography.default('medium'),
    },
    fileDirPath: {
        fontSize: 11,
        color: '#5c6370',
        marginTop: 1,
    },
    statusBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 3,
        flexShrink: 0,
    },
    statusBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    },

    // 右栏：Diff 预览
    previewPane: {
        flex: 1,
        backgroundColor: '#0b0b0b',
        minWidth: 0,
    },
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#111',
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    previewTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        minWidth: 0,
    },
    previewFileName: {
        fontSize: 13,
        fontWeight: '600',
        color: '#9cdcfe',
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
        flexShrink: 1,
    },
    previewBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 3,
    },
    previewBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    previewCloseBtn: {
        padding: 4,
        marginLeft: 8,
        backgroundColor: '#1a1a1a',
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#333',
    },
    previewPathBar: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        backgroundColor: '#0d0d0d',
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
    },
    previewPath: {
        fontSize: 11,
        color: '#555',
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    },
    previewBody: {
        flex: 1,
        backgroundColor: '#0b0b0b',
    },
    previewLoading: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        gap: 12,
    },
    previewLoadingText: {
        color: '#666',
        fontSize: 12,
    },
    diffContainer: {
        padding: 8,
    },
    previewEmpty: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    previewEmptyText: {
        color: '#555',
        fontSize: 13,
    },

    // 空状态
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        gap: 12,
        opacity: 0.5,
    },
    emptyText: {
        fontSize: 13,
        textAlign: 'center',
        ...Typography.default(),
    },

    // 提交区域
    commitArea: {
        padding: 8,
        borderTopWidth: 1,
        gap: 6,
    },
    commitInput: {
        padding: 8,
        borderRadius: 6,
        borderWidth: 1,
        fontSize: 13,
    },
    commitButton: {
        padding: 8,
        borderRadius: 6,
        alignItems: 'center',
    },
    commitBtnText: {
        fontWeight: 'bold',
        fontSize: 13,
    },
}));
