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
    Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SURROUND_COLOR, CHROME_FULL_WIDTH } from '../theme/listExperiment';

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
        // Outer wrapper paints the gray chrome (full-width in minimal,
        // capped at 720 in default) AND acts as the open-modal hit
        // target — tapping anywhere on the gray (including the wings on
        // wide screens and the safe-area padding below) opens the
        // QuickAdd modal. The inner sendButton is a TouchableOpacity, so
        // its press is captured by the responder system before bubbling
        // up to the outer Pressable.
        <Pressable
            style={[styles.barOuter, { paddingBottom: bottomPadding }]}
            onPress={onOpenModal}
        >
            <View style={styles.barInner}>
                {/* fakeInput no longer needs its own Touchable — the
                    outer Pressable handles taps on it (and on the gray
                    around it) uniformly. */}
                <View style={styles.fakeInput}>
                    <Text style={previewText ? styles.previewText : styles.placeholder} numberOfLines={1}>
                        {previewText ?? t('add_note_placeholder')}
                    </Text>
                </View>

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
        </Pressable>
    );
};

const styles = StyleSheet.create({
    // Outer chrome strip — paints the gray. In minimal it spans the full
    // screen; in default it stays capped at 720 px (the original look).
    barOuter: {
        backgroundColor: SURROUND_COLOR,
        width: '100%',
        ...(CHROME_FULL_WIDTH ? null : { maxWidth: 720, alignSelf: 'center' as const }),
    },
    // Inner row — the input + send button. Always capped at 720 so the
    // controls stay on the readable rail on wide screens.
    barInner: {
        flexDirection: 'row',
        direction: 'ltr',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 10,
        gap: 8,
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
