import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { machineListDirectory } from '@/sync/ops';
import { useAllMachines } from '@/sync/storage';
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
    filterInput: {
        marginTop: 8,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 9,
        backgroundColor: theme.colors.input.background,
        color: theme.colors.text,
        fontSize: 14,
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

export default function PathPickerScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const navigation = useNavigation();
    const params = useLocalSearchParams<{ machineId?: string; selectedPath?: string }>();
    const machines = useAllMachines();

    const machine = React.useMemo(() => {
        return machines.find(m => m.id === params.machineId);
    }, [machines, params.machineId]);

    const rootPath = React.useMemo(() => {
        const selectedPath = (params.selectedPath || '').trim();
        if (selectedPath) {
            return normalizePath(selectedPath);
        }
        const homeDir = machine?.metadata?.homeDir?.trim();
        if (homeDir) {
            return normalizePath(homeDir);
        }
        return '/home';
    }, [machine?.metadata?.homeDir, params.selectedPath]);

    const allowedRoot = React.useMemo(() => {
        const homeDir = machine?.metadata?.homeDir?.trim();
        if (homeDir) {
            return normalizePath(homeDir);
        }
        return rootPath;
    }, [machine?.metadata?.homeDir, rootPath]);

    const homeDir = machine?.metadata?.homeDir;

    const [currentPath, setCurrentPath] = React.useState<string | null>(null);
    const [entries, setEntries] = React.useState<DirectoryEntry[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [folderFilter, setFolderFilter] = React.useState('');

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
        if (!params.machineId) return;
        setIsLoading(true);
        setError(null);

        const response = await machineListDirectory(params.machineId, path);
        if (!response.success || !response.entries) {
            setEntries([]);
            setError(response.error || 'Failed to load folders');
            setIsLoading(false);
            return;
        }

        const directories = response.entries
            .filter(entry => entry.type === 'directory')
            .sort((a, b) => a.name.localeCompare(b.name));

        setEntries(directories);
        setIsLoading(false);
    }, [params.machineId]);

    React.useEffect(() => {
        if (currentPath) {
            loadEntries(currentPath);
        }
    }, [currentPath, loadEntries]);

    React.useEffect(() => {
        setFolderFilter('');
    }, [currentPath]);

    const filteredEntries = React.useMemo(() => {
        const normalizedFilter = folderFilter.trim().toLowerCase();
        if (!normalizedFilter) {
            return entries;
        }
        return entries.filter(entry => entry.name.toLowerCase().includes(normalizedFilter));
    }, [entries, folderFilter]);

    const handleSelectPath = React.useCallback(() => {
        const pathToUse = currentPath || rootPath;
        const state = navigation.getState();
        const previousRoute = state?.routes?.[state.index - 1];
        if (state && state.index > 0 && previousRoute) {
            navigation.dispatch({
                ...CommonActions.setParams({ path: pathToUse }),
                source: previousRoute.key,
            } as never);
        }
        router.back();
    }, [currentPath, navigation, rootPath, router]);

    if (!machine) {
        return (
            <>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: 'Select Path',
                        headerBackTitle: t('common.back'),
                    }}
                />
                <View style={styles.container}>
                    <View style={styles.emptyContainer}>
                        <Ionicons name="warning-outline" size={36} color={theme.colors.textSecondary} />
                        <Text style={styles.emptyText}>{t('newSession.noMachineSelected')}</Text>
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
                    headerTitle: 'Select Path',
                    headerBackTitle: t('common.back'),
                    headerRight: () => (
                        <Pressable
                            onPress={handleSelectPath}
                            disabled={!currentPath}
                            style={({ pressed }) => ({
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
                        <ItemGroup title="Current Folder">
                            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                                <Text style={styles.pathText}>
                                    {formatPathRelativeToHome(currentPath || rootPath, homeDir)}
                                </Text>
                                <Text style={styles.pathSubtitle}>Choose a subfolder or use the current folder</Text>
                            </View>
                            <Item
                                title="Use this folder"
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
                                <Text style={styles.actionText}>Refresh</Text>
                            </Pressable>
                            <TextInput
                                value={folderFilter}
                                onChangeText={setFolderFilter}
                                placeholder={t('remoteFs.searchPlaceholder')}
                                placeholderTextColor={theme.colors.textSecondary}
                                style={styles.filterInput}
                                autoCapitalize="none"
                                autoCorrect={false}
                                clearButtonMode="while-editing"
                            />
                        </View>

                        <ItemGroup title="Folders">
                            {canGoUp && parentPath && (
                                <Item
                                    title=".."
                                    subtitle="Parent folder"
                                    icon={<Ionicons name="arrow-up" size={22} color={theme.colors.textSecondary} />}
                                    onPress={() => setCurrentPath(parentPath)}
                                    showChevron={false}
                                />
                            )}

                            {isLoading ? (
                                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                    <Text style={styles.emptyText}>Loading folders...</Text>
                                </View>
                            ) : error ? (
                                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                    <Ionicons name="warning-outline" size={28} color={theme.colors.textSecondary} />
                                    <Text style={styles.emptyText}>Failed to load folders</Text>
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            ) : filteredEntries.length === 0 ? (
                                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                    <Ionicons name="folder-open-outline" size={28} color={theme.colors.textSecondary} />
                                    <Text style={styles.emptyText}>No subfolders found</Text>
                                </View>
                            ) : (
                                filteredEntries.map((entry, index) => (
                                    <Item
                                        key={`${currentPath}/${entry.name}`}
                                        title={entry.name}
                                        icon={<Ionicons name="folder-outline" size={22} color={theme.colors.textSecondary} />}
                                        onPress={() => setCurrentPath(joinPath(currentPath || rootPath, entry.name))}
                                        showDivider={index < filteredEntries.length - 1}
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
