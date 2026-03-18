# KAF 5th ONE-MAN LIVE -- Evidence Manifest

## 1. Source Summary

| Field | Value |
|:------|:------|
| **URL** | `https://yokohamawars2026.kamitsubaki.jp/kaf` |
| **Capture Date** | 2026-03-16 |
| **Site Type** | VTuber event landing page with navigation bar |
| **Extraction Method** | Visual analysis, CSS inspection |

## 2. Screenshots

| ID | Filename | Description | Status |
|:---|:---------|:------------|:-------|
| SC-01 | `evidence/screenshots/kaf-hero-full-desktop.png` | Full hero with salmon-pink bg and character art | Pending capture |
| SC-02 | `evidence/screenshots/kaf-nav-pill-buttons.png` | Close-up of black nav bar with pill buttons | Pending capture |
| SC-03 | `evidence/screenshots/kaf-scroll-marquee.png` | Mint green "SCROLL DOWN" marquee detail | Pending capture |
| SC-04 | `evidence/screenshots/kaf-calligraphy-title.png` | White calligraphy Japanese title overlay | Pending capture |
| SC-05 | `evidence/screenshots/kaf-mobile-hero.png` | Mobile viewport layout | Pending capture |
| SC-06 | `evidence/screenshots/kaf-below-fold.png` | Content sections below the hero | Pending capture |

## 3. Scripts Used

None -- visual extraction only. Style tokens derived from manual inspection of rendered page, computed CSS values, and font declarations.

## 4. Coverage Assessment

| Area | Covered | Confidence |
|:-----|:--------|:-----------|
| Hero section layout + color | Yes | High |
| Navigation pattern (pill buttons) | Yes | High |
| Color palette | Yes | High -- specific hex values identified |
| Typography (3-font system) | Yes | High -- font-family declarations confirmed |
| Scroll marquee component | Yes | High |
| Red accent usage | Partial | Medium -- limited instances observed |
| Below-fold content | No | Low |
| Mobile responsiveness | No | Low |
| Interactive states (hover, focus) | No | Low |

## 5. Gaps and Confidence

### High Confidence
- Hero background color: `#fd839b` salmon-pink
- Mint green accent: `#55ffba` on scroll marquee
- Red accent: `#e50004`
- Font families: `Noto Sans JP`, `Red Hat Display`, `Reddit Sans`
- Black nav bar with white pill buttons
- Full-bleed character illustration approach

### Medium Confidence
- Exact pill button padding and border-radius values
- Marquee animation speed and CSS technique (transform vs. marquee tag)
- Whether nav is sticky or static
- Specific font weights used for each context

### Low Confidence / Gaps
- Below-fold page structure (event details, ticket info, schedule)
- Mobile layout breakpoints and responsive behavior
- Hover/focus/active states on interactive elements
- Footer design and content
- Any secondary pages or subnavigation patterns
- Performance of marquee animation on lower-end devices

### Recommended Follow-up
1. Capture full-page screenshot at 1440px and 375px widths
2. Inspect nav pill button hover states via DevTools forced-state
3. Scroll and capture below-fold sections for component inventory
4. Test marquee behavior with `prefers-reduced-motion: reduce`
5. Verify contrast ratios for mint green text on various backgrounds
