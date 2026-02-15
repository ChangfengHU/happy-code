import * as React from 'react';
import { Text, View, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ToolCall, Message } from '@/sync/typesMessage';
import { CodeView } from '../CodeView';
import { Metadata } from '@/sync/storageTypes';
import { getToolFullViewComponent } from './views/_all';
import { layout } from '../layout';
import { useLocalSetting } from '@/sync/storage';
import { StyleSheet } from 'react-native-unistyles';
import { t } from '@/text';

interface ToolFullViewProps {
    tool: ToolCall;
    metadata?: Metadata | null;
    messages?: Message[];
}

const extensionLanguageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    html: 'html',
    htm: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    xml: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    go: 'go',
    rs: 'rust',
    rust: 'rust',
    c: 'c',
    cc: 'cpp',
    cpp: 'cpp',
    cxx: 'cpp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
};

function getLanguageFromPath(filePath?: string): string | undefined {
    if (!filePath) return undefined;
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (!ext) return undefined;
    return extensionLanguageMap[ext];
}

export function ToolFullView({ tool, metadata, messages = [] }: ToolFullViewProps) {
    // Check if there's a specialized content view for this tool
    const SpecializedFullView = getToolFullViewComponent(tool.name);
    const screenWidth = useWindowDimensions().width;
    const devModeEnabled = (useLocalSetting('devModeEnabled') || __DEV__);
    console.log('ToolFullView', devModeEnabled);
    const inputLanguage = tool.input ? 'json' : undefined;
    const outputCode = typeof tool.result === 'string' ? tool.result : (tool.result ? JSON.stringify(tool.result, null, 2) : '');
    const outputLanguage = React.useMemo(() => {
        if (!tool.result) return undefined;
        if (typeof tool.result !== 'string') return 'json';

        if (tool.name === 'Read' || tool.name === 'read') {
            const filePath = typeof tool.input?.file_path === 'string'
                ? tool.input.file_path
                : tool.input?.locations?.[0]?.path;
            return getLanguageFromPath(filePath);
        }

        if (tool.name === 'CodexBash' && Array.isArray(tool.input?.parsed_cmd) && tool.input.parsed_cmd[0]?.type === 'read') {
            const filePath = tool.input.parsed_cmd[0]?.name;
            return getLanguageFromPath(typeof filePath === 'string' ? filePath : undefined);
        }

        return undefined;
    }, [tool.input, tool.name, tool.result]);

    return (
        <ScrollView style={[styles.container, { paddingHorizontal: screenWidth > 700 ? 16 : 0 }]}>
            <View style={styles.contentWrapper}>
                {/* Tool-specific content or generic fallback */}
                {SpecializedFullView ? (
                    <SpecializedFullView tool={tool} metadata={metadata || null} messages={messages} />
                ) : (
                    <>
                    {/* Generic fallback for tools without specialized views */}
                    {/* Tool Description */}
                    {tool.description && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Ionicons name="information-circle" size={20} color="#5856D6" />
                                <Text style={styles.sectionTitle}>{t('tools.fullView.description')}</Text>
                            </View>
                            <Text style={styles.description}>{tool.description}</Text>
                        </View>
                    )}
                    {/* Input Parameters */}
                    {tool.input && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Ionicons name="log-in" size={20} color="#5856D6" />
                                <Text style={styles.sectionTitle}>{t('tools.fullView.inputParams')}</Text>
                            </View>
                            <CodeView code={JSON.stringify(tool.input, null, 2)} language={inputLanguage} />
                        </View>
                    )}

                    {/* Result/Output */}
                    {tool.state === 'completed' && tool.result && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Ionicons name="log-out" size={20} color="#34C759" />
                                <Text style={styles.sectionTitle}>{t('tools.fullView.output')}</Text>
                            </View>
                            <CodeView code={outputCode} language={outputLanguage} />
                        </View>
                    )}

                    {/* Error Details */}
                    {tool.state === 'error' && tool.result && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Ionicons name="close-circle" size={20} color="#FF3B30" />
                                <Text style={styles.sectionTitle}>{t('tools.fullView.error')}</Text>
                            </View>
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorText}>{String(tool.result)}</Text>
                            </View>
                        </View>
                    )}

                    {/* No Output Message */}
                    {tool.state === 'completed' && !tool.result && (
                        <View style={styles.section}>
                            <View style={styles.emptyOutputContainer}>
                                <Ionicons name="checkmark-circle-outline" size={48} color="#34C759" />
                                <Text style={styles.emptyOutputText}>{t('tools.fullView.completed')}</Text>
                                <Text style={styles.emptyOutputSubtext}>{t('tools.fullView.noOutput')}</Text>
                            </View>
                        </View>
                    )}

                </>
                )}
                
                {/* Raw JSON View (Dev Mode Only) */}
                {devModeEnabled && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="code-slash" size={20} color="#FF9500" />
                            <Text style={styles.sectionTitle}>{t('tools.fullView.rawJsonDevMode')}</Text>
                        </View>
                        <CodeView 
                            code={JSON.stringify({
                                name: tool.name,
                                state: tool.state,
                                description: tool.description,
                                input: tool.input,
                                result: tool.result,
                                createdAt: tool.createdAt,
                                startedAt: tool.startedAt,
                                completedAt: tool.completedAt,
                                permission: tool.permission,
                                messages
                            }, null, 2)}
                            language="json"
                        />
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        paddingTop: 12,
    },
    contentWrapper: {
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        width: '100%',
    },
    section: {
        marginBottom: 28,
        paddingHorizontal: 4,
    },
    sectionFullWidth: {
        marginBottom: 28,
        paddingHorizontal: 0,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.text,
    },
    description: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
    toolId: {
        fontSize: 12,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
        color: theme.colors.textSecondary,
    },
    errorContainer: {
        backgroundColor: theme.colors.box.error.background,
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.box.error.border,
    },
    errorText: {
        fontSize: 14,
        color: theme.colors.box.error.text,
        lineHeight: 20,
    },
    emptyOutputContainer: {
        alignItems: 'center',
        paddingVertical: 48,
        gap: 12,
    },
    emptyOutputText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
    },
    emptyOutputSubtext: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
}));

// Export styles for use in specialized views
export const toolFullViewStyles = styles;
