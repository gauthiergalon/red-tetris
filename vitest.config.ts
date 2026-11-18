import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is ./client.
export default defineConfig({
	test: {
		include: ["server/**/*.test.ts", "client/**/*.test.{ts,tsx}"],
		coverage: {
			provider: "v8",
			// Everything is measured, client components included. The only
			// exclusion is server/src/index.ts: it just starts the server built
			// by server.ts (which has its own integration tests) and listens to
			// SIGINT/SIGTERM, so testing it would mean killing the test process.
			include: ["server/src/**/*.ts", "client/src/**/*.{ts,tsx}"],
			exclude: ["server/src/index.ts", "**/*.test.{ts,tsx}"],
			thresholds: {
				statements: 70,
				functions: 70,
				lines: 70,
				branches: 50,
			},
		},
	},
});
