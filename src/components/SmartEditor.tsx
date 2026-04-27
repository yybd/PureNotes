// SmartEditor.tsx
// Unified editor facade.
// Delegates to TiptapEditor (richtext mode) or NativeLiveEditor (markdown mode).
// Parents always receive / provide raw Markdown strings — the conversion to/from
// HTML is handled internally here.

import React, { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
import { StyleProp, TextStyle } from 'react-native';
import type { EditorBridge } from '@10play/tentap-editor';
import { NativeLiveEditor, NativeLiveEditorRef } from './NativeLiveEditor';
import { TiptapEditor, TiptapEditorRef } from './TiptapEditor';
import { useNotesStore } from '../stores/notesStore';
import MarkdownConverterService from '../services/MarkdownConverterService';

// Debounce window for HTML→Markdown conversion while the user is actively
// typing. The conversion is expensive (regex + node-html-markdown) and
// should not block every keystroke. getMarkdown() force-flushes the latest
// content, so save paths always read fresh data.
const RICHTEXT_CHANGE_DEBOUNCE_MS = 150;

// ─── Public ref interface ────────────────────────────────────────────────────

export interface SmartEditorRef {
    /** Always returns the current content as raw Markdown. */
    getMarkdown: () => Promise<string>;
    focus: () => void;
    blur: () => void;
    /** Replace content. Accepts raw Markdown. */
    setText: (text: string) => void;
    /** Replace content and update cursor (markdown mode only). */
    setTextAndSelection: (text: string, sel: { start: number; end: number }) => void;
    /** Move cursor (markdown mode only). */
    setSelection: (sel: { start: number; end: number }) => void;
    /**
     * Returns the EditorBridge for richtext mode so the toolbar can read
     * live state and call formatting commands directly.
     * Returns null in markdown mode.
     */
    getEditorBridge: () => EditorBridge | null;
    /**
     * Appends a new task-list item after the last existing one.
     * In markdown mode this is handled externally via appendChecklistItem.
     */
    insertCheckboxItem: () => void;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SmartEditorProps {
    initialContent: string;
    onChange?: (content: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    /** Fired when the WebView editor is fully initialised (richtext mode only). */
    onEditorReady?: () => void;
    placeholder?: string;
    style?: StyleProp<TextStyle>;
    scrollEnabled?: boolean;
    /** Background colour for the rich text editor WebView. */
    backgroundColor?: string;
    autoFocus?: boolean;
    // Native TextInput-only props — accepted here so callers don't get type errors,
    // but they are forwarded only in markdown mode (NativeLiveEditor).
    selection?: { start: number; end: number };
    onSelectionChange?: (e: any) => void;
    onStatusChange?: (actions: string[]) => void;
    contentInset?: any;
    scrollIndicatorInsets?: any;
    [key: string]: any;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const SmartEditor = forwardRef<SmartEditorRef, SmartEditorProps>(
    (
        {
            initialContent,
            onChange,
            onFocus,
            onBlur,
            onEditorReady,
            placeholder,
            style,
            scrollEnabled = true,
            backgroundColor,
            autoFocus,
            // Destructure native-only props so they are not forwarded to TiptapEditor/WebView
            selection,
            onSelectionChange,
            onStatusChange,
            contentInset,
            scrollIndicatorInsets,
            ...rest
        },
        ref,
    ) => {
        const { settings } = useNotesStore();
        // [INACTIVE] editorMode — תמיד richtext, בחירת מצב מושבתת (אבל משתמשים ב-settings כדי למנוע שגיאות טיפוס)
        const editorMode = settings.editorMode || 'richtext';

        const nativeEditorRef = useRef<NativeLiveEditorRef>(null);
        const tiptapEditorRef = useRef<TiptapEditorRef>(null);

        // Pending HTML payload from Tiptap waiting to be converted to markdown.
        // Held in a ref so a fast typist doesn't trigger a conversion per keystroke.
        const pendingHtmlRef = useRef<string | null>(null);
        const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

        const flushHtmlConversion = useCallback(() => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            const html = pendingHtmlRef.current;
            if (html === null) return;
            pendingHtmlRef.current = null;
            const markdown = MarkdownConverterService.htmlToMarkdown(html);
            onChange?.(markdown);
        }, [onChange]);

        // Cleanup timer on unmount to avoid stray conversions on a stale component.
        useEffect(() => {
            return () => {
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = null;
                }
                pendingHtmlRef.current = null;
            };
        }, []);

        // Notify parent when the Tiptap WebView is ready
        useEffect(() => {
            if (editorMode !== 'richtext') return;
            // TiptapEditor calls onFocus/onBlur via editorState — no extra hook needed.
            // onEditorReady is fired from inside TiptapEditor once isReady becomes true.
        }, [editorMode]);

        useImperativeHandle(
            ref,
            () => ({
                getMarkdown: async () => {
                    if (editorMode === 'markdown') {
                        return (await nativeEditorRef.current?.getMarkdown()) || '';
                    }
                    // Cancel any pending debounced conversion — we're about to
                    // produce a fresh result from the editor's current HTML.
                    if (debounceTimerRef.current) {
                        clearTimeout(debounceTimerRef.current);
                        debounceTimerRef.current = null;
                    }
                    pendingHtmlRef.current = null;
                    const html = await tiptapEditorRef.current?.getHtml() || '';
                    return MarkdownConverterService.htmlToMarkdown(html);
                },

                focus: () => {
                    editorMode === 'markdown'
                        ? nativeEditorRef.current?.focus()
                        : tiptapEditorRef.current?.focus();
                },

                blur: () => {
                    editorMode === 'markdown'
                        ? nativeEditorRef.current?.blur()
                        : tiptapEditorRef.current?.blur();
                },

                setText: (text: string) => {
                    if (editorMode === 'markdown') {
                        nativeEditorRef.current?.setText?.(text);
                    } else {
                        tiptapEditorRef.current?.setHtml(
                            MarkdownConverterService.markdownToHtml(text),
                        );
                    }
                },

                setTextAndSelection: (text: string, sel: { start: number; end: number }) => {
                    if (editorMode === 'markdown') {
                        nativeEditorRef.current?.setTextAndSelection?.(text, sel);
                    } else {
                        tiptapEditorRef.current?.setHtml(
                            MarkdownConverterService.markdownToHtml(text),
                        );
                    }
                },

                setSelection: (sel: { start: number; end: number }) => {
                    if (editorMode === 'markdown') {
                        nativeEditorRef.current?.setSelection?.(sel);
                    }
                },

                getEditorBridge: () => {
                    if (editorMode !== 'richtext') return null;
                    return tiptapEditorRef.current?.editorBridge ?? null;
                },

                insertCheckboxItem: () => {
                    if (editorMode !== 'richtext') return;
                    // toggleTaskList at the end of the document appends a new task item
                    // using Tiptap's built-in ProseMirror command — no custom JS needed.
                    const bridge = tiptapEditorRef.current?.editorBridge;
                    if (!bridge) return;
                    bridge.focus('end');
                    bridge.toggleTaskList();
                },
            }),
            [editorMode],
        );

        // ── [INACTIVE] Markdown mode — מושבת, תמיד משתמשים ב-richtext ──────
        // if (editorMode === 'markdown') {
        //     return (
        //         <NativeLiveEditor
        //             ref={nativeEditorRef}
        //             initialContent={initialContent}
        //             onChange={onChange}
        //             onFocus={onFocus}
        //             onBlur={onBlur}
        //             placeholder={placeholder}
        //             style={style}
        //             scrollEnabled={scrollEnabled}
        //             selection={selection}
        //             onSelectionChange={onSelectionChange}
        //             contentInset={contentInset}
        //             scrollIndicatorInsets={scrollIndicatorInsets}
        //             {...rest}
        //         />
        //     );
        // }

        // ── Rich-text mode ─────────────────────────────────────────────────────
        const initialHtml = MarkdownConverterService.markdownToHtml(initialContent);

        // Debounce: store the latest HTML in a ref and schedule a single
        // conversion. Rapid keystrokes collapse into one conversion at the
        // end of the debounce window. Save paths force-flush via getMarkdown.
        const handleRichTextChange = (html: string) => {
            pendingHtmlRef.current = html;
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(flushHtmlConversion, RICHTEXT_CHANGE_DEBOUNCE_MS);
        };

        return (
            <TiptapEditor
                ref={tiptapEditorRef}
                initialHtml={initialHtml}
                onChange={handleRichTextChange}
                onFocus={onFocus}
                onBlur={onBlur}
                onReady={onEditorReady}
                placeholder={placeholder}
                style={style}
                backgroundColor={backgroundColor}
                autoFocus={autoFocus}
            />
        );
    },
);

SmartEditor.displayName = 'SmartEditor';
