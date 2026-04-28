// EnrichedEditor.tsx
// Native rich text editor wrapper around `react-native-enriched`.
//
// This component mirrors the public surface of TiptapEditor.tsx so it can be
// dropped in as a replacement once the USE_NATIVE_EDITOR feature flag is
// flipped. The interface is INTENTIONALLY shaped to match TiptapEditorRef
// from TiptapEditor.tsx (focus/blur/getHtml/setHtml + an editorBridge-like
// commands object) so SmartEditor and the EditorModal can branch on the
// flag with minimal divergence between the two paths.
//
// Why native instead of WebView (TenTap/Tiptap):
//   On iOS, react-native-webview's WKWebView pays a 4-10 s "WebContent
//   process launch" cold-start tax on the first time the user opens the
//   editor after app launch — and iOS aggressively kills that process for
//   non-browser apps (no com.apple.developer.web-browser-engine.*
//   entitlement). Native UITextView (used here via react-native-enriched)
//   has no such cold start; first-tap is instantaneous on every device.

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
    EnrichedTextInput,
    type EnrichedTextInputInstance,
    type OnChangeStateEvent,
} from 'react-native-enriched';

// ─── Public ref interface ────────────────────────────────────────────────────
// Mirrors TiptapEditorRef as closely as possible so SmartEditor only has to
// branch on the feature flag at one decision point.

/**
 * "Bridge" object surfaced via `editorBridge` for parity with the Tiptap path.
 * The TiptapToolbar consumes a similar shape (toggleBold, toggleHeading, ...).
 * For RNE we expose an equivalent set of commands proxied to the native ref,
 * plus a state-subscription hook so toolbars can reflect active formatting.
 */
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
    /**
     * Bridge-shaped command surface so a toolbar can call `bridge.toggleBold()`
     * just like it would on the Tiptap path. Toolbar reads the live state via
     * the `onChangeState` event (forwarded through props), not via a hook.
     */
    editorBridge: EnrichedEditorBridge;
}

// ─── Props ───────────────────────────────────────────────────────────────────
// Matches TiptapEditorProps so SmartEditor doesn't have to translate.

