// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
	const handlers = new Map<string, (payload: unknown) => void>();
	const socket = {
		id: "socket-1",
		on: (event: string, handler: (payload: unknown) => void) => {
			handlers.set(event, handler);
			return socket;
		},
		emit: vi.fn(),
		disconnect: vi.fn(),
	};
	return { handlers, socket };
});

vi.mock("socket.io-client", () => ({ io: vi.fn(() => fake.socket) }));

import { Game } from "./Game";

function serverSends(event: string, payload?: unknown) {
	act(() => fake.handlers.get(event)?.(payload));
}

const emptyGrid = () => Array.from({ length: 20 }, () => Array(10).fill(" "));
const tShape = [
	[" ", "T", " "],
	["T", "T", "T"],
	[" ", " ", " "],
];

function player(id: string, extra: object = {}) {
	return {
		id,
		username: id,
		alive: true,
		inGame: true,
		connected: true,
		score: 0,
		spectrum: Array(10).fill(0),
		...extra,
	};
}

function room(extra: object = {}) {
	return {
		id: "r",
		status: "waiting",
		hostId: "me",
		countdown: null,
		difficulty: "medium",
		players: [player("me"), player("bob")],
		...extra,
	};
}

function playingState(extra: object = {}) {
	return {
		grid: emptyGrid(),
		piece: { type: "T", shape: tShape, pos: { x: 3, y: 0 }, rotationState: 0 },
		playing: true,
		score: 120,
		lines: 1,
		next: [{ type: "I", shape: [["I", "I", "I", "I"]] }],
		hold: {
			type: "O",
			shape: [
				["O", "O"],
				["O", "O"],
			],
		},
		canHold: true,
		...extra,
	};
}

const emitted = () => fake.socket.emit.mock.calls;
const key = (type: "keyDown" | "keyUp", k: string, repeat = false) =>
	fireEvent[type](window, { key: k, repeat });

beforeEach(() => {
	fake.handlers.clear();
	fake.socket.emit.mockClear();
	render(<Game roomId="r" username="me" />);
	serverSends("welcome", { playerId: "me" });
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("Game screen: room and lobby", () => {
	it("shows the room, the player and the host", () => {
		serverSends("room", room());
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
			"Room: r | Player: me (host)",
		);
		expect(screen.getByText(/No one else|bob/)).toBeTruthy();
	});

	it("lets the host start and choose the difficulty", () => {
		serverSends("room", room());
		fireEvent.click(screen.getByText("Start Game"));
		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "hard" },
		});
		expect(emitted()).toContainEqual(["start"]);
		expect(emitted()).toContainEqual(["difficulty", "hard"]);
	});

	it("disables Start and difficulty for other players", () => {
		serverSends("room", room({ hostId: "bob" }));
		expect((screen.getByText("Start Game") as HTMLButtonElement).disabled).toBe(
			true,
		);
		expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
			true,
		);
	});

	it("shows the countdown, then the result", () => {
		serverSends("room", room({ status: "countdown", countdown: 2 }));
		expect(screen.getByText("Starting in 2")).toBeTruthy();
		serverSends("room", room({ status: "playing" }));
		serverSends("gameEnd", { winner: { id: "me", username: "me" } });
		serverSends("room", room());
		expect(screen.getByText("Victory")).toBeTruthy();
	});

	it("shows connection errors", () => {
		serverSends("connectionError", { message: "This room is full." });
		expect(screen.getByText("This room is full.")).toBeTruthy();
	});

	it("labels opponents and shows an eliminated one in red, disabled", () => {
		serverSends(
			"room",
			room({
				status: "playing",
				players: [
					player("me"),
					player("bob", { alive: false, spectrum: [3, ...Array(9).fill(0)] }),
					player("carol", { inGame: false, alive: false }),
					player("dan", { connected: false }),
				],
			}),
		);
		expect(screen.getByText(/bob \(0\).*\(out\)/)).toBeTruthy();
		expect(screen.getByText(/carol \(0\).*\(waiting\)/)).toBeTruthy();
		expect(screen.getByText(/dan \(0\).*\(disconnected\)/)).toBeTruthy();
		const spectra = document.querySelectorAll("[aria-disabled]");
		expect(spectra[0].getAttribute("aria-disabled")).toBe("true");
		expect(spectra[1].getAttribute("aria-disabled")).toBe("false");
	});
});

describe("Game screen: playing", () => {
	beforeEach(() => {
		serverSends("room", room({ status: "playing" }));
		serverSends("gameState", playingState());
	});

	it("shows the score, the lines, the hold and the next pieces", () => {
		expect(screen.getByText("Score: 120")).toBeTruthy();
		expect(screen.getByText("Lines: 1")).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Hold" })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Next" })).toBeTruthy();
	});

	it("sends one action per button", () => {
		for (const label of [
			"Rotate ↺",
			"Rotate ↻",
			"←",
			"→",
			"↓",
			"Hard Drop",
			"Hold",
		]) {
			fireEvent.click(screen.getByRole("button", { name: label }));
		}
		expect(emitted()).toEqual([
			["rotate", "ccw"],
			["rotate", "cw"],
			["move", "left"],
			["move", "right"],
			["softDrop"],
			["hardDrop"],
			["hold"],
		]);
	});

	it("maps the keyboard to actions and ignores OS key repeat", () => {
		key("keyDown", "ArrowUp");
		key("keyDown", "x");
		key("keyDown", "z");
		key("keyDown", "c");
		key("keyDown", "Shift");
		key("keyDown", " ");
		key("keyDown", " ", true);
		key("keyDown", "ArrowDown");
		key("keyUp", "ArrowDown");
		expect(emitted()).toEqual([
			["rotate", "cw"],
			["rotate", "cw"],
			["rotate", "ccw"],
			["hold"],
			["hold"],
			["hardDrop"],
			["softDrop", true],
			["softDrop", false],
		]);
	});

	it("moves once per press, then repeats only after the DAS delay", () => {
		vi.useFakeTimers();
		key("keyDown", "ArrowLeft");
		expect(emitted()).toEqual([["move", "left"]]);
		act(() => vi.advanceTimersByTime(169));
		expect(emitted()).toHaveLength(1);
		act(() => vi.advanceTimersByTime(1 + 60));
		expect(emitted()).toHaveLength(3);
		key("keyUp", "ArrowLeft");
		act(() => vi.advanceTimersByTime(500));
		expect(emitted()).toHaveLength(3);
	});

	it("switches direction and stops everything when the window loses focus", () => {
		vi.useFakeTimers();
		key("keyDown", "ArrowLeft");
		key("keyDown", "ArrowRight");
		fireEvent.blur(window);
		act(() => vi.advanceTimersByTime(500));
		expect(emitted()).toEqual([
			["move", "left"],
			["move", "right"],
			["softDrop", false],
		]);
	});

	it("ignores keys when not playing", () => {
		serverSends("gameState", playingState({ playing: false }));
		key("keyDown", "ArrowUp");
		expect(emitted()).toEqual([]);
	});

	it("counts the time while playing", () => {
		cleanup();
		vi.useFakeTimers();
		render(<Game roomId="r" username="me" />);
		serverSends("gameState", playingState());
		act(() => vi.advanceTimersByTime(2000));
		expect(screen.getByText("Timer: 2s")).toBeTruthy();
		serverSends("gameState", playingState({ playing: false }));
		expect(screen.queryByText(/Timer/)).toBeNull();
	});

	it("disconnects when leaving the page", () => {
		cleanup();
		expect(fake.socket.disconnect).toHaveBeenCalled();
	});
});
