Reference packages reviewed: 9nine-visual-novel + motherduck. Primary quality bar: 9nine for motion-heavy.

# KAF 5th ONE-MAN LIVE -- Style Guide

## 1. Overview

- **Project**: KAF 5th ONE-MAN LIVE
- **Source URL**: `yokohamawars2026.kamitsubaki.jp/kaf`
- **Visual Summary**: Warm salmon-pink hero background with a full-bleed character illustration. Top navigation uses pill-shaped buttons on a black background. A "SCROLL DOWN" marquee in mint green runs along the bottom. The aesthetic is elegant, warm, and feminine with a refined VTuber event identity.
- **Dominant Read**: Soft, inviting warmth from the salmon-pink, punctuated by sharp contrast from black nav elements and the unexpected mint green scroll indicator. The overall feeling is of a spring concert poster come to life.

## 2. Design Philosophy

### 2.1 Warm Feminine Elegance
The salmon-pink base establishes a warm, approachable tone that aligns with KAF's artistic identity. White calligraphy overlaid on character art creates a hand-crafted, personal feeling rather than a corporate event page. Evidence: `#fd839b` hero background, white brush-stroke Japanese title.

### 2.2 Contrast Through Unexpected Accent
The mint green (`#55ffba`) scroll indicator creates a deliberate visual surprise against the warm pink palette. This tension between warm and cool prevents the design from feeling monotone and adds a digital/modern edge. Evidence: green marquee on pink page.

### 2.3 Navigation as Frame
The black pill-button navigation bar acts as a visual frame for the full-bleed illustration below, creating a clear boundary between functional UI and immersive artwork. Evidence: solid black nav bar with white/colored pill buttons.

## 3. Semantic Tokens

### Color Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--color-bg-hero` | `#fd839b` | Salmon-pink hero background |
| `--color-bg-nav` | `#000000` | Navigation bar background |
| `--color-bg-body` | `#ffffff` | Default body background |
| `--color-accent-mint` | `#55ffba` | Scroll indicator, secondary accent |
| `--color-accent-red` | `#e50004` | Red accent / CTA emphasis |
| `--color-text-primary` | `#000000` | Body text on light backgrounds |
| `--color-text-inverse` | `#ffffff` | Text on dark/pink backgrounds |
| `--color-text-nav` | `#ffffff` | Navigation link text |

### Typography Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--font-body` | `Noto Sans JP` | Primary body typeface |
| `--font-display` | `Red Hat Display` | Display/heading typeface |
| `--font-ui` | `Reddit Sans` | UI element typeface |
| `--font-weight-regular` | `400` | Body weight |
| `--font-weight-medium` | `500` | UI element weight |
| `--font-weight-bold` | `700` | Heading/emphasis weight |

### Spacing Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--space-nav-height` | `56px - 64px` | Navigation bar height |
| `--space-section-pad` | `48px - 80px` | Vertical section padding |
| `--space-nav-pill-pad` | `8px 20px` | Pill button internal padding |
| `--space-marquee-height` | `32px - 40px` | Scroll marquee bar height |

## 4. Color Palette + Usage Mapping

| Token | Hex | Usage |
|:------|:----|:------|
| Salmon Pink | `#fd839b` | Hero background, brand color |
| Black | `#000000` | Navigation bar, body text, strong contrast |
| White | `#ffffff` | Body background, text on dark, calligraphy title |
| Mint Green | `#55ffba` | Scroll-down marquee, secondary digital accent |
| Red | `#e50004` | CTA buttons, alert/emphasis accent |
| Light Pink | `#ffc0cb` | Subtle tint variations in content areas |
| Dark Charcoal | `#1a1a1a` | Footer, deep background sections |

## 5. Typography

| Property | Noto Sans JP | Red Hat Display | Reddit Sans |
|:---------|:-------------|:----------------|:------------|
| Family | `Noto Sans JP, sans-serif` | `Red Hat Display, sans-serif` | `Reddit Sans, sans-serif` |
| Weights | 400, 500, 700 | 400, 700, 900 | 400, 500, 700 |
| Usage | Body text, descriptions | Event title, hero headings | Nav labels, UI elements |
| Sizes | 14px - 16px | 32px - 64px | 12px - 14px |
| Line height | 1.6 - 1.8 | 1.1 - 1.3 | 1.4 - 1.6 |

## 6. Component System

### 6.1 Pill Navigation Button
- **Structure**: Rounded-full button with solid background, white text
- **States**: Default (black bg, white text), Hover (possible pink or mint highlight), Active (pressed state)
- **Notes**: Arranged horizontally in the top nav bar. Pill shape (border-radius: 9999px) creates a soft, approachable UI element that contrasts with the sharp black bar.

### 6.2 Scroll Marquee
- **Structure**: Fixed-height horizontal bar at bottom of hero, text scrolling left-to-right continuously
- **States**: Always animating (CSS marquee/transform animation)
- **Notes**: "SCROLL DOWN" text in mint green (`#55ffba`) on transparent or dark background. Serves as both a UX hint and a decorative rhythm element.

### 6.3 Character Illustration Hero
- **Structure**: Full-bleed container with character artwork, overlaid with white calligraphy title text
- **States**: Static (no hover interaction on illustration), possible parallax on scroll
- **Notes**: The illustration is the primary visual payload. The salmon-pink background bleeds around the character art edges, creating a cohesive color environment.

## 7. Layout Tendencies

- **Container**: Full-bleed hero, likely max-width container (1200-1440px) for content sections below
- **Navigation**: Fixed/sticky top bar, horizontally centered pill buttons
- **Hero ratio**: Approximately 100vh or close to it, character art centered vertically
- **Below fold**: Likely transitions to white background with event details, ticket info
- **Scroll behavior**: Smooth scroll with the marquee as a visual cue
- **Z-index**: Nav on top, character art middle, background color base

## 8. Adaptation Notes

### Keep
- Salmon-pink as hero background -- distinctive and memorable
- Pill-button navigation pattern on black bar
- Mint green as a surprise accent color for interactivity cues
- White calligraphy overlay technique for titling
- Three-font system (display, body, UI) for clear hierarchy

### Adapt
- The mint green may need to be tested for accessibility contrast against various backgrounds
- Pill buttons should have visible focus states for keyboard navigation
- Marquee scroll speed should respect `prefers-reduced-motion`
- Character illustration dependency limits reuse -- consider abstract pink gradient alternative

### Discard
- Single-character-illustration hero is too specific for general reuse
- Japanese calligraphy overlay requires bespoke assets per deployment
- Red accent (`#e50004`) used sparingly in original -- may conflict with pink if overused
