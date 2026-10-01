/** Generic public error; database details belong only in server logs. */
export function unavailableResponse() {
	return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Temporarily unavailable | EmDash HQ</title></head><body><main><h1>Temporarily unavailable</h1><p>We could not load this page. Please try again shortly.</p><a href="/">Go home</a></main></body></html>`, {
		status: 503,
		headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "30" },
	});
}