export interface EnrichedEditorProps {
    initialHtml: string;
    onChange?: (html: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onReady?: () => void;
    /**
     * Toolbar state callback. Fires on selection / formatting changes; the
     * payload mirrors RNE's OnChangeStateEvent so a toolbar can highlight
     * active buttons without owning a bridge state hook.
     */
    onStateChange?: (state: OnChangeStateEvent) => void;
    placeholder?: string;
    style?: StyleProp<ViewStyle>;
    autoFocus?: boolean;
    backgroundColor?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const EnrichedEditor = forwardRef<EnrichedEditorRef, EnrichedEditorProps>(
    (
        {
            initialHtml,
            onChange,
            onFocus,
            onBlur,
            onReady,
            onStateChange,
            placeholder = 'התחל לכתוב...',
            style,
            autoFocus = false,
            backgroundColor = '#FFFFFF',
        },
        ref,
    ) => {
        const inputRef = useRef<EnrichedTextInputInstance | null>(null);

        // Build the bridge object once per mount. All methods proxy to the
        // native ref. We use refs (not state) because the bridge is consumed
        // imperatively by the toolbar — there's no React reactivity needed.
        const bridge = React.useMemo<EnrichedEditorBridge>(() => ({
            focus: () => inputRef.current?.focus(),
            blur: () => inputRef.current?.blur(),
            toggleBold: () => inputRef.current?.toggleBold(),
            toggleItalic: () => inputRef.current?.toggleItalic(),
            toggleUnderline: () => inputRef.current?.toggleUnderline(),
            toggleStrikeThrough: () => inputRef.current?.toggleStrikeThrough(),
            toggleInlineCode: () => inputRef.current?.toggleInlineCode(),
            toggleH1: () => inputRef.current?.toggleH1(),
            toggleH2: () => inputRef.current?.toggleH2(),
            toggleH3: () => inputRef.current?.toggleH3(),
            toggleH4: () => inputRef.current?.toggleH4(),
            toggleH5: () => inputRef.current?.toggleH5(),
            toggleH6: () => inputRef.current?.toggleH6(),
            toggleBlockQuote: () => inputRef.current?.toggleBlockQuote(),
            toggleCodeBlock: () => inputRef.current?.toggleCodeBlock(),
            toggleOrderedList: () => inputRef.current?.toggleOrderedList(),
            toggleUnorderedList: () => inputRef.current?.toggleUnorderedList(),
            toggleCheckboxList: (checked: boolean) =>
                inputRef.current?.toggleCheckboxList(checked),
        }), []);

        useImperativeHandle(ref, () => ({
            getHtml: () => {
                const inst = inputRef.current;
                if (!inst) return Promise.resolve('');
                return inst.getHTML();
            },
            focus: () => inputRef.current?.focus(),
            blur: () => inputRef.current?.blur(),
            setHtml: (html: string) => inputRef.current?.setValue(html),
            editorBridge: bridge,
        }), [bridge]);

        // Native UITextView/EditText is ready as soon as the component mounts —
        // there's no WebView cold-start to wait for. Fire onReady on the next
        // tick so the parent's editorReady gating works the same way as on the
        // Tiptap path (where it fires when isReady flips). This also lets us
        // signal the loading-spinner overlay to dismiss immediately.
        React.useEffect(() => {
            if (onReady) {
                const id = setTimeout(onReady, 0);
                return () => clearTimeout(id);
            }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        return (
            <View style={[styles.container, !!backgroundColor && { backgroundColor }, style]}>
                <EnrichedTextInput
                    ref={inputRef}
                    defaultValue={initialHtml}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    style={styles.input}
                    htmlStyle={EDITOR_HTML_STYLE}
                    // The MD→HTML pipeline emits standard tags (<pre><code>,
                    // <input type="checkbox">). useHtmlNormalizer maps those
                    // to RNE's canonical tags (<codeblock>, data-type="checkbox").
                    useHtmlNormalizer={true}
                    onChangeHtml={(e) => {
                        onChange?.(e.nativeEvent.value);
                    }}
                    onChangeState={(e) => {
                        onStateChange?.(e.nativeEvent);
                    }}
                    onFocus={() => onFocus?.()}
                    onBlur={() => onBlur?.()}
                />
            </View>
        );
    },
);

EnrichedEditor.displayName = 'EnrichedEditor';

// HTML style overrides — passed to EnrichedTextInput's `htmlStyle` prop.
//
// RNE defaults are in node_modules/react-native-enriched/lib/module/utils/
// defaultHtmlStyle.js. Key default we override:
//   - ulCheckbox.boxColor: 'blue' (iOS system tint) → black
//   - ulCheckbox.boxSize: 24                         → 18 (less dominant)
//
// CRITICAL: keep `marginLeft` at the default (16). Setting it to 0 places
// the bullet/checkbox right against the editor's left padding, where it's
// clipped/invisible — the "I can't see the list icon" bug.
const EDITOR_HTML_STYLE = {
    ulCheckbox: {
        boxSize: 18,         // slightly bigger than fontSize:16; comfortable tap target
        boxColor: '#000000', // black, not the iOS system tint (blue)
        gapWidth: 12,        // space between box and text
        marginLeft: 16,       // default — keeps the box inside the visible content area
    },
    ul: {
        bulletColor: '#000000',
        bulletSize: 8,        // default — small dot, but visible
        gapWidth: 12,
        marginLeft: 16,
    },
    ol: {
        markerColor: '#000000',
        markerFontWeight: '600' as const,
        gapWidth: 12,
        marginLeft: 16,
    },
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    input: {
        flex: 1,
        fontSize: 16,
        // Increase line height for visible breathing room between rows —
        // especially noticeable in checkbox lists where each row has a box.
        // 1.5× fontSize matches the Tiptap WebView's CSS line-height.
        lineHeight: 24,
        // Match Tiptap's body padding so the visual rhythm is identical
        // when the user toggles between the two paths.
        padding: 16,
        // RTL / BiDi support. Hebrew/Arabic users need each paragraph
        // aligned naturally based on its first strong character — Hebrew
        // lines align right, English lines align left. Without these:
        //   - textAlign defaults to 'left' (NSTextAlignmentLeft on iOS),
        //     which leaves Hebrew text glued to the left edge even though
        //     the glyphs are ordered correctly by Unicode bidi.
        //   - writingDirection defaults to ltr, which doesn't matter for
        //     glyph ordering but does affect the position of list bullets
        //     and other paragraph-level decoration.
        // 'auto' on RN iOS maps to NSTextAlignmentNatural / natural
        // writing direction, which is exactly the per-paragraph BiDi
        // behavior we want. Same effect as the Tiptap WebView's CSS:
        //   `direction: auto; unicode-bidi: plaintext; text-align: start`
        textAlign: 'auto',
        writingDirection: 'auto',
    },
});
