// ArchiveModal.tsx - Modal for viewing and managing archived notes

import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    FlatList,
    Alert,
    ActivityIndicator,
    useWindowDimensions
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Note } from '../types/Note';
import StorageService from '../services/StorageService';
import { useNotesStore } from '../stores/notesStore';
import { RTL_TEXT_STYLE, RTL_ROW } from '../utils/rtlUtils';

interface ArchiveModalProps {
    visible: boolean;
    onClose: () => void;
}

export const ArchiveModal: React.FC<ArchiveModalProps> = ({ visible, onClose }) => {
    const { t } = useTranslation();
    const [archivedNotes, setArchivedNotes] = useState<Note[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
    const { loadNotes } = useNotesStore();
    const { height: screenHeight } = useWindowDimensions();

    const fetchArchivedNotes = async () => {
        setIsLoading(true);
        try {
            const notes = await StorageService.listArchivedNotes();
            setArchivedNotes(notes);
        } catch (error) {
            console.error('Error fetching archived notes:', error);
            Alert.alert(t('error'), t('cannot_load_archive'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (visible) {
            fetchArchivedNotes();
        }
    }, [visible]);

    const handleRestore = async (note: Note) => {
        try {
            await StorageService.restoreNote(note);
            setArchivedNotes(prev => prev.filter(n => n.id !== note.id));
            loadNotes(); // Refresh main list
        } catch (error) {
            console.error('Error restoring note:', error);
            Alert.alert(t('error'), t('cannot_restore_note'));
        }
    };

    const handleDeleteForever = (note: Note) => {
        Alert.alert(
            t('delete_forever_title'),
            t('delete_forever_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete_action'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await StorageService.deleteArchivedNote(note);
                            setArchivedNotes(prev => prev.filter(n => n.id !== note.id));
                        } catch (error) {
                            console.error('Error deleting note forever:', error);
                            Alert.alert(t('error'), t('cannot_delete_note'));
                        }
                    }
                }
            ]
        );
    };

    const handleEmptyArchive = () => {
        Alert.alert(
            t('empty_archive_title'),
            t('empty_archive_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete_all'),
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoading(true);
                        try {
                            await StorageService.emptyArchive();
                            setArchivedNotes([]);
                        } catch (error) {
                            console.error('Error emptying archive:', error);
                            Alert.alert(t('error'), t('cannot_empty_archive'));
                        } finally {
                            setIsLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const toggleExpand = (id: string) => {
        setExpandedNoteId(prev => prev === id ? null : id);
    };

    const renderItem = ({ item }: { item: Note }) => {
        const isExpanded = expandedNoteId === item.id;

        return (
            <View style={styles.noteItem}>
                <TouchableOpacity
                    style={styles.noteContent}
                    onPress={() => toggleExpand(item.id)}
                    activeOpacity={0.7}
                >
                    <Text style={styles.noteTitle} numberOfLines={isExpanded ? undefined : 1}>{item.title}</Text>
                    <Text style={styles.noteText} numberOfLines={isExpanded ? undefined : 2}>
                        {item.content.replace(/^# /, '').trim()}
                    </Text>
                </TouchableOpacity>
                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.restoreButton]}
                        onPress={() => handleRestore(item)}
                    >
                        <Ionicons name="refresh-outline" size={20} color="#4CAF50" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDeleteForever(item)}
                    >
                        <Ionicons name="trash-outline" size={20} color="#F44336" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxHeight: screenHeight * 0.9 }]}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="#1A1A1A" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>{t('archive_title')}</Text>
                        <View style={styles.headerPlaceholder} />
                    </View>

                    {isLoading ? (
                        <View style={styles.centerContainer}>
                            <ActivityIndicator size="large" color="#6200EE" />
                        </View>
                    ) : archivedNotes.length === 0 ? (
                        <View style={styles.centerContainer}>
                            <Ionicons name="archive-outline" size={64} color="#CCC" />
                            <Text style={styles.emptyText}>{t('archive_empty')}</Text>
                        </View>
                    ) : (
                        <>
                            <FlatList
                                data={archivedNotes}
                                keyExtractor={item => item.id}
                                renderItem={renderItem}
                                contentContainerStyle={styles.listContent}
                            />
                            <View style={styles.footer}>
                                <TouchableOpacity
                                    style={styles.emptyArchiveButton}
                                    onPress={handleEmptyArchive}
                                >
                                    <Ionicons name="trash-bin-outline" size={20} color="#FFFFFF" />
                                    <Text style={styles.emptyArchiveText}>{t('delete_all')}</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end', // Slide from bottom
    },
    modalContent: {
        backgroundColor: '#F9F9F9',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 8,
        flex: 1,
    },
    header: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1A1A1A',
    },
    closeButton: {
        padding: 4,
    },
    headerPlaceholder: {
        width: 32,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 18,
        color: '#999',
        marginTop: 16,
        fontWeight: '500',
    },
    listContent: {
        padding: 16,
        paddingBottom: 24,
    },
    noteItem: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    noteContent: {
        flex: 1,
        marginLeft: 16,
    },
    noteTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1A1A1A',
        marginBottom: 4,
        ...RTL_TEXT_STYLE,
    },
    noteText: {
        fontSize: 14,
        color: '#666',
        ...RTL_TEXT_STYLE,
    },
    actionButtons: {
        flexDirection: 'row-reverse',
    },
    actionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
        backgroundColor: '#F5F5F5',
    },
    restoreButton: {
        backgroundColor: '#E8F5E9',
    },
    deleteButton: {
        backgroundColor: '#FFEBEE',
    },
    footer: {
        padding: 16,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
    },
    emptyArchiveButton: {
        flexDirection: 'row-reverse',
        backgroundColor: '#F44336',
        padding: 14,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyArchiveText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginRight: 8,
    }
});
