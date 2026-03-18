# VWP 4th ONE-MAN LIVE -- Evidence Manifest

## 1. Source Summary

| Field | Value |
|:------|:------|
| **URL** | `https://yokohamawars2026.kamitsubaki.jp/vwp` |
| **Capture Date** | 2026-03-16 |
| **Site Type** | VTuber event landing page |
| **Extraction Method** | Visual analysis, CSS inspection |

## 2. Screenshots

| ID | Filename | Description | Status |
|:---|:---------|:------------|:-------|
| SC-01 | `evidence/screenshots/vwp-hero-mosaic-full.png` | Full viewport mosaic hero on desktop | Pending capture |
| SC-02 | `evidence/screenshots/vwp-kanji-overlay-detail.png` | Close-up of kanji glyph overlays on tiles | Pending capture |
| SC-03 | `evidence/screenshots/vwp-mobile-mosaic.png` | Mobile viewport tile layout | Pending capture |
| SC-04 | `evidence/screenshots/vwp-scroll-below-fold.png` | Content below the mosaic hero | Pending capture |
| SC-05 | `evidence/screenshots/vwp-animation-sequence.png` | Tile reveal animation mid-state | Pending capture |

## 3. Scripts Used

None -- visual extraction only. Style tokens derived from manual inspection of rendered page and computed CSS values.

## 4. Coverage Assessment

| Area | Covered | Confidence |
|:-----|:--------|:-----------|
| Hero mosaic layout | Yes | High |
| Color palette (artwork-derived) | Yes | Medium -- colors are emergent from artwork, not CSS variables |
| Typography (fonts) | Yes | High -- `KingHwa_OldSong` and `Noto Sans JP` confirmed |
| Navigation pattern | Yes | High -- absence of nav is a design choice |
| Animation/motion behavior | Partial | Medium -- staggered tile animation observed, timing details not captured |
| Below-fold content | No | Low -- analysis focused on hero mosaic |
| Mobile responsiveness | No | Low -- desktop-only analysis |
| Accessibility features | No | Low -- not inspected |

## 5. Gaps and Confidence

### High Confidence
- Font families (`KingHwa_OldSong`, `Noto Sans JP`)
- Mosaic layout pattern (edge-to-edge tiles, no gaps)
- Kanji overlay usage (decorative, not navigational)
- Black/white base with imagery-driven color story

### Medium Confidence
- Exact hex values for artwork-derived palette (crimson, blue, teal, pink) -- these are approximations from visual inspection, not extracted from CSS custom properties
- Animation timing and easing functions
- Tile grid column counts at various breakpoints

### Low Confidence / Gaps
- Below-fold page structure and content types
- Mobile layout adaptation specifics
- Interactive states (hover, focus, active) on tiles
- Performance characteristics of the mosaic animation
- Whether the mosaic uses CSS Grid, absolute positioning, or a JS library

### Recommended Follow-up
1. Capture full-page screenshots at desktop (1440px) and mobile (375px) widths
2. Extract computed CSS for grid/layout properties via DevTools
3. Record animation sequence as video or frame captures
4. Inspect below-fold content sections for additional component patterns
