---
name: EmDash HQ — Print Edition
description: Every page is a magazine cover about one working CMS. Cream stock, indigo serif display, a rose highlighter swash, pill chips, and paper cards that rest on the desk.
colors:
  paper: "light-dark(#f3eddf, #16133a)"
  ink: "light-dark(#242049, #f1edde)"
  ink-muted: "light-dark(#5f5979, #aba5cb)"
  rule: "light-dark(#ddd3bc, #3b3670)"
  surface: "light-dark(#fdfaf2, #221e52)"
  indigo: "light-dark(#3b37a4, #a6a2ee)"
  indigo-strong: "light-dark(#2b2880, #c9c5f8)"
  indigo-soft: "light-dark(#5b56be, #8c87dc)"
  rose-accent: "light-dark(#c05d72, #e79ca9)"
  rose-accent-soft: "light-dark(#de97a5, #c1768a)"
  highlighter: "light-dark(rgba(206,106,126,0.5), rgba(214,132,152,0.42))"
  warm-amber: "light-dark(#e8831c, #f0a24a)"
  on-brand: "light-dark(#faf5e9, #262150)"
  control: "light-dark(#2b2880, #f1edde)"
  control-hover: "light-dark(#3b37a4, #ffffff)"
  on-control: "light-dark(#faf5e9, #262150)"
  plate: "light-dark(#211c58, #14113c)"
  plate-ink: "#f1edde"
  plate-muted: "#b6b0e2"
  status-green: "light-dark(#1e7a46, #6fcb8f)"
  status-amber: "light-dark(#b46a0e, #f0a24a)"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "var(--font-size-5xl)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "var(--font-size-4xl)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Playfair Display, Georgia, serif"
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
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  full: "9999px"
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
    backgroundColor: "{colors.control}"
    textColor: "{colors.on-control}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.25rem"
    boxShadow: "paper lift"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.indigo-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.25rem"
  badge:
    backgroundColor: "color-mix(in srgb, {colors.indigo} 8%, transparent)"
    textColor: "{colors.indigo-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "3px 12px"
---

# Design System: EmDash HQ, Print Edition

## Overview

The Print Edition dresses every page like a Bitdoze tutorial cover: a magazine cover about one working CMS. Light mode is cream stock with indigo ink and a rose highlighter; dark mode is the ink plate itself — the deep navy of the covers' logo tile, cream ink, the same rose marker. Paper cards rest on the desk with real soft shadows; the words that matter get a pink marker swash.

## Colors

Cream paper ground with faint fiber texture, deep-indigo text, dusty-rose accent for marks and small annotations. Filled controls are indigo on paper in light mode and paper on the plate in dark mode (`--color-control` / `--color-on-control` carry the pair). `--color-plate` is the one always-dark panel — used for the video spotlight, highlighted pricing tier, gradient CTAs, the hero terminal card and the footer. Green and amber remain functional statuses only.

## Typography

Playfair Display carries display and headlines (`--font-heading` → `--font-display`, bound in `astro.config.mjs`); high-contrast serif is the signature. Archivo remains the body voice. IBM Plex Mono remains for metadata, eyebrows, labels, pills and buttons at small sizes — the magazine's caption voice. The hero's highlighted phrase is italic serif inside the `.hl` marker swash.

## Layout

Use the shared container and card grid. Sections, short final rows, lists, and section links start at the container's left edge. Only a hero explicitly marked centered uses centered alignment. Section headers are a masthead: short rose mark, letterspaced mono eyebrow, serif headline.

## Elevation & Depth

Paper rests on the desk: cards carry warm indigo-tinted soft shadows (`--shadow-sm`…`--shadow-xl`), and hover lifts them a few pixels. Depth is allowed here — restrained, soft, never glow on elements. The faint warm washes behind the hero (`hero-glow-*`) are ambient cover light, not element glow. The `.hl` highlighter, washi tape and postal stamp are the only decorations that break flatness, and they only appear on hero/CTA features.

## Shapes

Rounded paper geometry: 6px small, 10px standard, 16px cards, full pills for badges, chips, spec items and the video play button.

## Components

Primary buttons are solid ink-pill stamps (mono uppercase label) that lift on hover. Secondary buttons are outlined paper cards. Badges and filter chips are pills. Cards are paper: surface, 1px border, soft shadow, small lift on hover. Featured surfaces (video spotlight, highlighted price, dark CTAs, footer) are the ink plate — always dark, cream ink, rose annotations.

The hero is a paper collage: a rotated figure card held by washi tape, a postal stamp on the corner, the semantic architecture diagram inside window chrome, and a dark "wrangler deploy" terminal card overlapping its foot. Reduced-motion visitors get the finished still.

Mobile navigation is visible without JavaScript. Enhancement adds a toggle, Escape-to-close, and focus return. Video activation transfers focus to the attached player.

## Do's and Don'ts

- Do keep cream in light mode and the ink plate in dark mode; rose is the accent in both.
- Do use the `.hl` swash for the one phrase that matters per headline — at most one per headline.
- Do use visible focus outlines and keep plate text in `--color-plate-ink`/`--color-plate-muted`.
- Do render real content; diagrams describe architecture without fabricated live numbers.
- Don't put the rose accent on large areas — it is a marker, not a fill.
- Don't stack multiple tilted cards in one section; the collage belongs to hero/CTA features.
- Don't animate navigation-critical text or hide the only navigation when JavaScript is unavailable.
