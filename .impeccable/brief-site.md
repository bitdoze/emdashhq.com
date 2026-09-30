# Surface brief — site (all routes via src/pages/[...slug].astro)

Scope: every public page. Visitor mode: Persuade (evaluate EmDash, grab a resource, hire the developer).

## THESIS

The site is a drawing set, not a landing page: each page is a numbered sheet of engineering drawings for one working CMS, and the offer is proved by showing how the thing is wired. It refuses the category-default arrangement of centered hero, icon-tile card grids, and gradient banners.

## OWN-WORLD

Drafting-sheet material: paper ground with a faint 5 mm grid, blue ink lines at 1–1.5 px, near-square corners, no shadows. Light mode is a blue-ink sheet on paper; dark mode is a true blueprint (Prussian-blue ground, pale ink line-work). Type: Archivo for display and body (engineering grotesque), IBM Plex Mono for annotations, metadata, labels, buttons. Controls: solid-ink stamp buttons and outlined buttons, both mono uppercase; badges are bracket tags. Phosphor icons bare in ink. Depth comes from line weight and layered rules, never blur or glow.

## STORY

The visitor sees a working system documented by the person who builds with it, concludes the tutorials are real, and hires or follows. Every section ends in a concrete action; the approval block (CTA) asks for sign-off.

## FIRST VIEWPORT

Home, 1440 px: sticky ink title strip carries the EMDASH HQ wordmark and a mono nav whose items carry sheet numbers, current sheet underlined. Left column: a title block under a heavy rule — mono meta line (SET · SHEET 01 · REV date), the CMS headline at 3–3.5rem Archivo 800, subhead, then stamp button "Work with me" and outlined "Watch on YouTube". Right column: an authored SVG schematic of the EmDash stack (browser → Worker → D1/R2, admin branch) in thin ink strokes with mono node labels; it draws itself on load over ~1.2 s. Registration marks sit at the sheet corners.

## FORM

Code-led build. Signature interaction: the hero schematic draws on load, once; reduced-motion renders it complete. Hover language: registration marks appear at card corners, link underlines draw, rows tint paper-blue. No scroll-driven motion. Navigation is the sheet index; the footer is the set's cover block on blueprint ground.

## RAISES (from the roll's declined challengers)

- From seven-segment: metadata (dates, durations, counts) set as instrument readouts in tabular mono; empty states designed deliberately.
- From dong-ho print: flat color-block discipline with precise keylines; entries reveal in order on first paint.
- From neubrutalist: decisive press state on buttons (1 px travel, no shadow theatre).

## RISKS

Mono overload (confine to ≤ sm sizes and metadata); grid texture must stay ≤ 5% opacity; the schematic must stay semantic (title, desc, real labels) and must not fake numbers; services copy stays the existing placeholder-truthful content.
