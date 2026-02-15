/**
 * FileEditor - 文件编辑器组件
 * 用于显示和编辑远程文件内容
 */
import * as React from 'react';
import { View, Pressable, TextInput, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Octicons, Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { sessionReadFile, sessionWriteFile } from '@/sync/ops';
import { t } from '@/text';
import { Modal } from '@/modal';
import { CodeHighlighter } from '@/components/CodeHighlighter';
import { decodeUTF8, encodeUTF8 } from '@/encryption/text';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import * as Crypto from 'expo-crypto';
import { encodeHex } from '@/encryption/hex';

interface FileEditorProps {
    /** 会话 ID */
    sessionId: string;
    /** 文件路径 */
    filePath: string;
    /** 文件名 */
    fileName: string;
    /** 关闭回调 */
    onClose?: () => void;
    /** 保存成功回调 */
    onSaved?: () => void;
}

/**
 * 判断文件是否为二进制文件
 */
function isBinaryFile(fileName: string): boolean {
    const binaryExtensions = [
        'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg',
        'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv',
        'zip', 'tar', 'gz', 'rar', '7z',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'exe', 'dll', 'so', 'dylib',
        'woff', 'woff2', 'ttf', 'eot', 'otf',
    ];
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return binaryExtensions.includes(ext);
}

/**
 * 获取文件语言类型（用于语法高亮）
 */
function getLanguage(fileName: string): string {
    const extensionMap: Record<string, string> = {
        'ts': 'typescript',
        'tsx': 'tsx',
        'js': 'javascript',
        'jsx': 'jsx',
        'py': 'python',
        'rb': 'ruby',
        'go': 'go',
        'rs': 'rust',
        'java': 'java',
        'kt': 'kotlin',
        'swift': 'swift',
        'c': 'c',
        'cpp': 'cpp',
        'h': 'c',
        'hpp': 'cpp',
        'cs': 'csharp',
        'php': 'php',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'less': 'less',
        'json': 'json',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'md': 'markdown',
        'sql': 'sql',
        'sh': 'bash',
        'bash': 'bash',
        'zsh': 'bash',
        'fish': 'bash',
        'dockerfile': 'docker',
        'makefile': 'makefile',
    };
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return extensionMap[ext] || 'text';
}

/**
 * FileEditor 主组件
 */
export const FileEditor = React.memo(({
    sessionId,
    filePath,
    fileName,
    onClose,
    onSaved,
}: FileEditorProps) => {
    const { theme } = useUnistyles();

    // 状态
    const [content, setContent] = React.useState<string>('');
    const [originalContent, setOriginalContent] = React.useState<string>('');
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [isEditing, setIsEditing] = React.useState(false);
    const [fileHash, setFileHash] = React.useState<string | null>(null);

    // 判断是否有未保存的更改
    const hasChanges = content !== originalContent;
    const isBinary = isBinaryFile(fileName);
    const language = getLanguage(fileName);

    // 加载文件内容
    const loadFile = React.useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await sessionReadFile(sessionId, filePath);
            if (response.success && response.content !== undefined) {
                // 解码 base64 内容，并正确处理 UTF-8
                const bytes = decodeBase64(response.content);
                const decoded = decodeUTF8(bytes);
                setContent(decoded);
                setOriginalContent(decoded);

                // 计算文件哈希 (SHA-256 of raw bytes)
                const hashBuffer = await Crypto.digest(
                    Crypto.CryptoDigestAlgorithm.SHA256,
                    bytes as any
                );
                // Convert ArrayBuffer to Hex string
                const hash = encodeHex(new Uint8Array(hashBuffer)).toLowerCase();
                setFileHash(hash);
            } else {
                setError(response.error || '读取文件失败');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '读取文件失败');
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, filePath]);



    // 初始加载
    React.useEffect(() => {
        if (!isBinary) {
            loadFile();
        } else {
            setIsLoading(false);
        }
    }, [isBinary, loadFile]);

    // 保存文件
    const handleSave = React.useCallback(async () => {
        if (!hasChanges) return;

        setIsSaving(true);
        setError(null);

        try {
            // 编码为 base64，并正确处理 UTF-8
            const bytes = encodeUTF8(content);
            const encoded = encodeBase64(bytes);
            const response = await sessionWriteFile(sessionId, filePath, encoded, fileHash);


            if (response.success) {
                setOriginalContent(content);
                setFileHash(response.hash || null);
                setIsEditing(false);
                onSaved?.();
                Modal.alert(t('common.success'), t('remoteFs.fileSaved'));
            } else {
                setError(response.error || '保存失败');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '保存失败');
        } finally {
            setIsSaving(false);
        }
    }, [sessionId, filePath, content, fileHash, hasChanges, onSaved]);

    // 放弃更改
    const handleDiscard = React.useCallback(async () => {
        if (hasChanges) {
            const confirmed = await Modal.confirm(
                t('remoteFs.discardTitle'),
                t('remoteFs.discardMessage'),
                {
                    confirmText: t('common.discard'),
                    destructive: true,
                }
            );
            if (confirmed) {
                setContent(originalContent);
                setIsEditing(false);
            }
        } else {
            setIsEditing(false);
        }
    }, [hasChanges, originalContent]);

    // 关闭编辑器
    const handleClose = React.useCallback(async () => {
        if (hasChanges) {
            const confirmed = await Modal.confirm(
                t('remoteFs.unsavedTitle'),
                t('remoteFs.unsavedMessage'),
                {
                    confirmText: t('common.discard'),
                    destructive: true,
                }
            );
            if (confirmed) {
                onClose?.();
            }
        } else {
            onClose?.();
        }
    }, [hasChanges, onClose]);

    // 二进制文件提示
    if (isBinary) {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.groupped.background }]}>
                <View style={[styles.header, { borderBottomColor: theme.colors.divider }]}>
                    <View style={styles.headerTitle}>
                        <Octicons name="file" size={16} color={theme.colors.textSecondary} />
                        <Text style={[styles.fileName, { color: theme.colors.text }]} numberOfLines={1}>
                            {fileName}
                        </Text>
                    </View>
                    <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
                        <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
                <View style={styles.centerContent}>
                    <Octicons name="file-binary" size={48} color={theme.colors.textSecondary} />
                    <Text style={[styles.binaryText, { color: theme.colors.textSecondary }]}>
                        {t('remoteFs.binaryFile')}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.groupped.background }]}>
            {/* 头部 */}
            <View style={[styles.header, { backgroundColor: '#1e1e1e', borderBottomColor: '#333' }]}>
                <View style={styles.headerTitle}>
                    <Octicons name="file-code" size={16} color="#4ADE80" />
                    <Text style={[styles.fileName, { color: '#E5E7EB' }]} numberOfLines={1}>
                        {fileName}
                    </Text>
                    <View style={styles.badgeContainer}>
                        <Text style={styles.langBadge}>{language}</Text>
                        {hasChanges && (
                            <View style={[styles.modifiedBadge, { backgroundColor: theme.colors.warning }]}>
                                <Text style={styles.modifiedText}>MODIFIED</Text>
                            </View>
                        )}
                    </View>
                </View>
                <View style={styles.headerActions}>
                    {isEditing ? (
                        <>
                            <Pressable
                                onPress={handleDiscard}
                                style={[styles.actionButton, { backgroundColor: theme.colors.surfaceHigh }]}
                                disabled={isSaving}
                            >
                                <Text style={[styles.actionButtonText, { color: theme.colors.textSecondary }]}>
                                    {t('common.cancel')}
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleSave}
                                style={[
                                    styles.actionButton,
                                    { backgroundColor: hasChanges ? theme.colors.textLink : theme.colors.surfaceHigh },
                                ]}
                                disabled={!hasChanges || isSaving}
                            >
                                {isSaving ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text
                                        style={[
                                            styles.actionButtonText,
                                            { color: hasChanges ? '#fff' : theme.colors.textSecondary },
                                        ]}
                                    >
                                        {t('common.save')}
                                    </Text>
                                )}
                            </Pressable>
                        </>
                    ) : (
                        <Pressable
                            onPress={() => setIsEditing(true)}
                            style={[styles.actionButton, { backgroundColor: theme.colors.textLink }]}
                        >
                            <Ionicons name="pencil" size={14} color="#fff" />
                            <Text style={[styles.actionButtonText, { color: '#fff' }]}>
                                {t('common.copy')}
                            </Text>
                        </Pressable>
                    )}
                    <Pressable onPress={handleClose} style={styles.closeButton} hitSlop={8}>
                        <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
            </View>

            {/* 内容区域 */}
            {isLoading ? (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
                        {t('remoteFs.loading')}
                    </Text>
                </View>
            ) : error ? (
                <View style={styles.centerContent}>
                    <Octicons name="alert" size={32} color={theme.colors.deleteAction} />
                    <Text style={[styles.errorText, { color: theme.colors.deleteAction }]}>
                        {error}
                    </Text>
                    <Pressable
                        onPress={loadFile}
                        style={[styles.retryButton, { backgroundColor: theme.colors.textLink }]}
                    >
                        <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
                    </Pressable>
                </View>
            ) : isEditing ? (
                <TextInput
                    value={content}
                    onChangeText={setContent}
                    multiline
                    style={[
                        styles.editor,
                        {
                            backgroundColor: theme.colors.input.background,
                            color: theme.colors.text,
                        },
                    ]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textAlignVertical="top"
                />
            ) : (
                <ScrollView
                    style={styles.scrollView}
                    showsVerticalScrollIndicator={true}
                >
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={true}
                        contentContainerStyle={styles.codeContainer}
                    >
                        <View style={{ flexShrink: 0 }}>
                            <CodeHighlighter
                                code={content || t('remoteFs.emptyFile')}
                                language={language}
                                fontSize={13}
                            />
                        </View>
                    </ScrollView>
                </ScrollView>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    headerTitle: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        // marginRight: 8, // Removed to let flex handle space
    },
    fileName: {
        fontSize: 14,
        fontWeight: '600',
        ...Typography.default('semiBold'),
        marginRight: 8,
    },
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    langBadge: {
        fontSize: 10,
        color: '#9CA3AF',
        backgroundColor: '#374151',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 3,
        overflow: 'hidden',
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    },
    modifiedBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    modifiedText: {
        fontSize: 10,
        color: '#fff',
        fontWeight: '600',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        gap: 4,
    },
    actionButtonText: {
        fontSize: 13,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    closeButton: {
        padding: 4,
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        ...Typography.default(),
    },
    errorText: {
        fontSize: 14,
        textAlign: 'center',
        ...Typography.default(),
    },
    binaryText: {
        fontSize: 14,
        textAlign: 'center',
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
    scrollView: {
        flex: 1,
    },
    codeContainer: {
        padding: 12,
        minHeight: '100%',
    },
    editor: {
        flex: 1,
        padding: 12,
        fontSize: 13,
        fontFamily: Platform.select({
            ios: 'Menlo',
            android: 'monospace',
            default: 'monospace',
        }),
        lineHeight: 20,
    },
}));

export default FileEditor;
