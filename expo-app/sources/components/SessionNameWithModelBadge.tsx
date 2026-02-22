import React from 'react';
import { View, type TextStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Session } from '@/sync/storageTypes';
import { getSessionModelName, getSessionName } from '@/utils/sessionUtils';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';

type SessionNameWithModelBadgeProps = {
    session: Session;
    titleStyle?: TextStyle | TextStyle[];
    numberOfLines?: number;
    isConnected?: boolean;
};

type SessionModelBadgeProps = {
    session: Session;
    isConnected?: boolean;
};

const FLAVOR_STYLES = {
    claude: {
        color: '#B45309',
        backgroundColor: '#FFE8C2',
        borderColor: '#D97706',
    },
    codex: {
        color: '#1E40AF',
        backgroundColor: '#DDE9FF',
        borderColor: '#2563EB',
    },
    gemini: {
        color: '#6D28D9',
        backgroundColor: '#EEDCFF',
        borderColor: '#9333EA',
    },
} as const;

const FLAVOR_LABELS: Record<keyof typeof FLAVOR_STYLES, string> = {
    claude: 'Claude',
    codex: 'Codex',
    gemini: 'Gemini',
};

function resolveFlavor(session: Session): keyof typeof FLAVOR_STYLES {
    const normalizedFlavor = session.metadata?.flavor?.trim().toLowerCase() || '';
    if (
        normalizedFlavor === 'codex' ||
        normalizedFlavor === 'gpt' ||
        normalizedFlavor === 'openai' ||
        normalizedFlavor.startsWith('gpt-') ||
        normalizedFlavor.includes('codex') ||
        normalizedFlavor.includes('openai')
    ) {
        return 'codex';
    }
    if (normalizedFlavor === 'gemini' || normalizedFlavor.includes('gemini')) {
        return 'gemini';
    }
    return 'claude';
}

const styles = StyleSheet.create(() => ({
    badge: {
        borderRadius: 10,
        borderWidth: 1.2,
        paddingHorizontal: 8,
        minHeight: 20,
        justifyContent: 'center',
        marginLeft: 8,
        maxWidth: 140,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 1.5,
        elevation: 1,
    },
    badgeDisconnected: {
        opacity: 0.45,
    },
    badgeText: {
        fontSize: 11,
        lineHeight: 13,
        ...Typography.default('semiBold'),
    },
    nameText: {
        minWidth: 0,
        flex: 1,
    },
}));

export const SessionNameWithModelBadge = React.memo(({
    session,
    titleStyle,
    numberOfLines = 1,
    isConnected: _isConnected = true,
}: SessionNameWithModelBadgeProps) => {
    const baseName = getSessionName(session, { withModelPrefix: false });
    const flavor = resolveFlavor(session);
    const modelPrefix = `[${FLAVOR_LABELS[flavor]}]`;
    const title = baseName.match(/^\[(Claude|Codex|Gemini)\]\s+/i)
        ? baseName
        : `${modelPrefix} ${baseName}`;

    return (
        <Text style={[styles.nameText, titleStyle]} numberOfLines={numberOfLines} ellipsizeMode="tail">
            {title}
        </Text>
    );
});

export const SessionModelBadge = React.memo(({ session, isConnected = true }: SessionModelBadgeProps) => {
    const modelName = getSessionModelName(session);
    const flavor = resolveFlavor(session);
    if (!modelName || flavor === 'codex') {
        return null;
    }

    const flavorStyle = FLAVOR_STYLES[flavor];

    return (
        <View
            style={[
                styles.badge,
                {
                    backgroundColor: flavorStyle.backgroundColor,
                    borderColor: flavorStyle.borderColor,
                },
                !isConnected && styles.badgeDisconnected
            ]}
        >
            <Text style={[styles.badgeText, { color: flavorStyle.color }]} numberOfLines={1}>
                {modelName}
            </Text>
        </View>
    );
});
