import React from 'react';
import { Text, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { hapticsLight } from './haptics';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'read-only' | 'safe-yolo' | 'yolo';
export type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export type ModelMode = 'default' | 'adaptiveUsage' | 'sonnet' | 'opus' | 'gpt-5-codex-high' | 'gpt-5-codex-medium' | 'gpt-5-codex-low' | 'gpt-5-minimal' | 'gpt-5-low' | 'gpt-5-medium' | 'gpt-5-high' | 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'claude-3-5-sonnet-20241022' | 'claude-3-5-haiku-20241022' | 'claude-3-opus-20240229' | 'gpt-4o' | 'o1-preview' | 'o1-mini' | 'gpt-5.3-codex' | 'gpt-5.2-codex' | 'gpt-5.2' | 'gpt-5.1-codex-max' | 'gpt-5.1-codex-mini' | 'claude-haiku-4-5' | 'gpt-5-mini' | 'gpt-4.1';

interface PermissionModeSelectorProps {
    mode: PermissionMode;
    onModeChange: (mode: PermissionMode) => void;
    disabled?: boolean;
}

const modeConfig = {
    default: {
        label: 'Default',
        icon: 'shield-checkmark' as const,
        description: 'Ask for permissions'
    },
    acceptEdits: {
        label: 'Accept Edits',
        icon: 'create' as const,
        description: 'Auto-approve edits'
    },
    plan: {
        label: 'Plan',
        icon: 'list' as const,
        description: 'Plan before executing'
    },
    bypassPermissions: {
        label: 'Yolo',
        icon: 'flash' as const,
        description: 'Skip all permissions'
    },
    // Codex modes (not displayed in this component, but needed for type compatibility)
    'read-only': {
        label: 'Read-only',
        icon: 'eye' as const,
        description: 'Read-only mode'
    },
    'safe-yolo': {
        label: 'Safe YOLO',
        icon: 'shield' as const,
        description: 'Safe YOLO mode'
    },
    'yolo': {
        label: 'YOLO',
        icon: 'rocket' as const,
        description: 'YOLO mode'
    },
};

const modeOrder: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];

export const PermissionModeSelector: React.FC<PermissionModeSelectorProps> = ({
    mode,
    onModeChange,
    disabled = false
}) => {
    const currentConfig = modeConfig[mode];

    const handleTap = () => {
        hapticsLight();
        const currentIndex = modeOrder.indexOf(mode);
        const nextIndex = (currentIndex + 1) % modeOrder.length;
        onModeChange(modeOrder[nextIndex]);
    };

    return (
        <Pressable
            onPress={handleTap}
            disabled={disabled}
            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                // backgroundColor: Platform.select({
                //     ios: '#F2F2F7',
                //     android: '#E0E0E0',
                //     default: '#F2F2F7'
                // }),
                borderRadius: Platform.select({ default: 16, android: 20 }),
                paddingHorizontal: 12,
                paddingVertical: 6,
                width: 120,
                justifyContent: 'center',
                height: 32,
                opacity: disabled ? 0.5 : 1,
            }}
        >
            <Ionicons
                name={'hammer-outline'}
                size={16}
                color={'black'}
                style={{ marginRight: 4 }}
            />
            {/* <Text style={{
                fontSize: 13,
                color: '#000',
                fontWeight: '600',
                ...Typography.default('semiBold')
            }}>
                {currentConfig.label}
            </Text> */}
        </Pressable>
    );
};
