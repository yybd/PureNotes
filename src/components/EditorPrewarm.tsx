// EditorPrewarm.tsx
// Warms iOS WebKit at app startup. Renders a tiny off-screen, non-interactive
// TiptapEditor whose WKWebView lives in the visible window from t=0 — that's
// what triggers iOS to spawn the WebContent process (4-6 seconds on iPad)
// and load the WebKit framework into kernel/process memory caches.
//
// CRITICAL: this MUST mount eagerly (no setTimeout / no InteractionManager).
// The expensive part — iOS WebContent process launch + GPU process spin-up —
// happens NATIVELY off the JS thread, regardless of when JS runs. What we
// control is when the WKWebView is added to the view hierarchy. Adding it at
// t=0 vs t=200 ms is exactly the latency the user feels on the first
// "new note" tap, because by then the WebKit framework is in OS caches and
// the modal's NEW WKWebView spins up much faster (1-2 s instead of 6 s).
//
// Putting it inside an RN <Modal visible={false}> doesn't work — iOS only
// launches the WebContent process when the WKWebView is in a visible
// window. Hidden modals don't qualify. This component sits at App root in
// the actual visible window (offscreen via top: -10000), which does qualify.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { TiptapEditor } from './TiptapEditor';

export const EditorPrewarm: React.FC = () => {
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
