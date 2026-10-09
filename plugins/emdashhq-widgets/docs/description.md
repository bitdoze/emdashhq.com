# Content Widgets

**Live demo:** [emdashhq.com/blog/widget-gallery](https://emdashhq.com/blog/widget-gallery/) — all nineteen widgets rendering in one article.

A set of article widgets for EmDash sites: callouts, accordions, tabs, checklists, buttons, YouTube and iframe embeds, product/review boxes, pull quotes, facts tables, an automatic table of contents, series navigation and a live "latest posts" list.

Each widget is a `blocks`-field block type, so editors can drop them into any blocks-based field — page content, blog post bodies, landing pages — wherever your schema allows them.

## What's included

Nineteen block types, all prefixed `widget_`: Prose, Notice, Accordion, Tabs, Checklist, Steps, Button, YouTube, Embed, Image, Code, Product box, Link cards, Pull quote, Facts table, Table of contents, Series nav, Latest posts and Divider.

## How it works

Sandboxed plugins cannot ship Astro render components, so the widgets are distributed as **block-type JSON + ready-made Astro components** inside the package's `site/` directory. You copy them into your site once; the plugin supplies shared runtime behavior (privacy mode for YouTube, the affiliate disclosure line, the posts query) through two public routes the components call in-process — no HTTP roundtrip.

The plugin also adds a **Widget catalog** admin page documenting every block's fields, and a **Setup guide** page with the exact install steps and settings status.
