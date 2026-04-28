import React, { useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Ionicons } from '@expo/vector-icons';
import { getDirection } from '../utils/rtlUtils';

interface UnifiedMarkdownDisplayProps {
    content: string;
    onToggleCheckbox?: (checklistIndexTarget: number) => void;
    style?: StyleProp<ViewStyle>;
    numberOfLines?: number;
    /** Multiplier applied to body and heading font sizes. 1 = default. */
    scale?: number;
}

// Android: RN's `writingDirection` style is iOS-only, and `textAlign: 'right'`
// alone does not change the paragraph-level BiDi direction — Android decides
// paragraph direction from the device locale. Symptom: when the device is in
// English, Hebrew lines in the notes list are laid out as LTR paragraphs
// containing Hebrew runs, with punctuation/digits in visually wrong positions
// (e.g. a final period jumps to the right edge). Prefixing the rendered text
// with U+200F (RIGHT-TO-LEFT MARK) — a strong-RTL formatting character —
// forces Android's BiDi algorithm (UAX#9 rule P2) to treat the line as an
// RTL paragraph, mirroring the editor's CSS `unicode-bidi: plaintext`
// behavior. U+200E (LRM) does the symmetric job for LTR lines on RTL
// devices.
const RLM = '‏';
const LRM = '‎';
const dirMark = (direction: 'rtl' | 'ltr') => (direction === 'rtl' ? RLM : LRM);

// Recursively extract text from a node to determine direction
const getNodeText = (node: any): string => {
    if (node.type === 'text' && node.content) {
        return node.content;
    }
    let text = '';
    if (node.children) {
        for (const child of node.children) {
            text += getNodeText(child);
            if (text.length > 5) break; // Optimization: we only need the first few chars
        }
    }
    return text;
};

