import { describe, expect, it } from "vitest";
import {
	createEmptyRow,
	GRID_ROWS,
	PENALTY_CELL,
	type PieceType,
} from "../game.ts";
import { Player } from "./Player.ts";

function makePlayer(type: PieceType = "O"): Player {
	const player = new Player("id", "bob", () => type);
	player.reset();
	return player;
}

/** Fills row `y` with blocks, except the given columns. */
function fillRow(player: Player, y: number, except: number[] = []): void {
	player.grid[y] = player.grid[y].map((_, x) =>
		except.includes(x) ? " " : "Z",
	);
}

describe("Player", () => {
	it("starts alive with an empty board and a first piece", () => {
		const player = makePlayer();
		expect(player.alive).toBe(true);
		expect(player.piece?.type).toBe("O");
		expect(player.sequenceIndex).toBe(1);
		expect(player.toState(true).playing).toBe(true);
		expect(player.toState(false).playing).toBe(false);
	});

	it("reads its pieces from the given source, in order", () => {
		const types: PieceType[] = ["T", "I", "L"];
		const player = new Player("id", "bob", (i) => types[i]);
		player.reset();
		expect(player.piece?.type).toBe("T");
		player.hardDrop();
		expect(player.piece?.type).toBe("I");
	});

	it("moves and rotates", () => {
		const player = makePlayer("T");
		const x = player.piece?.pos.x ?? 0;
		expect(player.move("left")).toBe(true);
		expect(player.piece?.pos.x).toBe(x - 1);
		expect(player.rotate()).toBe(true);
		expect(player.piece?.rotationState).toBe(1);
	});

	it("does nothing when dead", () => {
		const player = makePlayer();
		player.alive = false;
		expect(player.move("left")).toBe(false);
		expect(player.rotate()).toBe(false);
		expect(player.tick().changed).toBe(false);
		expect(player.hardDrop().changed).toBe(false);
		expect(player.receivePenalty(2)).toBe(false);
	});

	it("falls on tick and locks only when it cannot fall anymore", () => {
		const player = makePlayer();
		const first = player.tick();
		expect(first).toEqual({ changed: true, locked: false, cleared: 0 });

		while (player.softDrop()) {
			// fall to the floor without locking
		}
		expect(player.sequenceIndex).toBe(1);

		const lock = player.tick();
		expect(lock.locked).toBe(true);
		expect(player.grid[GRID_ROWS - 1][3]).toBe("O");
		expect(player.sequenceIndex).toBe(2);
	});

	it("reports cleared lines on hard drop", () => {
		const player = makePlayer();
		// O spawns on columns 3 and 4: leave them free on the last two rows.
		fillRow(player, GRID_ROWS - 1, [3, 4]);
		fillRow(player, GRID_ROWS - 2, [3, 4]);
		const result = player.hardDrop();
		expect(result).toEqual({ changed: true, locked: true, cleared: 2 });
		expect(player.spectrum.every((h) => h === 0)).toBe(true);
	});

	it("dies when the next piece cannot spawn", () => {
		const player = makePlayer();
		// A block on row 2 stops the O at the top: it locks there, and the next O
		// spawns on top of it.
		fillRow(player, 2, [0]);
		player.hardDrop();
		expect(player.alive).toBe(false);
	});

	it("receives penalty lines at the bottom", () => {
		const player = makePlayer();
		expect(player.receivePenalty(2)).toBe(true);
		expect(player.grid[GRID_ROWS - 1]).toEqual(createEmptyRow(PENALTY_CELL));
		expect(player.spectrum[0]).toBe(2);
		expect(player.alive).toBe(true);
		expect(player.receivePenalty(0)).toBe(false);
	});

	it("pushes its piece up when a penalty line reaches it", () => {
		const player = makePlayer();
		while (player.softDrop()) {
			// down to the floor
		}
		const y = player.piece?.pos.y ?? 0;
		player.receivePenalty(1);
		expect(player.alive).toBe(true);
		expect(player.piece?.pos.y).toBe(y - 1);
	});

	it("dies when a penalty pushes blocks out of the board", () => {
		const player = makePlayer();
		player.grid[0][0] = "Z";
		player.receivePenalty(1);
		expect(player.alive).toBe(false);
	});

	it("dies when its piece has no room left after a penalty", () => {
		const player = makePlayer();
		player.receivePenalty(GRID_ROWS - 1);
		expect(player.alive).toBe(false);
	});
});
