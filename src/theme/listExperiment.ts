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

// Soft fade strips at the top and bottom of the list. In minimal mode
// the fade is turned off entirely — the hairline dividers already
// provide a clean edge against the gray chrome, and the fade muddied
// the topmost / bottommost line.
export const LIST_FADE_ENABLED = !isMinimal;
export const LIST_FADE_HEIGHT = 12;

// In minimal mode the gray chrome strips (header search row, QuickAdd
// bar) span the FULL screen width — only the controls inside them stay
// capped at the readable 720 px rail. In default mode the gray itself
// is also capped to 720 px (original behavior).
export const CHROME_FULL_WIDTH = isMinimal;

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
//
// In minimal mode the modal surround is white (no gray fill) and the
// writing window is bracketed by two black hairlines that span only
// the width of the centered modalSheet — not the full screen, even on
// wide displays where the toolbar (which lives outside modalSheet)
// extends to both edges.
export const EDITOR_SURROUND_COLOR = isMinimal ? '#FFFFFF' : '#F0F2F5';
export const EDITOR_CARD_RADIUS = isMinimal ? 0 : 12;

// Horizontal inset of the writing window inside modalSheet. In minimal
// this also bounds the top and bottom hairlines, so a non-zero value
// shrinks them so they don't reach the edges of the centered rail.
export const EDITOR_HORIZONTAL_INSET = isMinimal ? 24 : 20;

// Vertical breathing gap above the writing window — the surround color
// (white in minimal) shows above the top hairline. Sized in minimal to
// match the height of the white header bar on the main screen (icon row
// 40 px + paddingBottom 16 px + 1 px border = 57 px), so the editor's
// top hairline aligns with where the gray search row begins on the
// notes list.
export const EDITOR_TOP_OFFSET = isMinimal ? 57 : 20;

// Bottom inset of the writing window. In default this gives the rounded
// editor card breathing room above the toolbar; in minimal there is no
// card and the bottom hairline already sits on domainSelectorRow, so 0
// keeps it flush against the toolbar below.
export const EDITOR_BOTTOM_INSET = isMinimal ? 0 : 20;

// Vertical gap between titleContainer and editorArea when the title is
// shown. 0 in minimal so the two read as one continuous white sheet;
// 4 px in default for a small gap between the two rounded cards.
export const EDITOR_TITLE_TO_BODY_GAP = isMinimal ? 0 : 4;

// Top margin for the no-title flow (QuickAdd). In minimal we use the
// same EDITOR_TOP_OFFSET (line aligned with main-screen gray section);
// in default the original 32 px keeps the editor from crowding the
// modal's top edge.
export const EDITOR_NO_TITLE_TOP_OFFSET = isMinimal ? EDITOR_TOP_OFFSET : 32;

export const EDITOR_BORDER_WIDTH = isMinimal ? StyleSheet.hairlineWidth : 0;
export const EDITOR_BORDER_COLOR = '#000000';
