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
  sm: "2px"
  md: "2px"
  lg: "4px"
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
    padding: "0.625rem 1.125rem"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.125rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.signal-blue-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.125rem"
  badge:
    backgroundColor: "color-mix(in srgb, {colors.signal-blue} 8%, transparent)"
    textColor: "{colors.signal-blue-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "1px 0.5rem"
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

This system has **no shadows and no gradients** — all four shadow tokens (`--shadow-sm` … `--shadow-xl`) are `none`, and all gradient tokens resolve to a single solid color (`--gradient-headline` is `none`). Depth is conveyed by line weight (1 px hairline rules vs 1.5 px ink rules), layered rules (meta strip over headline over heavy rule in section title blocks), the background grid receding behind surface fills, and hover responses (registration marks, tint) that draw on the surface rather than lift it.

## Shapes

Near-square drafting geometry: `--radius-sm`/`--radius` are 2px, `--radius-lg` is 4px. Line work is the form language: `--line-hair` 1px for card borders and dividers, `--line-ink` 1.5px for heavy rules, stamp-button borders, registration marks, and the header rule. The only round affordance in the system is the play button in the video facade (a deliberate exception: a round screening affordance on an otherwise square sheet). Focus is a 2px dashed brand outline, offset 3px, radius 2px — dashed like a construction line.

## Components

### Buttons
Mono-uppercase stamp and outline controls; press travels 1px, no shadow theatre.
- **Shape:** 2px radius, 1.5px solid `--color-brand-strong` border.
- **Primary (stamp):** solid `--color-brand-strong` ground, `--color-on-brand` text; padding `0.625rem 1.125rem`; mono 500–600, `--font-size-xs`, 0.07em, uppercase. Large variant: `0.875rem 1.5rem`, `--font-size-sm`.
- **Secondary (outline):** transparent ground, brand-strong text, 55%-mixed border.
- **Hover / Active:** primary shifts ground to `--color-brand`; secondary gains a 7% brand tint and full border. `:active` translates Y by 1px.
- **Focus:** system dashed brand outline.

### Badges
- **Style:** bracket tags — CSS `[` `]` pseudo-elements frame mono uppercase text (`[FREE]`, `[TUTORIAL]`); 8–10% tint ground, 30–35% tint border, 2px radius, `1px 0.5rem` padding. Never pills.
- **State:** default (brand), `badge-muted`, `badge-free` (green), `badge-paid` (amber) — the only non-blue hues.

### Cards / Containers (sheets)
- **Corner Style:** `--radius-lg` 4px.
- **Background:** `--color-surface` on the grid ground.
- **Shadow Strategy:** none; see Elevation.
- **Border:** 1px hairline `--color-border`.
- **Internal Padding:** scale-driven; the stretched `.card-link` covers the whole card.
- **Hover:** border mixes toward brand (55%), ground tints 3% brand, and 10px registration marks (1.5px ink, top-left + bottom-right) fade in.

### Inputs / Filters
- **Filter chips:** transparent ground, 1px `--color-border`, 2px radius, mono; pressed state is solid brand-strong ground with on-brand text (`aria-pressed`).
- **Focus:** dashed brand outline system-wide.

### Navigation
Sticky header, mono uppercase items with zero-padded sheet numbers; `aria-current` item underlined; CTA is a compact primary stamp. Hover draws the underline. Mobile collapses to a toggled panel (list/x icon swap).

### Signature Component: Hero Schematic
An authored SVG of the EmDash stack (browser → Worker → D1/R2, admin branch) in thin ink strokes with mono node labels. It draws itself on load once over ~1.2s via staged `stroke-draw` delays (0–760ms); `prefers-reduced-motion` renders it complete. The schematic stays semantic: real `<title>`/`<desc>`, real labels, no faked numbers.

### Title Blocks (section headers)
Meta strip in mono uppercase (sheet number + revision) over the Archivo display headline, capped subheadline, closed by a 1.5px ink rule — a drawing title block, left-aligned, max 44rem.

## Do's and Don'ts

### Do:
- **Do** keep every surface flat: `--shadow-*: none`, gradients resolved to solid ink.
- **Do** annotate in IBM Plex Mono at ≤ `sm` sizes; set metadata (dates, durations, counts) as instrument readouts.
- **Do** respond to hover with sheet behavior: registration marks, paper-blue tint, drawn underlines — and keep press states decisive (1px travel).
- **Do** keep the background grid ≤5.5% opacity and semantic SVG in the schematic (`title`/`desc`, real labels).
- **Do** use dashed construction-line focus outlines (2px brand, 3px offset) on all interactive elements.

### Don't:
- **Don't** use blur, glow, drop shadows, or decorative gradients — the world's depth is line weight and rules.
- **Don't** introduce hues outside the blue family except functional green/amber badges.
- **Don't** render mono at display sizes or as body prose; don't round corners beyond 4px (sole exception: the video play affordance).
- **Don't** add scroll-driven motion or repeat the schematic draw; the one draw happens once on load and reduced-motion renders it complete.
- **Don't** fake numbers in schematics or invent content: placeholder-truthful copy stays truthful.
