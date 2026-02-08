import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { sessionListDirectory } from '@/sync/ops';
import { useSession } from '@/sync/storage';
import { formatPathRelativeToHome } from '@/utils/sessionUtils';
import { t } from '@/text';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

type DirectoryEntry = {
    name: string;
    type: 'file' | 'directory' | 'other';
};

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    contentWrapper: {
        width: '100%',
        maxWidth: layout.maxWidth,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: 12,
        ...Typography.default(),
    },
    errorText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
        ...Typography.default(),
    },
    pathText: {
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default(),
    },
    pathSubtitle: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 4,
        ...Typography.default(),
    },
    inlineActions: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: theme.colors.input.background,
        gap: 6,
    },
    actionText: {
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default(),
    },
}));

const normalizePath = (path: string): string => {
    if (!path) return '/';
    if (path === '/') return '/';
    return path.replace(/\/+$/, '') || '/';
};

const joinPath = (base: string, name: string): string => {
    const normalizedBase = normalizePath(base);
    if (normalizedBase === '/') {
        return `/${name}`.replace(/\/+/, '/');
    }
    return `${normalizedBase}/${name}`;
};

const getParentPath = (path: string): string | null => {
    const normalized = normalizePath(path);
    if (normalized === '/') return null;
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 1) {
        return '/';
    }
    return `/${parts.slice(0, -1).join('/')}`;
};

