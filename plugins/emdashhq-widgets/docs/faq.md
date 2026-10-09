# FAQ

**Why do I have to copy files instead of the plugin doing it?**
Sandboxed plugins run in an isolated runtime and cannot register Astro render components. The `site/` directory ships the same block-type JSON and components the plugin author uses, so installation is a one-time copy into your repo — after that the widgets behave like any of your own block types.

**Do the widgets work without the plugin installed?**
The static ones do — Prose, Notice, Accordion, Tabs, Checklist, Button, Embed, Quote, Facts, TOC and Series need only the block types and components. YouTube, Product box and Latest posts read plugin settings or routes; without the plugin they fall back to defaults (no-cookie on, no disclosure, empty list).

**Does the YouTube widget set cookies?**
No player loads until the visitor clicks the facade. With the default privacy setting the player then comes from `youtube-nocookie.com`, which sets no tracking cookies even then.

**How does Latest posts build its list?**
The component calls the plugin's public `posts` route in-process (no HTTP request). The route lists published entries newest-first from the configured collection and resolves each entry's public URL from its collection's `urlPattern`.

**Can I restyle the widgets?**
Yes — every component uses `wgt-*` classes and reads your design tokens (`--color-brand`, `--color-surface`, …) with neutral fallbacks. Override the classes or the tokens to match your theme.

**Do the widgets work inside regular pages too?**
Yes. Add the `widget_*` types to the `allowedTypes` of any `blocks` field — pages, posts, or anything else.
