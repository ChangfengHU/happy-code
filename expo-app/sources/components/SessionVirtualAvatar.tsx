import React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';

type SessionVirtualAvatarProps = {
    sessionId: string;
    flavor?: string | null;
    size?: number;
    monochrome?: boolean;
};

const FLAVOR_COLORS = {
    claude: {
        background: '#FFDCA6',
        border: '#D97706',
    },
    codex: {
        background: '#CFE0FF',
        border: '#1D4ED8',
    },
    gemini: {
        background: '#E8D2FF',
        border: '#7C3AED',
    },
} as const;

const EMOJI_BY_FLAVOR = {
    claude: ['🦊', '🐱', '🐼', '🦉'],
    codex: ['🦝', '🐺', '🦦', '🐯'],
    gemini: ['🦄', '🦋', '🐧', '🐬'],
} as const;

function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function resolveFlavor(flavor?: string | null): keyof typeof FLAVOR_COLORS {
    if (flavor === 'codex' || flavor === 'gpt' || flavor === 'openai') return 'codex';
    if (flavor === 'gemini') return 'gemini';
    return 'claude';
}

function getAvatarEmoji(seed: string, flavor: keyof typeof EMOJI_BY_FLAVOR): string {
    const hash = hashString(seed);
    const options = EMOJI_BY_FLAVOR[flavor];
    return options[hash % options.length];
}

const styles = StyleSheet.create(() => ({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.16,
        shadowRadius: 2.5,
        elevation: 2,
    },
    emoji: {
        ...Typography.default('semiBold'),
        includeFontPadding: false,
        textAlign: 'center',
    },
}));

export const SessionVirtualAvatar = React.memo(({
    sessionId,
    flavor,
    size = 48,
    monochrome = false,
}: SessionVirtualAvatarProps) => {
    const resolvedFlavor = resolveFlavor(flavor);
    const colorStyle = FLAVOR_COLORS[resolvedFlavor];
    const emoji = React.useMemo(() => getAvatarEmoji(sessionId, resolvedFlavor), [sessionId, resolvedFlavor]);
    const emojiSize = Math.max(14, Math.round(size * 0.55));

    return (
        <View
            style={[
                styles.container,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: colorStyle.background,
                    borderColor: colorStyle.border,
                    opacity: monochrome ? 0.5 : 1,
                }
            ]}
        >
            <Text style={[styles.emoji, { fontSize: emojiSize, lineHeight: emojiSize + 2 }]}>
                {emoji}
            </Text>
        </View>
    );
});
