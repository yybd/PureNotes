// EditorPrewarm.tsx
// Warms the Tiptap WebView at app startup so the *first* time the user opens
// the editor modal it doesn't pay the ~300–500ms cold-start cost (WebView
// native module load + Tiptap JS bundle init in the WebView). Renders a tiny
// off-screen, non-interactive editor instance that initializes in the
// background while the user is still browsing the notes list.

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, InteractionManager } from 'react-native';
import { TiptapEditor } from './TiptapEditor';

export const EditorPrewarm: React.FC = () => {
    // Mount as soon as React Native's interaction queue is idle. Replaces a
    // hard-coded setTimeout(200) which over-delayed the prewarm even when the
    // JS thread was already free — costing up to 200 ms on the very first
    // "new note" tap, which is precisely the cold-start the prewarm exists
    // to eliminate. InteractionManager waits exactly as long as needed and
    // no longer, so the WebView mount overlaps with idle time after first paint.
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const handle = InteractionManager.runAfterInteractions(() => {
            setMounted(true);
        });
        return () => handle.cancel();
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
