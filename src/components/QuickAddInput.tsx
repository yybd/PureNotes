import React, { useRef, useImperativeHandle, forwardRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DomainType } from '../types/Note';
import { EditorModal, EditorModalRef } from './EditorModal';

interface QuickAddInputProps {
    text: string;
    isPinned: boolean;
    domain: DomainType | null;
    isSending: boolean;
    bottomPadding: number;
    onTextChange: (text: string) => void;
    onPinChange: (isPinned: boolean) => void;
    onDomainChange: (domain: DomainType | null) => void;
    onSend: () => void;
    onFocus: () => void;
    onBlur?: () => void;
}

export interface QuickAddInputRef {
    clear: () => void;
    setTextAndSelection: (text: string, sel: { start: number; end: number }) => void;
    blur: () => void;
    openModal: () => void;
}

export const QuickAddInput = forwardRef<QuickAddInputRef, QuickAddInputProps>(({
    text,
    isPinned,
    domain,
    isSending,
    bottomPadding,
    onTextChange,
    onPinChange,
    onDomainChange,
    onSend,
    onFocus,
    onBlur,
}, ref) => {
    const { t } = useTranslation();
    const [modalVisible, setModalVisible] = useState(false);
    const editorModalRef = useRef<EditorModalRef>(null);

    useImperativeHandle(ref, () => ({
        clear: () => { editorModalRef.current?.clear(); },
        setTextAndSelection: (t, sel) => { editorModalRef.current?.setTextAndSelection(t, sel); },
        blur: () => {
            editorModalRef.current?.blur();
            setModalVisible(false);
        },
        openModal: () => {
            handleOpenModal();
        },
    }), []);

    const handleOpenModal = () => {
        setModalVisible(true);
        onFocus();
    };

    const handleSendFromBar = () => {
        onSend();
    };

    const handleClose = () => {
        setModalVisible(false);
        onBlur?.();
    };

    const previewText = text.trim() || null;

    return (
        <>
            {/* ── Closed state: simple tappable row ── */}
            <View style={[styles.bar, { paddingBottom: bottomPadding }]}>
                <TouchableOpacity
                    style={styles.fakeInput}
                    onPress={handleOpenModal}
                    activeOpacity={0.7}
                >
                    <Text style={previewText ? styles.previewText : styles.placeholder} numberOfLines={1}>
                        {previewText ?? t('add_note_placeholder')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.sendButton, (!text.trim() || isSending) && styles.sendButtonDisabled]}
                    onPress={handleSendFromBar}
                    disabled={!text.trim() || isSending}
                >
                    {isSending
                        ? <ActivityIndicator size="small" color="#000000" />
                        : <Ionicons name="send" size={20} color="#000000" />}
                </TouchableOpacity>
            </View>

            {/* ── Shared full-screen editor modal ── */}
            <EditorModal
                ref={editorModalRef}
                visible={modalVisible}
                text={text}
                domain={domain}
                isPinned={isPinned}
                isSaving={isSending}
                onTextChange={onTextChange}
                onDomainChange={onDomainChange}
                onPinChange={onPinChange}
                onSave={onSend}
                onClose={handleClose}
                requireDomain={true}
            />
        </>
    );
});

QuickAddInput.displayName = 'QuickAddInput';

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        direction: 'ltr',
        alignItems: 'center',
        backgroundColor: '#F0F2F5',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        paddingHorizontal: 16,
        paddingTop: 10,
        gap: 8,
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
