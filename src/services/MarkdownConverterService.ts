// MarkdownConverterService.ts
// Bidirectional converter between raw Markdown (stored on disk) and HTML
// (consumed by the editor — TiptapEditor WebView OR react-native-enriched
// native, depending on USE_NATIVE_EDITOR feature flag).
//
// Tiptap's task list format:
//   <ul data-type="taskList">
//     <li data-type="taskItem" data-checked="false"><label>...</label><div><p>text</p></div></li>
//     <li data-type="taskItem" data-checked="true"><label>...</label><div><p>done</p></div></li>
//   </ul>
//
// react-native-enriched (RNE) checkbox list format:
//   <ul data-type="checkbox">
//     <li>unchecked item</li>
//     <li checked>checked item</li>
//   </ul>
//
// RNE also uses a NON-STANDARD <codeblock>...</codeblock> tag instead of
// the standard <pre><code>...</code></pre> for fenced code blocks.
//
// Markdown GFM task list format (what is stored on disk):
//   - [ ] unchecked item
//   - [x] checked item
//
// The Tiptap-targeted methods (markdownToHtml / htmlToMarkdown) and the
// RNE-targeted methods (markdownToHtmlForRne / htmlToMarkdownFromRne) live
// side-by-side so flipping the feature flag is a clean no-op rollback path.

import { marked } from 'marked';
import { NodeHtmlMarkdown } from 'node-html-markdown';

const nhm = new NodeHtmlMarkdown({}, undefined, undefined);

class MarkdownConverterService {
    // ─── Markdown → HTML ──────────────────────────────────────────────────────

    /**
     * Converts raw Markdown to Tiptap-compatible HTML.
     * GFM task lists are converted to Tiptap's <ul data-type="taskList"> structure.
     */
    static markdownToHtml(markdown: string): string {
        if (!markdown) return '';
        try {
            // 0. Pre-process markdown to normalize task items.
            // We use a unique marker that is highly unlikely to appear in natural text.
            // We preserve the list bullet structure so marked still sees it as a list item.
            let preprocessed = markdown.replace(/^(\s*[-*+]\s*)\[ \]\s*/gm, '$1TASK_UNCHECKED_MARKER ');
            preprocessed = preprocessed.replace(/^(\s*[-*+]\s*)\[[xX]\]\s*/gm, '$1TASK_CHECKED_MARKER ');

            let html = marked.parse(preprocessed, { gfm: true, breaks: true }) as string;

            // 1. Convert our markers OR marked's own GFM output into Tiptap taskItem format.

            // Handle our markers
            html = html.replace(
                /<li>\s*(?:<p>\s*)?TASK_(UNCHECKED|CHECKED)_MARKER\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/gi,
                (_match, type, content) => {
                    const isChecked = type === 'CHECKED';
                    return (
                        `<li data-type="taskItem" data-checked="${isChecked}">` +
                        `<label></label><div><p>${content.trim()}</p></div>` +
                        `</li>`
                    );
                },
            );

            // Handle marked's GFM output (<input type="checkbox">)
            html = html.replace(
                /<li[^>]*>\s*(?:<p>\s*)?<input[^>]*type="checkbox"[^>]*\/?>\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/gi,
                (_match, content) => {
                    const isChecked = /<input\b[^>]*?\bchecked\b/i.test(_match);
                    return (
                        `<li data-type="taskItem" data-checked="${isChecked}">` +
                        `<label></label><div><p>${content.trim()}</p></div>` +
                        `</li>`
                    );
                },
            );

            // 2. Extra Robustness: Catch literal "[ ]" that might have survived inside ANY <li>
            html = html.replace(
                /<li>\s*(?:<p>\s*)?\[([ xX])\]\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/gi,
                (_match, type, content) => {
                    const isChecked = type.toLowerCase() === 'x';
                    return (
                        `<li data-type="taskItem" data-checked="${isChecked}">` +
                        `<label></label><div><p>${content.trim()}</p></div>` +
                        `</li>`
                    );
                },
            );

            // 3. Wrap ALL specifically converted <li data-type="taskItem"> items in a taskList <ul>
            // Also handle <ol> if marked outputted that for some reason.
            html = html.replace(
                /<(ul|ol)>([\s\S]*?data-type="taskItem"[\s\S]*?)<\/\1>/gi,
                '<ul data-type="taskList">$2</ul>',
            );

            return html;
        } catch (error) {
            console.error('MarkdownConverterService.markdownToHtml error:', error);
            return '<p>Error loading content.</p>';
        }
    }

