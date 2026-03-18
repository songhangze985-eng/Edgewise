Reference packages reviewed: 9nine-visual-novel + motherduck. Primary quality bar: 9nine for motion-heavy.

# Straylight S/N-GUL4R1TY -- Style Guide

## 1. Overview

- **Project**: THE IDOLM@STER ShinyColors Straylight S/N-GUL4R1TY
- **Source URL**: `idolmaster-official.jp/live_event/283_XXX/`
- **Visual Summary**: Deep black background with pixel/glitch decorative elements in the top-right corner. Futuristic custom font for the title "S/N-GUL4R1TY" (leetspeak for Singularity). Full-bleed anime illustration of 3 characters in a zero-gravity pose over ice-blue water. Cyber/tech/sci-fi aesthetic throughout. Hamburger menu for navigation. Characters in white/tech outfits with colorful hair (blue, pink, blonde).
- **Dominant Read**: Dark, sleek, and futuristic -- the pure black background creates maximum contrast for the ice-blue water and character illustration. The glitch motifs and leetspeak title signal a digital/cyberpunk identity.

## 2. Design Philosophy

### 2.1 Black as Void
Pure black (`#000000`) is used not as a dark background but as a void -- empty digital space from which the illustration and glitch elements emerge. This creates an infinite-depth feeling appropriate for the "Singularity" theme. Evidence: no gradients or texture on the black background, hard edges between content and void.

### 2.2 Glitch as Identity
Pixel/glitch decorative elements are not errors but deliberate identity markers. The corrupted-data aesthetic extends to the leetspeak title (replacing letters with numbers: 4=A, 1=I) and the fragmented visual motifs. Evidence: pixel artifacts in top-right corner, "S/N-GUL4R1TY" typography.

### 2.3 Contrast Through Color Temperature
The ice-blue water surface beneath the characters creates a cold, digital temperature that contrasts with the warm character hair colors (pink, blonde). This temperature contrast adds depth and visual interest within the minimal color palette. Evidence: ice-blue reflective surface, warm-colored character elements.

## 3. Semantic Tokens

### Color Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--color-bg-primary` | `#000000` | Pure black void background |
| `--color-ice-blue` | `#b0e0ff` | Ice-blue water / digital accent |
| `--color-ice-blue-deep` | `#4a8ab5` | Deeper ice-blue for shadows |
| `--color-glitch-white` | `#ffffff` | Pixel/glitch element color |
| `--color-glitch-cyan` | `#00ffff` | Glitch accent (if present) |
| `--color-char-pink` | `#ff69b4` | Character hair - pink |
| `--color-char-blue` | `#5b9bd5` | Character hair - blue |
| `--color-char-blonde` | `#ffd700` | Character hair - blonde |
| `--color-text-primary` | `#ffffff` | Primary text on black |
| `--color-text-muted` | `#888888` | Secondary text |

### Typography Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--font-cyber` | Custom cyber typeface (site-specific) | Title "S/N-GUL4R1TY" font |
| `--font-body` | Sans-serif (system or Noto Sans JP) | Body/info text |
| `--font-weight-regular` | `400` | Body weight |
| `--font-weight-bold` | `700` | Emphasis weight |

### Spacing Tokens

| Token | Value | Description |
|:------|:------|:------------|
| `--space-hero-height` | `100vh` | Full viewport hero |
| `--space-glitch-offset` | Top-right corner, 20-40px from edges | Glitch element position |
| `--space-hamburger-pad` | `16px` | Hamburger menu touch target padding |
| `--space-title-margin` | `24px - 40px` | Margin around title element |

## 4. Color Palette + Usage Mapping

