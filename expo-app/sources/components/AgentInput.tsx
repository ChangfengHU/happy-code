import { Ionicons, Octicons } from '@expo/vector-icons';
import * as React from 'react';
import { View, Platform, useWindowDimensions, ViewStyle, Text, ActivityIndicator, TouchableWithoutFeedback, Image as RNImage, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { layout } from './layout';
import { MultiTextInput, KeyPressEvent, PastedImageFile } from './MultiTextInput';
import { Typography } from '@/constants/Typography';
import { PermissionMode, ModelMode, CodexReasoningEffort } from './PermissionModeSelector';
import { hapticsLight, hapticsError } from './haptics';
import { Shaker, ShakeInstance } from './Shaker';
import { StatusDot } from './StatusDot';
import { useActiveWord } from './autocomplete/useActiveWord';
import { useActiveSuggestions } from './autocomplete/useActiveSuggestions';
import { AgentInputAutocomplete } from './AgentInputAutocomplete';
import { FloatingOverlay } from './FloatingOverlay';
import { TextInputState, MultiTextInputHandle } from './MultiTextInput';
import { applySuggestion } from './autocomplete/applySuggestion';
import { GitStatusBadge, useHasMeaningfulGitStatus } from './GitStatusBadge';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSetting } from '@/sync/storage';
import { Theme } from '@/theme';
import { t } from '@/text';
import { Metadata } from '@/sync/storageTypes';
import { AIBackendProfile, getProfileEnvironmentVariables, validateProfileForAgent } from '@/sync/settings';
import { getBuiltInProfile } from '@/sync/profileUtils';
import { Modal } from '@/modal';

export type AgentInputImagePayload = {
    mimeType: string;
    data: string;
    name?: string;
    width?: number;
    height?: number;
    size?: number;
};

export type AgentInputSendPayload = {
    text: string;
    images: AgentInputImagePayload[];
};

interface AgentInputProps {
    value: string;
    placeholder: string;
    onChangeText: (text: string) => void;
    sessionId?: string;
    onSend: (payload?: AgentInputSendPayload) => void;
    sendIcon?: React.ReactNode;
    onMicPress?: () => void;
    isMicActive?: boolean;
    permissionMode?: PermissionMode;
    onPermissionModeChange?: (mode: PermissionMode) => void;
    modelMode?: ModelMode;
    onModelModeChange?: (mode: ModelMode) => void;
    reasoningEffort?: CodexReasoningEffort;
    onReasoningEffortChange?: (effort: CodexReasoningEffort) => void;
    metadata?: Metadata | null;
    onAbort?: () => void | Promise<void>;
    showAbortButton?: boolean;
    connectionStatus?: {
        text: string;
        color: string;
        dotColor: string;
        isPulsing?: boolean;
        cliStatus?: {
            claude: boolean | null;
            codex: boolean | null;
            gemini?: boolean | null;
        };
    };
    autocompletePrefixes: string[];
    autocompleteSuggestions: (query: string) => Promise<{ key: string, text: string, component: React.ElementType }[]>;
    usageData?: {
        inputTokens: number;
        outputTokens: number;
        cacheCreation: number;
        cacheRead: number;
        contextSize: number;
    };
    alwaysShowContextSize?: boolean;
    onFileViewerPress?: () => void;
    agentType?: 'claude' | 'codex' | 'gemini';
    onAgentClick?: () => void;
    machineName?: string | null;
    onMachineClick?: () => void;
    currentPath?: string | null;
    onPathClick?: () => void;
    isSendDisabled?: boolean;
    isSending?: boolean;
    minHeight?: number;
    profileId?: string | null;
    onProfileClick?: () => void;
    onRefreshMachines?: () => void;  // 用于手动刷新机器列表（当无设备时显示）
    allowImagePaste?: boolean;
}

const MAX_CONTEXT_SIZE = 190000;
const MAX_PASTED_IMAGE_COUNT = 4;
const MAX_PASTED_IMAGE_BYTES = 350 * 1024;
const MAX_PASTED_IMAGE_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_PENDING_SEND_BYTES = 620 * 1024;

type PendingImageAttachment = AgentInputImagePayload & {
    id: string;
    previewUri: string;
};

const estimateBase64Bytes = (base64: string): number => {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
};

const getStringBytes = (value: string): number => {
    const encoder = (globalThis as any).TextEncoder ? new (globalThis as any).TextEncoder() : null;
    if (encoder) {
        return encoder.encode(value).length;
    }
    return value.length;
};

const extractBase64FromDataUrl = (dataUrl: string): string | null => {
    const marker = ';base64,';
    const markerIndex = dataUrl.indexOf(marker);
    if (markerIndex === -1) {
        return null;
    }
    return dataUrl.slice(markerIndex + marker.length);
};

const compressDataUrlForSend = async (dataUrl: string): Promise<{
    dataUrl: string;
    mimeType: string;
} | null> => {
    const BrowserImage = (globalThis as any).Image;
    const documentRef = (globalThis as any).document;
    if (!BrowserImage || !documentRef?.createElement) {
        return { dataUrl, mimeType: 'image/png' };
    }

    const image = await new Promise<any>((resolve, reject) => {
        const img = new BrowserImage();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.src = dataUrl;
    });

    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) {
        return null;
    }

    const MAX_DIMENSION = 1600;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
    const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = documentRef.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    // Prefer JPEG for smaller payload size in encrypted transport.
    const qualityCandidates = [0.82, 0.72, 0.62, 0.52, 0.42];
    let bestDataUrl = canvas.toDataURL('image/jpeg', qualityCandidates[0]);
    for (const quality of qualityCandidates) {
        const candidate = canvas.toDataURL('image/jpeg', quality);
        const candidateB64 = extractBase64FromDataUrl(candidate);
        if (!candidateB64) {
            continue;
        }
        bestDataUrl = candidate;
        if (estimateBase64Bytes(candidateB64) <= MAX_PASTED_IMAGE_BYTES) {
            break;
        }
    }

    return {
        dataUrl: bestDataUrl,
        mimeType: 'image/jpeg'
    };
};

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        alignItems: 'center',
        paddingBottom: 8,
        paddingTop: 8,
    },
    innerContainer: {
        width: '100%',
        position: 'relative',
    },
    unifiedPanel: {
        backgroundColor: theme.colors.input.background,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        overflow: 'hidden',
        paddingVertical: 2,
        paddingBottom: 8,
        paddingHorizontal: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 0,
        paddingLeft: 8,
        paddingRight: 8,
        paddingVertical: 4,
        minHeight: 40,
    },
    pastedImagesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 4,
    },
    pastedImageChip: {
        width: 72,
        height: 72,
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: theme.colors.surface,
    },
    pastedImage: {
        width: '100%',
        height: '100%',
    },
    pastedImageRemove: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Overlay styles
    autocompleteOverlay: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        zIndex: 1000,
    },
    settingsOverlay: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        zIndex: 1000,
    },
    overlayBackdrop: {
        position: 'absolute',
        top: -1000,
        left: -1000,
        right: -1000,
        bottom: -1000,
        zIndex: 999,
    },
    overlaySection: {
        paddingVertical: 8,
    },
    overlaySectionTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        paddingHorizontal: 16,
        paddingBottom: 4,
        ...Typography.default('semiBold'),
    },
    overlayDivider: {
        height: 1,
        backgroundColor: theme.colors.divider,
        marginHorizontal: 16,
    },

    // Selection styles
    selectionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'transparent',
    },
    selectionItemPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    radioButton: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    radioButtonActive: {
        borderColor: theme.colors.radio.active,
    },
    radioButtonInactive: {
        borderColor: theme.colors.radio.inactive,
    },
    radioButtonDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.radio.dot,
    },
    selectionLabel: {
        fontSize: 14,
        ...Typography.default(),
    },
    selectionLabelActive: {
        color: theme.colors.radio.active,
    },
    selectionLabelInactive: {
        color: theme.colors.text,
    },

    // Status styles
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 4,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        fontSize: 11,
        ...Typography.default(),
    },
    permissionModeContainer: {
        flexDirection: 'column',
        alignItems: 'flex-end',
    },
    permissionModeText: {
        fontSize: 11,
        ...Typography.default(),
    },
    contextWarningText: {
        fontSize: 11,
        marginLeft: 8,
        ...Typography.default(),
    },

    // Button styles
    actionButtonsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 0,
    },
    actionButtonsLeft: {
        flexDirection: 'row',
        gap: 8,
        flex: 1,
        overflow: 'hidden',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Platform.select({ default: 16, android: 20 }),
        paddingHorizontal: 8,
        paddingVertical: 6,
        justifyContent: 'center',
        height: 32,
    },
    actionButtonPressed: {
        opacity: 0.7,
    },
    actionButtonIcon: {
        color: theme.colors.button.secondary.tint,
    },
    sendButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginLeft: 8,
    },
    sendButtonActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    sendButtonInactive: {
        backgroundColor: theme.colors.button.primary.disabled,
    },
    sendButtonInner: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonInnerPressed: {
        opacity: 0.7,
    },
    sendButtonIcon: {
        color: theme.colors.button.primary.tint,
    },
}));

