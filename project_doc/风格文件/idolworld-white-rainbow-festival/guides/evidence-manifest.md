# IDOL WORLD SUPER FESTIVAL 2026 -- Evidence Manifest

## 1. Source Summary

| Field | Value |
|:------|:------|
| **URL** | `https://idolmaster-official.jp/live_event/mr_idolworld2026/` |
| **Capture Date** | 2026-03-16 |
| **Site Type** | Multi-day festival page, static |
| **Extraction Method** | Visual analysis, CSS inspection |

## 2. Screenshots

| ID | Filename | Description | Status |
|:---|:---------|:------------|:-------|
| SC-01 | `evidence/screenshots/idolworld-hero-crowd-desktop.png` | Full hero with character crowd and title | Pending capture |
| SC-02 | `evidence/screenshots/idolworld-rainbow-stripe-detail.png` | Close-up of rainbow gradient stripe bands | Pending capture |
| SC-03 | `evidence/screenshots/idolworld-day-cards.png` | Three-day event card grid | Pending capture |
| SC-04 | `evidence/screenshots/idolworld-pixel-frame.png` | Black pixel-frame border detail | Pending capture |
| SC-05 | `evidence/screenshots/idolworld-anniversary-badge.png` | 20th anniversary badge element | Pending capture |
| SC-06 | `evidence/screenshots/idolworld-display-type.png` | Bold condensed display typography for title | Pending capture |
| SC-07 | `evidence/screenshots/idolworld-mobile-layout.png` | Mobile viewport layout | Pending capture |

## 3. Scripts Used

None -- visual extraction only. Rainbow band hex values are approximations from visual inspection.

## 4. Coverage Assessment

| Area | Covered | Confidence |
|:-----|:--------|:-----------|
| White/platinum base palette | Yes | High |
| Rainbow stripe accent system | Yes | High |
| Bold condensed display type | Yes | High -- style identified, exact font unknown |
| Event day card pattern | Yes | Medium |
| Pixel-frame border | Yes | Medium -- implementation details unclear |
| Anniversary badge | Yes | Medium |
| Character crowd illustration | Yes | High (visual), N/A (reusability) |
| Below-fold content | Partial | Medium |
| Mobile responsiveness | No | Low |
| Interactive states | No | Low |

## 5. Gaps and Confidence

### High Confidence
- White/platinum base as dominant surface color
- Rainbow gradient stripe as primary accent motif
- Bold condensed sans-serif for display title
- Black pixel-frame as border/framing device
- Three-day event card layout structure
- Celebratory, grand, and clean visual identity
- 20th anniversary badge presence

### Medium Confidence
- Exact hex values for rainbow band colors (approximated)
- Specific condensed display font family
- Card internal layout and accent color assignment per day
- Pixel-frame implementation method (CSS border-image vs pseudo-element vs SVG)
- Anniversary badge treatment (flat vs metallic)

### Low Confidence / Gaps
- Below-fold content beyond the hero and cards
- Navigation structure (if any top nav exists)
- Mobile responsive card stacking behavior
- Hover/interaction states on day cards
- Footer design
- Whether rainbow stripes animate or are static

### Recommended Follow-up
1. Full-page capture at 1440px and 375px widths
2. Inspect condensed display font via network tab or computed styles
3. Measure exact rainbow stripe band heights
4. Capture hover states on event day cards
5. Examine pixel-frame implementation in DevTools Elements panel
