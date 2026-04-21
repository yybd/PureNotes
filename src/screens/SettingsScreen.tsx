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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotesStore } from '../stores/notesStore';
import PureNotesService from '../services/PureNotesService';
import StorageService from '../services/StorageService';
import { ArchiveModal } from '../components/ArchiveModal';
import { RTL_TEXT_STYLE } from '../utils/rtlUtils';

export const SettingsScreen = ({ navigation }: any) => {
    const { settings, updateSettings, setVaultConfig /* [INACTIVE] setEditorMode */ } = useNotesStore();
    const [vaultName, setVaultName] = useState(settings.vault?.vaultName || '');
    const [isArchiveVisible, setIsArchiveVisible] = useState(false);

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

                Alert.alert(
                    'הצלחה ✅',
                    `תיקייה נבחרה בהצלחה!\n\n📁 ${vaultConfig.vaultName}\n\n✨ כעת תוכל לכתוב ולקרוא ישירות מהתיקייה!`
                );
            }
        } catch (error) {
            console.error('Error selecting vault:', error);
            Alert.alert('שגיאה', 'לא ניתן לבחור תיקייה');
        }
    };

    const handleDisconnectVault = () => {
        Alert.alert(
            'ניתוק',
            `האם לנתק את ה - Vault "${settings.vault?.vaultName}" ? `,
            [
                { text: 'ביטול', style: 'cancel' },
                {
                    text: 'נתק',
                    style: 'destructive',
                    onPress: () => {
                        setVaultConfig({ vaultName: '', isConnected: false });
                        setVaultName('');
                    },
                },
            ]
        );
    };

    const handleAutoSyncToggle = (value: boolean) => {
        if (value && !settings.vault?.isConnected) {
            Alert.alert('שגיאה', 'חבר קודם את ה-Vault של PureNotes');
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
                <Text style={styles.headerTitle}>הגדרות</Text>
                <View style={styles.placeholder} />
            </View>

            {/* Storage Configuration */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>מיקום האחסון</Text>

                {!settings.vault?.isConnected ? (
                    <>
                        <View style={styles.storageCard}>
                            <Ionicons name="phone-portrait-outline" size={24} color="#666" />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.storageTitle}>אחסון מקומי</Text>
                                <Text style={styles.storageDesc}>הפתקים נשמרים על המכשיר בלבד.</Text>
                            </View>
                            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                        </View>

                        <Text style={styles.sectionSubtitle}>חיבור לענן / חיצוני</Text>
                        <Text style={styles.description}>
                            ניתן לחבר תיקייה חיצונית (כמו iCloud Drive) כדי שהפתקים ישמרו ישירות שם ויסונכרנו עם המחשב.
                        </Text>

                        <TouchableOpacity
                            style={[styles.button, styles.buttonPrimary]}
                            onPress={handleSelectVaultDirectory}
                        >
                            <Ionicons name="folder-open" size={20} color="#FFFFFF" />
                            <Text style={styles.buttonText}>
                                {Platform.OS === 'ios' ? 'בחר תיקיית iCloud Drive' : 'בחר תיקייה חיצונית'}
                            </Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <View style={styles.storageCard}>
                            <Ionicons name="cloud-outline" size={24} color="#6200EE" />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.storageTitle}>אחסון חיצוני מחובר</Text>
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
                                חזור לאחסון מקומי
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.hint}>
                            💡 הפתקים נשמרים ומתעדכנים ישירות בתיקייה שנבחרה.
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
                <Text style={styles.sectionTitle}>ארכיון</Text>
                <Text style={styles.description}>
                    פתקים שהעברת לארכיון ישמרו כאן. ניתן למחוק אותם לצמיתות או לשחזר אותם לרשימה.
                </Text>

                <TouchableOpacity
                    style={[styles.button, styles.buttonSecondary]}
                    onPress={() => setIsArchiveVisible(true)}
                >
                    <Ionicons name="archive-outline" size={20} color="#03A9F4" />
                    <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                        ניהול ארכיון הפתקים
                    </Text>
                </TouchableOpacity>
            </View>

            {/* App Info */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>אודות</Text>
                <Text style={styles.infoText}>גרסה: 1.1.0 (Direct Storage)</Text>
                <Text style={styles.infoText}>
                    הפתקים שלך, איפה שאתה רוצה אותם.
                </Text>
            </View>

            {/* Archive Modal */}
            <ArchiveModal
                visible={isArchiveVisible}
                onClose={() => setIsArchiveVisible(false)}
            />
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
        backgroundColor: '#6200EE',
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
        backgroundColor: '#6200EE',
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
});