const getContextWarning = (contextSize: number, alwaysShow: boolean = false, theme: Theme) => {
    const percentageUsed = (contextSize / MAX_CONTEXT_SIZE) * 100;
    const percentageRemaining = Math.max(0, Math.min(100, 100 - percentageUsed));

    if (percentageRemaining <= 5) {
        return { text: t('agentInput.context.remaining', { percent: Math.round(percentageRemaining) }), color: theme.colors.warningCritical };
    } else if (percentageRemaining <= 10) {
        return { text: t('agentInput.context.remaining', { percent: Math.round(percentageRemaining) }), color: theme.colors.warning };
    } else if (alwaysShow) {
        // Show context remaining in neutral color when not near limit
        return { text: t('agentInput.context.remaining', { percent: Math.round(percentageRemaining) }), color: theme.colors.warning };
    }
    return null; // No display needed
};

export const AgentInput = React.memo(React.forwardRef<MultiTextInputHandle, AgentInputProps>((props, ref) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const screenWidth = useWindowDimensions().width;

    // Check if this is a Codex or Gemini session
    // Use metadata.flavor for existing sessions, agentType prop for new sessions
    const isCodex = (
        props.metadata?.flavor === 'codex' ||
        props.metadata?.flavor === 'gpt' ||
        props.metadata?.flavor === 'openai' ||
        props.agentType === 'codex'
    );
    const isGemini = props.metadata?.flavor === 'gemini' || props.agentType === 'gemini';

    // Profile data
    const profiles = useSetting('profiles');
    const currentProfile = React.useMemo(() => {
        if (!props.profileId) return null;
        // Check custom profiles first
        const customProfile = profiles.find(p => p.id === props.profileId);
        if (customProfile) return customProfile;
        // Check built-in profiles
        return getBuiltInProfile(props.profileId);
    }, [profiles, props.profileId]);

    // Calculate context warning
    const contextWarning = props.usageData?.contextSize
        ? getContextWarning(props.usageData.contextSize, props.alwaysShowContextSize ?? false, theme)
        : null;

    const modelModeLabel = React.useMemo(() => {
        if (!props.modelMode) return null;
        const m = props.modelMode;

        if (isGemini) {
            if (m === 'gemini-3-pro') return 'Gemini 3 Pro';
            if (m === 'gemini-3-flash') return 'Gemini 3 Flash';
            if (m === 'gemini-2.5-pro') return 'Gemini 2.5 Pro';
            if (m === 'gemini-2.5-flash') return 'Gemini 2.5 Flash';
            if (m === 'gemini-2.5-flash-lite') return 'Gemini 2.5 Flash Lite';
            if (m === 'default') return 'Gemini (Default)';
            return m;
        }

        if (isCodex) {
            const effortLabel = props.reasoningEffort || 'medium';
            if (m === 'gpt-5.3-codex') return `gpt-5.3-codex (${effortLabel})`;
            if (m === 'gpt-5.2-codex') return `gpt-5.2-codex (${effortLabel})`;
            if (m === 'gpt-5.2') return `gpt-5.2 (${effortLabel})`;
            if (m === 'gpt-5.1-codex-max') return `gpt-5.1-codex-max (${effortLabel})`;
            if (m === 'gpt-5.1-codex-mini') return `gpt-5.1-codex-mini (${effortLabel})`;
            if (m === 'default') return `Codex (${effortLabel})`;
            return `${m} (${effortLabel})`;
        }

        if (m === 'claude-3-opus-20240229') return 'Opus';
        if (m === 'claude-3-5-haiku-20241022') return 'Haiku';
        if (m === 'default') return 'Claude (Default)';
        return m;
    }, [props.modelMode, props.reasoningEffort, isGemini, isCodex]);

    const agentInputEnterToSend = useSetting('agentInputEnterToSend');


    // Abort button state
    const [isAborting, setIsAborting] = React.useState(false);
    const shakerRef = React.useRef<ShakeInstance>(null);
    const inputRef = React.useRef<MultiTextInputHandle>(null);
    const [pendingImages, setPendingImages] = React.useState<PendingImageAttachment[]>([]);

    const hasText = props.value.trim().length > 0;
    const hasImages = pendingImages.length > 0;
    const hasSendPayload = hasText || hasImages;

    const handleRemovePastedImage = React.useCallback((imageId: string) => {
        setPendingImages((current) => current.filter((image) => image.id !== imageId));
    }, []);

    const handlePasteFiles = React.useCallback(async (files: PastedImageFile[]) => {
        if (!props.allowImagePaste) {
            hapticsError();
            return;
        }
        const ReaderCtor = (globalThis as any).FileReader;
        if (!ReaderCtor) {
            return;
        }

        const availableSlots = MAX_PASTED_IMAGE_COUNT - pendingImages.length;
        if (availableSlots <= 0) {
            hapticsError();
            Modal.alert('Image limit reached', `You can attach up to ${MAX_PASTED_IMAGE_COUNT} images per message.`);
            return;
        }

        const readAsDataUrl = (blob: PastedImageFile) => new Promise<string>((resolve, reject) => {
            const reader = new ReaderCtor();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                    return;
                }
                reject(new Error('Failed to read pasted image'));
            };
            reader.onerror = () => reject(new Error('Failed to read pasted image'));
            reader.readAsDataURL(blob as any);
        });

        const readImageSize = (uri: string) => new Promise<{ width: number; height: number } | null>((resolve) => {
            RNImage.getSize(uri, (width, height) => resolve({ width, height }), () => resolve(null));
        });

        const next: PendingImageAttachment[] = [];
        let rejectedBecauseTooLarge = false;
        for (const file of files.slice(0, availableSlots)) {
            if (!file.type.startsWith('image/')) {
                continue;
            }
            if (file.size > MAX_PASTED_IMAGE_INPUT_BYTES) {
                hapticsError();
                rejectedBecauseTooLarge = true;
                continue;
            }

            try {
                const inputDataUrl = await readAsDataUrl(file);
                const compressed = await compressDataUrlForSend(inputDataUrl);
                if (!compressed) {
                    continue;
                }
                const compressedBase64 = extractBase64FromDataUrl(compressed.dataUrl);
                if (!compressedBase64) {
                    continue;
                }
                const compressedBytes = estimateBase64Bytes(compressedBase64);
                if (compressedBytes > MAX_PASTED_IMAGE_BYTES) {
                    hapticsError();
                    rejectedBecauseTooLarge = true;
                    continue;
                }

                const dimensions = await readImageSize(compressed.dataUrl);
                next.push({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    mimeType: compressed.mimeType,
                    data: compressedBase64,
                    previewUri: compressed.dataUrl,
                    ...(typeof file.name === 'string' ? { name: file.name } : {}),
                    ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
                    size: compressedBytes
                });
            } catch (error) {
                console.error('Failed to handle pasted image', error);
            }
        }

        if (next.length > 0) {
            setPendingImages((current) => current.concat(next).slice(0, MAX_PASTED_IMAGE_COUNT));
            hapticsLight();
        } else if (rejectedBecauseTooLarge) {
            Modal.alert('Image too large', `Please use images under ${Math.round(MAX_PASTED_IMAGE_BYTES / 1024)}KB after compression.`);
        }
    }, [pendingImages.length, props.allowImagePaste]);

    const handlePickImage = React.useCallback(async () => {
        if (!props.allowImagePaste) {
            hapticsError();
            return;
        }

        // Request camera roll permissions
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(
                'Permission needed',
                'Please grant camera roll permissions to attach images.'
            );
            return;
        }

        // Check if we can add more images
        const availableSlots = MAX_PASTED_IMAGE_COUNT - pendingImages.length;
        if (availableSlots <= 0) {
            hapticsError();
            Modal.alert('Image limit reached', `You can attach up to ${MAX_PASTED_IMAGE_COUNT} images per message.`);
            return;
        }

        try {
            // Launch image library
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: availableSlots > 1,
                quality: 0.8,
                allowsEditing: false,
                exif: false,
            });

            if (result.canceled) {
                return;
            }

            const selectedAssets = result.assets || [];
            if (selectedAssets.length === 0) {
                return;
            }

            // Process selected images
            const next: PendingImageAttachment[] = [];
            let rejectedBecauseTooLarge = false;

            const readImageSize = (uri: string) => new Promise<{ width: number; height: number } | null>((resolve) => {
                RNImage.getSize(uri, (width, height) => resolve({ width, height }), () => resolve(null));
            });

            for (const asset of selectedAssets.slice(0, availableSlots)) {
                if (!asset.uri) {
                    continue;
                }

                try {
                    // Get file info to check size
                    const fileInfo = await FileSystem.getInfoAsync(asset.uri);

                    // Check file size
                    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size && fileInfo.size > MAX_PASTED_IMAGE_INPUT_BYTES) {
                        hapticsError();
                        rejectedBecauseTooLarge = true;
                        continue;
                    }

                    // Compress image
                    const compressed = await compressDataUrlForSend(asset.uri);
                    if (!compressed) {
                        continue;
                    }

                    const compressedBase64 = extractBase64FromDataUrl(compressed.dataUrl);
                    if (!compressedBase64) {
                        continue;
                    }

                    const compressedBytes = estimateBase64Bytes(compressedBase64);
                    if (compressedBytes > MAX_PASTED_IMAGE_BYTES) {
                        hapticsError();
                        rejectedBecauseTooLarge = true;
                        continue;
                    }

                    const dimensions = await readImageSize(compressed.dataUrl);
                    next.push({
                        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        mimeType: compressed.mimeType,
                        data: compressedBase64,
                        previewUri: compressed.dataUrl,
                        name: asset.fileName || undefined,
                        ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
                        size: compressedBytes
                    });
                } catch (error) {
                    console.error('Failed to handle picked image', error);
                }
            }

            if (next.length > 0) {
                setPendingImages((current) => current.concat(next).slice(0, MAX_PASTED_IMAGE_COUNT));
                hapticsLight();
            } else if (rejectedBecauseTooLarge) {
                Modal.alert('Image too large', `Please use images under ${Math.round(MAX_PASTED_IMAGE_BYTES / 1024)}KB after compression.`);
            }
        } catch (error) {
            console.error('Failed to pick image', error);
            hapticsError();
        }
    }, [pendingImages.length, props.allowImagePaste]);

    const sendCurrentPayload = React.useCallback(() => {
        if (!hasSendPayload) {
            return;
        }

        const imageBytes = pendingImages.reduce((sum, image) => {
            if (typeof image.size === 'number') {
                return sum + image.size;
            }
            return sum + estimateBase64Bytes(image.data);
        }, 0);
        const totalBytes = imageBytes + getStringBytes(props.value);
        if (totalBytes > MAX_PENDING_SEND_BYTES) {
            hapticsError();
            Modal.alert('Message too large', `Please reduce image count/size (max ${Math.round(MAX_PENDING_SEND_BYTES / 1024)}KB per message).`);
            return;
        }

        props.onSend({
            text: props.value,
            images: pendingImages.map((image) => ({
                mimeType: image.mimeType,
                data: image.data,
                ...(image.name ? { name: image.name } : {}),
                ...(typeof image.width === 'number' ? { width: image.width } : {}),
                ...(typeof image.height === 'number' ? { height: image.height } : {}),
                ...(typeof image.size === 'number' ? { size: image.size } : {}),
            }))
        });
        setPendingImages([]);
    }, [hasSendPayload, pendingImages, props.onSend, props.value]);

    React.useEffect(() => {
        if (!props.allowImagePaste && pendingImages.length > 0) {
            setPendingImages([]);
        }
    }, [props.allowImagePaste, pendingImages.length]);

    // Forward ref to the MultiTextInput
    React.useImperativeHandle(ref, () => inputRef.current!, []);

    // Autocomplete state - track text and selection together
    const [inputState, setInputState] = React.useState<TextInputState>({
        text: props.value,
        selection: { start: 0, end: 0 }
    });

    // Handle combined text and selection state changes
    const handleInputStateChange = React.useCallback((newState: TextInputState) => {
        // console.log('📝 Input state changed:', JSON.stringify(newState));
        setInputState(newState);
    }, []);

    // Use the tracked selection from inputState
    const activeWord = useActiveWord(inputState.text, inputState.selection, props.autocompletePrefixes);
    // Using default options: clampSelection=true, autoSelectFirst=true, wrapAround=true
    // To customize: useActiveSuggestions(activeWord, props.autocompleteSuggestions, { clampSelection: false, wrapAround: false })
    const [suggestions, selected, moveUp, moveDown] = useActiveSuggestions(activeWord, props.autocompleteSuggestions, { clampSelection: true, wrapAround: true });

    // Debug logging
    // React.useEffect(() => {
    //     console.log('🔍 Autocomplete Debug:', JSON.stringify({
    //         value: props.value,
    //         inputState,
    //         activeWord,
    //         suggestionsCount: suggestions.length,
    //         selected,
    //         prefixes: props.autocompletePrefixes
    //     }, null, 2));
    // }, [props.value, inputState, activeWord, suggestions.length, selected]);

    // Handle suggestion selection
    const handleSuggestionSelect = React.useCallback((index: number) => {
        if (!suggestions[index] || !inputRef.current) return;

        const suggestion = suggestions[index];

        // Apply the suggestion
        const result = applySuggestion(
            inputState.text,
            inputState.selection,
            suggestion.text,
            props.autocompletePrefixes,
            true // add space after
        );

        // Use imperative API to set text and selection
        inputRef.current.setTextAndSelection(result.text, {
            start: result.cursorPosition,
            end: result.cursorPosition
        });

        // console.log('Selected suggestion:', suggestion.text);

        // Small haptic feedback
        hapticsLight();
    }, [suggestions, inputState, props.autocompletePrefixes]);

    // Settings modal state
    const [showSettings, setShowSettings] = React.useState(false);

    // Handle settings button press
    const handleSettingsPress = React.useCallback(() => {
        hapticsLight();
        setShowSettings(prev => !prev);
    }, []);

    // Handle settings selection
    const handleSettingsSelect = React.useCallback((mode: PermissionMode) => {
        hapticsLight();
        props.onPermissionModeChange?.(mode);
        // Don't close the settings overlay - let users see the change and potentially switch again
    }, [props.onPermissionModeChange]);

    // Handle abort button press
    const handleAbortPress = React.useCallback(async () => {
        if (!props.onAbort) return;

        hapticsError();
        setIsAborting(true);
        const startTime = Date.now();

        try {
            await props.onAbort?.();

            // Ensure minimum 300ms loading time
            const elapsed = Date.now() - startTime;
            if (elapsed < 300) {
                await new Promise(resolve => setTimeout(resolve, 300 - elapsed));
            }
        } catch (error) {
            // Shake on error
            shakerRef.current?.shake();
            console.error('Abort RPC call failed:', error);
        } finally {
            setIsAborting(false);
        }
    }, [props.onAbort]);

    // Handle keyboard navigation
    const handleKeyPress = React.useCallback((event: KeyPressEvent): boolean => {
        // Handle autocomplete navigation first
        if (suggestions.length > 0) {
            if (event.key === 'ArrowUp') {
                moveUp();
                return true;
            } else if (event.key === 'ArrowDown') {
                moveDown();
                return true;
            } else if ((event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
                // Both Enter and Tab select the current suggestion
                // If none selected (selected === -1), select the first one
                const indexToSelect = selected >= 0 ? selected : 0;
                handleSuggestionSelect(indexToSelect);
                return true;
            } else if (event.key === 'Escape') {
                // Clear suggestions by collapsing selection (triggers activeWord to clear)
                if (inputRef.current) {
                    const cursorPos = inputState.selection.start;
                    inputRef.current.setTextAndSelection(inputState.text, {
                        start: cursorPos,
                        end: cursorPos
                    });
                }
                return true;
            }
        }

        // Handle Escape for abort when no suggestions are visible
        if (event.key === 'Escape' && props.showAbortButton && props.onAbort && !isAborting) {
            handleAbortPress();
            return true;
        }

        // Original key handling
        if (Platform.OS === 'web') {
            if (agentInputEnterToSend && event.key === 'Enter' && !event.shiftKey) {
                if (hasSendPayload) {
                    sendCurrentPayload();
                    return true; // Key was handled
                }
            }
            // Handle Shift+Tab for permission mode switching
            if (event.key === 'Tab' && event.shiftKey && props.onPermissionModeChange) {
                const modeOrder: PermissionMode[] = isCodex
                    ? ['default', 'read-only', 'safe-yolo', 'yolo']
                    : ['default', 'acceptEdits', 'plan', 'bypassPermissions']; // Claude and Gemini share same modes
                const currentIndex = modeOrder.indexOf(props.permissionMode || 'default');
                const nextIndex = (currentIndex + 1) % modeOrder.length;
                props.onPermissionModeChange(modeOrder[nextIndex]);
                hapticsLight();
                return true; // Key was handled, prevent default tab behavior
            }

        }
        return false; // Key was not handled
    }, [suggestions, moveUp, moveDown, selected, handleSuggestionSelect, props.showAbortButton, props.onAbort, isAborting, handleAbortPress, agentInputEnterToSend, hasSendPayload, sendCurrentPayload, props.permissionMode, props.onPermissionModeChange]);




    return (
        <View style={[
            styles.container,
            { paddingHorizontal: screenWidth > 700 ? 16 : 8 }
        ]}>
            <View style={[
                styles.innerContainer,
                { maxWidth: layout.maxWidth }
            ]}>
                {/* Autocomplete suggestions overlay */}
                {suggestions.length > 0 && (
                    <View style={[
                        styles.autocompleteOverlay,
                        { paddingHorizontal: screenWidth > 700 ? 0 : 8 }
                    ]}>
                        <AgentInputAutocomplete
                            suggestions={suggestions.map(s => {
                                const Component = s.component;
                                return <Component key={s.key} />;
                            })}
                            selectedIndex={selected}
                            onSelect={handleSuggestionSelect}
                            itemHeight={48}
                        />
                    </View>
                )}

                {/* Settings overlay */}
                {showSettings && (
                    <>
                        <TouchableWithoutFeedback onPress={() => setShowSettings(false)}>
                            <View style={styles.overlayBackdrop} />
                        </TouchableWithoutFeedback>
                        <View style={[
                            styles.settingsOverlay,
                            { paddingHorizontal: screenWidth > 700 ? 0 : 8 }
                        ]}>
                            <FloatingOverlay maxHeight={400} keyboardShouldPersistTaps="always">
                                {/* Permission Mode Section */}
                                <View style={styles.overlaySection}>
                                    <Text style={styles.overlaySectionTitle}>
                                        {isCodex ? t('agentInput.codexPermissionMode.title') : isGemini ? t('agentInput.geminiPermissionMode.title') : t('agentInput.permissionMode.title')}
                                    </Text>
                                    {((isCodex || isGemini)
                                        ? (['default', 'read-only', 'safe-yolo', 'yolo'] as const)
                                        : (['default', 'acceptEdits', 'plan', 'bypassPermissions'] as const)
                                    ).map((mode) => {
                                        const modeConfig = isCodex ? {
                                            'default': { label: t('agentInput.codexPermissionMode.default') },
                                            'read-only': { label: t('agentInput.codexPermissionMode.readOnly') },
                                            'safe-yolo': { label: t('agentInput.codexPermissionMode.safeYolo') },
                                            'yolo': { label: t('agentInput.codexPermissionMode.yolo') },
                                        } : isGemini ? {
                                            'default': { label: t('agentInput.geminiPermissionMode.default') },
                                            'read-only': { label: t('agentInput.geminiPermissionMode.readOnly') },
                                            'safe-yolo': { label: t('agentInput.geminiPermissionMode.safeYolo') },
                                            'yolo': { label: t('agentInput.geminiPermissionMode.yolo') },
                                        } : {
                                            default: { label: t('agentInput.permissionMode.default') },
                                            acceptEdits: { label: t('agentInput.permissionMode.acceptEdits') },
                                            plan: { label: t('agentInput.permissionMode.plan') },
                                            bypassPermissions: { label: t('agentInput.permissionMode.bypassPermissions') },
                                        };
                                        const config = modeConfig[mode as keyof typeof modeConfig];
                                        if (!config) return null;
                                        const isSelected = props.permissionMode === mode;

                                        return (
                                            <Pressable
                                                key={mode}
                                                onPress={() => handleSettingsSelect(mode)}
                                                style={({ pressed }) => ({
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    paddingHorizontal: 16,
                                                    paddingVertical: 8,
                                                    backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent'
                                                })}
                                            >
                                                <View style={{
                                                    width: 16,
                                                    height: 16,
                                                    borderRadius: 8,
                                                    borderWidth: 2,
                                                    borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    marginRight: 12
                                                }}>
                                                    {isSelected && (
                                                        <View style={{
                                                            width: 6,
                                                            height: 6,
                                                            borderRadius: 3,
                                                            backgroundColor: theme.colors.radio.dot
                                                        }} />
                                                    )}
                                                </View>
                                                <Text style={{
                                                    fontSize: 14,
                                                    color: isSelected ? theme.colors.radio.active : theme.colors.text,
                                                    ...Typography.default()
                                                }}>
                                                    {config.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                {/* Divider */}
                                <View style={{
                                    height: 1,
                                    backgroundColor: theme.colors.divider,
                                    marginHorizontal: 16
                                }} />

                                {/* Model Section */}
                                <View style={{ paddingVertical: 8 }}>
                                    <Text style={{
                                        fontSize: 12,
                                        fontWeight: '600',
                                        color: theme.colors.textSecondary,
                                        paddingHorizontal: 16,
                                        paddingBottom: 4,
                                        ...Typography.default('semiBold')
                                    }}>
                                        {t('agentInput.model.title')}
                                    </Text>
                                    {isGemini ? (
                                        // Gemini model selector
                                        (['gemini-3-pro', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const).map((model) => {
                                            const modelConfig = {
                                                'gemini-3-pro': { label: 'Gemini 3 Pro', description: 'Newest high-capability Gemini model' },
                                                'gemini-3-flash': { label: 'Gemini 3 Flash', description: 'Newest fast/efficient Gemini model' },
                                                'gemini-2.5-pro': { label: 'Gemini 2.5 Pro', description: '性能最强' },
                                                'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', description: '快速高效' },
                                                'gemini-2.5-flash-lite': { label: 'Gemini 2.5 Flash Lite', description: '极速响应' },
                                            };
                                            const config = modelConfig[model];
                                            const isSelected = props.modelMode === model;

                                            return (
                                                <Pressable
                                                    key={model}
                                                    onPress={() => {
                                                        hapticsLight();
                                                        props.onModelModeChange?.(model);
                                                    }}
                                                    style={({ pressed }) => ({
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        paddingHorizontal: 16,
                                                        paddingVertical: 8,
                                                        backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent'
                                                    })}
                                                >
                                                    <View style={{
                                                        width: 16,
                                                        height: 16,
                                                        borderRadius: 8,
                                                        borderWidth: 2,
                                                        borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        marginRight: 12
                                                    }}>
                                                        {isSelected && (
                                                            <View style={{
                                                                width: 6,
                                                                height: 6,
                                                                borderRadius: 3,
                                                                backgroundColor: theme.colors.radio.dot
                                                            }} />
                                                        )}
                                                    </View>
                                                    <View>
                                                        <Text style={{
                                                            fontSize: 14,
                                                            color: isSelected ? theme.colors.radio.active : theme.colors.text,
                                                            ...Typography.default()
                                                        }}>
                                                            {config.label}
                                                        </Text>
                                                        <Text style={{
                                                            fontSize: 11,
                                                            color: theme.colors.textSecondary,
                                                            ...Typography.default()
                                                        }}>
                                                            {config.description}
                                                        </Text>
                                                    </View>
                                                </Pressable>
                                            );
                                        })
                                    ) : isCodex ? (
                                        <>
                                            {(['gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini'] as const).map((model) => {
                                                const modelConfig = {
                                                    'gpt-5.3-codex': { label: 'gpt-5.3-codex (current)', description: 'Latest frontier agentic coding model' },
                                                    'gpt-5.2-codex': { label: 'gpt-5.2-codex', description: 'Frontier agentic coding model' },
                                                    'gpt-5.2': { label: 'gpt-5.2', description: 'Latest frontier model with improvements' },
                                                    'gpt-5.1-codex-max': { label: 'gpt-5.1-codex-max', description: 'Flagship for deep and fast reasoning' },
                                                    'gpt-5.1-codex-mini': { label: 'gpt-5.1-codex-mini', description: 'Cheaper, faster, less capable' },
                                                };
                                                const config = modelConfig[model];
                                                const isSelected = props.modelMode === model || (props.modelMode === 'default' && model === 'gpt-5.3-codex');

                                                return (
                                                    <Pressable
                                                        key={model}
                                                        onPress={() => {
                                                            hapticsLight();
                                                            props.onModelModeChange?.(model);
                                                        }}
                                                        style={({ pressed }) => ({
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            paddingHorizontal: 16,
                                                            paddingVertical: 8,
                                                            backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent'
                                                        })}
                                                    >
                                                        <View style={{
                                                            width: 16,
                                                            height: 16,
                                                            borderRadius: 8,
                                                            borderWidth: 2,
                                                            borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            marginRight: 12
                                                        }}>
                                                            {isSelected && (
                                                                <View style={{
                                                                    width: 6,
                                                                    height: 6,
                                                                    borderRadius: 3,
                                                                    backgroundColor: theme.colors.radio.dot
                                                                }} />
                                                            )}
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={{
                                                                fontSize: 14,
                                                                color: isSelected ? theme.colors.radio.active : theme.colors.text,
                                                                ...Typography.default()
                                                            }}>
                                                                {config.label}
                                                            </Text>
                                                            <Text style={{
                                                                fontSize: 11,
                                                                color: theme.colors.textSecondary,
                                                                ...Typography.default()
                                                            }} numberOfLines={1}>
                                                                {config.description}
                                                            </Text>
                                                        </View>
                                                    </Pressable>
                                                );
                                            })}

                                            <View style={{
                                                height: 1,
                                                backgroundColor: theme.colors.divider,
                                                marginHorizontal: 16,
                                                marginVertical: 6
                                            }} />

                                            <Text style={{
                                                fontSize: 12,
                                                fontWeight: '600',
                                                color: theme.colors.textSecondary,
                                                paddingHorizontal: 16,
                                                paddingBottom: 4,
                                                ...Typography.default('semiBold')
                                            }}>
                                                Reasoning level
                                            </Text>

                                            {(['low', 'medium', 'high', 'xhigh'] as const).map((effort) => {
                                                const effortConfig = {
                                                    low: { label: 'Low', description: 'Fast responses with lighter reasoning' },
                                                    medium: { label: 'Medium (default)', description: 'Balanced speed and reasoning depth' },
                                                    high: { label: 'High', description: 'Greater reasoning depth for complex tasks' },
                                                    xhigh: { label: 'Extra high', description: 'Maximum depth for hardest tasks' },
                                                };
                                                const config = effortConfig[effort];
                                                const isSelected = (props.reasoningEffort || 'medium') === effort;

                                                return (
                                                    <Pressable
                                                        key={effort}
                                                        onPress={() => {
                                                            hapticsLight();
                                                            props.onReasoningEffortChange?.(effort);
                                                        }}
                                                        style={({ pressed }) => ({
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            paddingHorizontal: 16,
                                                            paddingVertical: 8,
                                                            backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent'
                                                        })}
                                                    >
                                                        <View style={{
                                                            width: 16,
                                                            height: 16,
                                                            borderRadius: 8,
                                                            borderWidth: 2,
                                                            borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            marginRight: 12
                                                        }}>
                                                            {isSelected && (
                                                                <View style={{
                                                                    width: 6,
                                                                    height: 6,
                                                                    borderRadius: 3,
                                                                    backgroundColor: theme.colors.radio.dot
                                                                }} />
                                                            )}
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={{
                                                                fontSize: 14,
                                                                color: isSelected ? theme.colors.radio.active : theme.colors.text,
                                                                ...Typography.default()
                                                            }}>
                                                                {config.label}
                                                            </Text>
                                                            <Text style={{
                                                                fontSize: 11,
                                                                color: theme.colors.textSecondary,
                                                                ...Typography.default()
                                                            }} numberOfLines={1}>
                                                                {config.description}
                                                            </Text>
                                                        </View>
                                                    </Pressable>
                                                );
                                            })}
                                        </>
                                    ) : (
                                        // Claude model selector (Default)
                                        (['default', 'claude-3-opus-20240229', 'claude-3-5-haiku-20241022'] as const).map((model) => {
                                            const modelConfig = {
                                                'default': { label: 'Default (recommended)', description: 'Use the default model (currently glm-4.7)' },
                                                'claude-3-opus-20240229': { label: 'Opus', description: 'Opus 4.5 • Most capable for complex work' },
                                                'claude-3-5-haiku-20241022': { label: 'Haiku', description: 'Haiku 4.5 • Fastest for quick answers' },
                                            };
                                            const config = modelConfig[model];
                                            const isSelected = props.modelMode === model;

                                            return (
                                                <Pressable
                                                    key={model}
                                                    onPress={() => {
                                                        hapticsLight();
                                                        props.onModelModeChange?.(model);
                                                    }}
                                                    style={({ pressed }) => ({
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        paddingHorizontal: 16,
                                                        paddingVertical: 8,
                                                        backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent'
                                                    })}
                                                >
                                                    <View style={{
                                                        width: 16,
                                                        height: 16,
                                                        borderRadius: 8,
                                                        borderWidth: 2,
                                                        borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        marginRight: 12
                                                    }}>
                                                        {isSelected && (
                                                            <View style={{
                                                                width: 6,
                                                                height: 6,
                                                                borderRadius: 3,
                                                                backgroundColor: theme.colors.radio.dot
                                                            }} />
                                                        )}
                                                    </View>
                                                    <View>
                                                        <Text style={{
                                                            fontSize: 14,
                                                            color: isSelected ? theme.colors.radio.active : theme.colors.text,
                                                            ...Typography.default()
                                                        }}>
                                                            {config.label}
                                                        </Text>
                                                        <Text style={{
                                                            fontSize: 11,
                                                            color: theme.colors.textSecondary,
                                                            ...Typography.default()
                                                        }}>
                                                            {config.description}
                                                        </Text>
                                                    </View>
                                                </Pressable>
                                            );
                                        })
                                    )}
                                    {/* Fallback/Legacy message removed as we now support all agents */}
                                </View>
                            </FloatingOverlay>
                        </View>
                    </>
                )}

                {/* Connection status, context warning, and permission mode */}
                {(props.connectionStatus || contextWarning || props.permissionMode) && (
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 16,
                        paddingBottom: 4,
                        minHeight: 20, // Fixed minimum height to prevent jumping
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 11 }}>
                            {props.connectionStatus && (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <StatusDot
                                            color={props.connectionStatus.dotColor}
                                            isPulsing={props.connectionStatus.isPulsing}
                                            size={6}
                                        />
                                        <Text style={{
                                            fontSize: 11,
                                            color: props.connectionStatus.color,
                                            ...Typography.default()
                                        }}>
                                            {props.connectionStatus.text}
                                        </Text>
                                    </View>
                                    {modelModeLabel && (
                                        <Text style={{
                                            fontSize: 11,
                                            color: theme.colors.textSecondary,
                                            ...Typography.default()
                                        }}>
                                            • {modelModeLabel}
                                        </Text>
                                    )}
                                    {/* CLI Status - only shown when provided (wizard only) */}
                                    {props.connectionStatus.cliStatus && (
                                        <>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <Text style={{
                                                    fontSize: 11,
                                                    color: props.connectionStatus.cliStatus.claude
                                                        ? theme.colors.success
                                                        : theme.colors.textDestructive,
                                                    ...Typography.default()
                                                }}>
                                                    {props.connectionStatus.cliStatus.claude ? '✓' : '✗'}
                                                </Text>
                                                <Text style={{
                                                    fontSize: 11,
                                                    color: props.connectionStatus.cliStatus.claude
                                                        ? theme.colors.success
                                                        : theme.colors.textDestructive,
                                                    ...Typography.default()
                                                }}>
                                                    claude
                                                </Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <Text style={{
                                                    fontSize: 11,
                                                    color: props.connectionStatus.cliStatus.codex
                                                        ? theme.colors.success
                                                        : theme.colors.textDestructive,
                                                    ...Typography.default()
                                                }}>
                                                    {props.connectionStatus.cliStatus.codex ? '✓' : '✗'}
                                                </Text>
                                                <Text style={{
                                                    fontSize: 11,
                                                    color: props.connectionStatus.cliStatus.codex
                                                        ? theme.colors.success
                                                        : theme.colors.textDestructive,
                                                    ...Typography.default()
                                                }}>
                                                    codex
                                                </Text>
                                            </View>
                                            {props.connectionStatus.cliStatus.gemini !== undefined && (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Text style={{
                                                        fontSize: 11,
                                                        color: props.connectionStatus.cliStatus.gemini
                                                            ? theme.colors.success
                                                            : theme.colors.textDestructive,
                                                        ...Typography.default()
                                                    }}>
                                                        {props.connectionStatus.cliStatus.gemini ? '✓' : '✗'}
                                                    </Text>
                                                    <Text style={{
                                                        fontSize: 11,
                                                        color: props.connectionStatus.cliStatus.gemini
                                                            ? theme.colors.success
                                                            : theme.colors.textDestructive,
                                                        ...Typography.default()
                                                    }}>
                                                        gemini
                                                    </Text>
                                                </View>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                            {contextWarning && (
                                <Text style={{
                                    fontSize: 11,
                                    color: contextWarning.color,
                                    marginLeft: props.connectionStatus ? 8 : 0,
                                    ...Typography.default()
                                }}>
                                    {props.connectionStatus ? '• ' : ''}{contextWarning.text}
                                </Text>
                            )}
                        </View>
                        <View style={{
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            minWidth: 150, // Fixed minimum width to prevent layout shift
                        }}>
                            {props.permissionMode && (
                                <Text style={{
                                    fontSize: 11,
                                    color: props.permissionMode === 'acceptEdits' ? theme.colors.permission.acceptEdits :
                                        props.permissionMode === 'bypassPermissions' ? theme.colors.permission.bypass :
                                            props.permissionMode === 'plan' ? theme.colors.permission.plan :
                                                props.permissionMode === 'read-only' ? theme.colors.permission.readOnly :
                                                    props.permissionMode === 'safe-yolo' ? theme.colors.permission.safeYolo :
                                                        props.permissionMode === 'yolo' ? theme.colors.permission.yolo :
                                                            theme.colors.textSecondary, // Use secondary text color for default
                                    ...Typography.default()
                                }}>
                                    {isCodex ? (
                                        props.permissionMode === 'default' ? t('agentInput.codexPermissionMode.default') :
                                            props.permissionMode === 'read-only' ? t('agentInput.codexPermissionMode.badgeReadOnly') :
                                                props.permissionMode === 'safe-yolo' ? t('agentInput.codexPermissionMode.badgeSafeYolo') :
                                                    props.permissionMode === 'yolo' ? t('agentInput.codexPermissionMode.badgeYolo') : ''
                                    ) : isGemini ? (
                                        props.permissionMode === 'default' ? t('agentInput.geminiPermissionMode.default') :
                                            props.permissionMode === 'read-only' ? t('agentInput.geminiPermissionMode.badgeReadOnly') :
                                                props.permissionMode === 'safe-yolo' ? t('agentInput.geminiPermissionMode.badgeSafeYolo') :
                                                    props.permissionMode === 'yolo' ? t('agentInput.geminiPermissionMode.badgeYolo') : ''
                                    ) : (
                                        props.permissionMode === 'default' ? t('agentInput.permissionMode.default') :
                                            props.permissionMode === 'acceptEdits' ? t('agentInput.permissionMode.badgeAcceptAllEdits') :
                                                props.permissionMode === 'bypassPermissions' ? t('agentInput.permissionMode.badgeBypassAllPermissions') :
                                                    props.permissionMode === 'plan' ? t('agentInput.permissionMode.badgePlanMode') : ''
                                    )}
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {/* Box 1: Context Information (Machine + Path) - Only show if either exists */}
                {(props.machineName !== undefined || props.currentPath) && (
                    <View style={{
                        backgroundColor: theme.colors.surfacePressed,
                        borderRadius: 12,
                        padding: 8,
                        marginBottom: 8,
                        gap: 4,
                    }}>
                        {/* Machine chip */}
                        {props.machineName !== undefined && props.onMachineClick && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Pressable
                                    onPress={() => {
                                        hapticsLight();
                                        props.onMachineClick?.();
                                    }}
                                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                    style={(p) => ({
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        borderRadius: Platform.select({ default: 16, android: 20 }),
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        height: 32,
                                        opacity: p.pressed ? 0.7 : 1,
                                        gap: 6,
                                    })}
                                >
                                    <Ionicons
                                        name="desktop-outline"
                                        size={14}
                                        color={theme.colors.textSecondary}
                                    />
                                    <Text style={{
                                        fontSize: 13,
                                        color: props.machineName === null ? theme.colors.textSecondary : theme.colors.text,
                                        fontWeight: '600',
                                        ...Typography.default('semiBold'),
                                    }}>
                                        {props.machineName === null ? t('agentInput.noMachinesAvailable') : props.machineName}
                                    </Text>
                                </Pressable>
                                {/* 刷新按钮 - 仅在无设备时显示 */}
                                {props.machineName === null && props.onRefreshMachines && (
                                    <Pressable
                                        onPress={() => {
                                            hapticsLight();
                                            props.onRefreshMachines?.();
                                        }}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        style={(p) => ({
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            paddingHorizontal: 8,
                                            paddingVertical: 4,
                                            borderRadius: 8,
                                            backgroundColor: p.pressed ? theme.colors.surfacePressed : 'transparent',
                                            opacity: p.pressed ? 0.7 : 1,
                                            gap: 4,
                                        })}
                                    >
                                        <Ionicons
                                            name="refresh-outline"
                                            size={14}
                                            color={theme.colors.textLink}
                                        />
                                        <Text style={{
                                            fontSize: 12,
                                            color: theme.colors.textLink,
                                            ...Typography.default(),
                                        }}>
                                            {t('agentInput.refreshMachines')}
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        )}

                        {/* Path chip */}
                        {props.currentPath && props.onPathClick && (
                            <Pressable
                                onPress={() => {
                                    hapticsLight();
                                    props.onPathClick?.();
                                }}
                                hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                style={(p) => ({
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    borderRadius: Platform.select({ default: 16, android: 20 }),
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    height: 32,
                                    opacity: p.pressed ? 0.7 : 1,
                                    gap: 6,
                                })}
                            >
                                <Ionicons
                                    name="folder-outline"
                                    size={14}
                                    color={theme.colors.textSecondary}
                                />
                                <Text style={{
                                    fontSize: 13,
                                    color: theme.colors.text,
                                    fontWeight: '600',
                                    ...Typography.default('semiBold'),
                                }}>
                                    {props.currentPath}
                                </Text>
                            </Pressable>
                        )}
                    </View>
                )}

                {/* Box 2: Action Area (Input + Send) */}
                <View style={styles.unifiedPanel}>
                    {!!pendingImages.length && (
                        <View style={styles.pastedImagesRow}>
                            {pendingImages.map((image) => (
                                <View key={image.id} style={styles.pastedImageChip}>
                                    <RNImage
                                        source={{ uri: image.previewUri }}
                                        style={styles.pastedImage}
                                        resizeMode="cover"
                                    />
                                    <Pressable
                                        onPress={() => handleRemovePastedImage(image.id)}
                                        style={styles.pastedImageRemove}
                                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    >
                                        <Ionicons name="close" size={12} color="#fff" />
                                    </Pressable>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Input field */}
                    <View style={[styles.inputContainer, props.minHeight ? { minHeight: props.minHeight } : undefined]}>
                        <MultiTextInput
                            ref={inputRef}
                            value={props.value}
                            paddingTop={Platform.OS === 'web' ? 10 : 8}
                            paddingBottom={Platform.OS === 'web' ? 10 : 8}
                            onChangeText={props.onChangeText}
                            placeholder={props.placeholder}
                            onKeyPress={handleKeyPress}
                            onStateChange={handleInputStateChange}
                            onPasteFiles={handlePasteFiles}
                            maxHeight={120}
                        />
                    </View>

                    {/* Action buttons below input */}
                    <View style={styles.actionButtonsContainer}>
                        <View style={{ flexDirection: 'column', flex: 1, gap: 2 }}>
                            {/* Row 1: Settings, Profile (FIRST), Agent, Abort, Git Status */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={styles.actionButtonsLeft}>

                                    {/* Image upload button */}
                                    {props.allowImagePaste && (
                                        <Pressable
                                            onPress={handlePickImage}
                                            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                            style={(p) => ({
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                borderRadius: Platform.select({ default: 16, android: 20 }),
                                                paddingHorizontal: 8,
                                                paddingVertical: 6,
                                                justifyContent: 'center',
                                                height: 32,
                                                opacity: p.pressed ? 0.7 : 1,
                                            })}
                                        >
                                            <Ionicons
                                                name={'image-outline'}
                                                size={16}
                                                color={theme.colors.button.secondary.tint}
                                            />
                                        </Pressable>
                                    )}

                                    {/* Settings button */}
                                    {props.onPermissionModeChange && (
                                        <Pressable
                                            onPress={handleSettingsPress}
                                            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                            style={(p) => ({
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                borderRadius: Platform.select({ default: 16, android: 20 }),
                                                paddingHorizontal: 8,
                                                paddingVertical: 6,
                                                justifyContent: 'center',
                                                height: 32,
                                                opacity: p.pressed ? 0.7 : 1,
                                            })}
                                        >
                                            <Octicons
                                                name={'gear'}
                                                size={16}
                                                color={theme.colors.button.secondary.tint}
                                            />
                                        </Pressable>
                                    )}

                                    {/* Profile selector button - FIRST */}
                                    {props.profileId && props.onProfileClick && (
                                        <Pressable
                                            onPress={() => {
                                                hapticsLight();
                                                props.onProfileClick?.();
                                            }}
                                            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                            style={(p) => ({
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                borderRadius: Platform.select({ default: 16, android: 20 }),
                                                paddingHorizontal: 10,
                                                paddingVertical: 6,
                                                justifyContent: 'center',
                                                height: 32,
                                                opacity: p.pressed ? 0.7 : 1,
                                                gap: 6,
                                            })}
                                        >
                                            <Ionicons
                                                name="person-outline"
                                                size={14}
                                                color={theme.colors.button.secondary.tint}
                                            />
                                            <Text style={{
                                                fontSize: 13,
                                                color: theme.colors.button.secondary.tint,
                                                fontWeight: '600',
                                                ...Typography.default('semiBold'),
                                            }}>
                                                {currentProfile?.name || 'Select Profile'}
                                            </Text>
                                        </Pressable>
                                    )}

                                    {/* Agent selector button */}
                                    {props.agentType && props.onAgentClick && (
                                        <Pressable
                                            onPress={() => {
                                                hapticsLight();
                                                props.onAgentClick?.();
                                            }}
                                            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                            style={(p) => ({
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                borderRadius: Platform.select({ default: 16, android: 20 }),
                                                paddingHorizontal: 10,
                                                paddingVertical: 6,
                                                justifyContent: 'center',
                                                height: 32,
                                                opacity: p.pressed ? 0.7 : 1,
                                                gap: 6,
                                            })}
                                        >
                                            <Octicons
                                                name="cpu"
                                                size={14}
                                                color={theme.colors.button.secondary.tint}
                                            />
                                            <Text style={{
                                                fontSize: 13,
                                                color: theme.colors.button.secondary.tint,
                                                fontWeight: '600',
                                                ...Typography.default('semiBold'),
                                            }}>
                                                {props.agentType === 'claude' ? t('agentInput.agent.claude') : props.agentType === 'codex' ? t('agentInput.agent.codex') : t('agentInput.agent.gemini')}
                                            </Text>
                                        </Pressable>
                                    )}

                                    {/* Abort button */}
                                    {props.onAbort && (
                                        <Shaker ref={shakerRef}>
                                            <Pressable
                                                style={(p) => ({
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    borderRadius: Platform.select({ default: 16, android: 20 }),
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 6,
                                                    justifyContent: 'center',
                                                    height: 32,
                                                    opacity: p.pressed ? 0.7 : 1,
                                                })}
                                                hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                                onPress={handleAbortPress}
                                                disabled={isAborting}
                                            >
                                                {isAborting ? (
                                                    <ActivityIndicator
                                                        size="small"
                                                        color={theme.colors.button.secondary.tint}
                                                    />
                                                ) : (
                                                    <Octicons
                                                        name={"stop"}
                                                        size={16}
                                                        color={theme.colors.button.secondary.tint}
                                                    />
                                                )}
                                            </Pressable>
                                        </Shaker>
                                    )}

                                    {/* Git Status Badge */}
                                    <GitStatusButton sessionId={props.sessionId} onPress={props.onFileViewerPress} />
                                </View>

                                {/* Send/Voice button - aligned with first row */}
                                <View
                                    style={[
                                        styles.sendButton,
                                        (hasSendPayload || props.isSending || (props.onMicPress && !props.isMicActive))
                                            ? styles.sendButtonActive
                                            : styles.sendButtonInactive
                                    ]}
                                >
                                    <Pressable
                                        style={(p) => ({
                                            width: '100%',
                                            height: '100%',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            opacity: p.pressed ? 0.7 : 1,
                                        })}
                                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                        onPress={() => {
                                            hapticsLight();
                                            if (hasSendPayload) {
                                                sendCurrentPayload();
                                            } else {
                                                props.onMicPress?.();
                                            }
                                        }}
                                        disabled={props.isSendDisabled || props.isSending || (!hasSendPayload && !props.onMicPress)}
                                    >
                                        {props.isSending ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={theme.colors.button.primary.tint}
                                            />
                                        ) : hasSendPayload ? (
                                            <Octicons
                                                name="arrow-up"
                                                size={16}
                                                color={theme.colors.button.primary.tint}
                                                style={[
                                                    styles.sendButtonIcon,
                                                    { marginTop: Platform.OS === 'web' ? 2 : 0 }
                                                ]}
                                            />
                                        ) : props.onMicPress && !props.isMicActive ? (
                                            <Image
                                                source={require('@/assets/images/icon-voice-white.png')}
                                                style={{
                                                    width: 24,
                                                    height: 24,
                                                }}
                                                tintColor={theme.colors.button.primary.tint}
                                            />
                                        ) : (
                                            <Octicons
                                                name="arrow-up"
                                                size={16}
                                                color={theme.colors.button.primary.tint}
                                                style={[
                                                    styles.sendButtonIcon,
                                                    { marginTop: Platform.OS === 'web' ? 2 : 0 }
                                                ]}
                                            />
                                        )}
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}));

// Git Status Button Component
function GitStatusButton({ sessionId, onPress }: { sessionId?: string, onPress?: () => void }) {
    const hasMeaningfulGitStatus = useHasMeaningfulGitStatus(sessionId || '');
    const styles = stylesheet;
    const { theme } = useUnistyles();

    if (!sessionId || !onPress) {
        return null;
    }

    return (
        <Pressable
            style={(p) => ({
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: Platform.select({ default: 16, android: 20 }),
                paddingHorizontal: 8,
                paddingVertical: 6,
                height: 32,
                opacity: p.pressed ? 0.7 : 1,
                flex: 1,
                overflow: 'hidden',
            })}
            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
            onPress={() => {
                hapticsLight();
                onPress?.();
            }}
        >
            {hasMeaningfulGitStatus ? (
                <GitStatusBadge sessionId={sessionId} />
            ) : (
                <Octicons
                    name="git-branch"
                    size={16}
                    color={theme.colors.button.secondary.tint}
                />
            )}
        </Pressable>
    );
}
