// Slider.tsx
// Tiny dependency-free continuous slider built on PanResponder. Used by
// the Settings screen for the note-text-size control. Adding the full
// @react-native-community/slider package felt heavy for a single small
// control, hence this minimal in-house version.

import React, { useRef } from 'react';
import {
    View,
    StyleSheet,
    PanResponder,
    GestureResponderEvent,
    LayoutChangeEvent,
    StyleProp,
    ViewStyle,
} from 'react-native';

interface SliderProps {
    value: number;
    onValueChange: (v: number) => void;
    min: number;
    max: number;
    /** Snap value to this step. Omit for free movement. */
    step?: number;
    style?: StyleProp<ViewStyle>;
    trackColor?: string;
    thumbColor?: string;
}

const TRACK_HEIGHT = 2;
const THUMB_SIZE = 18;
const TOUCH_HEIGHT = 32;

export const Slider: React.FC<SliderProps> = ({
    value,
    onValueChange,
    min,
    max,
    step,
    style,
    trackColor = '#000000',
    thumbColor = '#000000',
}) => {
    // Measured width of the touchable area — used to translate touch x
    // back to a value. Stored on a ref so the gesture handler always sees
    // the latest measurement without recreating the PanResponder.
    const widthRef = useRef(0);

    // Latest props captured in a ref so PanResponder (created once) sees
    // the current onValueChange / min / max / step rather than the stale
    // values from first render.
    const handlersRef = useRef({ onValueChange, min, max, step });
    handlersRef.current = { onValueChange, min, max, step };

    const handle = (e: GestureResponderEvent) => {
        const w = widthRef.current;
        if (w <= 0) return;
        const x = e.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / w));
        const { min: lo, max: hi, step: s, onValueChange: cb } = handlersRef.current;
        let v = lo + ratio * (hi - lo);
        if (s) v = Math.round(v / s) * s;
        v = Math.max(lo, Math.min(hi, v));
        cb(v);
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: handle,
            onPanResponderMove: handle,
        })
    ).current;

    const ratio = max > min ? (value - min) / (max - min) : 0;
    const clampedRatio = Math.max(0, Math.min(1, ratio));

    return (
        <View
            style={[styles.touchArea, style]}
            onLayout={(e: LayoutChangeEvent) => {
                widthRef.current = e.nativeEvent.layout.width;
            }}
            {...panResponder.panHandlers}
        >
            <View style={[styles.track, { backgroundColor: trackColor }]} pointerEvents="none" />
            <View
                pointerEvents="none"
                style={[
                    styles.thumb,
                    {
                        backgroundColor: thumbColor,
                        // Keep the thumb fully inside the track horizontally
                        // (centered on the value, but offset by half its
                        // width so the edges align with the track ends).
                        left: `${clampedRatio * 100}%`,
                        marginLeft: -THUMB_SIZE / 2,
                    },
                ]}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    touchArea: {
        height: TOUCH_HEIGHT,
        justifyContent: 'center',
        position: 'relative',
    },
    track: {
        height: TRACK_HEIGHT,
        borderRadius: TRACK_HEIGHT / 2,
    },
    thumb: {
        position: 'absolute',
        top: (TOUCH_HEIGHT - THUMB_SIZE) / 2,
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
    },
});
