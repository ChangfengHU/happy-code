import * as React from 'react';
import { View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import TextareaAutosize from 'react-textarea-autosize';
import { Typography } from '@/constants/Typography';

export type SupportedKey = 'Enter' | 'Escape' | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Tab';

export interface KeyPressEvent {
    key: SupportedKey;
    shiftKey: boolean;
}

export type OnKeyPressCallback = (event: KeyPressEvent) => boolean;

export interface TextInputState {
    text: string;
    selection: {
        start: number;
        end: number;
    };
}

export interface MultiTextInputHandle {
    setTextAndSelection: (text: string, selection: { start: number; end: number }) => void;
    focus: () => void;
    blur: () => void;
}

export interface PastedImageFile {
    type: string;
    size: number;
    name?: string;
    [key: string]: any;
}

const DATA_URL_IMAGE_SRC_REGEX = /src=["'](data:image\/[^"']+)["']/gi;

const dataUrlToFile = (dataUrl: string, index: number): File | null => {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
        return null;
    }

    const mimeType = match[1];
    const base64 = match[2];
    if (!mimeType || !base64 || typeof globalThis.atob !== 'function') {
        return null;
    }

    try {
        const binary = globalThis.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }

        const extensionRaw = mimeType.split('/')[1] || 'png';
        const extension = extensionRaw.replace(/[^a-zA-Z0-9.+-]/g, '') || 'png';
        return new File([bytes], `pasted-image-${index}.${extension}`, { type: mimeType });
    } catch {
        return null;
    }
};

const extractDataUrlImageFiles = (html: string): File[] => {
    const files: File[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null = null;
    let index = 0;

    while ((match = DATA_URL_IMAGE_SRC_REGEX.exec(html)) !== null) {
        const src = match[1];
        if (!src || seen.has(src)) {
            continue;
        }
        seen.add(src);
        const file = dataUrlToFile(src, index);
        if (file) {
            files.push(file);
            index += 1;
        }
    }

    return files;
};

interface MultiTextInputProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    maxHeight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    onKeyPress?: OnKeyPressCallback;
    onSelectionChange?: (selection: { start: number; end: number }) => void;
    onStateChange?: (state: TextInputState) => void;
    onPasteFiles?: (files: PastedImageFile[]) => void;
}

export const MultiTextInput = React.forwardRef<MultiTextInputHandle, MultiTextInputProps>((props, ref) => {
    const {
        value,
        onChangeText,
        placeholder,
        maxHeight = 120,
        onKeyPress,
        onSelectionChange,
        onStateChange,
        onPasteFiles
    } = props;
    
    const { theme } = useUnistyles();
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Convert maxHeight to approximate maxRows (assuming ~24px line height)
    const maxRows = Math.floor(maxHeight / 24);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!onKeyPress) return;

        const isComposing = e.nativeEvent.isComposing || (e.nativeEvent as any).isComposing || e.keyCode === 229;
        if (isComposing) {
            return;
        }

        const key = e.key;
        
        // Map browser key names to our normalized format
        let normalizedKey: SupportedKey | null = null;
        
        switch (key) {
            case 'Enter':
                normalizedKey = 'Enter';
                break;
            case 'Escape':
                normalizedKey = 'Escape';
                break;
            case 'ArrowUp':
                normalizedKey = 'ArrowUp';
                break;
            case 'ArrowDown':
                normalizedKey = 'ArrowDown';
                break;
            case 'ArrowLeft':
                normalizedKey = 'ArrowLeft';
                break;
            case 'ArrowRight':
                normalizedKey = 'ArrowRight';
                break;
            case 'Tab':
                normalizedKey = 'Tab';
                break;
        }

        if (normalizedKey) {
            const keyEvent: KeyPressEvent = {
                key: normalizedKey,
                shiftKey: e.shiftKey
            };
            
            const handled = onKeyPress(keyEvent);
            if (handled) {
                e.preventDefault();
            }
        }
    }, [onKeyPress]);

    const handleChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        const selection = { 
            start: e.target.selectionStart, 
            end: e.target.selectionEnd 
        };
        
        onChangeText(text);
        
        if (onStateChange) {
            onStateChange({ text, selection });
        }
        if (onSelectionChange) {
            onSelectionChange(selection);
        }
    }, [onChangeText, onStateChange, onSelectionChange]);

    const handleSelect = React.useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
        const target = e.target as HTMLTextAreaElement;
        const selection = { 
            start: target.selectionStart, 
            end: target.selectionEnd 
        };
        
        if (onSelectionChange) {
            onSelectionChange(selection);
        }
        if (onStateChange) {
            onStateChange({ text: value, selection });
        }
    }, [value, onSelectionChange, onStateChange]);

    const handlePaste = React.useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (!onPasteFiles) {
            return;
        }

        const files: PastedImageFile[] = [];
        const clipboardItems = Array.from(event.clipboardData.items || []);
        for (const item of clipboardItems) {
            if (item.kind !== 'file' || !item.type.startsWith('image/')) {
                continue;
            }
            const file = item.getAsFile();
            if (file) {
                files.push(file);
            }
        }

        // Some browsers expose pasted images in clipboardData.files but not items.
        if (files.length === 0 && event.clipboardData.files?.length) {
            for (const file of Array.from(event.clipboardData.files)) {
                if (file.type?.startsWith('image/')) {
                    files.push(file as PastedImageFile);
                }
            }
        }

        // Some copy sources provide only text/html with data URLs.
        if (files.length === 0) {
            const html = event.clipboardData.getData('text/html');
            if (html) {
                files.push(...extractDataUrlImageFiles(html));
            }
        }

        if (files.length > 0) {
            event.preventDefault();
            onPasteFiles(files);
        }
    }, [onPasteFiles]);

    // Imperative handle for direct control
    React.useImperativeHandle(ref, () => ({
        setTextAndSelection: (text: string, selection: { start: number; end: number }) => {
            if (textareaRef.current) {
                // Directly set value and selection on DOM element
                textareaRef.current.value = text;
                textareaRef.current.setSelectionRange(selection.start, selection.end);
                
                // Trigger React's onChange by dispatching an input event
                const event = new Event('input', { bubbles: true });
                textareaRef.current.dispatchEvent(event);
                
                // Also call callbacks directly for immediate update
                onChangeText(text);
                if (onStateChange) {
                    onStateChange({ text, selection });
                }
                if (onSelectionChange) {
                    onSelectionChange(selection);
                }
            }
        },
        focus: () => {
            textareaRef.current?.focus();
        },
        blur: () => {
            textareaRef.current?.blur();
        }
    }), [onChangeText, onStateChange, onSelectionChange]);

    return (
        <View style={{ width: '100%' }}>
            <TextareaAutosize
                ref={textareaRef}
                style={{
                    width: '100%',
                    padding: '0',
                    fontSize: '16px',
                    color: theme.colors.input.text,
                    border: 'none',
                    outline: 'none',
                    resize: 'none' as const,
                    backgroundColor: 'transparent',
                    fontFamily: Typography.default().fontFamily,
                    lineHeight: '1.4',
                    scrollbarWidth: 'none',
                    paddingTop: props.paddingTop,
                    paddingBottom: props.paddingBottom,
                    paddingLeft: props.paddingLeft,
                    paddingRight: props.paddingRight,
                }}
                placeholder={placeholder}
                value={value}
                onChange={handleChange}
                onSelect={handleSelect}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                maxRows={maxRows}
                autoCapitalize="sentences"
                autoCorrect="on"
                autoComplete="off"
            />
        </View>
    );
});

MultiTextInput.displayName = 'MultiTextInput';
