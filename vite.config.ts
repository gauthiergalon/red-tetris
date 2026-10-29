import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	root: "./client",
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			"/socket.io": {
				target: "http://localhost:3000",
				ws: true,
			},
		},
	},
	build: {
		outDir: path.resolve(import.meta.dirname, "dist"),
		emptyOutDir: true,
	},
});
