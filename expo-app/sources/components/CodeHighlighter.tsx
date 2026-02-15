import React from 'react';
import { Text, View, TextStyle, Platform, ViewStyle } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
// @ts-ignore
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
// @ts-ignore
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 注册常用语言
// @ts-ignore
import clike from 'react-syntax-highlighter/dist/esm/languages/prism/clike';
// @ts-ignore
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
// @ts-ignore
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
// @ts-ignore
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
// @ts-ignore
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
// @ts-ignore
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
// @ts-ignore
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
// @ts-ignore
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
// @ts-ignore
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
// @ts-ignore
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
// @ts-ignore
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
// @ts-ignore
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
// @ts-ignore
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
// @ts-ignore
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
// @ts-ignore
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
// @ts-ignore
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
// @ts-ignore
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
// @ts-ignore
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
// @ts-ignore
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
// @ts-ignore
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker';
// @ts-ignore
import makefile from 'react-syntax-highlighter/dist/esm/languages/prism/makefile';

SyntaxHighlighter.registerLanguage('clike', clike);
SyntaxHighlighter.registerLanguage('markup', markup);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('docker', docker);
SyntaxHighlighter.registerLanguage('makefile', makefile);

const languageAliases: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    jsonc: 'json',
    yml: 'yaml',
    py: 'python',
    sh: 'bash',
    zsh: 'bash',
    shell: 'bash',
    htm: 'html',
    html: 'html',
    xml: 'xml',
    md: 'markdown',
    cxx: 'cpp',
    cc: 'cpp',
    hpp: 'cpp',
    h: 'c',
    dockerfile: 'docker',
    text: 'text',
    txt: 'text',
    plain: 'text',
    plaintext: 'text',
};

const getTokenText = (node: any): string => {
    if (!node) {
        return '';
    }
    if (typeof node === 'string') {
        return node;
    }
    if (typeof node.value === 'string') {
        return node.value;
    }
    if (Array.isArray(node.children)) {
        return node.children.map(getTokenText).join('');
    }
    return '';
};

const resolveLanguage = (language: string): string | undefined => {
    const normalized = language.trim().toLowerCase();
    const mapped = languageAliases[normalized] || normalized;
    if (mapped === 'text') {
        return undefined;
    }
    return mapped;
};

interface CodeHighlighterProps {
    code: string;
    language: string;
    fontSize?: number;
    fontFamily?: string;
}

/**
 * 根据 token 的 className 从 stylesheet 中解析出对应的内联样式。
 * react-syntax-highlighter 在使用自定义 renderer 时，不会自动将 className 映射到 style，
 * 需要手动完成这个映射才能正确显示语法高亮颜色。
 */
const resolveTokenStyle = (classNames: string[] | undefined, stylesheet: Record<string, any>): Record<string, any> => {
    if (!classNames || classNames.length === 0) return {};

    // 过滤掉 'token' 基础类名
    const tokenClasses = classNames.filter((cn: string) => cn !== 'token');
    if (tokenClasses.length === 0) return {};

    // 将每个 className 对应的样式合并（支持复合类名如 "property.string"）
    let mergedStyle: Record<string, any> = {};
    for (const className of tokenClasses) {
        if (stylesheet[className]) {
            mergedStyle = { ...mergedStyle, ...stylesheet[className] };
        }
    }

    // 也尝试匹配复合 className 组合（如 "punctuation.operator"）
    if (tokenClasses.length >= 2) {
        const combo = tokenClasses.join('.');
        if (stylesheet[combo]) {
            mergedStyle = { ...mergedStyle, ...stylesheet[combo] };
        }
        const reverseCombo = [...tokenClasses].reverse().join('.');
        if (stylesheet[reverseCombo]) {
            mergedStyle = { ...mergedStyle, ...stylesheet[reverseCombo] };
        }
    }

    // 只保留 React Native 支持的文本样式属性
    const { color, fontWeight, fontStyle } = mergedStyle;
    const result: Record<string, any> = {};
    if (color) result.color = color;
    if (fontWeight) result.fontWeight = fontWeight;
    if (fontStyle) result.fontStyle = fontStyle;
    return result;
};

export const CodeHighlighter = React.memo(({
    code,
    language,
    fontSize = 13,
    fontFamily,
}: CodeHighlighterProps) => {
    const { theme } = useUnistyles();
    const defaultFontFamily = Platform.select({
        ios: 'Menlo',
        android: 'monospace',
        default: 'monospace',
    });
    const resolvedLanguage = resolveLanguage(language);
    const syntaxTheme = theme.dark ? atomDark : oneLight;
    const baseTextStyle: TextStyle = {
        color: theme.dark ? '#d4d4d4' : '#1f2937',
        fontSize,
        fontFamily: fontFamily || defaultFontFamily,
    };

    return (
        <SyntaxHighlighter
            language={resolvedLanguage}
            style={syntaxTheme}
            customStyle={{ padding: 0, margin: 0, backgroundColor: 'transparent' }}
            renderer={({ rows, stylesheet }: any) => {
                return rows.map((row: any, i: number) => {
                    // Diff 模式下的行背景高亮
                    let rowStyle: ViewStyle = {};
                    if (resolvedLanguage === 'diff') {
                        const rowText = getTokenText(row);
                        if (rowText.startsWith('+') && !rowText.startsWith('+++')) {
                            rowStyle = { backgroundColor: 'rgba(74, 222, 128, 0.15)', width: '100%' };
                        } else if (rowText.startsWith('-') && !rowText.startsWith('---')) {
                            rowStyle = { backgroundColor: 'rgba(248, 113, 113, 0.15)', width: '100%' };
                        } else if (rowText.startsWith('@@')) {
                            rowStyle = { backgroundColor: 'rgba(148, 163, 184, 0.15)', width: '100%' };
                        }
                    }

                    return (
                        <View key={i} style={[{ flexDirection: 'row', flexWrap: 'nowrap' }, rowStyle]}>
                            {row.children.map((token: any, key: number) => {
                                // 从 stylesheet 中根据 className 解析出语法高亮颜色
                                const tokenStyle = resolveTokenStyle(
                                    token.properties?.className,
                                    stylesheet
                                );
                                return (
                                    <Text
                                        key={key}
                                        style={[
                                            baseTextStyle,
                                            tokenStyle,
                                        ]}
                                    >
                                        {getTokenText(token)}
                                    </Text>
                                );
                            })}
                        </View>
                    );
                });
            }}
        >
            {code}
        </SyntaxHighlighter>
    );
});
