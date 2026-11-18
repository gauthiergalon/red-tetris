import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["server/**/*.test.ts", "client/**/*.test.{ts,tsx}"],
		coverage: {
			provider: "v8",

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
