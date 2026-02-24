/**
 * RemoteTerminalPanel - 远程终端面板 (Web Only)
 *
 * Provides an interactive terminal connected to the remote session's machine.
 * Uses polling-based I/O over the existing session RPC infrastructure.
 * Only renders on web platform.
 */
import * as React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import {
    sessionCreateTerminal,
    sessionWriteTerminal,
    sessionReadTerminal,
    sessionKillTerminal,
} from '@/sync/ops';

// Terminal polling interval (ms)
const POLL_INTERVAL = 150;

interface RemoteTerminalPanelProps {
    sessionId: string;
    workDir: string;
    onClose: () => void;
}

/**
 * Web-only terminal panel using theme-aligned styling.
 * Uses polling-based I/O over session RPC for interactive shell access.
 */
export const RemoteTerminalPanel = React.memo(({
    sessionId,
    workDir,
    onClose,
}: RemoteTerminalPanelProps) => {
    const { theme } = useUnistyles();
    const [terminalId, setTerminalId] = React.useState<string | null>(null);
    const [output, setOutput] = React.useState<string>('');
    const [inputValue, setInputValue] = React.useState('');
    const [isAlive, setIsAlive] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [isConnecting, setIsConnecting] = React.useState(true);
    const outputRef = React.useRef<HTMLPreElement | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

    // Create terminal session on mount
    React.useEffect(() => {
        let cancelled = false;

        const init = async () => {
            setIsConnecting(true);
            const result = await sessionCreateTerminal(sessionId, workDir);

            if (cancelled) return;

            if (result.success && result.terminalId) {
                setTerminalId(result.terminalId);
                setError(null);
            } else {
                setError(result.error || 'Failed to create terminal');
            }
            setIsConnecting(false);
        };

        init();

        return () => {
            cancelled = true;
        };
    }, [sessionId, workDir]);

    // Poll for output
    React.useEffect(() => {
        if (!terminalId) return;

        const poll = async () => {
            const result = await sessionReadTerminal(sessionId, terminalId);
            if (result.success) {
                if (result.data) {
                    setOutput(prev => {
                        const next = prev + result.data!;
                        // Keep only last ~100k chars to prevent memory issues
                        return next.length > 100000 ? next.slice(-100000) : next;
                    });
                }
                if (result.alive === false) {
                    setIsAlive(false);
                }
            }
        };

        pollRef.current = setInterval(poll, POLL_INTERVAL);
        // Initial poll immediately
        poll();

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [sessionId, terminalId]);

    // Auto-scroll to bottom
    React.useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            if (terminalId) {
                sessionKillTerminal(sessionId, terminalId).catch(() => { });
            }
        };
    }, [sessionId, terminalId]);

    // Send input - now handles both character-by-character and line-based input
    const handleInputChange = React.useCallback(async (newValue: string) => {
        if (!terminalId) return;

        const currentValue = inputValue;
        const diff = newValue.length - currentValue.length;

        // Character added
        if (diff > 0) {
            const addedChars = newValue.substring(currentValue.length);
            await sessionWriteTerminal(sessionId, terminalId, addedChars);
        }
        // Character removed (backspace)
        else if (diff < 0) {
            // Send backspace for each removed character
            for (let i = 0; i < Math.abs(diff); i++) {
                await sessionWriteTerminal(sessionId, terminalId, '\x08');
            }
        }

        setInputValue(newValue);
    }, [sessionId, terminalId, inputValue]);

    // Send input (for send button or Enter key)
    const handleSend = React.useCallback(async () => {
        if (!terminalId || !inputValue) return;
        await sessionWriteTerminal(sessionId, terminalId, '\n');
        setInputValue('');
        inputRef.current?.focus();
    }, [sessionId, terminalId, inputValue]);

    // Handle key events on the input
    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (!terminalId) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
            return;
        }
        
        // Ctrl+C - send SIGINT
        if (e.key === 'c' && e.ctrlKey) {
            e.preventDefault();
            sessionWriteTerminal(sessionId, terminalId, '\x03');
            return;
        }
        
        // Ctrl+D - send EOF
        if (e.key === 'd' && e.ctrlKey) {
            e.preventDefault();
            sessionWriteTerminal(sessionId, terminalId, '\x04');
            return;
        }

        // Tab - send tab character for autocomplete
        if (e.key === 'Tab') {
            e.preventDefault();
            sessionWriteTerminal(sessionId, terminalId, '\t');
            return;
        }

        // Arrow keys and other control sequences
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            sessionWriteTerminal(sessionId, terminalId, '\x1b[A');
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            sessionWriteTerminal(sessionId, terminalId, '\x1b[B');
            return;
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            sessionWriteTerminal(sessionId, terminalId, '\x1b[C');
            return;
        }

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            sessionWriteTerminal(sessionId, terminalId, '\x1b[D');
            return;
        }

        // Backspace - send backspace
        if (e.key === 'Backspace') {
            e.preventDefault();
            sessionWriteTerminal(sessionId, terminalId, '\x08');
            return;
        }
    }, [sessionId, terminalId]);

    // Only render on web
    if (Platform.OS !== 'web') {
        return null;
    }

    return (
        <View style={{
            flex: 1,
            backgroundColor: theme.colors.groupped.background,
            borderLeftWidth: 1,
            borderLeftColor: theme.colors.divider,
        }}>
            {/* Header - matches RemoteFileSystemPanel header style */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 0.5,
                borderBottomColor: theme.colors.divider,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="terminal-outline" size={16} color={theme.colors.textLink} />
                    <Text style={{
                        color: theme.colors.text,
                        fontSize: 14,
                        fontWeight: '600',
                    }}>
                        终端
                    </Text>
                    {!isAlive && (
                        <Text style={{
                            color: theme.colors.deleteAction || '#e74c3c',
                            fontSize: 11,
                        }}>
                            [已退出]
                        </Text>
                    )}
                </View>
                <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
                    <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                </Pressable>
            </View>

            {/* Terminal Content */}
            {isConnecting ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>连接中...</Text>
                </View>
            ) : error ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <Ionicons name="warning-outline" size={32} color={theme.colors.deleteAction || '#e74c3c'} />
                    <Text style={{ color: theme.colors.deleteAction || '#e74c3c', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                        {error}
                    </Text>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    {/* Output area */}
                    <div
                        ref={(el: any) => { outputRef.current = el; }}
                        onClick={() => inputRef.current?.focus()}
                        style={{
                            flex: 1,
                            overflow: 'auto',
                            padding: '12px 12px',
                            fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
                            fontSize: '12.5px',
                            lineHeight: '1.6',
                            color: theme.colors.text,
                            backgroundColor: '#f5f5f5',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            height: '100%',
                            cursor: 'text',
                        } as any}
                    >
                        {output || '$ '}
                    </div>

                    {/* Input area */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderTop: `0.5px solid ${theme.colors.divider}`,
                        backgroundColor: '#f5f5f5',
                        padding: '8px 12px',
                    } as any}>
                        <span style={{
                            color: theme.colors.textSecondary,
                            fontFamily: "'SF Mono', 'Menlo', monospace",
                            fontSize: '12.5px',
                            marginRight: '0px',
                            fontWeight: '400',
                            whiteSpace: 'nowrap',
                        } as any}>{isAlive ? '$ ' : '[已退出] '}</span>
                        <input
                            ref={(el: any) => { inputRef.current = el; }}
                            type="text"
                            value={inputValue}
                            onChange={(e: any) => handleInputChange(e.target.value)}
                            onKeyDown={handleKeyDown as any}
                            placeholder={isAlive ? '' : '终端已退出'}
                            disabled={!isAlive}
                            autoFocus
                            style={{
                                flex: 1,
                                backgroundColor: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: theme.colors.text,
                                fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
                                fontSize: '12.5px',
                                padding: '0px 4px',
                            } as any}
                        />
                        <Pressable
                            onPress={handleSend}
                            disabled={!isAlive || !inputValue}
                            style={{
                                opacity: isAlive && inputValue ? 1 : 0.3,
                                padding: 4,
                                marginLeft: 8,
                            }}
                        >
                            <Ionicons name="send" size={14} color={theme.colors.textLink} />
                        </Pressable>
                    </div>
                </View>
            )}
        </View>
    );
});
