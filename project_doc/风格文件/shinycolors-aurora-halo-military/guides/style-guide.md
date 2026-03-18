Reference packages reviewed: 9nine-visual-novel + motherduck. Primary quality bar: 9nine for motion-heavy.

# ShinyColors 7th LIVE -- Style Guide

## 1. Overview

- **Project**: THE IDOLM@STER ShinyColors 7th LIVE
- **Source URL**: `idolmaster-official.jp/live_event/shinycolors_7th_rasen/`
- **Visual Summary**: Full-bleed anime illustration with aurora/halo light effects radiating from the center. Cool grey-blue atmospheric palette with military-style uniform characters flanking the center like a movie poster. Japanese calligraphy title "Rasen" (Spiral) anchors the composition. Cinematic, moody, and atmospheric.
- **Dominant Read**: Theatrical and cinematic -- the page reads like a film poster rather than a web page. The aurora center glow draws the eye inward while the flanking characters create a widescreen composition.

## 2. Design Philosophy

### 2.1 Cinematic Composition
The layout mirrors film poster conventions: characters arranged in a triangular/flanking composition, central light source, title placement below center. The page is designed to be viewed as a single cinematic frame. Evidence: widescreen character arrangement, center-glow focal point, minimal UI chrome.

### 2.2 Atmospheric Light as Identity
The aurora/halo effect is not decorative but structural -- it defines the visual hierarchy by pulling focus to the center, creating depth through light falloff, and establishing the event's ethereal mood. Evidence: rainbow-spectrum light refraction emanating from center, desaturated edges.

### 2.3 Restraint Through Desaturation
Character tones are deliberately desaturated, allowing the aurora light effect to be the only saturated element. This restraint creates a sophisticated, moody atmosphere that distinguishes the page from typical colorful idol event pages. Evidence: grey-blue character uniforms, muted skin tones, contrast with vivid aurora center.

## 3. Semantic Tokens

### Color Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--color-bg-primary` | `#1a2030` | Cool dark grey-blue background |
| `--color-bg-atmosphere` | `#2a3545` | Atmospheric mid-tone blue |
| `--color-glow-center` | `#ffffff` | White center glow (aurora source) |
| `--color-aurora-green` | `#4ade80` | Aurora green spectrum |
| `--color-aurora-purple` | `#a855f7` | Aurora purple spectrum |
| `--color-aurora-cyan` | `#22d3ee` | Aurora cyan spectrum |
| `--color-text-primary` | `#ffffff` | Primary text on dark background |
| `--color-text-muted` | `#94a3b8` | Secondary/date text |
| `--color-character-desat` | `#6b7a8d` | Desaturated character tone range |

### Typography Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--font-calligraphy` | Japanese brush font (site-specific) | Title "Rasen" calligraphy |
| `--font-body` | Clean sans-serif (Noto Sans JP or similar) | Date text, event info |
| `--font-weight-regular` | `400` | Body/date weight |
| `--font-weight-bold` | `700` | Emphasis weight |

### Spacing Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--space-hero-height` | `100vh` | Full viewport hero |
| `--space-title-offset` | `60% - 70%` from top | Title vertical position |
| `--space-date-margin` | `16px - 24px` | Margin below title for date text |

## 4. Color Palette + Usage Mapping

| Token | Hex | Usage |
|:------|:----|:------|
| Dark Grey-Blue | `#1a2030` | Page background, atmospheric base |
| Mid Grey-Blue | `#2a3545` | Atmospheric gradient mid-tone |
| White | `#ffffff` | Center glow source, primary text, title |
| Aurora Green | `#4ade80` | Light refraction spectrum band |
| Aurora Purple | `#a855f7` | Light refraction spectrum band |
| Aurora Cyan | `#22d3ee` | Light refraction spectrum band |
| Aurora Gold | `#fbbf24` | Subtle warm spectrum edge |
| Slate | `#94a3b8` | Muted date/info text |
| Desaturated Blue-Grey | `#6b7a8d` | Character uniform tone range |

## 5. Typography

| Property | Calligraphy (Title) | Sans-serif (Info) |
|:---------|:-------------------|:-------------------|
| Family | Japanese brush font | Noto Sans JP or similar |
| Weights | Single weight (brush) | 400, 700 |
| Usage | Event title "Rasen" only | Date, venue, event info |
| Sizes | 48px - 80px (estimated) | 14px - 20px |
| Line height | 1.0 - 1.1 | 1.5 - 1.7 |
| Color | White | White / Slate grey |
| Style | Brush stroke, organic | Clean, geometric, modern |

## 6. Component System

### 6.1 Aurora Hero
- **Structure**: Full-viewport container with radial gradient glow at center, character illustration layer, atmospheric background layer
- **States**: Default (static glow or subtle pulse), possible scroll-triggered parallax
- **Notes**: The aurora is likely implemented as overlapping radial gradients with low opacity, possibly with a subtle CSS animation for shimmer. The white center glow fades through spectrum colors before dissipating into the dark blue background.

### 6.2 Calligraphy Title Block
- **Structure**: Centered title text in brush calligraphy font, date/venue text below in clean sans-serif
- **States**: Default (static), possible fade-in on load
- **Notes**: The calligraphy font is likely loaded as a custom web font or rendered as an SVG/image. The "Rasen" title functions as both text content and a visual design element.

### 6.3 Minimal Date Strip
- **Structure**: Clean single-line or two-line text block below the title with event date and venue
- **States**: Static
- **Notes**: Extremely minimal -- just white or slate-grey sans-serif text. The restraint here lets the cinematic illustration above do the visual heavy lifting.

## 7. Layout Tendencies

- **Full-bleed**: Entire viewport is the illustration canvas, no containers or max-width
- **Layering**: Background atmosphere, character illustration, aurora glow overlay, text overlay (bottom-up z-index)
- **Vertical rhythm**: Hero fills 100vh, title positioned at ~60-70% from top, date text below
- **Horizontal**: Characters spread across full width, creating a panoramic composition
- **Responsive strategy**: Likely crops illustration edges on mobile, possibly re-centers the aurora glow
- **Minimal chrome**: No visible navigation on the hero, hamburger menu if any

## 8. Adaptation Notes

### Keep
- Cool grey-blue atmospheric palette -- sophisticated and distinctive
- Aurora/halo radial glow as a signature visual effect
- Cinematic full-bleed composition approach
- Desaturation strategy for non-focal elements
- Extreme typographic restraint (calligraphy title + minimal date text)

### Adapt
- Aurora effect can be achieved with CSS radial-gradient + mix-blend-mode without heavy images
- Calligraphy font dependency should have graceful fallback (serif font with letter-spacing)
- Full-bleed illustration requires responsive crop strategy for mobile
- Add subtle `prefers-reduced-motion` variant for any aurora pulse animation
- Consider adding a barely-visible nav overlay for accessibility

### Discard
- Movie-poster character composition is too bespoke for reusable components
- Military uniform aesthetic is specific to this event's theme
- Single-page-hero approach lacks navigation affordance for content-heavy sites
