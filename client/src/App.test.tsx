// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("socket.io-client", () => ({
	io: vi.fn(() => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })),
}));

import { App } from "./App";

afterEach(cleanup);

function renderAt(url: string) {
	window.history.pushState({}, "", url);
	render(<App />);
}

describe("App routes", () => {
	it("shows the tutorial on /", () => {
		renderAt("/");
		expect(screen.getByText("How to play")).toBeTruthy();
	});

	it("opens the game on /<room>/<username>", () => {
		renderAt("/friends/alice");
		expect(screen.getByText("Room: friends | Player: alice")).toBeTruthy();
	});

	it("shows a 404 for any other path", () => {
		renderAt("/a/b/c");
		expect(screen.getByText("404")).toBeTruthy();
	});
});

describe("main entry point", () => {
	it("renders the app into #root", async () => {
		window.history.pushState({}, "", "/");
		document.body.innerHTML = '<div id="root"></div>';
		await act(async () => {
			await import("./main.tsx");
		});
		expect(document.querySelector("h1")?.textContent).toBe("Red Tetris");
	});
});
