Reference packages reviewed: 9nine-visual-novel + motherduck. Primary quality bar: motherduck for static.

# SideM 10th Anniversary -- Style Guide

## 1. Overview

- **Project**: THE IDOLM@STER SideM 10th Anniversary
- **Source URL**: `idolmaster-official.jp/live_event/sidem10th/`
- **Visual Summary**: Royal/deep blue background with starfield sparkle particle effects. Ornate gold and emerald emblem badges serve as primary visual elements. A large shield/crest logo is centered on the page. City venue cards present tour information. The design conveys celebration, prestige, and anniversary grandeur.
- **Dominant Read**: Regal and ceremonial -- the combination of deep blue, metallic gold, and shield crests evokes formal celebration, award ceremonies, and luxury branding.

## 2. Design Philosophy

### 2.1 Heraldic Prestige
The shield/crest logo and emblem badges draw from heraldic design traditions to communicate legacy, achievement, and institutional pride. A 10th anniversary is treated as a milestone worthy of royal iconography. Evidence: centered shield logo, ornate badge elements, metallic gradient treatments.

### 2.2 Celestial Celebration
Star-white sparkle particles on the deep blue background create a night-sky/constellation metaphor that elevates the page from a simple event listing to a celebratory atmosphere. Evidence: animated sparkle effects across the background, starfield density.

### 2.3 Metallic Material Language
Gold, silver, and emerald metallic gradients replace flat colors for key visual elements, creating a sense of physical premium -- as if the badges and crests were minted metal. Evidence: gradient treatments on emblem elements, reflective highlight simulation.

## 3. Semantic Tokens

### Color Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--color-bg-primary` | `#0a1628` | Deep royal blue background |
| `--color-bg-card` | `#0f2040` | Card/panel background (slightly lighter blue) |
| `--color-accent-gold` | `#d4a847` | Gold metallic base |
| `--color-accent-gold-light` | `#f5d882` | Gold metallic highlight |
| `--color-accent-emerald` | `#2e8b57` | Emerald green accent |
| `--color-sparkle` | `#ffffff` | Star sparkle particles |
| `--color-text-primary` | `#ffffff` | Primary text on dark bg |
| `--color-text-gold` | `#d4a847` | Gold accent text |
| `--color-border-ornate` | `#b8860b` | Ornate border/divider color |

### Typography Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--font-display` | Serif display font (site-specific) | Title/emblem typeface |
| `--font-body` | Sans-serif (likely Noto Sans JP) | Body text |
| `--font-weight-regular` | `400` | Body weight |
| `--font-weight-bold` | `700` | Heading weight |
| `--font-weight-black` | `900` | Display weight |

### Spacing Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--space-section` | `64px - 96px` | Vertical section padding |
| `--space-card-gap` | `24px - 32px` | Gap between venue cards |
| `--space-emblem-margin` | `40px - 60px` | Margin around emblem badges |
| `--space-nav-ornate-pad` | `12px 24px` | Nav item padding with decorators |

## 4. Color Palette + Usage Mapping

| Token | Hex | Usage |
|:------|:----|:------|
| Royal Blue | `#0a1628` | Page background, dominant surface |
| Navy Blue | `#0f2040` | Card backgrounds, elevated surfaces |
| Gold | `#d4a847` | Emblem fills, accent text, borders |
| Gold Light | `#f5d882` | Metallic gradient highlights |
| Gold Dark | `#8b6914` | Metallic gradient shadows |
| Emerald | `#2e8b57` | Secondary emblem accent, badge elements |
| Silver | `#c0c0c0` | Tertiary metallic, subtle borders |
| Star White | `#ffffff` | Sparkle particles, primary text |
| Warm White | `#f5f0e0` | Softened text for descriptions |

## 5. Typography

| Property | Display (Serif) | Body (Sans-serif) |
|:---------|:----------------|:-------------------|
| Family | Serif display (site-specific) | Noto Sans JP or similar |
| Weights | 700, 900 | 400, 500, 700 |
| Usage | Event title, emblem text, section headers | Venue info, descriptions, dates |
| Sizes | 36px - 72px | 14px - 18px |
| Line height | 1.1 - 1.3 | 1.6 - 1.8 |
| Color | Gold / White | White / Warm White |

## 6. Component System

### 6.1 Emblem Badge
- **Structure**: Shield or circular crest with metallic gradient fill, ornate border, interior text or icon
- **States**: Default (static metallic sheen), possible hover glow effect
- **Notes**: Central visual identity element. Gold-to-dark-gold gradient simulates minted metal. May include emerald accent within the crest design.

### 6.2 Venue City Card
- **Structure**: Rounded or bordered card on navy background, containing city name, venue, date, and possibly a small venue image
- **States**: Default, Hover (subtle glow or border highlight)
- **Notes**: Arranged in a grid or horizontal scroll. Each card represents one tour stop. Clean typography hierarchy: city name large, venue/date smaller.

### 6.3 Ornate Navigation
- **Structure**: Horizontal nav bar with decorative symbols (star/diamond characters) flanking each link
- **States**: Default (white text), Hover (gold text or underline), Active (gold + bold)
- **Notes**: The decorative symbols serve as visual separators and reinforce the heraldic/celebratory theme throughout the UI.

## 7. Layout Tendencies

- **Container**: Centered max-width (1200px), content centered on royal blue background
- **Hero**: Large shield crest logo centered, sparkle background behind
- **Sections**: Generous vertical spacing (64-96px) between emblem, nav, and card sections
- **Card grid**: 2-3 columns for venue cards on desktop, stacking to 1 column on mobile
- **Background**: Full-viewport deep blue with sparkle particle animation layer
- **Visual weight**: Centered and symmetrical, befitting the ceremonial theme

## 8. Adaptation Notes

### Keep
- Deep blue + gold metallic color system -- timeless luxury/celebration palette
- Sparkle particle background for atmosphere
- Emblem/badge component for brand identity moments
- Ornate nav decorators for thematic consistency
- Generous spacing that lets the design breathe

### Adapt
- Metallic gradients need careful implementation -- SVG gradients or CSS gradients, not image-based
- Sparkle particles should use requestAnimationFrame with performance budgets
- Emerald green needs contrast testing against dark blue for accessibility
- Serif display font should have a web-safe fallback chain

### Discard
- Heraldic shield crest is too event-specific for general component reuse
- Star character decorators in nav may feel out of place in non-celebration contexts
- Heavy metallic gradient usage may not translate to light-mode variants