| Token | Hex | Usage |
|:------|:----|:------|
| Pure Black | `#000000` | Page background, void space |
| Ice Blue | `#b0e0ff` | Water surface, digital accent, atmospheric glow |
| Deep Ice Blue | `#4a8ab5` | Water shadows, depth |
| White | `#ffffff` | Glitch pixels, primary text, character outfits |
| Cyan | `#00ffff` | Glitch accent highlight |
| Hot Pink | `#ff69b4` | Character accent (hair), minor warm contrast |
| Steel Blue | `#5b9bd5` | Character accent (hair) |
| Gold | `#ffd700` | Character accent (hair), warm contrast |
| Mid Grey | `#888888` | Muted text, secondary information |
| Dark Grey | `#1a1a1a` | Subtle surface differentiation (if any) |

## 5. Typography

| Property | Cyber Display | Body (Sans-serif) |
|:---------|:-------------|:-------------------|
| Family | Custom cyber typeface | System sans-serif or Noto Sans JP |
| Weights | Single weight (display) | 400, 700 |
| Usage | "S/N-GUL4R1TY" title only | Event info, dates, descriptions |
| Sizes | 36px - 64px | 14px - 16px |
| Line height | 1.0 - 1.1 | 1.5 - 1.7 |
| Letter spacing | Wide (0.1em - 0.2em) | Normal |
| Transform | Uppercase | Normal |
| Color | White on black | White / Mid grey |
| Special | Leetspeak character substitution | Standard characters |

## 6. Component System

### 6.1 Glitch Decoration Block
- **Structure**: Absolutely positioned cluster of pixel/block elements in the top-right corner, varying sizes and opacities
- **States**: Default (static or subtle animation), possible glitch animation (random position shifts)
- **Notes**: The glitch elements are small rectangular blocks (2-8px) arranged in a dispersing pattern. They may use CSS box-shadow, multiple background, or individual positioned elements. White and possibly cyan colored.

### 6.2 Cyber Title
- **Structure**: Custom-font title text with leetspeak substitution, centered or left-aligned on the black void
- **States**: Default (static), possible glitch animation (text distortion, color channel split)
- **Notes**: The "S/N-GUL4R1TY" title is the primary typographic identity element. The custom font likely has geometric/angular letterforms with technical aesthetics. May include a subtle text-shadow or glow effect.

### 6.3 Hamburger Menu
- **Structure**: Three-line hamburger icon, white on black, positioned top-right or top-left
- **States**: Default (closed), Open (transforms to X, reveals overlay nav), Hover (subtle glow)
- **Notes**: The use of a hamburger menu on desktop reinforces the minimal/void aesthetic by hiding the navigation. The menu overlay likely slides in over the black background.

## 7. Layout Tendencies

- **Full-bleed**: Character illustration spans full viewport width and height
- **Black void**: No containers, borders, or visible grid -- content floats in black space
- **Layering**: Black void base > ice-blue water/atmosphere > character illustration > glitch decorations > title text > hamburger menu (top-to-bottom z-index)
- **Minimal chrome**: Hamburger menu is the only visible UI element on the hero
- **Asymmetry**: Glitch elements clustered in top-right create deliberate visual imbalance
- **Responsive**: Illustration likely crops or scales on mobile, glitch elements may reposition

## 8. Adaptation Notes

### Keep
- Pure black void background -- creates maximum impact and contrast
- Ice-blue as the primary accent color on black -- striking and distinctive
- Glitch/pixel decoration motif -- achievable with CSS and lightweight
- Leetspeak title technique for cyber/tech identity
- Wide letter-spacing on display type for futuristic feel
- Hamburger menu on desktop for immersive experiences

### Adapt
- Glitch animation should respect `prefers-reduced-motion` (fallback to static)
- Custom cyber font needs a geometric sans-serif fallback (e.g., `JetBrains Mono`, `Space Grotesk`)
- Ice-blue glow effects can be CSS box-shadow or filter: blur for performance
- Consider adding keyboard-accessible navigation alongside hamburger menu
- The zero-gravity character pose concept can be abstracted to a "floating element" animation pattern

### Discard
- Leetspeak substitution is too niche for general-purpose text (keep for titles only)
- Character-hair-color tokens are illustration-specific, not design system colors
- Zero-gravity pose is a one-off illustration concept, not a layout pattern
- Full hamburger-menu-only navigation is insufficient for content-heavy sites
