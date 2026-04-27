// SettingsScreen.tsx - App settings and PureNotes Vault configuration

import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    Platform,
    Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNotesStore } from '../stores/notesStore';
import PureNotesService from '../services/PureNotesService';
import StorageService from '../services/StorageService';
import { ArchiveModal } from '../components/ArchiveModal';
import { RTL_TEXT_STYLE } from '../utils/rtlUtils';

export const SettingsScreen = ({ navigation }: any) => {
    const { t } = useTranslation();
    const { settings, updateSettings, setVaultConfig /* [INACTIVE] setEditorMode */ } = useNotesStore();
    const [vaultName, setVaultName] = useState(settings.vault?.vaultName || '');
    const [isArchiveVisible, setIsArchiveVisible] = useState(false);
    // Custom-styled disconnect confirmation. Replaces Alert.alert which is
    // unreliable on react-native-web (the auto-converted browser confirm
    // could be auto-dismissed by some browsers and didn't fire onPress).
    const [isDisconnectConfirmVisible, setIsDisconnectConfirmVisible] = useState(false);

    const handleSelectVaultDirectory = async () => {
        try {
            const vaultConfig = await StorageService.selectExternalFolder();

            if (vaultConfig) {
                // If user entered a manual name on iOS, respect it
                if (Platform.OS === 'ios' && vaultName.trim()) {
                    vaultConfig.vaultName = vaultName.trim();
                }

                setVaultConfig(vaultConfig);
                StorageService.setConfig(vaultConfig);

                // Title is the confirmation, body is just the folder name —
                // no redundant "Success" header or marketing text.
                Alert.alert(t('folder_selected_success'), vaultConfig.vaultName);
            }
        } catch (error) {
            console.error('Error selecting vault:', error);
            Alert.alert(t('error'), t('cannot_select_folder'));
        }
    };

    const handleDisconnectVault = () => {
        // Open a custom-styled confirmation modal instead of Alert.alert —
        // the native alert behaves inconsistently on react-native-web and
        // doesn't visually match the rest of the app on any platform.
        setIsDisconnectConfirmVisible(true);
    };

    const performDisconnect = () => {
        setVaultConfig({ vaultName: '', isConnected: false });
        setVaultName('');
        setIsDisconnectConfirmVisible(false);
    };

    const handleAutoSyncToggle = (value: boolean) => {
        if (value && !settings.vault?.isConnected) {
            Alert.alert(t('error'), t('connect_vault_first'));
            return;
        }
        updateSettings({ autoSync: value });
    };

    return (
        <ScrollView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('settings')}</Text>
                <View style={styles.placeholder} />
            </View>

            {/* Storage Configuration */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('storage_location')}</Text>

                {!settings.vault?.isConnected ? (
                    <>
                        {/* On web there's no "internal" vs "external" — the
                            browser only has the user's chosen folder. Hide the
                            local-storage card + the dual-option framing, and
                            show just a single folder picker. */}
                        {Platform.OS !== 'web' && (
                            <>
                                <View style={styles.storageCard}>
                                    <Ionicons name="phone-portrait-outline" size={24} color="#666" />
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.storageTitle}>{t('local_storage')}</Text>
                                        <Text style={styles.storageDesc}>{t('local_storage_desc')}</Text>
                                    </View>
                                    <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                                </View>

                                <Text style={styles.sectionSubtitle}>{t('cloud_storage_connection')}</Text>
                            </>
                        )}

                        <Text style={styles.description}>
                            {t('cloud_storage_desc')}
                        </Text>

                        <TouchableOpacity
                            style={[styles.button, styles.buttonPrimary]}
                            onPress={handleSelectVaultDirectory}
                        >
                            <Ionicons name="folder-open" size={20} color="#FFFFFF" />
                            <Text style={styles.buttonText}>
                                {Platform.OS === 'ios'
                                    ? t('select_icloud_drive')
                                    : Platform.OS === 'web'
                                        ? t('select_folder_web')
                                        : t('select_external_folder')}
                            </Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <View style={styles.storageCard}>
                            <Ionicons name="cloud-outline" size={24} color="#000000" />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.storageTitle}>
                                    {Platform.OS === 'web'
                                        ? t('connected_folder_web')
                                        : t('connected_external_storage')}
                                </Text>
                                <Text style={styles.storageDesc} numberOfLines={1}>
                                    {settings.vault.vaultName}
                                </Text>
                            </View>
                            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                        </View>

                        {settings.vault.vaultDirectoryUri && (
                            <Text style={styles.pathText}>
                                {decodeURIComponent(settings.vault.vaultDirectoryUri)}
                            </Text>
                        )}

                        <TouchableOpacity
                            style={[styles.button, styles.buttonSecondary]}
                            onPress={handleDisconnectVault}
                        >
                            <Ionicons name="log-out-outline" size={20} color="#03A9F4" />
                            <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                                {Platform.OS === 'web'
                                    ? t('disconnect_folder_web')
                                    : t('back_to_local_storage')}
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.hint}>
                            {t('notes_saved_in_folder_hint')}
                        </Text>
                    </>
                )}
            </View>

            {/* [INACTIVE] Editor Settings — בחירת מצב עורך מושבתת. ברירת מחדל: richtext בלבד.
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>תצוגת עורך הטקסט</Text>
                <Text style={styles.description}>
                    בחר באיזה ממשק תרצה לערוך את הפתקים. הפורמט שיישמר לקובץ תמיד יהיה Markdown.
                </Text>

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <TouchableOpacity
                        style={[
                            styles.button,
                            { flex: 1, justifyContent: 'center', opacity: settings.editorMode === 'richtext' ? 1 : 0.6 },
                            settings.editorMode === 'richtext' ? styles.buttonPrimary : styles.buttonSecondary
                        ]}
                        onPress={() => setEditorMode('richtext')}
                    >
                        <Ionicons name="document-text-outline" size={20} color={settings.editorMode === 'richtext' ? "#FFFFFF" : "#03A9F4"} />
                        <Text style={[
                            styles.buttonText,
                            { marginLeft: 8 },
                            settings.editorMode === 'richtext' ? {} : styles.buttonTextSecondary
                        ]}>
                            עורך עשיר (Web)
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.button,
                            { flex: 1, justifyContent: 'center', opacity: settings.editorMode === 'markdown' ? 1 : 0.6 },
                            settings.editorMode === 'markdown' ? styles.buttonPrimary : styles.buttonSecondary
                        ]}
                        onPress={() => setEditorMode('markdown')}
                    >
                        <Ionicons name="code-slash-outline" size={20} color={settings.editorMode === 'markdown' ? "#FFFFFF" : "#03A9F4"} />
                        <Text style={[
                            styles.buttonText,
                            { marginLeft: 8 },
                            settings.editorMode === 'markdown' ? {} : styles.buttonTextSecondary
                        ]}>
                            קוד (Markdown)
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
            */}

            {/* Archive Settings */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('archive')}</Text>

                <TouchableOpacity
                    style={[styles.button, styles.buttonSecondary]}
                    onPress={() => setIsArchiveVisible(true)}
                >
                    <Ionicons name="archive-outline" size={20} color="#03A9F4" />
                    <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                        {t('manage_archive')}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* App Info */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('about')}</Text>
                <Text style={styles.infoText}>{t('version', { version: '1.1.0' })}</Text>
                <Text style={styles.infoText}>
                    {t('app_mission')}
                </Text>
            </View>

            {/* Archive Modal */}
            <ArchiveModal
                visible={isArchiveVisible}
                onClose={() => setIsArchiveVisible(false)}
            />

            {/* Custom disconnect confirmation — matches app style and works
                reliably on every platform (unlike Alert.alert on web). */}
            <Modal
                visible={isDisconnectConfirmVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setIsDisconnectConfirmVisible(false)}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    style={styles.confirmBackdrop}
                    onPress={() => setIsDisconnectConfirmVisible(false)}
                >
                    {/* Stop the inner card from receiving the backdrop tap. */}
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.confirmDialog}>
                        <Text style={styles.confirmTitle}>{t('disconnect')}</Text>
                        <Text style={styles.confirmMessage}>
                            {t('disconnect_vault_confirm', { name: settings.vault?.vaultName })}
                        </Text>
                        <View style={styles.confirmButtonsRow}>
                            <TouchableOpacity
                                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                                onPress={() => setIsDisconnectConfirmVisible(false)}
                            >
                                <Text style={styles.confirmBtnCancelText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.confirmBtn, styles.confirmBtnDestructive]}
                                onPress={performDisconnect}
                            >
                                <Text style={styles.confirmBtnDestructiveText}>{t('disconnect_action')}</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9F9F9',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1A1A1A',
    },
    backButton: {
        padding: 8,
    },
    placeholder: {
        width: 40,
    },
    section: {
        backgroundColor: '#FFFFFF',
        padding: 20,
        marginTop: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1A1A1A',
        marginBottom: 16,
    },
    sectionSubtitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginTop: 16,
        marginBottom: 8,
    },
    description: {
        fontSize: 14,
        color: '#666',
        marginBottom: 16,
        lineHeight: 20,
    },
    button: {
        flexDirection: 'row',
        backgroundColor: '#000000',
        padding: 14,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    buttonSecondary: {
        backgroundColor: '#E1F5FE',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    buttonTextSecondary: {
        color: '#03A9F4',
    },
    infoText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },
    hint: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
        textAlign: 'center',
        marginTop: 8,
    },
    buttonPrimary: {
        backgroundColor: '#000000',
    },
    storageCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    storageTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1A1A1A',
        marginBottom: 4,
        ...RTL_TEXT_STYLE,
    },
    storageDesc: {
        fontSize: 13,
        color: '#666',
        ...RTL_TEXT_STYLE,
    },
    pathText: {
        fontSize: 12,
        color: '#999',
        fontFamily: 'monospace',
        marginBottom: 16,
        textAlign: 'center',
    },
    // ── Disconnect confirmation modal ────────────────────────────────────
    confirmBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    confirmDialog: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 6,
    },
    confirmTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 8,
        textAlign: 'center',
    },
    confirmMessage: {
        fontSize: 14,
        color: '#555',
        lineHeight: 20,
        marginBottom: 20,
        textAlign: 'center',
    },
    confirmButtonsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    confirmBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmBtnCancel: {
        backgroundColor: '#F0F0F0',
    },
    confirmBtnCancelText: {
        color: '#1A1A1A',
        fontSize: 15,
        fontWeight: '600',
    },
    confirmBtnDestructive: {
        backgroundColor: '#000000',
    },
    confirmBtnDestructiveText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
});
