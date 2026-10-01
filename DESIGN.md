---
name: EmDash HQ — Drawing Set
description: Every page is a numbered sheet of engineering drawings for one working CMS; blue ink on paper, dark mode is a true blueprint.
colors:
  paper: "light-dark(#f6f8fb, #0d2340)"
  ink: "light-dark(#0a1c38, #dbe7fb)"
  ink-muted: "light-dark(#4b5f7f, #9fb0cc)"
  rule: "light-dark(#c9d6ea, #2a4a7f)"
  surface: "light-dark(#ffffff, #10294d)"
  signal-blue: "light-dark(#1d4ed8, #60a5fa)"
  signal-blue-strong: "light-dark(#1e40af, #3b82f6)"
  signal-blue-soft: "light-dark(#3b82f6, #93c5fd)"
  cyan-accent: "light-dark(#0284c7, #22d3ee)"
  cyan-accent-soft: "light-dark(#38bdf8, #67e8f9)"
  on-brand: "#ffffff"
  status-green: "light-dark(#15803d, #4ade80)"
  status-amber: "light-dark(#b45309, #fbbf24)"
typography:
  display:
    fontFamily: "Archivo, sans-serif"
    fontSize: "var(--font-size-5xl)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Archivo, sans-serif"
    fontSize: "var(--font-size-4xl)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Archivo, sans-serif"
    fontSize: "var(--font-size-2xl)"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Archivo, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "var(--font-size-xs)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.07em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "3rem"
  3xl: "4rem"
  4xl: "6rem"
  5xl: "8rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue-strong}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.25rem"
  button-secondary:
    backgroundColor: "color-mix(in srgb, {colors.surface} 80%, transparent)"
    textColor: "{colors.signal-blue-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.25rem"
  badge:
    backgroundColor: "color-mix(in srgb, {colors.signal-blue} 10%, transparent)"
    textColor: "{colors.signal-blue-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: EmDash HQ — Drawing Set

## Overview

**Creative North Star: "The Drawing Set"**

The site is a set of engineering drawings, not a landing page. Each page is a numbered sheet documenting one working CMS: a paper ground with a faint drafting grid, blue ink line-work at 1–1.5 px, near-square corners, and no elevation anywhere. Light mode is a blue-ink sheet on paper; dark mode is a true blueprint (Prussian-blue ground, pale ink line-work). Blue is the brand family in both modes; depth comes from line weight and layered rules, never blur, glow, or shadow.

It refuses the category-default arrangement: no centered hero, no icon-tile card grids, no gradient banners. Gradients resolve to solid ink. Metadata reads like instrument output in tabular mono; controls are mono-uppercase stamp and outline buttons; badges are bracket tags. The one authored motion is the hero schematic drawing itself on load (~1.2 s, once); reduced-motion renders it complete.

**Key Characteristics:**
- Drafting-sheet material: 28 px graph with a stronger 140 px major grid at ≤5.5% opacity; registration marks appear at card corners on hover.
- Flat world: all shadow tokens are `none`; `--gradient-brand*` are solid-color gradients.
- Two voices only: Archivo for display/body, IBM Plex Mono for annotations, metadata, labels, and buttons (mono confined to ≤ `sm` sizes and metadata).
- Hover = response of the sheet: corner registration marks, paper-blue tint, drawn link underlines, 1 px button travel on press. No scroll-driven motion.

## Colors

One blue ink family on paper — navy ink for text, signal blue for action, cyan for highlights — with functional green/amber reserved for status badges.

### Primary
- **Signal Blue Strong** (`light-dark(#1e40af, #3b82f6)`, `--color-brand-strong`): solid stamp buttons, active nav underlines, registration marks, selection ground, focus-adjacent emphasis. The ink that acts.
- **Signal Blue** (`light-dark(#1d4ed8, #60a5fa)`, `--color-brand`): primary hover, authored-content links, badge tint at 8–35% mixes.
- **Signal Blue Soft** (`light-dark(#3b82f6, #93c5fd)`): softer brand emphasis.

### Secondary
- **Cyan Accent** (`light-dark(#0284c7, #22d3ee)`, `--color-accent`): highlight and secondary accent; use sparingly, it reads as the bright mark on the sheet.
- **Cyan Accent Soft** (`light-dark(#38bdf8, #67e8f9)`): accent tint.

### Functional (status only)
- **Status Green** (`light-dark(#15803d, #4ade80)`): `[FREE]`-class badges only.
- **Status Amber** (`light-dark(#b45309, #fbbf24)`): `[PAID]`-class badges only.

### Neutral
- **Paper** (`light-dark(#f6f8fb, #0d2340)`): page ground; in dark mode it is the Prussian blueprint sheet.
- **Ink** (`light-dark(#0a1c38, #dbe7fb)`): primary text and heavy rules (`border-top: 1.5px solid`).
- **Ink Muted** (`light-dark(#4b5f7f, #9fb0cc)`): meta lines, secondary text, empty notes.
- **Rule** (`light-dark(#c9d6ea, #2a4a7f)`): 1 px hairline card borders and dividers.
- **Surface** (`light-dark(#ffffff, #10294d)`): card/sheet fills.
- **On-Brand** (`#ffffff`): text on solid brand ink, both modes.

### Named Rules
**The Blue Family Rule.** Blue stays the brand in both modes: light mode is ink-on-paper, dark mode is pale ink on Prussian ground. No other hue joins except functional green/amber badges.

**The Flat World Rule.** Every shadow token is `none` and every gradient resolves to a solid. Depth is line weight (1 px hair vs 1.5 px ink) and layered rules.

## Typography

