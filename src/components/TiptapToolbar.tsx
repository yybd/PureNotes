// TiptapToolbar.tsx
// Native toolbar for the TiptapEditor.
// Uses useBridgeState to track active formatting and calls official EditorBridge
// commands — no custom JavaScript injection.

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
import { useBridgeState, type EditorBridge } from '@10play/tentap-editor';

// ─── Props ───────────────────────────────────────────────────────────────────

interface TiptapToolbarProps {
    /** The EditorBridge instance returned by TiptapEditor.editorBridge. */
    editor: EditorBridge;
    onPinPress?: () => void;
    isPinned?: boolean;
    /** Called when the dismiss button is pressed. If provided, replaces the default keyboard-dismiss behaviour. */
    onDismiss?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const TiptapToolbar: React.FC<TiptapToolbarProps> = ({
    editor,
    onPinPress,
    isPinned,
    onDismiss,
}) => {
    // useBridgeState re-renders this component whenever the editor selection
    // changes — giving us live active/inactive state for every button.
    const editorState = useBridgeState(editor);

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.container}
            contentContainerStyle={styles.row}
            keyboardShouldPersistTaps="always"
        >

            {/* H1 */}
            <ToolBtn
                active={editorState.headingLevel === 1}
                onPress={() => editor.toggleHeading(1)}
            >
                <Text style={styles.label}>
                    H1
                </Text>
            </ToolBtn>

            {/* Bold */}
            <ToolBtn
                active={editorState.isBoldActive}
                onPress={() => editor.toggleBold()}
            >
                <Text style={styles.labelBold}>
                    B
                </Text>
            </ToolBtn>

            {/* Bullet list */}
            <ToolBtn
                active={editorState.isBulletListActive}
                onPress={() => editor.toggleBulletList()}
            >
                <Ionicons
                    name="list"
                    size={22}
                    color="#000000"
                />
            </ToolBtn>

            {/* Task / checkbox list */}
            <ToolBtn
                active={editorState.isTaskListActive}
                onPress={() => editor.toggleTaskList()}
            >
                <Ionicons
                    name="checkbox-outline"
                    size={22}
                    color="#000000"
                />
            </ToolBtn>

            {/* Separator */}
            <View style={styles.vSeparator} />

            {/* Pin */}
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

// ─── Small helper so each button is DRY ──────────────────────────────────────

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

// ─── Styles ──────────────────────────────────────────────────────────────────

const BTN_SIZE = 40;

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'transparent',
        flex: 1,
    },
    row: {
        // flexGrow:1 ensures the row fills the ScrollView width when buttons
        // are narrower than the bar, so justifyContent can actually center
        // them. When buttons exceed the width the scroll still works because
        // flexGrow does not shrink content below its natural size.
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
