// QuickAddInput.tsx
// Dumb bar-only component. Modal state and EditorModal rendering have been
// LIFTED to NotesListScreen so that NotesListScreen can render the EditorModal
// at SCREEN LEVEL with eagerMount=true — which keeps the SmartEditor's
// WKWebView in the visible window from app launch, eliminating the 4-6 s
// WebKit cold start the user previously felt on their first "new note" tap.

import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SURROUND_COLOR } from '../theme/listExperiment';

interface QuickAddInputProps {
    text: string;
    isSending: boolean;
    bottomPadding: number;
    onOpenModal: () => void;
    onSend: () => void;
}

export const QuickAddInput: React.FC<QuickAddInputProps> = ({
    text,
    isSending,
    bottomPadding,
    onOpenModal,
    onSend,
}) => {
    const { t } = useTranslation();
    const previewText = text.trim() || null;

    return (
        <View style={[styles.bar, { paddingBottom: bottomPadding }]}>
            <TouchableOpacity
                style={styles.fakeInput}
                onPress={onOpenModal}
                activeOpacity={0.7}
            >
                <Text style={previewText ? styles.previewText : styles.placeholder} numberOfLines={1}>
                    {previewText ?? t('add_note_placeholder')}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.sendButton, (!text.trim() || isSending) && styles.sendButtonDisabled]}
                onPress={onSend}
                disabled={!text.trim() || isSending}
            >
                {isSending
                    ? <ActivityIndicator size="small" color="#000000" />
                    : <Ionicons name="send" size={20} color="#000000" />}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        direction: 'ltr',
        alignItems: 'center',
        backgroundColor: SURROUND_COLOR,
        paddingHorizontal: 16,
        paddingTop: 10,
        gap: 8,
        // Cap readable width on wide screens (web/tablet).
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
    },
    fakeInput: {
        flex: 1,
        minHeight: 44,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E4E6EB',
        paddingHorizontal: 16,
        paddingVertical: 12,
        justifyContent: 'center',
    },
    placeholder: {
        color: '#A9A9A9',
        fontSize: 15,
    },
    previewText: {
        color: '#333',
        fontSize: 15,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    sendButtonDisabled: {
        backgroundColor: '#E8E8E8',
        shadowOpacity: 0,
        elevation: 0,
    },
});
