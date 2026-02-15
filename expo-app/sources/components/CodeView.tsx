import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';

interface CodeViewProps {
    code: string;
    language?: string;
}

const languageAliases: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    jsonc: 'json',
    yml: 'yaml',
    htm: 'html',
    zsh: 'bash',
    sh: 'bash',
};

function resolveLanguage(language?: string): string | null {
    if (typeof language === 'string' && language.trim()) {
        const normalized = language.trim().toLowerCase();
        return languageAliases[normalized] || normalized;
    }
    return null;
}

function detectLanguageFromCode(code: string): string | null {
    const trimmed = code.trim();
    if (!trimmed) return null;

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            JSON.parse(trimmed);
            return 'json';
        } catch {
            // Ignore
        }
    }

    if (/<[a-zA-Z][\s\S]*?>/.test(trimmed) && /<\/[a-zA-Z]+>/.test(trimmed)) {
        return 'html';
    }

    if (/\b(interface|type|implements|readonly|enum)\b/.test(trimmed)) {
        return 'typescript';
    }

    if (/\b(import\s+.+\s+from|export\s+default|const\s+|let\s+|function\s+)\b/.test(trimmed)) {
        return 'javascript';
    }

    if (/\b(package\s+[a-zA-Z0-9_.]+;|import\s+java\.|public\s+class)\b/.test(trimmed)) {
        return 'java';
    }

    return null;
}

export const CodeView = React.memo<CodeViewProps>(({
    code,
    language
}) => {
    const resolvedLanguage = resolveLanguage(language) || detectLanguageFromCode(code);

    return (
        <View style={styles.codeBlock}>
            <SimpleSyntaxHighlighter code={code} language={resolvedLanguage} selectable />
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    codeBlock: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 6,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
}));
