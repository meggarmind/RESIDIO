---
name: Residio
description: Admin dashboard for estate associations, a warm and proactive concierge for the people who keep the books.
colors:
  primary: "oklch(0.205 0.012 265.729)"
  on-primary: "oklch(0.985 0.001 106.423)"
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0.012 265.729)"
  surface-muted: "oklch(0.967 0.001 286.375)"
  text-muted: "oklch(0.552 0.016 285.938)"
  border: "oklch(0.85 0.005 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  page-canvas: "#F8F9FA"
  card-surface: "#FFFFFF"
  mint: "#86EFAC"
  lavender: "#C4B5FD"
  teal: "#5EEAD4"
  status-success: "#22C55E"
  status-warning: "#FDBA74"
  status-error: "#FDA4AF"
  status-info: "#60A5FA"
  chart-green: "oklch(0.6314 0.1373 150.7159)"
  chart-teal: "oklch(0.7255 0.1686 192.1771)"
  chart-amber: "oklch(0.7098 0.1255 78.9271)"
  chart-orange: "oklch(0.7843 0.1608 52.5208)"
  chart-rose: "oklch(0.6902 0.1294 17.3825)"
  dark-background: "oklch(0.1373 0.0196 166.1429)"
  dark-card: "oklch(0.1765 0.0314 166.1429)"
  dark-primary: "oklch(0.5882 0.1373 166.1429)"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
  badge:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
  status-badge:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-muted}"
    typography: "{typography.badge}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  icon-box:
    backgroundColor: "{colors.chart-green}"
    rounded: "{rounded.lg}"
    size: "48px"
---

# Design System: Residio

## Overview

**Creative North Star: "The Estate Concierge"**

Residio should feel like a capable estate manager who has already looked at the books before you opened them. It greets the officer, surfaces what needs doing next (an unpaid levy, a payment to match, a message waiting to send) and gets out of the way. The system is warm and proactive rather than austere: soft surfaces, pastel icon anchors, a friendly greeting, and quiet motion that confirms an action took.

It is built for volunteer committee members who open the dashboard occasionally, often on a phone, and have to trust the numbers on it. So the warmth sits in the surfaces, greetings and icon anchors; the numbers themselves stay plain and exact. Whitespace does the structural work in place of heavy borders, and color is spent on status and on a small number of accents. "Anticipatory minimalism" (DESIGN_AGENTS.md) is the working philosophy: suggest the action, do not decorate the data.

Colors are theme-driven. The values below are the shipped fallbacks and the Default theme; a visual theme provider can replace the palette and fonts at runtime from the theme registry, so structure and roles are normative and exact hues are not.

**Key Characteristics:**
- Warm, proactive, calm. Concierge tone in greetings and suggested actions, restraint in data.
- Token-first: components read theme variables (`--primary`, `--card`, `--border`), never fixed hex.
- Soft layered depth with small lift on interaction; glass only on floating overlays.
- Responsive by two layout modes (compact for phones, expanded for desktop) controlled by CSS variables.
- Tabular, bold numerals for money; muted labels with slight tracking.

## Colors

A neutral, ink-and-paper base with a mint, lavender and teal accent family from the Default theme, and a five-color chart set that also tints icon boxes. OKLCH is the source format for the base tokens; the Default theme's accents and status colors are authored in hex and are kept as authored.

### Primary
- **Ink Slate** (oklch(0.205 0.012 265.729)): the primary action fill, selection color and focus ring in light mode. Near-black with a cool lean. Text on it is **Paper White** (oklch(0.985 0.001 106.423)).
- **Deep Fern** (oklch(0.5882 0.1373 166.1429)): the dark-mode primary, a saturated green on a green-black background.

