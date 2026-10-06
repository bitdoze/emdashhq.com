# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro (server-rendered) with EmDash CMS integration. Blocks map to `src/components/blocks/*.astro`; schema and content in `seed/seed.json`.

## Users

Developers and small-site owners evaluating EmDash CMS: they come from bitdoze.com tutorials or YouTube, want to learn EmDash (tutorials, videos), grab themes/plugins (resources), or hire the owner for hands-on work (services: Cloudflare Workers setup, custom themes, plugin development, WordPress migration).

## Product Purpose

The hub site for EmDash CMS run by the Bitdoze creator. It aggregates his tutorials, YouTube videos, and free/paid themes and plugins in one place, and sells EmDash services. Success: a visitor finds a resource, starts an EmDash site, or books a service.

## Positioning

The practical companion to EmDash CMS by someone who builds with it publicly: real tutorials, real videos, real themes, and paid help from the same person.

## Operating Context

Content flows from bitdoze.com and its YouTube channel. Services are quoted per project ("Contact for a quote"). Deploy target is Cloudflare Workers. Owner contact email is a placeholder until confirmed.

## Capabilities and Constraints

- One route (`src/pages/[...slug].astro`) renders every `pages` entry; blocks query `tutorials`, `videos`, `resources`, `services` collections.
- All pages server-rendered; no `getStaticPaths()`.
- Stored blocks carry immutable `_type`, `_version`, `_key`; components must not restructure them.
- Menus: `primary`, `header_cta` (first item only), three footer columns. Site settings: title, tagline, logo, socials.
- Placeholder content (services copy) must not be replaced with invented facts. The contact email is confirmed: `dragos@emdashhq.com`.

## Brand Commitments

- Voice: plain and specific. No hype, no invented testimonials, no em dashes.
- Colors are binding: the Print Edition palette (cream paper, deep indigo, dusty-rose marker, ink plate, light/dark) stays — it mirrors the bitdoze.com tutorial covers.
- Type: Playfair Display for headlines, Archivo for body, IBM Plex Mono for annotations, metadata, labels and buttons (see `DESIGN.md`). Light and dark mode with footer switcher must keep working.

## Evidence on Hand

Seeded tutorials and videos are real (bitdoze.com and its YouTube channel). Four real services with feature lists. No testimonials, no pricing tables, no client logos; none may be fabricated.

## Product Principles

1. Show the work: real tutorials, videos, and themes are the proof.
2. Make the next step obvious: every section ends with a concrete action.
3. Plain, specific, unhyped.

## Accessibility & Inclusion

Light/dark parity, visible focus rings, reduced-motion support, WCAG-AA contrast on both themes.
