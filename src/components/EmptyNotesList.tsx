import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useNotesStore } from '../stores/notesStore';

interface EmptyNotesListProps {
    isLoading: boolean;
}

export const EmptyNotesList: React.FC<EmptyNotesListProps> = ({ isLoading }) => {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const { settings } = useNotesStore();

    if (isLoading) {
        return (
            <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color="#000000" />
            </View>
        );
    }

    // On web, the app cannot write notes anywhere until the user picks a
    // folder via the File System Access API. Direct them to settings instead
    // of showing the misleading "no notes yet" message.
    const needsFolderConnection = Platform.OS === 'web' && !settings.vault?.isConnected;
    if (needsFolderConnection) {
        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={64} color="#CCC" />
                <Text style={styles.emptyTitle}>{t('connect_folder_prompt')}</Text>
                <Text style={styles.emptyText}>{t('connect_folder_desc')}</Text>
                <TouchableOpacity
                    style={styles.connectBtn}
                    onPress={() => navigation.navigate('Settings')}
                >
                    <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.connectBtnText}>{t('open_settings')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#CCC" />
            <Text style={styles.emptyTitle}>{t('no_notes_yet')}</Text>
            <Text style={styles.emptyText}>
                {t('write_note_instruction')}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
        paddingHorizontal: 24,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#666',
        marginTop: 16,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
    },
    connectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#000000',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        marginTop: 20,
    },
    connectBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
});
