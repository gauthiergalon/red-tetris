import { describe, expect, it } from "vitest";
import {
	canConfigureGame,
	getOpponents,
	getStatusMessage,
	isEliminated,
	opponentTags,
	spectrumToRows,
} from "./display.ts";
import type { GameResult, PlayerSummary, RoomSnapshot } from "./types.ts";

function player(id: string, patch: Partial<PlayerSummary> = {}): PlayerSummary {
	return {
		id,
		username: id,
		alive: true,
		inGame: true,
		connected: true,
		score: 0,
		spectrum: [],
		...patch,
	};
}

function room(status: RoomSnapshot["status"], players: PlayerSummary[]) {
	return {
		id: "r",
		status,
		hostId: "a",
		countdown: null,
		difficulty: "medium" as const,
		players,
	};
}

const win = (id: string): GameResult => ({ winner: { id, username: id } });

describe("spectrumToRows", () => {
	it("fills each column from the bottom up to its height", () => {
		expect(spectrumToRows([0, 1, 3], 3)).toEqual([
			[false, false, true],
			[false, false, true],
			[false, true, true],
		]);
	});
});

describe("getOpponents", () => {
	it("returns every player except me", () => {
		const r = room("playing", [player("a"), player("b"), player("c")]);
		expect(getOpponents(r, "b").map((p) => p.id)).toEqual(["a", "c"]);
		expect(getOpponents(null, "b")).toEqual([]);
	});
});

describe("getStatusMessage", () => {
	it("shows nothing when back in waiting without a result (reconnection)", () => {
		const r = room("waiting", [player("a")]);
		expect(getStatusMessage(r, null, "a")).toBeNull();
	});

	it("shows nothing before the first game or while playing", () => {
		expect(getStatusMessage(null, null, "a")).toBeNull();
		expect(
			getStatusMessage(
				room("waiting", [player("a", { inGame: false })]),
				null,
				"a",
			),
		).toBeNull();
		expect(
			getStatusMessage(room("playing", [player("a")]), null, "a"),
		).toBeNull();
	});

	it("shows Game Over as soon as I die during the game", () => {
		const r = room("playing", [player("a", { alive: false }), player("b")]);
		expect(getStatusMessage(r, null, "a")).toBe("Game Over");
	});

	it("shows Victory to the winner and Game Over to the others", () => {
		const r = room("waiting", [player("a"), player("b", { alive: false })]);
		expect(getStatusMessage(r, win("a"), "a")).toBe("Victory");
		expect(getStatusMessage(r, win("a"), "b")).toBe("Game Over");
	});

	it("shows Game Over at the end of a solo game", () => {
		const r = room("waiting", [player("a", { alive: false })]);
		expect(getStatusMessage(r, { winner: null }, "a")).toBe("Game Over");
	});

	it("tells a player who joined during a game to wait", () => {
		const r = room("playing", [
			player("a"),
			player("c", { inGame: false, alive: false }),
		]);
		expect(getStatusMessage(r, null, "c")).toBe("Waiting for the next game");
	});
});

describe("countdown and eliminated players", () => {
	it("shows the same countdown to everyone, new players included", () => {
		const r = {
			...room("countdown", [player("a"), player("c", { inGame: false })]),
			countdown: 2,
		};
		expect(getStatusMessage(r, null, "a")).toBe("Starting in 2");
		expect(getStatusMessage(r, null, "c")).toBe("Starting in 2");
	});

	it("marks as eliminated only players who lost a game", () => {
		expect(isEliminated(player("a", { alive: false }))).toBe(true);
		expect(isEliminated(player("a"))).toBe(false);
		expect(isEliminated(player("a", { alive: false, inGame: false }))).toBe(
			false,
		);
	});
});

describe("opponentTags", () => {
	it("lists what matters about an opponent", () => {
		const playing = room("playing", []);
		expect(opponentTags(player("a"), playing)).toBe(" (host)");
		expect(opponentTags(player("b", { alive: false }), playing)).toBe(" (out)");
		expect(
			opponentTags(player("b", { inGame: false, alive: false }), playing),
		).toBe(" (waiting)");
		expect(opponentTags(player("b", { connected: false }), playing)).toBe(
			" (disconnected)",
		);
		expect(
			opponentTags(player("b", { alive: false }), room("waiting", [])),
		).toBe("");
	});
});

describe("canConfigureGame", () => {
	it("is only true for the host while waiting", () => {
		expect(canConfigureGame(room("waiting", []), "a")).toBe(true);
		expect(canConfigureGame(room("waiting", []), "b")).toBe(false);
		expect(canConfigureGame(room("playing", []), "a")).toBe(false);
		expect(canConfigureGame(null, "a")).toBe(false);
	});
});
