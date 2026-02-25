import * as React from 'react';
import { useRoute } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';
import { sessionCreateTerminal, sessionKillTerminal, sessionReadTerminal, sessionResizeTerminal, sessionWriteTerminal } from '@/sync/ops';
import { useSession } from '@/sync/storage';
import { t } from '@/text';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const POLL_INTERVAL = 120;

export default function SessionTerminalLive() {
    const route = useRoute();
    const router = useRouter();
    const params = (route.params || {}) as { id?: string };
    const sessionId = params.id;
    const session = sessionId ? useSession(sessionId) : null;
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();

    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const terminalRef = React.useRef<Terminal | null>(null);
    const fitAddonRef = React.useRef<FitAddon | null>(null);
    const pollRef = React.useRef<number | null>(null);

    const [terminalId, setTerminalId] = React.useState<string | null>(null);
    const [statusText, setStatusText] = React.useState('连接终端...');
    const [error, setError] = React.useState<string | null>(null);
    const [isAlive, setIsAlive] = React.useState(true);

    React.useEffect(() => {
        if (!sessionId || !containerRef.current) {
            return;
        }

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace',
            theme: {
                background: '#0f1013',
                foreground: '#f8fafc',
                cursor: '#22d3ee'
            },
            scrollback: 5000,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current);
        fit.fit();
        term.focus();

        terminalRef.current = term;
        fitAddonRef.current = fit;

        const handleResize = () => {
            fit.fit();
        };

        window.addEventListener('resize', handleResize);

        let cancelled = false;
        setTerminalId(null);
        setIsAlive(true);
        setStatusText('连接终端...');
        setError(null);

        const initSession = async () => {
            setStatusText('启动远程 Shell...');
            const result = await sessionCreateTerminal(sessionId, session?.metadata?.path);
            if (cancelled) return;

            if (result.success && result.terminalId) {
                setTerminalId(result.terminalId);
                setStatusText('终端已就绪，输入命令');
                setError(null);
                term.focus();
            } else {
                setError(result.error || '创建终端失败');
                setStatusText('无法启动终端');
            }
        };

        initSession();

        return () => {
            cancelled = true;
            window.removeEventListener('resize', handleResize);
            if (pollRef.current) {
                window.clearInterval(pollRef.current);
            }
            term.dispose();
            terminalRef.current = null;
            fitAddonRef.current = null;
        };
    }, [sessionId, session?.metadata?.path]);

    React.useEffect(() => {
        if (!terminalId || !sessionId) return;
        if (!terminalRef.current) return;

        const term = terminalRef.current;
        const disposable = term.onData((data) => {
            if (!terminalId) return;
            sessionWriteTerminal(sessionId, terminalId, data).catch(() => {
                setError('发送命令失败');
            });
        });

        return () => disposable.dispose();
    }, [sessionId, terminalId]);

    React.useEffect(() => {
        if (!terminalId || !sessionId) return;
        if (!terminalRef.current) return;

        const term = terminalRef.current;
        const resizeDisposable = term.onResize(({ cols, rows }) => {
            sessionResizeTerminal(sessionId, terminalId, cols, rows).catch(() => {});
        });

        // Trigger once to sync size
        sessionResizeTerminal(sessionId, terminalId, term.cols, term.rows).catch(() => {});

        return () => resizeDisposable.dispose();
    }, [sessionId, terminalId]);

    React.useEffect(() => {
        if (!terminalId || !sessionId) return;
        if (!terminalRef.current) return;

        const read = async () => {
            const result = await sessionReadTerminal(sessionId, terminalId);
            if (!result.success) {
                return;
            }
            if (result.data && terminalRef.current) {
                terminalRef.current.write(result.data);
            }
            if (result.alive === false) {
                setIsAlive(false);
                setStatusText(`终端已退出${result.exitCode != null ? `（退出码 ${result.exitCode}）` : ''}`);
            }
        };

        read();
        const handle = window.setInterval(read, POLL_INTERVAL);
        pollRef.current = handle;

        return () => {
            window.clearInterval(handle);
        };
    }, [sessionId, terminalId]);

    React.useEffect(() => {
        return () => {
            if (terminalId && sessionId) {
                sessionKillTerminal(sessionId, terminalId).catch(() => {});
            }
        };
    }, [sessionId, terminalId]);

    if (!sessionId) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.colors.text }}>未指定会话</Text>
            </View>
        );
    }

    if (!session) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Text style={{ color: theme.colors.textSecondary }}>{t('errors.sessionDeleted')}</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: safeArea.top, display: 'flex', flexDirection: 'column' }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.divider, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable onPress={() => router.back()} style={{ padding: 8, borderRadius: 8 }}>
                        <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
                    </Pressable>
                    <View>
                        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600' }}>{session.metadata?.name || session.metadata?.path || 'Remote Terminal'}</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>{statusText}</Text>
                    </View>
                </View>
                {!isAlive && (
                    <Text style={{ color: '#e02424', fontSize: 12 }}>终端已断开</Text>
                )}
            </View>
            <View style={{ flex: 1, position: 'relative', backgroundColor: '#020710' }}>
                <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
                {error && (
                    <View style={{ position: 'absolute', top: 16, right: 20, backgroundColor: theme.colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ color: theme.colors.textDestructive, fontSize: 12 }}>{error}</Text>
                    </View>
                )}
            </View>
            <View style={{ padding: 12, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.divider, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>在这个终端里即可输入 <Text style={{ color: theme.colors.textLink }}>codex</Text> 以执行 AI 工具。</Text>
                <Pressable
                    onPress={() => {
                        terminalRef.current?.focus();
                    }}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.divider }}
                >
                    <Text style={{ color: theme.colors.text }}>聚焦</Text>
                </Pressable>
            </View>
        </View>
    );
}
