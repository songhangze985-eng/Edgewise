# ShinyColors 7th LIVE -- Evidence Manifest

## 1. Source Summary

| Field | Value |
|:------|:------|
| **URL** | `https://idolmaster-official.jp/live_event/shinycolors_7th_rasen/` |
| **Capture Date** | 2026-03-16 |
| **Site Type** | Event teaser page, cinematic mood |
| **Extraction Method** | Visual analysis, CSS inspection |

## 2. Screenshots

| ID | Filename | Description | Status |
|:---|:---------|:------------|:-------|
| SC-01 | `evidence/screenshots/shinycolors-hero-full-desktop.png` | Full hero with aurora glow and flanking characters | Pending capture |
| SC-02 | `evidence/screenshots/shinycolors-aurora-detail.png` | Close-up of aurora/halo light refraction at center | Pending capture |
| SC-03 | `evidence/screenshots/shinycolors-calligraphy-title.png` | "Rasen" calligraphy title and date text | Pending capture |
| SC-04 | `evidence/screenshots/shinycolors-character-desaturation.png` | Character illustration showing desaturated tones | Pending capture |
| SC-05 | `evidence/screenshots/shinycolors-mobile-crop.png` | Mobile viewport showing crop/reflow behavior | Pending capture |

## 3. Scripts Used

None -- visual extraction only. Aurora color values are approximations from visual inspection of the rendered light effect gradients.

## 4. Coverage Assessment

| Area | Covered | Confidence |
|:-----|:--------|:-----------|
| Overall cinematic composition | Yes | High |
| Aurora/halo light effect | Yes | Medium -- gradient implementation unclear |
| Color atmosphere (grey-blue) | Yes | High |
| Calligraphy title | Yes | Medium -- exact font not identified |
| Date/info text styling | Yes | High |
| Desaturation strategy | Yes | High |
| Below-fold content | No | Low |
| Navigation elements | No | Low -- possibly hidden or absent |
| Mobile behavior | No | Low |
| Animation/motion details | No | Low |

## 5. Gaps and Confidence

### High Confidence
- Cool grey-blue atmospheric palette as dominant color story
- Full-bleed cinematic illustration approach
- Aurora/halo center glow as primary visual effect
- Desaturated character tones contrasting with vivid aurora
- Clean sans-serif date text below calligraphy title
- Minimal UI chrome / teaser page approach

### Medium Confidence
- Specific aurora spectrum colors (green, purple, cyan approximated)
- Calligraphy font family identification
- Whether the aurora is CSS gradients, canvas, or image-based
- Title positioning ratio within viewport

### Low Confidence / Gaps
- Whether any navigation exists (hamburger menu, hidden nav)
- Below-fold content (if any exists beyond the hero)
- Animation timing for aurora effect or page load
- Mobile responsive behavior and illustration cropping strategy
- Accessibility considerations in current implementation
- Interactive elements beyond scroll

### Recommended Follow-up
1. Full-page capture at 1440px and 375px widths
2. Inspect DevTools for aurora implementation (CSS vs. canvas vs. image)
3. Identify calligraphy font via computed styles or network tab
4. Scroll to check for below-fold content
5. Test with screen reader to identify hidden nav or landmarks
