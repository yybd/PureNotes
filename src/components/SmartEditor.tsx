// SmartEditor.tsx
// Unified editor facade.
// Delegates to:
//   - TiptapEditor (richtext mode, USE_NATIVE_EDITOR=false): WebView-based.
//   - EnrichedEditor (richtext mode, USE_NATIVE_EDITOR=true): native UITextView /
//     EditText via react-native-enriched. NO WebView, no cold start.
//   - NativeLiveEditor (markdown mode): currently disabled.
//
// Parents always receive / provide raw Markdown strings — the conversion
// to/from HTML is handled internally here. The path branches on the
// USE_NATIVE_EDITOR feature flag (src/config/editorMode.ts) so flipping the
// flag back to false is the rollback path with no other code changes needed.

import React, { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
import { StyleProp, TextStyle } from 'react-native';
import type { EditorBridge } from '@10play/tentap-editor';
import type { OnChangeStateEvent } from 'react-native-enriched';
import { NativeLiveEditor, NativeLiveEditorRef } from './NativeLiveEditor';
import { TiptapEditor, TiptapEditorRef } from './TiptapEditor';
import { EnrichedEditor, EnrichedEditorRef, EnrichedEditorBridge } from './EnrichedEditor';
import { useNotesStore } from '../stores/notesStore';
import MarkdownConverterService from '../services/MarkdownConverterService';
import { USE_NATIVE_EDITOR } from '../config/editorMode';

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
     * Returns the Tiptap EditorBridge for richtext mode (Tiptap path only).
     * Returns null in markdown mode OR when running on the RNE path.
     * Use `getEnrichedBridge()` for the RNE path's command surface.
     */
    getEditorBridge: () => EditorBridge | null;
    /**
     * Returns the RNE-flavored bridge for the EnrichedEditor path.
     * Returns null in markdown mode OR on the Tiptap path. The shape mirrors
     * `EditorBridge` but proxies to react-native-enriched native commands.
     */
    getEnrichedBridge: () => EnrichedEditorBridge | null;
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
    /**
     * RNE-only: forwards EnrichedEditor's onStateChange events so a parent
     * (e.g. EditorModal) can pass formatting state to the EnrichedToolbar.
     * Tiptap path uses useBridgeState internally and ignores this.
     */
    onEnrichedStateChange?: (state: OnChangeStateEvent) => void;
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
            onEnrichedStateChange,
            ...rest
        },
        ref,
    ) => {
        const { settings } = useNotesStore();
        // [INACTIVE] editorMode — תמיד richtext, בחירת מצב מושבתת (אבל משתמשים ב-settings כדי למנוע שגיאות טיפוס)
        const editorMode = settings.editorMode || 'richtext';

        const nativeEditorRef = useRef<NativeLiveEditorRef>(null);
        const tiptapEditorRef = useRef<TiptapEditorRef>(null);
        const enrichedEditorRef = useRef<EnrichedEditorRef>(null);

        // Pending HTML payload from Tiptap waiting to be converted to markdown.
        // Held in a ref so a fast typist doesn't trigger a conversion per keystroke.
        const pendingHtmlRef = useRef<string | null>(null);
        const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

        // Mirror the latest HTML the editor emitted, regardless of debounce.
        // Lets getMarkdown read the freshest content WITHOUT round-tripping
        // to the WebView (which costs ~10–50ms each call).
        const latestHtmlRef = useRef<string>('');

        // Memoize the most recent HTML→Markdown conversion so getMarkdown can
        // skip work entirely when called twice on identical HTML.
        const conversionCacheRef = useRef<{ html: string; markdown: string } | null>(null);

        const convertAndCache = (html: string): string => {
            const cached = conversionCacheRef.current;
            if (cached && cached.html === html) return cached.markdown;
            // Different paths emit different HTML shapes:
            //   - Tiptap: <ul data-type="taskList"><li data-type="taskItem" data-checked="...">
            //   - RNE:    <ul data-type="checkbox"><li [checked]>... and <codeblock>
            // Each has its own htmlToMarkdown path tuned to its tag set.
            const markdown = USE_NATIVE_EDITOR
                ? MarkdownConverterService.htmlToMarkdownFromRne(html)
                : MarkdownConverterService.htmlToMarkdown(html);
            conversionCacheRef.current = { html, markdown };
            return markdown;
        };

        const flushHtmlConversion = useCallback(() => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            const html = pendingHtmlRef.current;
            if (html === null) return;
            pendingHtmlRef.current = null;
            const markdown = convertAndCache(html);
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
                conversionCacheRef.current = null;
                latestHtmlRef.current = '';
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
                    // produce a fresh result from the cached HTML.
                    if (debounceTimerRef.current) {
                        clearTimeout(debounceTimerRef.current);
                        debounceTimerRef.current = null;
                    }
                    pendingHtmlRef.current = null;
                    // Read from the locally-mirrored HTML so we skip the
                    // editor round-trip. The conversion itself is memoized.
                    return convertAndCache(latestHtmlRef.current);
                },

                focus: () => {
                    if (editorMode === 'markdown') {
                        nativeEditorRef.current?.focus();
                    } else if (USE_NATIVE_EDITOR) {
                        enrichedEditorRef.current?.focus();
                    } else {
                        tiptapEditorRef.current?.focus();
                    }
                },

                blur: () => {
                    if (editorMode === 'markdown') {
                        nativeEditorRef.current?.blur();
                    } else if (USE_NATIVE_EDITOR) {
                        enrichedEditorRef.current?.blur();
                    } else {
                        tiptapEditorRef.current?.blur();
                    }
                },

                setText: (text: string) => {
                    if (editorMode === 'markdown') {
                        nativeEditorRef.current?.setText?.(text);
                        return;
                    }
                    // Convert markdown to HTML using the path-appropriate
                    // converter. The Tiptap and RNE flavors emit different
                    // tag shapes (taskList vs checkbox, codeblock, etc.).
                    const html = USE_NATIVE_EDITOR
                        ? MarkdownConverterService.markdownToHtmlForRne(text)
                        : MarkdownConverterService.markdownToHtml(text);
                    // Keep mirrors in sync so a subsequent getMarkdown
                    // returns the just-set content faithfully.
                    latestHtmlRef.current = html;
                    conversionCacheRef.current = { html, markdown: text };
                    if (USE_NATIVE_EDITOR) {
                        enrichedEditorRef.current?.setHtml(html);
                    } else {
                        tiptapEditorRef.current?.setHtml(html);
                    }
                },

                setTextAndSelection: (text: string, sel: { start: number; end: number }) => {
                    if (editorMode === 'markdown') {
                        nativeEditorRef.current?.setTextAndSelection?.(text, sel);
                        return;
                    }
                    const html = USE_NATIVE_EDITOR
                        ? MarkdownConverterService.markdownToHtmlForRne(text)
                        : MarkdownConverterService.markdownToHtml(text);
                    latestHtmlRef.current = html;
                    conversionCacheRef.current = { html, markdown: text };
                    if (USE_NATIVE_EDITOR) {
                        enrichedEditorRef.current?.setHtml(html);
                    } else {
                        tiptapEditorRef.current?.setHtml(html);
                    }
                },

                setSelection: (sel: { start: number; end: number }) => {
                    if (editorMode === 'markdown') {
                        nativeEditorRef.current?.setSelection?.(sel);
                    }
                },

                getEditorBridge: () => {
                    if (editorMode !== 'richtext' || USE_NATIVE_EDITOR) return null;
                    return tiptapEditorRef.current?.editorBridge ?? null;
                },

                getEnrichedBridge: () => {
                    if (editorMode !== 'richtext' || !USE_NATIVE_EDITOR) return null;
                    return enrichedEditorRef.current?.editorBridge ?? null;
                },

                insertCheckboxItem: () => {
                    if (editorMode !== 'richtext') return;
                    if (USE_NATIVE_EDITOR) {
                        // RNE: toggleCheckboxList(false) starts a new
                        // unchecked checkbox at the current selection.
                        const bridge = enrichedEditorRef.current?.editorBridge;
                        if (!bridge) return;
                        bridge.focus();
                        bridge.toggleCheckboxList(false);
                    } else {
                        // Tiptap: toggleTaskList at the end of the document
                        // appends a new task item via Tiptap's command.
                        const bridge = tiptapEditorRef.current?.editorBridge;
                        if (!bridge) return;
                        bridge.focus('end');
                        bridge.toggleTaskList();
                    }
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
        // Compute initialHtml once per mount instead of every render. This
        // matters because the parent re-renders on every keystroke, which
        // previously re-ran markdownToHtml unnecessarily.
        const initialHtmlRef = useRef<string | null>(null);
        if (initialHtmlRef.current === null) {
            const html = USE_NATIVE_EDITOR
                ? MarkdownConverterService.markdownToHtmlForRne(initialContent)
                : MarkdownConverterService.markdownToHtml(initialContent);
            initialHtmlRef.current = html;
            // Seed mirrors so getMarkdown can return faithful content even if
            // the user opens the editor and immediately saves without typing.
            latestHtmlRef.current = html;
            conversionCacheRef.current = { html, markdown: initialContent };
        }
        const initialHtml = initialHtmlRef.current;

        // Debounce: store the latest HTML in refs and schedule a single
        // conversion. Rapid keystrokes collapse into one conversion at the
        // end of the debounce window. Save paths read latestHtmlRef directly.
        const handleRichTextChange = (html: string) => {
            latestHtmlRef.current = html;
            pendingHtmlRef.current = html;
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(flushHtmlConversion, RICHTEXT_CHANGE_DEBOUNCE_MS);
        };

        // Branch on USE_NATIVE_EDITOR. Both editors expose a similar surface
        // (initialHtml in, HTML out via onChange, focus/blur/ready hooks).
        if (USE_NATIVE_EDITOR) {
            return (
                <EnrichedEditor
                    ref={enrichedEditorRef}
                    initialHtml={initialHtml}
                    onChange={handleRichTextChange}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onReady={onEditorReady}
                    onStateChange={onEnrichedStateChange}
                    placeholder={placeholder}
                    style={style as any}
                    backgroundColor={backgroundColor}
                    autoFocus={autoFocus}
                />
            );
        }

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
