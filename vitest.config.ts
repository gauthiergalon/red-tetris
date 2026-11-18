import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is ./client.
export default defineConfig({
	test: {
		include: ["server/**/*.test.ts", "client/**/*.test.{ts,tsx}"],
		coverage: {
			provider: "v8",
			// index.ts only wires socket.io to the Game class; the rules live in
			// game.ts and models/, which are tested directly.
			include: ["server/src/**/*.ts", "client/src/**/*.ts"],
			exclude: ["server/src/index.ts", "**/*.test.ts"],
			thresholds: {
				statements: 70,
				functions: 70,
				lines: 70,
				branches: 50,
			},
		},
	},
});
