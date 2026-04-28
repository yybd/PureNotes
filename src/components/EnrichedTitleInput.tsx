// EnrichedTitleInput.tsx
// Native single-line markdown title input. Wraps `react-native-enriched`'s
// EnrichedTextInput to render inline markdown formatting (`**bold**`,
// `*italic*`, `~~strike~~`, ``code``, `__underline__`) as visible bold /
// italic / strike / code / underline — instead of leaking the raw markdown
// markers like the previous plain TextInput did.
//
// Why a dedicated component (not just reuse EnrichedEditor):
//   - The body editor is a multi-line block-aware surface (paragraphs,
//     headings, lists). The title is a single-line inline-only string;
//     using the heavy block editor would let users accidentally insert
//     paragraphs or headings into the title.
//   - The save path strips newlines so the title remains a single line
//     in the .md file, matching the existing convention (first line is
//     `# Title`).

import React, { useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import {
    EnrichedTextInput,
    type EnrichedTextInputInstance,
} from 'react-native-enriched';

interface Props {
    /** Markdown title content (without the leading `# `). */
    value: string;
    /** Called with the markdown title after each user edit. */
    onChangeText: (markdown: string) => void;
    placeholder?: string;
    placeholderTextColor?: string;
    /** Outer container style. */
    style?: StyleProp<TextStyle>;
}

// ─── Inline markdown ↔ HTML helpers ─────────────────────────────────────────
// These are intentionally small/inline (no marked / no NHM) because the
// title is single-line plain text with at most a handful of inline marks.
// Keeping the title pipeline lightweight avoids running marked's full
// block-level pass for every keystroke.

function titleMdToHtml(md: string): string {
    if (!md) return '<html></html>';
    // Escape HTML special chars first so user-typed `<` doesn't break parsing.
    let inner = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    // Inline marks. Order matters: ** before * (otherwise *foo* matches
    // inside **foo**).
    inner = inner
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/__(.+?)__/g, '<u>$1</u>')
        .replace(/~~(.+?)~~/g, '<s>$1</s>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/(?<![*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '<i>$1</i>');
    // RNE requires content to be wrapped in <html>…</html> AND have a block
    // wrapper for the parser. <p> is the safest single-line block.
    return `<html><p>${inner}</p></html>`;
}

function titleHtmlToMd(html: string): string {
    if (!html) return '';
    // Strip RNE's <html>/<body>/<p> wrappers so we work with the inline content.
    let md = html
        .replace(/^\s*<html>\s*/i, '')
        .replace(/\s*<\/html>\s*$/i, '')
        .replace(/^\s*<p[^>]*>/i, '')
        .replace(/<\/p>\s*$/i, '');
    // Inline marks back to markdown. Order matters: emit ** before * so
    // a nested case like <b><i>x</i></b> round-trips cleanly.
    md = md
        .replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '**$2**')
        .replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '*$2*')
        .replace(/<u>([\s\S]*?)<\/u>/gi, '__$1__')
        .replace(/<(s|strike|del)>([\s\S]*?)<\/\1>/gi, '~~$2~~')
        .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
        // Unescape HTML entities we inserted on the way in.
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        // Drop any other tags (paragraph wrappers, line break elements
        // inserted by RNE, etc.) — title is plain inline content.
        .replace(/<[^>]+>/g, '');
    // Collapse newlines: titles are single-line in the .md file.
    return md.replace(/\s*\n+\s*/g, ' ').trim();
}

// ─── Component ───────────────────────────────────────────────────────────────

export const EnrichedTitleInput: React.FC<Props> = ({
    value,
    onChangeText,
    placeholder,
    placeholderTextColor,
    style,
}) => {
    const inputRef = useRef<EnrichedTextInputInstance | null>(null);

    // Compute initial HTML once. After mount the user's edits drive the
    // content via onChangeHtml — re-deriving from `value` on every render
    // would clobber the user's caret position mid-typing.
    const initialHtml = useMemo(() => titleMdToHtml(value), []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-time

    // Track whether the parent's `value` is already in sync with our
    // current contents. When the parent supplies a new value externally
    // (e.g. opening a different note), push it into the editor.
    const lastEmittedRef = useRef<string>(value);
    useEffect(() => {
        if (value === lastEmittedRef.current) return;
        // Parent value changed for a reason other than our own onChange —
        // sync the editor.
        lastEmittedRef.current = value;
        inputRef.current?.setValue(titleMdToHtml(value));
    }, [value]);

    return (
        <View style={[styles.wrapper, style]}>
            <EnrichedTextInput
                ref={inputRef}
                defaultValue={initialHtml}
                placeholder={placeholder}
                placeholderTextColor={placeholderTextColor as any}
                style={styles.input}
                useHtmlNormalizer={true}
                onChangeHtml={(e) => {
                    const md = titleHtmlToMd(e.nativeEvent.value);
                    if (md === lastEmittedRef.current) return;
                    lastEmittedRef.current = md;
                    onChangeText(md);
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        // Match the previous TextInput visual: bold heading vibe via the
        // inner input's font sizing. Keep the wrapper light so title's
        // existing card padding (titleContainer) still applies.
    },
    input: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1A1A1A',
        // No fixed height — let the input grow with content (rare:
        // multi-line titles after paste). Newlines are stripped on save.
        padding: 0,
        // RTL support — same rationale as EnrichedEditor. Hebrew titles
        // align right, English titles align left. 'auto' maps to
        // NSTextAlignmentNatural on iOS.
        textAlign: 'auto',
        writingDirection: 'auto',
    },
});
