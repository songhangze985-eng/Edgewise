# Straylight S/N-GUL4R1TY -- Evidence Manifest

## 1. Source Summary

| Field | Value |
|:------|:------|
| **URL** | `https://idolmaster-official.jp/live_event/283_XXX/` |
| **Capture Date** | 2026-03-16 |
| **Site Type** | Unit performance page, cyberpunk/futuristic |
| **Extraction Method** | Visual analysis, CSS inspection |

## 2. Screenshots

| ID | Filename | Description | Status |
|:---|:---------|:------------|:-------|
| SC-01 | `evidence/screenshots/straylight-hero-full-desktop.png` | Full hero with black void, characters, ice-blue water | Pending capture |
| SC-02 | `evidence/screenshots/straylight-glitch-pixels-detail.png` | Close-up of pixel/glitch decorative elements in top-right | Pending capture |
| SC-03 | `evidence/screenshots/straylight-cyber-title.png` | "S/N-GUL4R1TY" title in custom cyber font | Pending capture |
| SC-04 | `evidence/screenshots/straylight-hamburger-menu.png` | Hamburger menu icon and position | Pending capture |
| SC-05 | `evidence/screenshots/straylight-ice-blue-water.png` | Ice-blue water surface reflection detail | Pending capture |
| SC-06 | `evidence/screenshots/straylight-mobile-layout.png` | Mobile viewport layout | Pending capture |

## 3. Scripts Used

None -- visual extraction only. Color values approximated from visual inspection of the rendered illustration and UI elements.

## 4. Coverage Assessment

| Area | Covered | Confidence |
|:-----|:--------|:-----------|
| Pure black background approach | Yes | High |
| Glitch/pixel decoration motif | Yes | High |
| Custom cyber typeface | Yes | Medium -- font family not identified |
| Ice-blue color accent | Yes | High |
| Character illustration composition | Yes | High |
| Hamburger menu pattern | Yes | High |
| Glitch animation behavior | Partial | Medium -- static vs animated unclear |
| Below-fold content | No | Low |
| Menu overlay design | No | Low |
| Mobile responsive behavior | No | Low |

## 5. Gaps and Confidence

### High Confidence
- Pure black (`#000000`) as page background
- Ice-blue (`#b0e0ff` area) as primary accent from water surface
- Pixel/glitch decorative elements in top-right corner
- Custom cyber typeface for "S/N-GUL4R1TY" title with leetspeak
- Full-bleed character illustration with zero-gravity pose
- Hamburger menu as sole visible navigation
- Cyber/tech/sci-fi overall aesthetic

### Medium Confidence
- Whether glitch elements are animated or static
- Exact custom font identification
- Whether ice-blue extends beyond the illustration into UI elements
- Glitch element implementation (CSS vs canvas vs image)
- Title letter-spacing and sizing measurements

### Low Confidence / Gaps
- Hamburger menu overlay content and design
- Below-fold content (event details, ticket info)
- Mobile viewport behavior and illustration cropping
- Any scroll-triggered animations
- Accessibility features (focus states, ARIA labels on hamburger)
- Performance impact of glitch animations (if animated)
- Whether there are additional pages with the same design system

### Recommended Follow-up
1. Full-page capture at 1440px and 375px widths
2. Click hamburger menu and capture overlay design
3. Inspect custom font via network tab or computed styles
4. Determine glitch element implementation method via DevTools
5. Scroll to capture below-fold content sections
6. Record any glitch animations as video reference
