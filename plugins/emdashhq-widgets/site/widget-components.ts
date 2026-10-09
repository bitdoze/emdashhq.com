/**
 * widget-components.ts — component map for every widget_* block type
 * shipped by the emdashhq-widgets plugin. Spread it into your site's
 * defineBlockComponents() map, or render <WidgetBlocks> for a standalone
 * widget-only blocks field.
 */
import WidgetAccordion from "./components/WidgetAccordion.astro";
import WidgetButton from "./components/WidgetButton.astro";
import WidgetCards from "./components/WidgetCards.astro";
import WidgetChecklist from "./components/WidgetChecklist.astro";
import WidgetCode from "./components/WidgetCode.astro";
import WidgetDivider from "./components/WidgetDivider.astro";
import WidgetEmbed from "./components/WidgetEmbed.astro";
import WidgetFacts from "./components/WidgetFacts.astro";
import WidgetImage from "./components/WidgetImage.astro";
import WidgetLatestPosts from "./components/WidgetLatestPosts.astro";
import WidgetNotice from "./components/WidgetNotice.astro";
import WidgetProduct from "./components/WidgetProduct.astro";
import WidgetProse from "./components/WidgetProse.astro";
import WidgetQuote from "./components/WidgetQuote.astro";
import WidgetSeries from "./components/WidgetSeries.astro";
import WidgetSteps from "./components/WidgetSteps.astro";
import WidgetTabs from "./components/WidgetTabs.astro";
import WidgetToc from "./components/WidgetToc.astro";
import WidgetYoutube from "./components/WidgetYoutube.astro";

export const widgetComponents = {
	widget_prose: WidgetProse,
	widget_notice: WidgetNotice,
	widget_accordion: WidgetAccordion,
	widget_tabs: WidgetTabs,
	widget_checklist: WidgetChecklist,
	widget_button: WidgetButton,
	widget_youtube: WidgetYoutube,
	widget_embed: WidgetEmbed,
	widget_product: WidgetProduct,
	widget_quote: WidgetQuote,
	widget_facts: WidgetFacts,
	widget_toc: WidgetToc,
	widget_series: WidgetSeries,
	widget_latest_posts: WidgetLatestPosts,
	widget_steps: WidgetSteps,
	widget_image: WidgetImage,
	widget_code: WidgetCode,
	widget_cards: WidgetCards,
	widget_divider: WidgetDivider,
};
