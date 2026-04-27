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
}

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

const UnifiedMarkdownDisplayImpl: React.FC<UnifiedMarkdownDisplayProps> = ({ content, onToggleCheckbox, style, numberOfLines }) => {

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
                            alignSelf: 'stretch'
                        }
                    ]}
                    numberOfLines={numberOfLines}
                >
                    {children}
                </Text>
            );
        },
        heading1: (node: any, children: any, parent: any, ruleStyles: any) => {
            const textContent = getNodeText(node);
            const direction = getDirection(textContent);
            return (
                <Text key={node.key} style={[ruleStyles.heading1, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]} numberOfLines={numberOfLines}>
                    {children}
                </Text>
            );
        },
        heading2: (node: any, children: any, parent: any, ruleStyles: any) => {
            const textContent = getNodeText(node);
            const direction = getDirection(textContent);
            return (
                <Text key={node.key} style={[ruleStyles.heading2, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]} numberOfLines={numberOfLines}>
                    {children}
                </Text>
            );
        },
        heading3: (node: any, children: any, parent: any, ruleStyles: any) => {
            const textContent = getNodeText(node);
            const direction = getDirection(textContent);
            return (
                <Text key={node.key} style={[ruleStyles.heading3, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]} numberOfLines={numberOfLines}>
                    {children}
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
                    {children}
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
        <View style={style}>
            <Markdown style={markdownStyles} rules={rules}>
                {cleanContent}
            </Markdown>
        </View>
    );
};

// Memo: skip re-render when content/props haven't changed (default shallow
// compare). Avoids re-parsing markdown when an unrelated NoteCard prop nudges
// the parent.
export const UnifiedMarkdownDisplay = React.memo(UnifiedMarkdownDisplayImpl);

const markdownStyles = StyleSheet.create({
    body: {
        fontSize: 15,
        color: '#333333',
        lineHeight: 22,
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
