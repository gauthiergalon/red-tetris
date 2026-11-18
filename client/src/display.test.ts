import { describe, expect, it } from "vitest";
import {
	type GameResult,
	getOpponents,
	getStatusMessage,
	type PlayerSummary,
	type RoomSnapshot,
	spectrumToRows,
} from "./display.ts";

function player(id: string, patch: Partial<PlayerSummary> = {}): PlayerSummary {
	return {
		id,
		username: id,
		alive: true,
		inGame: true,
		spectrum: [],
		...patch,
	};
}

function room(status: RoomSnapshot["status"], players: PlayerSummary[]) {
	return { id: "r", status, hostId: "a", players };
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