    // ─── HTML → Markdown ──────────────────────────────────────────────────────

    /**
     * Converts Tiptap HTML back to raw GFM Markdown for storage.
     * Handles both Tiptap task list format and falls back gracefully for other HTML.
     */
    static htmlToMarkdown(html: string): string {
        if (!html) return '';
        try {
            // 1. Convert Tiptap task items to plain "- [ ] " / "- [x] " text BEFORE
            //    NodeHtmlMarkdown sees the list, so NHM treats them as normal list items
            //    whose text already contains the checkbox token.
            //    Use lookaheads so data-type and data-checked match in any order.
            let processed = html.replace(
                /<li(?=[^>]*data-type="taskItem")(?=[^>]*data-checked="(true|false)")[^>]*>([\s\S]*?)<\/li>/gi,
                (_match, checked, inner) => {
                    const prefix = checked === 'true' ? '- [x] ' : '- [ ] ';
                    // Strip the <label> element (Tiptap's checkbox widget) and any
                    // surrounding <div><p> wrapper so only the plain text survives.
                    const text = inner
                        .replace(/<label[^>]*>[\s\S]*?<\/label>/gi, '')
                        .replace(/<\/?div[^>]*>/gi, '')
                        .replace(/<\/?p[^>]*>/gi, '')
                        .replace(/<[^>]+>/g, '')
                        .trim();
                    return `<li>${prefix}${text}</li>`;
                },
            );

            // 2. Remove the data-type attribute so NHM renders the list as a normal <ul>
            processed = processed.replace(/ data-type="taskList"/gi, '');

            let md = nhm.translate(processed);

            // 3. NHM escapes special chars in our "- [ ] " prefix.
            //    Depending on NHM version / bullet style, output may be:
            //      "* \- \[ \] text"  or  "* \[ \] text"  or  "- \- \[ \] text"
            md = md.replace(/^\* \\?-? ?\\\[ ?\\\] /gm, '- [ ] ');
            md = md.replace(/^\* \\?-? ?\\\[x\\\] /gim, '- [x] ');
            md = md.replace(/^- \\?-? ?\\\[ ?\\\] /gm, '- [ ] ');
            md = md.replace(/^- \\?-? ?\\\[x\\\] /gim, '- [x] ');

            return md;
        } catch (error) {
            console.error('MarkdownConverterService.htmlToMarkdown error:', error);
            return html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<[^>]+>/g, '');
        }
    }

    // ─── RNE-flavored converters ──────────────────────────────────────────────
    // These are used when USE_NATIVE_EDITOR=true (react-native-enriched).
    // The RNE editor accepts standard HTML on input thanks to its built-in
    // useHtmlNormalizer={true} prop, so MD → HTML can stay close to the
    // Tiptap path. The OUTPUT of getHTML() comes back in RNE's canonical
    // tags (<codeblock>, <ul data-type="checkbox">, <li checked>), so the
    // HTML → MD direction needs different pre-processing.

    /**
     * Converts raw Markdown to HTML for react-native-enriched.
     *
     * IMPORTANT: We can't rely on RNE's `useHtmlNormalizer` to map standard
     * GFM task-list output (<input type="checkbox">) to its canonical
     * checkbox shape — empirically, the normalizer doesn't, and the result
     * is that checkbox lists round-trip from Markdown into the editor as
     * plain bullet lists (the bug the user reported on existing notes).
     *
     * So we emit the canonical RNE shape directly:
     *   <ul data-type="checkbox">
     *     <li>unchecked text</li>
     *     <li checked>checked text</li>
     *   </ul>
     *
     * The strategy mirrors the Tiptap path: pre-process markdown task
     * markers into unique sentinels that survive marked's HTML parsing,
     * then post-process the HTML into the target format.
     */
    static markdownToHtmlForRne(markdown: string): string {
        if (!markdown) return '';
        try {
            // 0. Pre-process markdown to mark task items with unique sentinels.
            //    This survives marked's parsing intact and lets us find them in
            //    the HTML output regardless of which task-item form marked emits.
            let preprocessed = markdown.replace(
                /^(\s*[-*+]\s*)\[ \]\s*/gm,
                '$1TASK_UNCHECKED_MARKER ',
            );
            preprocessed = preprocessed.replace(
                /^(\s*[-*+]\s*)\[[xX]\]\s*/gm,
                '$1TASK_CHECKED_MARKER ',
            );

            let html = marked.parse(preprocessed, { gfm: true, breaks: true }) as string;

            // 1. Convert sentinel-based task items to RNE shape.
            //    Mark each rewritten <li> with a temporary data-rne-task
            //    attribute so we can locate their parent <ul> in the next pass.
            html = html.replace(
                /<li[^>]*>\s*(?:<p>\s*)?TASK_(UNCHECKED|CHECKED)_MARKER\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/gi,
                (_m, type, content) => {
                    const checked = type === 'CHECKED' ? ' checked' : '';
                    return `<li data-rne-task="1"${checked}>${content.trim()}</li>`;
                },
            );

            // 2. Also handle marked's alternative GFM output where it emits
            //    <input type="checkbox" [checked] disabled> directly inside <li>
            //    (some marked versions / configs do this even with our sentinels).
            html = html.replace(
                /<li[^>]*>\s*(?:<p>\s*)?<input[^>]*type=["']checkbox["'][^>]*\/?>\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/gi,
                (match, content) => {
                    const isChecked = /<input\b[^>]*?\bchecked\b/i.test(match);
                    const checked = isChecked ? ' checked' : '';
                    return `<li data-rne-task="1"${checked}>${content.trim()}</li>`;
                },
            );

            // 3. Robustness: catch literal "[ ]" / "[x]" tokens that survived
            //    inside an <li> (e.g. user typed without the leading "- ").
            html = html.replace(
                /<li[^>]*>\s*(?:<p>\s*)?\[([ xX])\]\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/gi,
                (_m, ch, content) => {
                    const isChecked = ch.toLowerCase() === 'x';
                    const checked = isChecked ? ' checked' : '';
                    return `<li data-rne-task="1"${checked}>${content.trim()}</li>`;
                },
            );

            // 4. Wrap any <ul> or <ol> that contains task items in
            //    <ul data-type="checkbox">. RNE only recognizes the checkbox
            //    list as a <ul>, so coerce <ol> to <ul> here too.
            //
            // CRITICAL: match each list block in isolation (no cross-list
            // capture). The earlier regex form
            //   <(ul|ol)[^>]*>([\s\S]*?data-rne-task="1"[\s\S]*?)<\/\1>
            // would, for input like
            //   <ul>regular</ul><ul>...task...</ul>
            // backtrack to extend the match across the first </ul> looking
            // for `data-rne-task="1"`, merging both lists into a single
            // checkbox list and producing broken nested HTML. Switching to
            // a per-list match + callback that *checks* the body avoids
            // crossing list boundaries.
            html = html.replace(
                /<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi,
                (match, _tag, body) => {
                    if (body.includes('data-rne-task="1"')) {
                        return `<ul data-type="checkbox">${body}</ul>`;
                    }
                    return match;
                },
            );

            // 5. Strip the temporary marker attribute now that the parent
            //    <ul> has been correctly tagged.
            html = html.replace(/ data-rne-task="1"/g, '');

            // 5a. Strip <p> wrappers inside <li> of checkbox lists. marked
            //     emits "loose mode" output (<li><p>text</p></li>) when list
            //     items are separated by blank lines or when the list is
            //     adjacent to other block content. RNE's native parser
            //     expects bare <li>text</li> for checkbox items — see
            //     react-native-enriched/src/web/tiptapHtmlNormalizer.ts
            //     which strips the same wrapping. Without this fix, RNE
            //     can fall back to rendering the list as plain bullets.
            html = html.replace(
                /<ul data-type="checkbox">([\s\S]*?)<\/ul>/gi,
                (_match, body) => {
                    const stripped = body.replace(
                        /<li([^>]*)>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/li>/gi,
                        '<li$1>$2</li>',
                    );
                    return `<ul data-type="checkbox">${stripped}</ul>`;
                },
            );

            // 6. Wrap in <html>…</html>. CRITICAL — this is RNE's "is this
            //    HTML or plain text?" sentinel: its native InputParser
            //    treats input that doesn't start with <html> and end with
            //    </html> as plain text, which means our <p>…</p> output
            //    would be rendered as literal "<p>" text in the editor.
            //    Same convention used by RNE's own web normalizer
            //    (see node_modules/react-native-enriched/src/web/
            //     tiptapHtmlNormalizer.ts → normalizeHtmlFromTiptap).
            return `<html>${html}</html>`;
        } catch (error) {
            console.error('MarkdownConverterService.markdownToHtmlForRne error:', error);
            return '<html><p>Error loading content.</p></html>';
        }
    }

    /**
     * Converts react-native-enriched HTML back to GFM Markdown for storage.
     * RNE outputs canonical tags that NodeHtmlMarkdown doesn't recognize
     * out of the box (<codeblock>, <ul data-type="checkbox">, <li checked>),
     * so we pre-process them into HTML shapes NHM does understand:
     *   <codeblock>...</codeblock>      → <pre><code>...</code></pre>
     *   <ul data-type="checkbox">       → <ul> (with our custom <li> rewriting)
     *   <li>...</li> (in checkbox list) → <li>- [ ] ...</li>
     *   <li checked>...</li>            → <li>- [x] ...</li>
     */
    static htmlToMarkdownFromRne(html: string): string {
        if (!html) return '';
        try {
            // 0. Strip the <html>…</html> wrapper that RNE's getHTML always
            //    emits (see ios/inputParser/InputParser.mm parseToHtmlFromRange).
            //    NHM happens to ignore unknown root tags, but stripping
            //    explicitly makes the conversion path predictable and
            //    avoids any edge case where the wrapper sneaks into the
            //    final markdown.
            let processed = html
                .replace(/^\s*<html>\s*/i, '')
                .replace(/\s*<\/html>\s*$/i, '');

            // 1. <codeblock> → <pre><code>. NHM emits triple-backtick fences
            //    for <pre><code>, which is what GFM markdown wants.
            processed = processed.replace(
                /<codeblock>([\s\S]*?)<\/codeblock>/gi,
                (_m, body) => {
                    // RNE puts <br> inside empty codeblocks; normalize to a newline
                    // so the resulting fence isn't blank.
                    const text = body.replace(/<br\s*\/?>/gi, '\n');
                    return `<pre><code>${text}</code></pre>`;
                },
            );

            // 2. Checkbox list <ul data-type="checkbox">…</ul> — rewrite each
            //    <li> with a "- [ ] " or "- [x] " prefix so NHM can render it
            //    as a normal list whose text starts with the checkbox token.
            processed = processed.replace(
                /<ul[^>]*data-type=["']checkbox["'][^>]*>([\s\S]*?)<\/ul>/gi,
                (_m, body) => {
                    const rewritten = body.replace(
                        /<li([^>]*)>([\s\S]*?)<\/li>/gi,
                        (_m2: string, attrs: string, inner: string) => {
                            const isChecked = / checked\b/i.test(attrs) ||
                                              /\bchecked(=|>|$)/i.test(attrs);
                            const prefix = isChecked ? '- [x] ' : '- [ ] ';
                            return `<li>${prefix}${inner.trim()}</li>`;
                        },
                    );
                    return `<ul>${rewritten}</ul>`;
                },
            );

            let md = nhm.translate(processed);

            // 3. NHM escapes the brackets in our injected "- [ ] " prefix.
            //    Same un-escaping pass as the Tiptap path.
            md = md.replace(/^\* \\?-? ?\\\[ ?\\\] /gm, '- [ ] ');
            md = md.replace(/^\* \\?-? ?\\\[x\\\] /gim, '- [x] ');
            md = md.replace(/^- \\?-? ?\\\[ ?\\\] /gm, '- [ ] ');
            md = md.replace(/^- \\?-? ?\\\[x\\\] /gim, '- [x] ');

            return md;
        } catch (error) {
            console.error('MarkdownConverterService.htmlToMarkdownFromRne error:', error);
            return html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<[^>]+>/g, '');
        }
    }
}

export default MarkdownConverterService;
