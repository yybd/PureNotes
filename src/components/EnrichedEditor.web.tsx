// EnrichedEditor.web.tsx
// WEB STUB. The native (iOS/Android) implementation lives in EnrichedEditor.tsx
// and depends on `react-native-enriched`, whose package.json `exports` field
// only declares `react-native` and `default` conditions — no `browser`. On
// Web, Metro resolves the native source which immediately calls
// `codegenNativeCommands(...)` — a function that doesn't exist in
// `react-native-web` — producing a TypeError on page load.
//
// This stub:
//   1. Avoids the runtime crash by NOT importing `react-native-enriched`.
//   2. Exposes the same TypeScript types so SmartEditor's static imports
//      from './EnrichedEditor' resolve cleanly on Web.
//   3. Provides a component that throws if rendered, as a safety net —
//      USE_NATIVE_EDITOR is `false` on Web (see src/config/editorMode.ts),
//      so SmartEditor's branch never reaches this code path.
//
// Metro's platform-extension resolution picks `.web.tsx` over `.tsx` only
// on Web, so iOS/Android keep the real implementation untouched.

import React, { forwardRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

// ─── Types (mirror EnrichedEditor.tsx exactly) ─────────────────────────────

export interface EnrichedEditorBridge {
    focus: () => void;
    blur: () => void;
    toggleBold: () => void;
    toggleItalic: () => void;
    toggleUnderline: () => void;
    toggleStrikeThrough: () => void;
    toggleInlineCode: () => void;
    toggleH1: () => void;
    toggleH2: () => void;
    toggleH3: () => void;
    toggleH4: () => void;
    toggleH5: () => void;
    toggleH6: () => void;
    toggleBlockQuote: () => void;
    toggleCodeBlock: () => void;
    toggleOrderedList: () => void;
    toggleUnorderedList: () => void;
    toggleCheckboxList: (checked: boolean) => void;
}

export interface EnrichedEditorRef {
    getHtml: () => Promise<string>;
    focus: () => void;
    blur: () => void;
    setHtml: (html: string) => void;
    editorBridge: EnrichedEditorBridge;
}

export interface EnrichedEditorProps {
    initialHtml: string;
    onChange?: (html: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onReady?: () => void;
    // On Web, OnChangeStateEvent isn't available because we don't load
    // `react-native-enriched`. Use `unknown` so callers that pass a typed
    // handler from the native build still type-check on Web.
    onStateChange?: (state: unknown) => void;
    placeholder?: string;
    style?: StyleProp<ViewStyle>;
    autoFocus?: boolean;
    backgroundColor?: string;
}

// ─── Stub component ─────────────────────────────────────────────────────────

export const EnrichedEditor = forwardRef<EnrichedEditorRef, EnrichedEditorProps>(
    () => {
        // Hard fail loudly if SmartEditor ever reaches this on Web — that
        // would mean USE_NATIVE_EDITOR was somehow `true` on Web, which is
        // a config bug worth surfacing rather than silently no-op'ing.
        throw new Error(
            'EnrichedEditor is not available on Web. Ensure USE_NATIVE_EDITOR ' +
            'is gated to non-web platforms (see src/config/editorMode.ts).'
        );
    },
);

EnrichedEditor.displayName = 'EnrichedEditor';
