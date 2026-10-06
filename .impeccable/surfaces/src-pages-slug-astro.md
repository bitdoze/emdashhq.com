---
version: 2
slug: "src-pages-slug-astro"
primary_target: "src/pages/[...slug].astro"
related_targets: []
---

# Surface brief — site (all routes via src/pages/[...slug].astro)

Scope: every public page. Visitor mode: Persuade (evaluate EmDash, grab a resource, hire the developer).

## THESIS

The site is a magazine issue about one working CMS, not a landing page: each page is a cover in the Bitdoze cover style — cream stock, indigo serif display, rose highlighter marks, pill chips and paper cards resting on a desk. The offer is proved by showing how the thing is wired, dressed like print.

## OWN-WORLD

Print material: cream paper ground with faint fiber texture, deep-indigo ink, dusty-rose marker accents, warm-amber detail. Light mode is a printed cover; dark mode is the ink plate (deep navy, cream ink, same rose). Type: Playfair Display for headlines (high-contrast serif, italic inside the `.hl` swash), Archivo for body, IBM Plex Mono for eyebrows, metadata, pills and buttons. Controls: solid stamp buttons and outlined paper buttons, mono uppercase; badges and filter chips are pills. Cards: paper surfaces with soft indigo-tinted shadows, small lift on hover. Featured surfaces are the always-dark "plate" (video spotlight, highlighted tier, dark CTA, footer). Decorations: `.hl` marker swash, washi tape, postal stamp — hero/CTA features only.

## STORY

The visitor sees a working system documented by the person who builds with it — but dressed like a beloved tutorial cover — concludes the tutorials are real, and hires or follows. Every section ends in a concrete action; the CTA banner is the issue's mail-in card.

## FIRST VIEWPORT

Home, 1440 px: translucent masthead carries the serif EMDASH HQ wordmark and a mono nav with issue numbers, current page underlined in rose. Left column: mono eyebrow with rose dot ("EMDASH CMS HUB BY BITDOZE · VOL. 2026"), the Playfair headline with the key phrase italic inside a rose highlighter swash, subhead, then indigo stamp button and outlined button, and pill spec chips below. Right column: a paper collage — a rotated figure card taped down, a postal stamp ("EDGE SSR") on its corner, the semantic stack diagram inside window chrome, and a dark terminal card ("$ wrangler deploy → Deployed!") overlapping its foot.

## FORM

Code-led build. Signature interaction: the marker swash and the diagram draw on first paint, once; reduced-motion renders them complete. Hover language: cards and chips lift a few pixels with deeper paper shadow. No scroll-driven motion. Navigation is the issue's masthead; the footer is the back cover — always the ink plate with a rose top edge.

## RAISES (from the roll's declined challengers)

- Keep the Drawing Set's truth: the diagram stays semantic (title, desc, real labels) and must not fake numbers.
- Keep left-edge discipline: every section child starts at the container's left edge; only a centered hero centers.

## RISKS

Rose overload (it is a marker, not a fill — confine to marks, annotations, small accents); mono overload (confine to ≤ sm sizes and metadata); Playfair must stay at display sizes — body stays Archivo; collage elements (tape/stamp/tilt) only on hero and CTA, never per-card; services copy stays the existing placeholder-truthful content.
