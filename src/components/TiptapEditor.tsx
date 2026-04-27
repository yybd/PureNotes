// TiptapEditor.tsx
// Rich text editor wrapper around @10play/tentap-editor (Tiptap / ProseMirror).
//
// Layout strategy
// ─────────────────────────────────────────────────────────────────────────────
// dynamicHeight: false — the WebView fills its container via flex:1.
// The *parent* is responsible for giving the container a defined height.
// For QuickAddInput this happens inside a Modal with KeyboardAvoidingView.
// For NoteEditorScreen the editor sits in a flex:1 View.

import React, { forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import {
    RichText,
    useEditorBridge,
    useBridgeState,
    TenTapStartKit,
    CoreBridge,
    type EditorBridge,
} from '@10play/tentap-editor';


const bridgeExtensions = TenTapStartKit.filter(
    (ext) => ext.name !== 'placeholder'
);

// ─── Public ref interface ────────────────────────────────────────────────────

export interface TiptapEditorRef {
    getHtml: () => Promise<string>;
    focus: () => void;
    blur: () => void;
    setHtml: (html: string) => void;
    editorBridge: EditorBridge;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface TiptapEditorProps {
    initialHtml: string;
    onChange?: (html: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onReady?: () => void;
    placeholder?: string;
    style?: StyleProp<ViewStyle>;
    autoFocus?: boolean;
    backgroundColor?: string;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
// The CSS starts with body { opacity: 0 } so the unstyled content is invisible.
// Once the full stylesheet is applied by the browser, the later rule
// (body { opacity: 1 }) takes effect and the content appears styled.

const buildCSS = (bg: string) => `
    html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
    }
    #root {
        height: 100%;
    }
    #root > div:nth-of-type(1) {
        height: 100% !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        scrollbar-width: none;
        -ms-overflow-style: none;
    }
    #root > div:nth-of-type(1)::-webkit-scrollbar {
        display: none;
    }
    html, body, .ProseMirror {
        background-color: ${bg} !important;
    }
    .ProseMirror {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 16px;
        line-height: 1.5;
        padding: 16px;
        min-height: 100%;
        box-sizing: border-box;
        outline: none;
        overflow-wrap: break-word;
        word-wrap: break-word;
        word-break: break-word;
    }
    .ProseMirror > *:first-child {
        margin-top: 0;
    }
    .ProseMirror > *:last-child {
        margin-bottom: 0;
    }
    .ProseMirror p,
    .ProseMirror h1, .ProseMirror h2, .ProseMirror h3,
    .ProseMirror h4, .ProseMirror h5, .ProseMirror h6,
    .ProseMirror li,
    .ProseMirror blockquote {
        direction: auto;
        unicode-bidi: plaintext;
        text-align: start;
    }
    .ProseMirror ul[data-type="taskList"] {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .ProseMirror ul[data-type="taskList"] li {
        display: flex;
        align-items: flex-start;
        margin-bottom: 0px;
    }
    .ProseMirror ul[data-type="taskList"] li > label {
        flex: 0 0 auto;
        margin-right: 12px;
        user-select: none;
        display: flex;
        align-items: center;
        padding-top: 4px;
    }
    .ProseMirror ul[data-type="taskList"] li > div {
        flex: 1 1 auto;
    }
    .ProseMirror ul[data-type="taskList"] input[type="checkbox"] {
        cursor: pointer;
        width: 1.1em;
        height: 1.1em;
        accent-color: #000000;
        margin: 0;
    }

`;

// ─── Component ───────────────────────────────────────────────────────────────

export const TiptapEditor = forwardRef<TiptapEditorRef, TiptapEditorProps>(
    (
        {
            initialHtml,
            onChange,
            onFocus,
            onBlur,
            onReady,
            placeholder = 'התחל לכתוב...',
            style,
            autoFocus = false,
            backgroundColor = 'transparent',
        },
        ref,
    ) => {
        // CSS is baked into bridgeExtensions via CoreBridge.configureCSS().
        // It is injected by the WebView's injectedJavaScript prop — the
        // leading "body { opacity: 0 }" hides the content until the trailing
        // "body { opacity: 1 }" is parsed, preventing any FOUC.
        const extensions = React.useMemo(
            () => [
                ...bridgeExtensions,
                CoreBridge.configureCSS(buildCSS(backgroundColor)),
            ],
            [backgroundColor],
        );

        const editor = useEditorBridge({
            autofocus: autoFocus,
            avoidIosKeyboard: false,
            dynamicHeight: false,
            initialContent: initialHtml,
            bridgeExtensions: extensions,
            theme: {
                webview: {
                    backgroundColor,
                },
            },
            onChange: async () => {
                if (!onChange) return;
                const html = await editor.getHTML();
                onChange(html);
            },
        });

        const editorState = useBridgeState(editor);
        const wasFocused = React.useRef(false);
        const dirInjected = React.useRef(false);

        React.useEffect(() => {
            const focused = editorState.isFocused;
            if (focused && !wasFocused.current) {
                wasFocused.current = true;
                onFocus?.();
            } else if (!focused && wasFocused.current) {
                wasFocused.current = false;
                onBlur?.();
            }
        }, [editorState.isFocused, onFocus, onBlur]);

        React.useEffect(() => {
            if (!editorState.isReady || dirInjected.current) return;
            dirInjected.current = true;
            editor.injectJS(`
                document.documentElement.setAttribute('dir', 'auto');
                document.body.setAttribute('dir', 'auto');
            `);
            onReady?.();
            // Explicit focus once the editor is genuinely ready. The bridge's
            // built-in `autofocus` option is set during mount but can lose the
            // race with the modal animation on a cold WebView — by the time
            // Tiptap is ready to accept focus, the autofocus pulse is already
            // gone, leaving the user staring at an editor with no caret.
            if (autoFocus) {
                editor.focus();
            }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [editorState.isReady]);

        useImperativeHandle(ref, () => ({
            getHtml: () => editor.getHTML(),
            focus: () => editor.focus(),
            blur: () => editor.blur(),
            setHtml: (html: string) => editor.setContent(html),
            editorBridge: editor,
        }), [editor]);

        return (
            <View style={styles.container}>
                <RichText editor={editor} />
            </View>
        );
    },
);

TiptapEditor.displayName = 'TiptapEditor';

const styles = StyleSheet.create({
    container: { flex: 1 },
});
