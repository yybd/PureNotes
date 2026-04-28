// EnrichedTitleInput.web.tsx
// Web fallback for EnrichedTitleInput. On Web we deliberately don't pull
// in `react-native-enriched` (its package.json `exports` field has no
// `browser` condition, so Metro tries to load the native source which
// crashes on `codegenNativeCommands`). The Web build of the app still
// uses the legacy WebView-backed editor, so the title can stay as a
// plain TextInput — same UX as before the migration.

import React from 'react';
import { TextInput, View, StyleSheet, type TextStyle, type StyleProp } from 'react-native';

interface Props {
    value: string;
    onChangeText: (markdown: string) => void;
    placeholder?: string;
    placeholderTextColor?: string;
    style?: StyleProp<TextStyle>;
}

export const EnrichedTitleInput: React.FC<Props> = ({
    value,
    onChangeText,
    placeholder,
    placeholderTextColor,
    style,
}) => {
    return (
        <View style={style}>
            <TextInput
                style={[styles.input, { writingDirection: 'auto', textAlign: 'auto' }]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={placeholderTextColor}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    input: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1A1A1A',
        padding: 0,
    },
});
