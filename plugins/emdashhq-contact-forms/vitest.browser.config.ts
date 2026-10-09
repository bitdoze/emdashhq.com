import { defineConfig } from "vitest/config";

// DOM tests run in Node; the plugin tests use the production workerd transport.
export default defineConfig({
	test: { include: ["tests/capacity-client.test.ts", "tests/capacity.test.ts"] },
});
