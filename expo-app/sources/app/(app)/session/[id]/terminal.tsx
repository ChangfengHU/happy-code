import * as React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/text';

export default function SessionTerminalFallback() {
    const router = useRouter();
    const route = useRoute();
    const params = (route.params || {}) as { id?: string };
    const sessionId = params.id;
    const { theme } = useUnistyles();

    if (Platform.OS === 'web') {
        // Web should render the .web version instead
        return null;
    }

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.colors.groupped.background }}>
            <Ionicons name="terminal-outline" size={48} color={theme.colors.textLink} style={{ marginBottom: 16 }} />
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '600', textAlign: 'center', marginBottom: 8 }}>
                {t('terminal.webBrowserRequired')}
            </Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
                {t('terminal.webBrowserRequiredDescription')}
            </Text>
            <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => ({
                    backgroundColor: pressed ? theme.colors.surfaceHover : theme.colors.surface,
                    paddingVertical: 10,
                    paddingHorizontal: 24,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.divider,
                })}
            >
                <Text style={{ color: theme.colors.text }}>返回会话</Text>
            </Pressable>
        </View>
    );
}
