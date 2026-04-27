// EditorPrewarm.tsx
// Warms the Tiptap WebView at app startup so the *first* time the user opens
// the editor modal it doesn't pay the ~300–500ms cold-start cost (WebView
// native module load + Tiptap JS bundle init in the WebView). Renders a tiny
// off-screen, non-interactive editor instance that initializes in the
// background while the user is still browsing the notes list.

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { TiptapEditor } from './TiptapEditor';

export const EditorPrewarm: React.FC = () => {
    // Mount only after the first paint to avoid stealing CPU from the initial
    // notes-list render. A tiny defer keeps the cold-start of the screen snappy
    // while still finishing the WebView warm-up well before the user can tap.
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const id = setTimeout(() => setMounted(true), 200);
        return () => clearTimeout(id);
    }, []);

    if (!mounted) return null;

    return (
        <View style={styles.hidden} pointerEvents="none" accessible={false}>
            <TiptapEditor initialHtml="" autoFocus={false} />
        </View>
    );
};

const styles = StyleSheet.create({
    // Off-screen, invisible, non-interactive. The WebView still initializes
    // because it is mounted in the React tree.
    hidden: {
        position: 'absolute',
        width: 1,
        height: 1,
        top: -10000,
        left: -10000,
        opacity: 0,
    },
});
