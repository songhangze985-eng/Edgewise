# SideM 10th Anniversary -- Evidence Manifest

## 1. Source Summary

| Field | Value |
|:------|:------|
| **URL** | `https://idolmaster-official.jp/live_event/sidem10th/` |
| **Capture Date** | 2026-03-16 |
| **Site Type** | Idol anniversary tour page, static-heavy |
| **Extraction Method** | Visual analysis, CSS inspection |

## 2. Screenshots

| ID | Filename | Description | Status |
|:---|:---------|:------------|:-------|
| SC-01 | `evidence/screenshots/sidem-hero-crest-desktop.png` | Full hero with shield crest and sparkle bg | Pending capture |
| SC-02 | `evidence/screenshots/sidem-emblem-badges-detail.png` | Close-up of gold/emerald emblem badges | Pending capture |
| SC-03 | `evidence/screenshots/sidem-venue-cards.png` | City venue card grid layout | Pending capture |
| SC-04 | `evidence/screenshots/sidem-nav-ornate.png` | Navigation bar with ornate decorators | Pending capture |
| SC-05 | `evidence/screenshots/sidem-sparkle-bg.png` | Starfield sparkle background detail | Pending capture |
| SC-06 | `evidence/screenshots/sidem-mobile-layout.png` | Mobile viewport layout | Pending capture |

## 3. Scripts Used

None -- visual extraction only. Metallic gradient values are approximations from visual inspection of rendered gradients.

## 4. Coverage Assessment

| Area | Covered | Confidence |
|:-----|:--------|:-----------|
| Color palette (blue, gold, emerald) | Yes | High |
| Shield/crest hero element | Yes | High |
| Sparkle background effect | Yes | Medium -- animation details not captured |
| Navigation with decorators | Yes | High |
| Venue card layout | Yes | Medium |
| Metallic gradient specifics | Partial | Medium -- gradient stops approximated |
| Typography specifics | Partial | Medium -- exact serif font not identified |
| Below-fold content | Partial | Medium |
| Mobile responsiveness | No | Low |
| Interactive states | No | Low |

## 5. Gaps and Confidence

### High Confidence
- Royal blue background as dominant surface
- Gold metallic as primary accent color
- Emerald green as secondary accent
- White sparkle particles on background
- Ornate navigation pattern with decorative symbols
- Centered shield/crest as primary identity element
- Celebratory/heraldic visual language

### Medium Confidence
- Exact hex values for gold gradient stops
- Specific serif display font family
- Sparkle animation implementation (Canvas vs. CSS vs. JS particles)
- Venue card border treatment details
- Whether emerald is a flat color or also uses metallic gradients

### Low Confidence / Gaps
- Exact typography scale and weight assignments
- Mobile breakpoint behavior
- Footer content and design
- Interactive states on cards and nav items
- Performance characteristics of sparkle animation
- Whether additional pages follow the same design system

### Recommended Follow-up
1. Capture emblem badge at high resolution for gradient analysis
2. Identify the serif display font via font inspector or WhatFont
3. Record sparkle animation for implementation reference
4. Test venue card interactions (hover, click) via DevTools
5. Capture mobile layout at 375px width