const UnifiedMarkdownDisplayImpl: React.FC<UnifiedMarkdownDisplayProps> = ({ content, onToggleCheckbox, style, numberOfLines, scale = 1 }) => {

    // Checkbox Render Index reference to preserve unique indexes across render
    const checklistRenderIndex = useRef(0);
    // Reset before every render so indexes correctly match content structure
    checklistRenderIndex.current = 0;

    // Strip out the RLM character just for the React Native Markdown parser
    // This allows native syntax block recognition to succeed; styling direction is managed separately below
    const cleanContent = content;

    // Memoize rules so the Markdown library can reuse them across renders.
    // Rebuilt only when one of the actually-referenced inputs changes.
    const rules = useMemo(() => ({
        // Standard text rule to strip checkbox markers from being displayed
        text: (node: any, children: any, parent: any, ruleStyles: any) => {
            let nodeContent = node.content;

            // Regex to match [ ] or [x] at the start of the text
            const checkboxPattern = /^\s*\[([ xX])\]\s?/;

            if (checkboxPattern.test(nodeContent)) {
                nodeContent = nodeContent.replace(checkboxPattern, '');
            }

            // If content is empty after stripping (e.g. just a checkbox), return null to avoid empty Text view
            if (!nodeContent) return null;

            return <Text key={node.key} style={ruleStyles.body} numberOfLines={numberOfLines}>{nodeContent}</Text>;
        },

        paragraph: (node: any, children: any, parent: any, ruleStyles: any) => {
            const textContent = getNodeText(node);
            const direction = getDirection(textContent);

            return (
                <Text
                    key={node.key}
                    style={[
                        ruleStyles.paragraph,
                        {
                            writingDirection: direction,
                            textAlign: direction === 'rtl' ? 'right' : 'left',
                            alignSelf: 'stretch',
                            width: '100%'
                        }
                    ]}
                    numberOfLines={numberOfLines}
                >
                    {dirMark(direction)}{children}
                </Text>
            );
        },
        heading1: (node: any, children: any, parent: any, ruleStyles: any) => {
            const textContent = getNodeText(node);
            const direction = getDirection(textContent);
            return (
                <Text key={node.key} style={[ruleStyles.heading1, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left', alignSelf: 'stretch', width: '100%' }]} numberOfLines={numberOfLines}>
                    {dirMark(direction)}{children}
                </Text>
            );
        },
        heading2: (node: any, children: any, parent: any, ruleStyles: any) => {
            const textContent = getNodeText(node);
            const direction = getDirection(textContent);
            return (
                <Text key={node.key} style={[ruleStyles.heading2, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left', alignSelf: 'stretch', width: '100%' }]} numberOfLines={numberOfLines}>
                    {dirMark(direction)}{children}
                </Text>
            );
        },
        heading3: (node: any, children: any, parent: any, ruleStyles: any) => {
            const textContent = getNodeText(node);
            const direction = getDirection(textContent);
            return (
                <Text key={node.key} style={[ruleStyles.heading3, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left', alignSelf: 'stretch', width: '100%' }]} numberOfLines={numberOfLines}>
                    {dirMark(direction)}{children}
                </Text>
            );
        },
        list_item: (node: any, children: any, parent: any, ruleStyles: any) => {
            const textContent = getNodeText(node);
            const direction = getDirection(textContent);

            // Check if we need to wrap children in a Text component to enforce alignment
            // Only do this if all children are inline to avoid nesting Views in Text
            const hasBlockChildren = node.children && node.children.some((c: any) =>
                ['paragraph', 'heading', 'bullet_list', 'ordered_list', 'blockquote', 'code_block', 'hr', 'html_block'].includes(c.type)
            );

            const renderedContent = hasBlockChildren ? children : (
                <Text style={{
                    textAlign: direction === 'rtl' ? 'right' : 'left',
                    writingDirection: direction,
                    flex: 1,
                    flexWrap: 'wrap',
                }} numberOfLines={numberOfLines}>
                    {dirMark(direction)}{children}
                </Text>
            );

            // Determine bullet or checkbox
            let isChecked;
            if (node.attributes && node.attributes.checked !== undefined) {
                isChecked = node.attributes.checked;
            } else {
                // Fallback: check text content for [ ] or [x] at start
                const match = textContent.match(/^\s*\[([ xX])\]/);
                if (match) {
                    isChecked = match[1].toLowerCase() === 'x';
                }
            }

            let marker;
            if (isChecked !== undefined) {
                const currentIndex = checklistRenderIndex.current++;
                marker = (
                    <TouchableOpacity
                        onPress={() => {
                            onToggleCheckbox?.(currentIndex);
                        }}
                        style={{
                            [direction === 'rtl' ? 'marginLeft' : 'marginRight']: 8,
                            justifyContent: 'center',
                            marginTop: 2,
                            padding: 2, // hit slop
                        }}
                        disabled={!onToggleCheckbox}
                    >
                        <Ionicons
                            name={isChecked ? "checkbox" : "square-outline"}
                            size={20}
                            color={isChecked ? "#000000" : "#757575"}
                        />
                    </TouchableOpacity>
                );
            } else {
                const isOrdered = parent.name === 'ordered_list';
                marker = (
                    <Text style={[
                        ruleStyles.list_item_bullet,
                        {
                            [direction === 'rtl' ? 'marginLeft' : 'marginRight']: 8,
                            textAlign: direction === 'rtl' ? 'left' : 'right',
                        }
                    ]}>
                        {isOrdered ? `${node.index + 1}.` : '•'}
                    </Text>
                );
            }

            return (
                <View key={node.key} style={[
                    ruleStyles.list_item,
                    {
                        flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
                        justifyContent: 'flex-start',
                        alignItems: 'flex-start', // Top align
                    }
                ]}>
                    {marker}
                    <View style={{ flex: 1, alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' }}>
                        {renderedContent}
                    </View>
                </View>
            );
        },
    }), [numberOfLines, onToggleCheckbox]);

    return (
        // alignSelf:'stretch' + width:'100%' guarantees the markdown surface
        // fills its container's full width. Without this, on Android with an
        // English device locale the wrapper shrinks to content width, and
        // textAlign:'right' inside paragraph rules has nothing to right-align
        // against — Hebrew lines visibly anchor to the left edge of a
        // narrower-than-card container. Forcing full width restores the
        // expected per-paragraph right-alignment.
        <View style={[{ alignSelf: 'stretch', width: '100%' }, style]}>
            <Markdown style={scale === 1 ? markdownStyles : scaledMarkdownStyles(scale)} rules={rules}>
                {cleanContent}
            </Markdown>
        </View>
    );
};

// Build a per-instance copy of markdownStyles with body / heading font
// sizes (and line heights) multiplied by `scale`. Recomputed only when
// scale actually differs from 1, so the default-scale path keeps the
// shared StyleSheet.create object.
const scaledMarkdownStyles = (scale: number) => ({
    ...markdownStyles,
    body: { ...markdownStyles.body, fontSize: 15 * scale, lineHeight: 22 * scale },
    heading1: { ...markdownStyles.heading1, fontSize: 24 * scale },
    heading2: { ...markdownStyles.heading2, fontSize: 20 * scale },
    heading3: { ...markdownStyles.heading3, fontSize: 18 * scale },
    list_item_bullet: { ...markdownStyles.list_item_bullet, fontSize: 15 * scale, lineHeight: 22 * scale },
});

// Memo: skip re-render when content/props haven't changed (default shallow
// compare). Avoids re-parsing markdown when an unrelated NoteCard prop nudges
// the parent.
export const UnifiedMarkdownDisplay = React.memo(UnifiedMarkdownDisplayImpl);

const markdownStyles = StyleSheet.create({
    body: {
        fontSize: 15,
        color: '#333333',
        lineHeight: 22,
        // The library applies `body` to its top-level container View. Force
        // it to stretch so per-paragraph textAlign:'right' has the full card
        // width to align against — without this, on Android-EN the container
        // shrinks to its content and right-aligned Hebrew text visibly
        // anchors to the left edge.
        alignSelf: 'stretch',
        width: '100%',
        // textAlign and writingDirection removed, handled by rules
    },
    heading1: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1A1A1A',
        marginBottom: 10,
        marginTop: 10,
        // dynamic
    },
    heading2: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1A1A1A',
        marginBottom: 8,
        marginTop: 8,
        // dynamic
    },
    heading3: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1A1A1A',
        marginBottom: 6,
        marginTop: 6,
        // dynamic
    },
    paragraph: {
        marginBottom: 10,
        // dynamic
    },
    list_item: {
        flexDirection: 'row', // Default LTR, rule handles override
        justifyContent: 'flex-start',
        marginVertical: 4,
    },
    list_item_bullet: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#1A1A1A',
        lineHeight: 22,
    },
    bullet_list: {
        alignItems: 'stretch', // Stretch to fill width
    },
    ordered_list: {
        alignItems: 'stretch', // Stretch to fill width
    },
    blockquote: {
        backgroundColor: '#F5F5F5',
        borderRightWidth: 4,
        borderRightColor: '#000000',
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginVertical: 4,
    },
    code_inline: {
        backgroundColor: '#F0F0F0',
        color: '#E91E63',
        borderRadius: 4,
        paddingHorizontal: 4,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    fence: {
        backgroundColor: '#F0F0F0',
        padding: 10,
        borderRadius: 4,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        marginVertical: 4,
    },
    link: {
        color: '#000000',
        textDecorationLine: 'underline',
    },
});
