// EnrichedToolbar.tsx
// Toolbar for the EnrichedEditor (react-native-enriched native editor).
//
// Mirrors the behavior of TiptapToolbar.tsx but consumes RNE's command bridge
// + state-event payload instead of TenTap's useBridgeState hook. The visual
// layout, button set, and button order are intentionally identical so the
// user sees no UX change when the USE_NATIVE_EDITOR feature flag is flipped.

import React from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Keyboard,
    Text,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { OnChangeStateEvent } from 'react-native-enriched';
import type { EnrichedEditorBridge } from './EnrichedEditor';

interface EnrichedToolbarProps {
    /** Bridge object exposed via EnrichedEditor.editorBridge */
    editor: EnrichedEditorBridge;
    /**
     * Latest formatting state — fed in by the parent (SmartEditor) which
     * subscribes to EnrichedEditor's onStateChange. Null until the first
     * selection event fires (initial render).
     */
    state: OnChangeStateEvent | null;
    onPinPress?: () => void;
    isPinned?: boolean;
    /** Called on the dismiss button. Falls back to keyboard.dismiss() */
    onDismiss?: () => void;
}

export const EnrichedToolbar: React.FC<EnrichedToolbarProps> = ({
    editor,
    state,
    onPinPress,
    isPinned,
    onDismiss,
}) => {
    // RNE state may be null until the first selection event fires. Default
    // each "active" flag to false in that window so buttons render in their
    // inactive state, not as undefined.
    const isH1Active = state?.h1?.isActive ?? false;
    const isBoldActive = state?.bold?.isActive ?? false;
    const isUnorderedListActive = state?.unorderedList?.isActive ?? false;
    const isCheckboxListActive = state?.checkboxList?.isActive ?? false;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.container}
            contentContainerStyle={styles.row}
            keyboardShouldPersistTaps="always"
        >
            {/* H1 */}
            <ToolBtn active={isH1Active} onPress={() => editor.toggleH1()}>
                <Text style={styles.label}>H1</Text>
            </ToolBtn>

            {/* Bold */}
            <ToolBtn active={isBoldActive} onPress={() => editor.toggleBold()}>
                <Text style={styles.labelBold}>B</Text>
            </ToolBtn>

            {/* Bullet list */}
            <ToolBtn
                active={isUnorderedListActive}
                onPress={() => editor.toggleUnorderedList()}
            >
                <Ionicons name="list" size={22} color="#000000" />
            </ToolBtn>

            {/* Checkbox / task list. RNE's toggleCheckboxList takes a
                boolean for whether NEW items start checked — pass false so
                new items start unchecked, matching Tiptap's default. */}
            <ToolBtn
                active={isCheckboxListActive}
                onPress={() => editor.toggleCheckboxList(false)}
            >
                <Ionicons name="checkbox-outline" size={22} color="#000000" />
            </ToolBtn>

            <View style={styles.vSeparator} />

            {/* Pin (matches TiptapToolbar) */}
            {onPinPress && (
                <TouchableOpacity
                    onPress={onPinPress}
                    style={[styles.btn, isPinned && styles.pinActive]}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
                >
                    <MaterialCommunityIcons
                        name={isPinned ? 'pin' : 'pin-outline'}
                        size={22}
                        color={isPinned ? '#000000' : '#666'}
                    />
                </TouchableOpacity>
            )}

            {/* Dismiss keyboard / close */}
            <TouchableOpacity
                onPress={() => {
                    editor.blur();
                    Keyboard.dismiss();
                    onDismiss?.();
                }}
                style={[styles.btn, styles.dismissBtn]}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
            >
                <Ionicons name="chevron-down" size={22} color="#666" />
            </TouchableOpacity>
        </ScrollView>
    );
};

interface ToolBtnProps {
    active: boolean;
    onPress: () => void;
    children: React.ReactNode;
}

const ToolBtn: React.FC<ToolBtnProps> = ({ active, onPress, children }) => (
    <TouchableOpacity
        style={[styles.btn, active && styles.btnActive]}
        onPress={onPress}
        activeOpacity={0.7}
    >
        {children}
    </TouchableOpacity>
);

const BTN_SIZE = 40;

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'transparent',
        flex: 1,
    },
    row: {
        flexGrow: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        gap: 4,
        minHeight: BTN_SIZE + 8,
    },
    btn: {
        width: BTN_SIZE,
        height: BTN_SIZE,
        borderRadius: 8,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 2,
    },
    btnActive: {
        backgroundColor: '#F5F5F5',
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000000',
    },
    labelBold: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000000',
    },
    vSeparator: {
        width: 1,
        height: 24,
        backgroundColor: '#E0E0E0',
        marginHorizontal: 4,
    },
    dismissBtn: {
        backgroundColor: 'transparent',
    },
    pinActive: {
        backgroundColor: '#F5F5F5',
    },
});
