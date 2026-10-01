---
name: EmDash HQ — Drawing Set
description: Every page is a numbered sheet of engineering drawings for one working CMS; blue ink on paper, dark mode is a true blueprint.
colors:
  paper: "light-dark(#f6f8fb, #0a192f)"
  ink: "light-dark(#0a1c38, #e2edfd)"
  ink-muted: "light-dark(#475c7e, #8ea6cc)"
  rule: "light-dark(#d3dfef, #1e3a66)"
  surface: "light-dark(#ffffff, #0f274a)"
  signal-blue: "light-dark(#1d4ed8, #60a5fa)"
  signal-blue-strong: "light-dark(#1e40af, #93c5fd)"
  signal-blue-soft: "light-dark(#3b82f6, #93c5fd)"
  cyan-accent: "light-dark(#0284c7, #22d3ee)"
  cyan-accent-soft: "light-dark(#38bdf8, #67e8f9)"
  on-brand: "#ffffff"
  control: "#1e40af"
  control-hover: "#1d4ed8"
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
    backgroundColor: "{colors.control}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.control-hover}"
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

# Design System: EmDash HQ, Drawing Set

## Overview

The Drawing Set presents each page as a numbered sheet for one working CMS. Light mode uses blue ink on drafting paper; dark mode uses pale ink on a Prussian ground. The blueprint grid, rules, registration marks, and architecture diagram carry the visual character.

## Colors

Keep the existing blue and cyan family. Background, text, muted ink, rules, and surfaces use the paired light and dark tokens above. Filled controls use solid #1e40af with white labels, changing to #1d4ed8 on hover. These control colors remain distinct from the brighter dark-mode link ink.

## Typography

Archivo carries display headings and prose. IBM Plex Mono is for annotations, labels, metadata, and buttons, at small sizes. Keep section copy readable and left aligned.

## Layout

Use the shared container and card grid. Sections, short final rows, lists, and section links start at the container's left edge. Only a hero explicitly marked centered uses centered alignment. Keep the 28px drawing grid and its 140px major rules faint.

## Elevation & Depth

All shadow tokens are `none`. Gradients resolve to solid ink or paper surfaces. Depth comes from 1px hairlines, 1.5px ink rules, and layered borders. Hover uses registration marks and tinted paper rather than moving surfaces.

## Shapes

Use 2px small and ordinary corners and 4px large corners. The circular video play affordance is retained.

## Components

Primary buttons are solid ink with white mono labels. Secondary buttons use a ruled surface. Pressed filter chips use the same accessible control color. Cards use the current theme surface, a hairline rule, and corner registration marks on hover.

Hero text and actions are readable immediately. Decorative schematic drawing is limited to the home cover; reduced-motion visitors see the completed drawing. Diagrams describe architecture without fabricated live measurements.

Mobile navigation is visible without JavaScript. Enhancement adds a toggle, Escape-to-close, and focus return. Video activation transfers focus to the attached player.

## Do's and Don'ts

- Do retain blue in both modes and use green and amber for functional states.
- Do use visible dashed focus outlines and maintain readable control contrast.
- Do render real content and label architecture diagrams accurately.
- Don't add glow, elevated cards, lifting interactions, or decorative gradients.
- Don't animate navigation-critical text or hide the only navigation when JavaScript is unavailable.
