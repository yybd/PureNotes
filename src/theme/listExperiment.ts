// Experimental visual variants for the notes list and the write/edit
// modal. Flip STYLE_VARIANT and reload — every consumer reads from this
// file, so the whole app rerenders against the new variant.
//
//   'default' — gray surround, white rounded cards with a soft shadow,
//               12 px gaps between cards. The original look.
//   'minimal' — white surround everywhere, no card radius, no shadow.
//               A hairline black line separates list items, and the
//               write/edit window is bracketed by a hairline black line
//               at the top and bottom only.
//
// The two variants share the same component tree — only token values
// differ — so you can flip back and forth freely while playing with it.

import { StyleSheet } from 'react-native';

export const STYLE_VARIANT: 'default' | 'minimal' = 'minimal';

const isMinimal = STYLE_VARIANT === 'minimal';

// Surround / board background. The list, editor modal, header search
// area and quick-add bar all paint this color so the composition reads
// as one continuous surface.
export const SURROUND_COLOR = isMinimal ? '#FFFFFF' : '#F0F2F5';
// Same color in `r, g, b` form — used by the scroll-fade strips that
// build their gradient out of variable-alpha rgba layers.
export const SURROUND_RGB = isMinimal ? '255, 255, 255' : '240, 242, 245';

// ─── Notes list cards ─────────────────────────────────────────────────
export const CARD_RADIUS = isMinimal ? 0 : 16;
export const CARD_GAP = isMinimal ? 0 : 12;
export const CARD_SHOW_SHADOW = !isMinimal;

// In minimal mode, each card carries a hairline black line at its
// bottom edge — that hairline is the divider between cards.
export const CARD_SEPARATOR_WIDTH = isMinimal ? StyleSheet.hairlineWidth : 0;
export const CARD_SEPARATOR_COLOR = '#000000';

// ─── Editor modal (write / edit window) ───────────────────────────────
// In minimal mode the editor card spans the full modal width with no
// rounded corners — it reads as a flush sheet inset only by hairline
// lines at the very top and very bottom of the writing surface.
export const EDITOR_CARD_RADIUS = isMinimal ? 0 : 12;
export const EDITOR_CARD_INSET = isMinimal ? 0 : 20;

export const EDITOR_BORDER_WIDTH = isMinimal ? StyleSheet.hairlineWidth : 0;
export const EDITOR_BORDER_COLOR = '#000000';