export default function SessionPathPickerScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const navigation = useNavigation();
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const session = useSession(sessionId);
    const rootPath = session?.metadata?.path;
    const allowedRoot = session?.metadata?.homeDir || rootPath;
    const homeDir = session?.metadata?.homeDir;

    const [currentPath, setCurrentPath] = React.useState<string | null>(null);
    const [entries, setEntries] = React.useState<DirectoryEntry[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!currentPath && rootPath) {
            setCurrentPath(rootPath);
        }
    }, [currentPath, rootPath]);

    const canGoUp = React.useMemo(() => {
        if (!currentPath || !allowedRoot) return false;
        const normalizedRoot = normalizePath(allowedRoot);
        const normalizedCurrent = normalizePath(currentPath);
        if (normalizedCurrent === normalizedRoot) return false;
        if (normalizedRoot === '/') return normalizedCurrent !== '/';
        return normalizedCurrent.startsWith(normalizedRoot);
    }, [allowedRoot, currentPath]);

    const parentPath = React.useMemo(() => {
        if (!currentPath || !canGoUp) return null;
        return getParentPath(currentPath);
    }, [canGoUp, currentPath]);

    const loadEntries = React.useCallback(async (path: string) => {
        if (!sessionId) return;
        setIsLoading(true);
        setError(null);

        const response = await sessionListDirectory(sessionId, path);
        if (!response.success || !response.entries) {
            setEntries([]);
            setError(response.error || t('directoryPicker.loadFailed'));
            setIsLoading(false);
            return;
        }

        const directories = response.entries
            .filter(entry => entry.type === 'directory')
            .sort((a, b) => a.name.localeCompare(b.name));

        setEntries(directories);
        setIsLoading(false);
    }, [sessionId]);

    React.useEffect(() => {
        if (currentPath) {
            loadEntries(currentPath);
        }
    }, [currentPath, loadEntries]);

    const handleSelectPath = React.useCallback(() => {
        if (!currentPath) return;
        const state = navigation.getState();
        const previousRoute = state?.routes?.[state.index - 1];
        if (state && state.index > 0 && previousRoute) {
            navigation.dispatch({
                ...CommonActions.setParams({ path: currentPath }),
                source: previousRoute.key,
            } as never);
        }
        router.back();
    }, [currentPath, navigation, router]);

    if (!session || !sessionId) {
        return (
            <>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: t('directoryPicker.title'),
                        headerBackTitle: t('common.back'),
                    }}
                />
                <View style={styles.container}>
                    <View style={styles.emptyContainer}>
                        <Ionicons name="warning-outline" size={36} color={theme.colors.textSecondary} />
                        <Text style={styles.emptyText}>{t('directoryPicker.sessionUnavailable')}</Text>
                    </View>
                </View>
            </>
        );
    }

    if (!rootPath) {
        return (
            <>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: t('directoryPicker.title'),
                        headerBackTitle: t('common.back'),
                    }}
                />
                <View style={styles.container}>
                    <View style={styles.emptyContainer}>
                        <Ionicons name="folder-open-outline" size={36} color={theme.colors.textSecondary} />
                        <Text style={styles.emptyText}>{t('directoryPicker.pathUnavailable')}</Text>
                    </View>
                </View>
            </>
        );
    }

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: t('directoryPicker.title'),
                    headerBackTitle: t('common.back'),
                    headerRight: () => (
                        <Pressable
                            onPress={handleSelectPath}
                            disabled={!currentPath}
                            style={({ pressed }) => ({
                                marginRight: 16,
                                opacity: pressed || !currentPath ? 0.6 : 1,
                                padding: 4,
                            })}
                        >
                            <Ionicons
                                name="checkmark"
                                size={24}
                                color={theme.colors.header.tint}
                            />
                        </Pressable>
                    ),
                }}
            />
            <View style={styles.container}>
                <ScrollView
                    style={styles.scrollContainer}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.contentWrapper}>
                        <ItemGroup title={t('directoryPicker.currentFolder')}>
                            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                                <Text style={styles.pathText}>
                                    {formatPathRelativeToHome(currentPath || rootPath, homeDir)}
                                </Text>
                                <Text style={styles.pathSubtitle}>{t('directoryPicker.currentFolderHint')}</Text>
                            </View>
                            <Item
                                title={t('directoryPicker.useThisFolder')}
                                icon={<Ionicons name="checkmark-circle-outline" size={24} color={theme.colors.textSecondary} />}
                                onPress={handleSelectPath}
                                showChevron={false}
                            />
                        </ItemGroup>

                        <View style={styles.inlineActions}>
                            <Pressable
                                onPress={() => currentPath && loadEntries(currentPath)}
                                style={({ pressed }) => [
                                    styles.actionButton,
                                    { opacity: pressed ? 0.7 : 1 }
                                ]}
                            >
                                <Ionicons name="refresh" size={16} color={theme.colors.textSecondary} />
                                <Text style={styles.actionText}>{t('directoryPicker.refresh')}</Text>
                            </Pressable>
                        </View>

                        <ItemGroup title={t('directoryPicker.folders')}>
                            {canGoUp && parentPath && (
                                <Item
                                    title=".."
                                    subtitle={t('directoryPicker.parentFolder')}
                                    icon={<Ionicons name="arrow-up" size={22} color={theme.colors.textSecondary} />}
                                    onPress={() => setCurrentPath(parentPath)}
                                    showChevron={false}
                                />
                            )}

                            {isLoading ? (
                                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                    <Text style={styles.emptyText}>{t('directoryPicker.loading')}</Text>
                                </View>
                            ) : error ? (
                                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                    <Ionicons name="warning-outline" size={28} color={theme.colors.textSecondary} />
                                    <Text style={styles.emptyText}>{t('directoryPicker.loadFailed')}</Text>
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            ) : entries.length === 0 ? (
                                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                    <Ionicons name="folder-open-outline" size={28} color={theme.colors.textSecondary} />
                                    <Text style={styles.emptyText}>{t('directoryPicker.empty')}</Text>
                                </View>
                            ) : (
                                entries.map((entry, index) => (
                                    <Item
                                        key={`${currentPath}/${entry.name}`}
                                        title={entry.name}
                                        icon={<Ionicons name="folder-outline" size={22} color={theme.colors.textSecondary} />}
                                        onPress={() => setCurrentPath(joinPath(currentPath || rootPath, entry.name))}
                                        showDivider={index < entries.length - 1}
                                        showChevron={false}
                                    />
                                ))
                            )}
                        </ItemGroup>
                    </View>
                </ScrollView>
            </View>
        </>
    );
}
