Reference packages reviewed: 9nine-visual-novel + motherduck. Primary quality bar: motherduck for static.

# IDOL WORLD SUPER FESTIVAL 2026 -- Style Guide

## 1. Overview

- **Project**: THE IDOLM@STER IDOL WORLD SUPER FESTIVAL 2026
- **Source URL**: `idolmaster-official.jp/live_event/mr_idolworld2026/`
- **Visual Summary**: White/platinum base with rainbow gradient stripe accents (red, orange, yellow, green). Black pixel-frame border at the bottom. Large crowd of anime characters in white costumes dominates the hero. Bold condensed display typography for the event title. Three-day event cards and a 20th anniversary badge. Celebratory, grand, and clean.
- **Dominant Read**: Bright, festive, and expansive -- the white base creates an open, inviting canvas while the rainbow stripes inject energy and celebration without overwhelming. The large character crowd emphasizes scale and community.

## 2. Design Philosophy

### 2.1 White Canvas, Rainbow Energy
The platinum-white base allows the rainbow gradient stripes to pop with maximum vibrancy. Rather than a dark, moody atmosphere, the design uses brightness and openness to convey a festival's daytime energy. Evidence: `#fff` base, rainbow stripe accents as the primary color injection.

### 2.2 Scale Through Crowd
The large character crowd illustration communicates the scale and inclusiveness of a "SUPER FESTIVAL" -- this is an event for everyone, featuring all franchise characters together. The white costumes unify the crowd visually. Evidence: panoramic character illustration spanning full width.

### 2.3 Structured Celebration
Despite the celebratory theme, the layout is clean and structured -- event cards are organized in a grid, typography is bold but readable, and the rainbow stripes follow precise geometric lines rather than chaotic splashes. Evidence: three-day event cards in orderly layout, condensed display type, geometric rainbow bands.

## 3. Semantic Tokens

### Color Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--color-bg-primary` | `#ffffff` | White/platinum base |
| `--color-bg-card` | `#f8f8f8` | Subtle off-white for card backgrounds |
| `--color-rainbow-red` | `#e53e3e` | Rainbow stripe - red band |
| `--color-rainbow-orange` | `#ed8936` | Rainbow stripe - orange band |
| `--color-rainbow-yellow` | `#ecc94b` | Rainbow stripe - yellow band |
| `--color-rainbow-green` | `#48bb78` | Rainbow stripe - green band |
| `--color-rainbow-blue` | `#4299e1` | Rainbow stripe - blue band (if present) |
| `--color-frame-black` | `#000000` | Pixel-frame border element |
| `--color-text-primary` | `#1a1a1a` | Primary body text |
| `--color-text-display` | `#000000` | Bold display title text |
| `--color-badge-gold` | `#d4a847` | 20th anniversary badge accent |

### Typography Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--font-display` | Bold condensed sans-serif (site-specific) | Event title typeface |
| `--font-body` | Noto Sans JP or similar | Body/info text |
| `--font-weight-regular` | `400` | Body weight |
| `--font-weight-bold` | `700` | Card heading weight |
| `--font-weight-black` | `900` | Display title weight |

### Spacing Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--space-section` | `48px - 80px` | Vertical section spacing |
| `--space-card-gap` | `20px - 32px` | Gap between event day cards |
| `--space-card-pad` | `24px - 32px` | Internal card padding |
| `--space-rainbow-stripe-h` | `4px - 8px` | Height of individual rainbow stripe bands |

## 4. Color Palette + Usage Mapping

| Token | Hex | Usage |
|:------|:----|:------|
| White | `#ffffff` | Page background, dominant surface, character costumes |
| Platinum | `#f8f8f8` | Card backgrounds, subtle elevation |
| Black | `#000000` | Pixel-frame border, display text, high contrast elements |
| Rainbow Red | `#e53e3e` | Gradient stripe band, Day 1 accent |
| Rainbow Orange | `#ed8936` | Gradient stripe band, Day 2 accent |
| Rainbow Yellow | `#ecc94b` | Gradient stripe band, warmth bridge |
| Rainbow Green | `#48bb78` | Gradient stripe band, Day 3 accent |
| Gold | `#d4a847` | 20th anniversary badge, premium accent |
| Dark Grey | `#333333` | Secondary text, descriptions |

## 5. Typography

| Property | Display (Condensed) | Body (Sans-serif) |
|:---------|:--------------------|:-------------------|
| Family | Bold condensed sans (site-specific) | Noto Sans JP or similar |
| Weights | 800, 900 | 400, 500, 700 |
| Usage | "IDOL WORLD SUPER FESTIVAL 2026" title | Event details, dates, venue info |
| Sizes | 40px - 72px | 14px - 18px |
| Line height | 1.0 - 1.15 | 1.5 - 1.7 |
| Letter spacing | Tight (-0.02em to -0.04em) | Normal |
| Transform | Uppercase | Normal |
| Color | Black | Dark grey / Black |

## 6. Component System

### 6.1 Event Day Card
- **Structure**: Bordered card with day number header, date, venue info, and possibly a color accent matching the rainbow band for that day
- **States**: Default, Hover (subtle shadow or border color change)
- **Notes**: Three cards for a three-day festival. Each card may use a different rainbow color as its accent (red for Day 1, orange for Day 2, green for Day 3). Clean internal typography hierarchy.

### 6.2 Rainbow Stripe Band
- **Structure**: Horizontal bar spanning full width or section width, composed of multiple thin color bands in rainbow sequence
- **States**: Static (decorative element)
- **Notes**: The stripe functions as a section divider and celebratory motif. Each band is approximately 4-8px tall, stacked vertically to form a rainbow gradient block. Used between sections or at page boundaries.

### 6.3 Anniversary Badge
- **Structure**: Circular or shield-shaped badge with "20th Anniversary" text, gold accent coloring
- **States**: Static
- **Notes**: Positioned near the event title or in a corner to establish franchise legacy. Gold metallic treatment similar to SideM's emblem approach but lighter and more playful.

## 7. Layout Tendencies

- **Container**: Max-width centered (1200-1440px) for content, full-bleed for character illustration and rainbow stripes
- **Hero**: Character crowd illustration spanning full width above or behind the title
- **Grid**: 3-column grid for day cards on desktop, 1-column stack on mobile
- **Pixel-frame**: Black border at bottom of hero creates a tech/digital frame effect
- **Whitespace**: Generous -- the white base demands ample breathing room to avoid feeling clinical
- **Visual hierarchy**: Character crowd (visual) > Event title (text) > Day cards (info) > Footer

## 8. Adaptation Notes

### Keep
- White/platinum base with rainbow accent system -- versatile and festive
- Bold condensed display typography for impact headlines
- Event day card pattern with color-coded accents
- Rainbow stripe as section divider motif
- Clean, structured layout despite celebratory theme

### Adapt
- Rainbow gradient can be implemented as CSS linear-gradient for performance
- Pixel-frame border can be a CSS border-image or pseudo-element
- Card color accent system (one rainbow color per card) is a reusable pattern
- Consider a 4-band rainbow (ROYGB minus IV) if the full spectrum feels too busy
- Anniversary badge should be a composable component, not a baked image

### Discard
- 50+ character crowd illustration is event-specific and unreproducible
- White costumes unifying all characters is a narrative choice, not a design system element
- Three-day card layout is specific to this event's schedule structure