**Display Font:** Archivo (system-ui fallback) — `--font-body` via the Astro font pipeline; `--font-heading` is the same family.
**Body Font:** Archivo (same voice for headings and body).
**Label/Mono Font:** IBM Plex Mono — annotations, metadata, labels, nav, buttons, badges, empty notes.

**Character:** An engineering grotesque that documents; the mono voice annotates the drawing. Mono never speaks at display sizes — it is confined to ≤ `sm` sizes and metadata.

### Hierarchy
- **Display** (800, `--font-size-5xl` 3.5rem, 1.1, −0.015em): hero CMS headline. `text-wrap: balance`.
- **Headline** (800, `--font-size-4xl` 2.5rem, 1.2): section headlines (`--font-weight-display`).
- **Title** (700–800, `--font-size-2xl` 1.5rem, 1.2): card and spotlight titles.
- **Body** (400, 1rem, 1.6): copy; subheadlines capped at 62ch. FAQ/long-form uses 1.7.
- **Label** (500, mono, `--font-size-xs` 0.75rem, 0.05–0.08em, uppercase): sheet meta (`SET · SHEET 01 · REV …`), nav items with sheet numbers, buttons, badges, empty states.

### Named Rules
**The Annotation Rule.** IBM Plex Mono is annotation, never prose: ≤ `sm` sizes, metadata/labels/buttons only. Archivo carries headings and body.

## Layout

The page is a sheet. A sticky ink title strip (border-bottom 1.5px solid ink, translucent paper ground) carries the wordmark and the mono nav; nav items carry zero-padded sheet numbers (`01`, `02`), the current sheet underlined. The body ground is the drafting grid: 28 px fine graph with a stronger line every fifth (140 px), ink at 3–5.5% opacity in light mode, pale ink at ≤5% in dark.

Sections use `padding: clamp(4rem, 8vw, 6.5rem) 0` (≤768px: `--spacing-2xl` 3rem). Sheet columns are a flex grid, 3 across, gap `--spacing-lg` 1.5rem, breaking to 2 at 900px and 1 at 600px; a short last row starts at the left edge, never floats centered. The footer is the set's cover block on blueprint ground. Spacing rhythm: `--spacing-xs` 0.25rem → `--spacing-5xl` 8rem.

## Elevation & Depth

This system features **tactile, multi-layered dimensional depth**:
- `--shadow-sm`: micro-shadow for subtle controls and buttons.
- `--shadow`: medium elevation for cards (`hub-card`) with an inset top specular highlight (`--color-highlight`).
- `--shadow-lg`: hover lift for cards, schematic panels, and interactive elements.
- `--shadow-xl`: prominent elevation for featured spotlight, CTA banner, and modals.
- `--shadow-glow`: soft brand-colored halo for active signals and hero atmosphere.

## Shapes

Modern developer tech hub geometry:
- `--radius-sm`: 4px for badges, filter chips, and inner tags.
- `--radius`: 8px for buttons, input controls, and list items.
- `--radius-lg`: 12px for cards, spotlight panels, and schematic containers.
- `--radius-full`: 9999px for pill accents.
Focus remains a 2px dashed brand outline with a 3px offset for strong accessibility.

## Components

### Buttons
Mono-uppercase tactile controls with dimensional elevation.
- **Shape:** 8px radius (`--radius`).
- **Primary:** solid brand gradient (`--gradient-brand-strong`), `--color-on-brand` text, subtle specular top inset and drop shadow. Hover shifts to `--gradient-brand` with lift.
- **Secondary:** translucent surface with backdrop blur, brand-mixed hairline border, subtle shadow. Hover gains brand tint and lift.
- **Active:** 1px travel (`translateY(1px)`).

### Badges
- **Style:** punchy, modern technical indicator tags with a glowing dot prefix.
- **State:** default (brand), `badge-muted`, `badge-free` (emerald), `badge-paid` (amber).

### Cards / Containers
- **Corner Style:** `--radius-lg` 12px.
- **Background:** `--gradient-card`.
- **Elevation:** `--shadow` plus inset top specular highlight (`--color-highlight`).
- **Hover:** lifts `translateY(-3px)`, intensifies border color toward brand, gains elevated shadow and soft brand glow. Corner registration marks fade in smoothly.

### Inputs / Filters
- **Filter chips:** 4px radius, mono uppercase; pressed state is solid brand-strong gradient with on-brand text and glow shadow.

### Signature Component: Hero Schematic
An authored SVG of the EmDash stack (browser → Worker → D1/R2, admin branch) inside an elevated, glassmorphic panel with ambient hero glow. It features live pulsing telemetry indicators on Worker and D1 nodes, and staged line animations.

### Title Blocks (section headers)
Left-aligned technical title block with a sleek brand gradient bar accent, mono uppercase `// META` strip, and display headline.

### Accordion FAQ
Full-width interactive accordion rows spanning the entire container width. Each item features a monospace numeric badge (`01`, `02`), clean question typography, a smooth rotating chevron indicator, elevated card styling (`--gradient-card`), and comfortable reading line length (`75ch`).

## Do's and Don'ts

### Do:
- **Do** maintain multi-layered depth with subtle offsets and soft blurs.
- **Do** annotate in IBM Plex Mono at ≤ `sm` sizes; set metadata as instrument readouts.
- **Do** respond to hover with decisive tactile lift (translateY) and subtle brand glow.
- **Do** preserve WCAG AA contrast across both light and dark modes.

### Don't:
- **Don't** introduce random off-brand hues outside the blue/cyan family and status green/amber.
- **Don't** use flat 0-offset muddy shadows.
- **Don't** remove visible focus rings or reduce-motion support.