### Secondary
- **Mint** (#86EFAC): the Default theme's lead accent; success-adjacent highlights and positive emphasis.
- **Lavender** (#C4B5FD): secondary accent for supporting chips and categorical emphasis.
- **Soft Teal** (#5EEAD4): tertiary accent.

### Neutral
- **Page Canvas** (#F8F9FA): the Default theme's page background behind cards.
- **Card White** (#FFFFFF / oklch(1 0 0)): card, popover and sheet surfaces.
- **Ink** (oklch(0.145 0.012 265.729)): body text and headings.
- **Quiet Slate** (oklch(0.552 0.016 285.938)): labels, helper text, placeholders.
- **Whisper Gray** (oklch(0.967 0.001 286.375)): muted and secondary surfaces, hover rows.
- **Hairline** (oklch(0.85 0.005 0)): borders and input strokes.
- **Night Green** (oklch(0.1373 0.0196 166.1429)) and **Night Card** (oklch(0.1765 0.0314 166.1429)): dark-mode canvas and card.

### Status and data
- **Success** (#22C55E), **Warning** (#FDBA74), **Error** (#FDA4AF), **Info** (#60A5FA) in the theme; destructive actions use **Alarm Red** (oklch(0.577 0.245 27.325)). Status badges tint with Tailwind emerald, amber, red and blue at the 100 and 700 steps (light) and 900/30 and 400 steps (dark).
- Chart and icon-box set: **Fern** (oklch(0.6314 0.1373 150.7159)), **Lagoon** (oklch(0.7255 0.1686 192.1771)), **Honey** (oklch(0.7098 0.1255 78.9271)), **Apricot** (oklch(0.7843 0.1608 52.5208)), **Rose** (oklch(0.6902 0.1294 17.3825)).

### Named Rules
**The Token Rule.** Colors come from theme variables or the Tailwind semantic names (`bg-primary`, `text-muted-foreground`, `border-border`). A hex literal in a component is a bug unless it is a documented status tint.

**The Status Is Never Color Alone Rule.** A paid, overdue or pending state must carry an icon or text label as well as its tint; money screens are read by people with varied eyesight and in bright light on phones.

## Typography

**Display Font:** Geist (with ui-sans-serif, system-ui)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono (for identifiers and references)

**Character:** One clean geometric sans used at confident weights. Hierarchy comes from size, weight and the muted-versus-ink color pair, not from a second display face. Themes can swap the family through `--font-family-sans`; the roles stay the same.

### Hierarchy
- **Display** (700, 2.25rem expanded / 1.5rem compact, 1.2, tracking -0.025em): page titles in the expanded layout.
- **Headline** (700, 1.5rem, 1.2, tracking -0.025em): page title on phones and stat values (`text-2xl sm:text-3xl font-bold tracking-tight`).
- **Title** (600, 1.125rem, 1.4): card and section headings.
- **Body** (400, 0.875rem, 1.5): table cells, form text and descriptions. Inputs use 1rem below the `md` breakpoint and 0.875rem from `md` up, so phones do not zoom on focus.
- **Label** (500, 0.875rem): buttons, field labels, and stat captions (with slight tracking).
- **Badge** (500, 0.75rem): status badges and trend chips.

### Named Rules
**The Tabular Money Rule.** Currency amounts and counts use tabular numerals and never wrap (`tabular-nums whitespace-nowrap`); long values shrink to fit the card rather than overflowing.

## Layout

A shell of a persistent sidebar (hidden below the `md` breakpoint) plus a mobile navigation, a header, and a scrolling main area with 16px padding on phones and 24px from `md`. Content sits in a centered container.

Two layout modes set the rhythm through CSS variables on the document: **Compact** (default, phone-first) uses a 1152px container, 12px grid gap, 16px card padding, 24px section gap and a 1rem layout icon; **Expanded** (desktop) uses a 1600px container, 24px grid gap, 24px card padding, 32px section gap and a 1.25rem layout icon. Pages are composed from semantic wrappers (`layout-container`, `layout-grid-gap`, `layout-card-padding`, `layout-section-gap`) rather than raw spacing.

Spacing follows the Tailwind 4px scale. Group related controls tightly (8px), separate sections generously (24 to 32px).

## Elevation & Depth

Soft and layered. Cards sit on a gentle two-part shadow with a visible hairline border; floating layers (modals, popovers, sheets) lift further; glass is reserved for overlays that sit over content. Interactive cards and primary buttons rise a few pixels on hover and settle on press.

### Shadow Vocabulary
- **Soft** (`box-shadow: 0 2px 8px -2px rgba(0,0,0,0.05), 0 4px 12px -4px rgba(0,0,0,0.08)`): default card resting depth (`shadow-soft`). Dark mode deepens it to 0.3 and 0.4 alpha.
- **Elevated** (`box-shadow: 0 4px 12px -2px rgba(0,0,0,0.08), 0 8px 24px -4px rgba(0,0,0,0.12)`): modals, popovers, floating panels (`shadow-elevated`).
- **Glass** (`background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2)`): sidebars and floating headers (`glass`).
- **Hover lift** (`transform: translateY(-4px)` with a 24px soft shadow, 0.3s ease): interactive cards (`card-hover-modern`); buttons lift 2px (`btn-hover-lift`).
- **Pressed-in field** (inset 1px 2px shadow, lifts 1px on focus): tactile inputs (`input-tactile`).

### Named Rules
**The Settle Rule.** Anything that lifts on hover must settle on press (`active:scale-[0.98]` on buttons). Motion confirms; it never decorates a money figure.

**The Reduced Motion Rule.** Today a single global `prefers-reduced-motion` rule collapses every animation and transition to 0.01ms, so lifts snap and nothing animates. That is a blunt fallback. New motion must never be the only carrier of a state change (pair it with a color, icon or text change), so the interface still reads when motion is removed.

## Shapes

Gently rounded, never sharp, never pill-shaped except for status. The base radius is 10px (`--radius`), derived into 6px, 8px, 10px and 14px. Controls (buttons, inputs) use the 8px step; cards and panels use 14px; icon boxes use 10px; status badges and trend chips are fully rounded. Borders are one pixel hairlines in the border token; thick borders only appear in high-contrast mode.

## Components

### Buttons
- **Shape:** 8px radius, 36px tall by default (32px small, 40px large, 48px extra large); icon buttons are 36px square.
- **Primary:** Ink Slate fill, Paper White text, soft shadow, 90% opacity on hover; 16px horizontal padding.
- **Outline / Ghost / Secondary / Destructive:** outline is a hairline on the background; ghost shows only an accent wash on hover; destructive uses Alarm Red with white text.
- **Hover / Focus:** 200ms transition; a 3px ring at 50% of the ring color on `focus-visible`; scale to 0.98 on press; a spinner replaces the label when loading.
- **Legacy "modern" variants:** see the Don'ts.

### Cards / Containers
- **Corner Style:** 14px, one-pixel border.
- **Background:** the card token on the page canvas.
- **Shadow Strategy:** Soft by default; Elevated for floating cards; Glass for overlay cards.
- **Internal Padding:** variants by density: default 24px vertical, stat 16px, compact 12px, list none.
- **Interactive:** pointer cursor with the hover lift.

### Inputs / Fields
- **Style:** 8px radius, hairline stroke, transparent fill (a 30% tint in dark mode), subtle shadow, 36px tall.
- **Focus:** border shifts to the ring color and a 3px ring at 50% opacity.
- **Error / Disabled:** invalid state shows a destructive border and 20% destructive ring; disabled drops to 50% opacity with a not-allowed cursor.

### Status badges
- Fully rounded chips with a tinted fill and a darker same-hue text, 0.75rem medium text, optional leading icon (check, alert, clock, cross, info, trend arrows). Variants: success, warning, error, info, pending, active, inactive, up and down. A pulse option signals live or urgent state.

### Icon boxes
- **Signature component.** A 48px rounded square (40 and 56 for small and large) holding a 24px Lucide icon over a soft tint from the five-color chart set. They anchor stat cards, quick actions and empty states and are the main place pastel color appears.

### Stat cards
- A muted, tracked caption, a large bold tabular value, and a small trend chip, with an icon box on the side. Values shrink to fit the card rather than overflow.

### Navigation
- **Sidebar:** persistent from the `md` breakpoint and collapsible to an icon rail. Items are 8px-rounded 14px medium text with a 16px Lucide icon; the active item (or the parent of the active child) gets a 10% primary wash, primary text, a soft shadow and a 4px-wide primary bar on its left edge. Hover uses the theme's hover background. Below `md` a separate mobile navigation replaces it.
- **Header:** global search command, breadcrumb, and an avatar dropdown. Page headers are wrapped in semantic components rather than assembled from raw primitives.

## Do's and Don'ts

### Do:
- **Do** read color from theme variables and semantic Tailwind names so a theme change repaints the whole app.
- **Do** wrap shadcn primitives in semantic layout components and use `IconBox` for Lucide icons.
- **Do** use the New-York shadcn style, Lucide icons only, and OKLCH for any new color token.
- **Do** keep money and counts tabular, bold and non-wrapping, with a muted caption above.
- **Do** design every screen for the phone first: the compact layout mode is the default and must be complete on its own. Prefer the large (40px) or extra large (48px) button for primary mobile actions, since 36px is below the comfortable touch size.
- **Do** pair every status tint with an icon or label.
- **Do** gate every action button on its write permission, and render a clear "no access" or empty state rather than a blank area.

### Don't:
- **Don't** hard-code the Modern theme's palette in components. `modern` is a registered, user-selectable visual theme (`src/lib/themes/modern.ts`: blue-teal accents, dark navy sidebar, rounder components), but components express it through `isModern` branches, the `modern*` button variants and the `modern` input variant, using sky blue (#0EA5E9) and gray hex literals that bypass theme tokens. The theme is legitimate; the hard-coding is the drift. New work reads theme tokens so Modern and every other theme repaint without a per-component branch, and existing `isModern` branches are to be migrated, not copied.
- **Don't** use raw hex colors, inline `style` colors, or fixed Tailwind palette steps (such as `bg-blue-500`) for brand or surface color. Status badge tints are the only documented exception.
- **Don't** introduce a second display typeface or hard-code a font; fonts come from the theme.
- **Don't** put hover lift or entrance animation on data that people are reconciling (tables of amounts); keep motion to cards, buttons and overlays.
- **Don't** put hover-only affordances on anything a phone user needs.
- **Don't** invest visual work in the resident portal or self-service surfaces; they are out of scope (PRODUCT.md).
