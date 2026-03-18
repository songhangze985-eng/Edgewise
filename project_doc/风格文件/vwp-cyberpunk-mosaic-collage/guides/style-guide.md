Reference packages reviewed: 9nine-visual-novel + motherduck. Primary quality bar: 9nine for motion-heavy.

# VWP 4th ONE-MAN LIVE -- Style Guide

## 1. Overview

- **Project**: VWP (Virtual Witch Phenomenon) 4th ONE-MAN LIVE
- **Source URL**: `yokohamawars2026.kamitsubaki.jp/vwp`
- **Visual Summary**: Full-page image mosaic/collage layout with dense anime art tiles filling the entire viewport. No visible navigation or text content on the hero section. Japanese kanji overlays punctuate the mosaic grid. The visual identity is entirely imagery-driven, channeling a cyberpunk/virtual idol aesthetic.
- **Dominant Read**: Dark, dense, immersive -- the eye is overwhelmed by tiled artwork before settling on individual panels. The feeling is of entering a chaotic digital gallery.

## 2. Design Philosophy

### 2.1 Imagery as Architecture
The entire page structure is built from artwork tiles rather than traditional UI components. There are no hero banners or card grids -- the mosaic IS the interface. Evidence: viewport is 100% filled with image tiles, no whitespace gutters visible.

### 2.2 Kanji as Glyph, Not Text
Japanese kanji characters (aI, sakai, matsuri, sai) function as graphic symbols overlaid on the mosaic rather than as readable content. They serve as emotional anchors and visual rhythm-breakers within the dense image grid.

### 2.3 Anti-Navigation
The page deliberately suppresses conventional web navigation patterns. No hamburger menu, no top bar, no footer links visible on the hero. The user experience is immersive and scroll-driven, similar to a music video or art installation.

## 3. Semantic Tokens

### Color Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--color-bg-primary` | `#ffffff` | Body background (fallback behind mosaic) |
| `--color-bg-dark` | `#000000` | Dark overlay areas |
| `--color-art-crimson` | `#c41e3a` | Dominant red from artwork palette |
| `--color-art-deep-blue` | `#1a237e` | Deep blue from artwork palette |
| `--color-art-teal` | `#00838f` | Teal/cyan from artwork palette |
| `--color-art-pink` | `#e88ca5` | Pink/salmon from artwork palette |
| `--color-text-primary` | `#000000` | Body text |
| `--color-text-inverse` | `#ffffff` | Text on dark backgrounds |

### Typography Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--font-display` | `KingHwa_OldSong` | Display/title typeface, CJK calligraphic |
| `--font-body` | `Noto Sans JP` | Body text, Japanese-optimized sans-serif |
| `--font-weight-regular` | `400` | Body weight |
| `--font-weight-bold` | `700` | Emphasis weight |

### Spacing Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--space-tile-gap` | `0px` | Mosaic tiles are edge-to-edge, no gap |
| `--space-section` | `0px` | Sections flow without padding in mosaic mode |
| `--space-overlay-pad` | `16px - 24px` | Padding inside overlay text blocks |

## 4. Color Palette + Usage Mapping

| Token | Hex | Usage |
|:------|:----|:------|
| White | `#ffffff` | Body background fallback |
| Black | `#000000` | Body text, dark overlays, text bg |
| Crimson Red | `#c41e3a` | Artwork dominant -- character art, dramatic scenes |
| Deep Blue | `#1a237e` | Artwork secondary -- night scenes, tech elements |
| Teal/Cyan | `#00838f` | Artwork accent -- digital/cyber highlights |
| Pink/Salmon | `#e88ca5` | Artwork accent -- character highlights, warmth |
| Dark Purple | `#4a148c` | Artwork tertiary -- atmospheric depth |
| Charcoal | `#212121` | UI surfaces behind mosaic |

Note: The color story is almost entirely derived from the artwork itself rather than from CSS-defined brand colors. The palette is emergent from the illustration content.

## 5. Typography

| Property | Display (KingHwa_OldSong) | Body (Noto Sans JP) |
|:---------|:--------------------------|:--------------------|
| Family | `KingHwa_OldSong` | `Noto Sans JP, sans-serif` |
| Weights | 400 | 400, 700 |
| Hero size | 48px - 72px (kanji overlays) | -- |
| Body size | -- | 14px - 16px |
| Line height | 1.0 - 1.2 (display) | 1.6 - 1.8 (body) |
| Letter spacing | Tight (display kanji) | Normal |
| Usage | Kanji glyph overlays, event title | Descriptive text, info sections |

## 6. Component System

### 6.1 Mosaic Tile
- **Structure**: Rectangular image container, variable aspect ratios, edge-to-edge placement
- **States**: Default (static), Hover (possible scale/opacity shift), Active (animation trigger)
- **Notes**: Tiles animate on page load with staggered reveal. The mosaic layout is the primary interaction surface.

### 6.2 Kanji Overlay
- **Structure**: Single CJK character positioned absolutely over mosaic tiles
- **States**: Default (visible), Animated (fade-in or slide on scroll)
- **Notes**: Characters use `KingHwa_OldSong` font, large scale (48-72px+), positioned at tile intersections for maximum visual impact.

### 6.3 Scroll Indicator
- **Structure**: Minimal downward-pointing cue at bottom of viewport
- **States**: Visible on load, fades or animates on scroll
- **Notes**: Necessary given the anti-navigation approach -- users need a hint that content continues below the mosaic.

## 7. Layout Tendencies

- **Grid**: CSS Grid or absolute positioning for mosaic tiles, non-uniform cell sizes
- **Breakpoints**: Likely reconfigures tile count per row at mobile breakpoints (4-6 columns desktop to 2-3 mobile)
- **Full-bleed**: No max-width container -- content spans 100vw
- **Scroll behavior**: Vertical scroll through mosaic sections, possible parallax or stagger animations
- **Z-index layering**: Kanji overlays sit above tile images, potential dark scrim layers between

## 8. Adaptation Notes

### Keep
- Imagery-as-structure concept -- powerful for portfolio or event showcase contexts
- Kanji/glyph overlay technique for branding moments
- Edge-to-edge mosaic density for visual impact
- Motion-heavy tile reveal animations

### Adapt
- Add subtle navigation affordances for accessibility (hidden but focusable nav)
- Consider reduced motion variant for `prefers-reduced-motion`
- Tile gap of 1-2px may improve visual parsing without losing density
- Ensure alt text on all mosaic images for screen readers

### Discard
- Complete absence of navigation is impractical for most production sites
- Pure imagery-driven color story requires bespoke artwork for every deployment
- Zero-gap mosaic may cause rendering issues on fractional pixel screens
