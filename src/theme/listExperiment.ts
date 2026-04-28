// Experimental visual variants for the notes list and the write/edit
// modal. Flip STYLE_VARIANT and reload — every consumer reads from this
// file, so the whole app rerenders against the new variant.
//
//   'default' — gray surround everywhere, white rounded cards with a
//               soft shadow, 12 px gaps between cards. Original look.
//   'minimal' — gray surround on the chrome (header / search / quick-add
//               / editor surround) but the scrolling list itself is a
//               white sheet with hairline black dividers between items.
//               The write/edit window is a flush white sheet framed by
//               hairline black lines at the top and bottom only, sitting
//               with a small breathing gap of gray above it.
//
// The two variants share the same component tree — only token values
// differ — so you can flip back and forth freely while playing with it.

import { StyleSheet } from 'react-native';

export const STYLE_VARIANT: 'default' | 'minimal' = 'minimal';

const isMinimal = STYLE_VARIANT === 'minimal';

// Surround / chrome color. Header, search row, QuickAdd bar, and the
// editor modal's wings all paint this — gray in both variants so the
// app chrome reads consistently and the white list (in minimal) pops
// against it.
export const SURROUND_COLOR = '#F0F2F5';
// Same in `r, g, b` form — used by the scroll-fade strips.
export const SURROUND_RGB = '240, 242, 245';

// Notes list area. In minimal mode the scrolling list sits on a white
// sheet so the cards (also white) bleed into it and only the hairline
// black dividers separate them.
export const LIST_BACKGROUND = isMinimal ? '#FFFFFF' : '#F0F2F5';

// Height of the soft fade strips at the top and bottom of the list.
// Smaller in minimal so the hairline dividers stay visible right up to
// the chrome edge instead of dissolving into a thick blur.
export const LIST_FADE_HEIGHT = isMinimal ? 10 : 12;

// Cards in the list.
export const CARD_RADIUS = isMinimal ? 0 : 16;
export const CARD_GAP = isMinimal ? 0 : 12;
export const CARD_SHOW_SHADOW = !isMinimal;

// Domain chip on each note card.
//   default — chip background is the domain color at ~12% opacity.
//   minimal — chip background is plain white; only the colored border and
//             text identify the domain.
export const DOMAIN_CHIP_USES_TINT = !isMinimal;
export const DOMAIN_CHIP_FONT_WEIGHT: '400' | '600' = isMinimal ? '400' : '600';
// In minimal, every card carries a hairline black line at its bottom
// edge — that hairline is the divider between cards.
export const CARD_SEPARATOR_WIDTH = isMinimal ? StyleSheet.hairlineWidth : 0;
export const CARD_SEPARATOR_COLOR = '#000000';

// Editor modal — write / edit window.
export const EDITOR_CARD_RADIUS = isMinimal ? 0 : 12;
export const EDITOR_CARD_INSET = isMinimal ? 0 : 20;
// Vertical breathing gap above the writing window so the top hairline
// sits a little below the modal's top edge (gray of the surround shows
// above it). Default keeps the original 20 px card inset on top.
export const EDITOR_TOP_OFFSET = isMinimal ? 12 : 20;
export const EDITOR_BORDER_WIDTH = isMinimal ? StyleSheet.hairlineWidth : 0;
export const EDITOR_BORDER_COLOR = '#000000';
