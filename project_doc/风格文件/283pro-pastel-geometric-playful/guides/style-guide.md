Reference packages reviewed: 9nine-visual-novel + motherduck. Primary quality bar: motherduck for static.

# 283 Sports Festival -- Style Guide

## 1. Overview

- **Project**: 283 Production Kanshasai (Sports Festival / Fan Appreciation Event)
- **Source URL**: `idolmaster-official.jp/live_event/283pro_kansyasai/`
- **Visual Summary**: White card layout over a light background with colorful geometric decorations -- yellow triangles, blue rectangles, pink/coral shapes scattered as accents. Clean body text in Japanese. Simple announcement layout optimized for maximum readability. Light, cheerful, sporty vibe with a playful geometric identity.
- **Dominant Read**: Clean, friendly, and approachable -- like a school event bulletin board. The geometric shapes add color and personality without competing with the informational content.

## 2. Design Philosophy

### 2.1 Content-First Readability
The design prioritizes text readability above all else. White card on a light background, clean sans-serif typography, generous line height. The geometric decorations are pushed to the margins so they add personality without reducing legibility. Evidence: white card surface, standard body text sizing, minimal visual noise in content areas.

### 2.2 Playful Through Geometry
Rather than illustration-heavy or gradient-driven design, the playful/sporty atmosphere is achieved through simple geometric shapes (triangles, rectangles, circles) in primary-adjacent pastel colors. This is a lightweight, reusable pattern. Evidence: scattered geometric shapes as the sole decorative motif.

### 2.3 Minimal Styling, Maximum Information
The page is essentially an announcement/notice format -- the styling supports information delivery rather than creating an immersive visual experience. This is the opposite end of the spectrum from the cinematic event pages. Evidence: text-heavy layout, standard card structure, no hero illustration.

## 3. Semantic Tokens

### Color Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--color-bg-page` | `#f5f5f5` | Light page background |
| `--color-bg-card` | `#ffffff` | White card surface |
| `--color-geo-yellow` | `#ffd54f` | Yellow triangle accent |
| `--color-geo-blue` | `#64b5f6` | Blue rectangle accent |
| `--color-geo-pink` | `#f48fb1` | Pink/coral shape accent |
| `--color-geo-green` | `#81c784` | Green accent (if present) |
| `--color-text-primary` | `#333333` | Body text |
| `--color-text-heading` | `#1a1a1a` | Heading text |
| `--color-text-muted` | `#757575` | Secondary/meta text |
| `--color-border` | `#e0e0e0` | Card border / dividers |

### Typography Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--font-body` | `Noto Sans JP, sans-serif` | Body and heading typeface |
| `--font-weight-regular` | `400` | Body weight |
| `--font-weight-medium` | `500` | Subheading weight |
| `--font-weight-bold` | `700` | Heading weight |

### Spacing Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--space-card-pad` | `24px - 40px` | Internal card padding |
| `--space-card-margin` | `16px - 24px` | Card margin from edges |
| `--space-section` | `24px - 40px` | Vertical section spacing |
| `--space-line-gap` | `8px - 12px` | Gap between text lines/items |
| `--space-geo-offset` | `-20px to 40px` | Geometric decoration offset from card edges |

## 4. Color Palette + Usage Mapping

| Token | Hex | Usage |
|:------|:----|:------|
| Light Grey | `#f5f5f5` | Page background |
| White | `#ffffff` | Card surface, content area |
| Pastel Yellow | `#ffd54f` | Triangle decoration |
| Pastel Blue | `#64b5f6` | Rectangle decoration |
| Pastel Pink | `#f48fb1` | Circle/shape decoration |
| Pastel Green | `#81c784` | Optional additional shape decoration |
| Dark Grey | `#333333` | Body text |
| Near Black | `#1a1a1a` | Headings |
| Mid Grey | `#757575` | Meta text, timestamps |
| Border Grey | `#e0e0e0` | Card borders, horizontal rules |

## 5. Typography

| Property | Value |
|:---------|:------|
| Family | `Noto Sans JP, sans-serif` (single font system) |
| Weights | 400 (body), 500 (subheadings), 700 (headings) |
| Body size | 14px - 16px |
| Heading size | 20px - 28px |
| Line height | 1.7 - 2.0 (generous for Japanese text readability) |
| Letter spacing | Normal |
| Color | `#333333` body, `#1a1a1a` headings |
| Alignment | Left-aligned for body, possibly centered for titles |

## 6. Component System

### 6.1 Announcement Card
- **Structure**: White rounded-corner card with padding, optional border, containing heading + body text + meta info
- **States**: Static (no interactive states -- this is an informational page)
- **Notes**: The primary and possibly only component. Generous padding (24-40px) ensures text breathes. May include a colored top border (2-4px) using one of the geometric accent colors.

### 6.2 Geometric Decoration
- **Structure**: Absolutely positioned CSS shapes (triangle, rectangle, circle) using the pastel color tokens
- **States**: Static (decorative only)
- **Notes**: Positioned at corners or edges of the card/page. Small scale (20-60px). Possibly implemented as CSS pseudo-elements, SVG, or background-image. They create visual rhythm without functional purpose.

### 6.3 Section Divider
- **Structure**: Horizontal rule or spacer between content sections within the card
- **States**: Static
- **Notes**: Likely a simple `<hr>` with `#e0e0e0` color and 1px height. Used to separate event details, notes, and ticket information.

## 7. Layout Tendencies

- **Container**: Centered max-width (800-960px) -- narrower than typical event pages to optimize reading width
- **Card**: Single white card as the primary content container
- **Grid**: No grid -- single-column text layout
- **Whitespace**: Generous internal padding and line height for readability
- **Decorations**: Geometric shapes positioned absolutely, overflowing the card edges slightly for a playful touch
- **Responsive**: Minimal adaptation needed -- single column is inherently mobile-friendly

## 8. Adaptation Notes

### Keep
- White card on light background pattern -- universally readable
- Pastel geometric decorations as a lightweight personality system
- Generous line height (1.7-2.0) for body text
- Single-font type system (weight variation only) for simplicity
- Content-first layout structure

### Adapt
- Geometric decoration system can be parameterized (shape, color, position) for reuse
- Consider adding subtle hover states if the card links to detail pages
- The narrow max-width (800-960px) works for text-heavy pages but may need widening for card grids
- Accent colors can serve as category indicators (yellow = event, blue = info, pink = ticket)

### Discard
- Pure announcement/notice format lacks visual impact for hero-driven pages
- No navigation pattern present -- would need to be added for multi-page sites
- Static-only component states insufficient for interactive applications
- No dark mode consideration in the current palette
