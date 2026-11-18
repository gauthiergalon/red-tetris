import { describe, expect, it } from "vitest";
import { GRID_ROWS, PENALTY_CELL } from "../game.ts";
import {
	Game,
	type GameListener,
	type GameResult,
	type RoomSnapshot,
} from "./Game.ts";
import type { PlayerState } from "./Player.ts";

/** A listener that records everything the Game emits. */
function recorder() {
	const states: { id: string; state: PlayerState }[] = [];
	const rooms: RoomSnapshot[] = [];
	const ends: GameResult[] = [];
	const listener: GameListener = {
		playerState: (id, state) => states.push({ id, state }),
		roomUpdate: (snapshot) => rooms.push(snapshot),
		gameEnd: (result) => ends.push(result),
	};
	return { listener, states, rooms, ends };
}

function makeGame(maxPlayers = 8) {
	const rec = recorder();
	// Fixed random: the sequence is deterministic in tests. The clock moves
	// 1 s per call, so the action throttle never gets in the way.
	let time = 0;
	const game = new Game("room", rec.listener, {
		maxPlayers,
		random: () => 0,
		now: () => (time += 1000),
	});
	return { game, ...rec };
}

function getPlayer(game: Game, id: string) {
	const player = game.players.get(id);
	if (!player) throw new Error(`no player ${id}`);
	return player;
}

/** Fills the last rows of a player's board except the given columns. */
function prepareRows(game: Game, id: string, rows: number, free: number[]) {
	const player = getPlayer(game, id);
	for (let y = GRID_ROWS - rows; y < GRID_ROWS; y++) {
		player.grid[y] = player.grid[y].map((_, x) =>
			free.includes(x) ? " " : "Z",
		);
	}
	return player;
}

describe("Game: joining and hosting", () => {
	it("makes the first player the host and notifies the room", () => {
		const { game, rooms, states } = makeGame();
		expect(game.join("a", "alice").ok).toBe(true);
		game.join("b", "bob");
		expect(game.hostId).toBe("a");
		expect(rooms.at(-1)?.players.map((p) => p.username)).toEqual([
			"alice",
			"bob",
		]);
		expect(states.map((s) => s.id)).toEqual(["a", "b"]);
	});

	it("refuses players when the room is full", () => {
		const { game } = makeGame(1);
		game.join("a", "alice");
		const result = game.join("b", "bob");
		expect(result.ok).toBe(false);
	});

	it("lets a player join during a game as a waiting player", () => {
		const { game, rooms } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.start("a");
		expect(game.join("c", "carol").ok).toBe(true);

		const carol = game.players.get("c");
		expect(carol?.alive).toBe(false);
		expect(rooms.at(-1)?.players.find((p) => p.id === "c")?.inGame).toBe(false);
		// The waiting player cannot play...
		expect(game.handleAction("c", { type: "rotate" })).toBe(false);
		// ...and does not prevent the game from ending.
		prepareRows(game, "b", GRID_ROWS - 2, [0]);
		game.handleAction("b", { type: "hardDrop" });
		expect(game.status).toBe("waiting");
	});

	it("includes players who joined during a game in the next one", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.start("a");
		game.join("c", "carol");
		game.leave("b"); // alice wins, the room goes back to waiting

		expect(game.start("a")).toBe(true);
		const carol = game.players.get("c");
		expect(carol?.alive).toBe(true);
		expect(carol?.inGame).toBe(true);
		expect(carol?.piece).toBeDefined();
		expect(game.handleAction("c", { type: "rotate" })).toBe(true);
	});

	it("gives the host role to the next player when the host leaves", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.leave("a");
		expect(game.hostId).toBe("b");
		game.leave("b");
		expect(game.isEmpty).toBe(true);
		expect(game.hostId).toBeUndefined();
		game.leave("unknown");
	});
});

describe("Game: starting", () => {
	it("only lets the host start", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		expect(game.start("b")).toBe(false);
		expect(game.status).toBe("waiting");
		expect(game.start("a")).toBe(true);
		expect(game.status).toBe("playing");
	});

	it("refuses a start during a game", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.start("a");
		game.handleAction("a", { type: "hardDrop" });
		expect(game.start("a")).toBe(false);
		// The board was not reset by the refused start.
		expect(game.players.get("a")?.sequenceIndex).toBe(2);
	});

	it("gives every player the same pieces in the same order", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.start("a");
		const a = game.players.get("a");
		const b = game.players.get("b");
		const seenA: string[] = [];
		const seenB: string[] = [];
		for (let i = 0; i < 9; i++) {
			seenA.push(a?.piece?.type ?? "");
			seenB.push(b?.piece?.type ?? "");
			a?.hardDrop();
			b?.hardDrop();
		}
		expect(seenA).toEqual(seenB);
	});

	it("keeps sequences independent between rooms and between games", () => {
		let calls = 0;
		const random = () => ((calls++ * 7) % 10) / 10;
		const one = new Game("1", recorder().listener, { random });
		const two = new Game("2", recorder().listener, { random });
		const first = Array.from({ length: 14 }, (_, i) => one.pieceAt(i));
		const second = Array.from({ length: 14 }, (_, i) => two.pieceAt(i));
		expect(first).not.toEqual(second);
	});
});

describe("Game: actions and gravity", () => {
	it("ignores actions when not playing or from unknown players", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		expect(game.handleAction("a", { type: "rotate" })).toBe(false);
		game.start("a");
		expect(game.handleAction("zzz", { type: "rotate" })).toBe(false);
	});

	it("applies moves, rotations, soft and hard drops", () => {
		const { game, states } = makeGame();
		game.join("a", "alice");
		game.start("a");
		const before = states.length;
		expect(game.handleAction("a", { type: "move", direction: "left" })).toBe(
			true,
		);
		expect(game.handleAction("a", { type: "rotate" })).toBe(true);
		expect(game.handleAction("a", { type: "softDrop" })).toBe(true);
		expect(game.handleAction("a", { type: "hardDrop" })).toBe(true);
		expect(states.length).toBe(before + 4);
	});

	it("makes pieces fall on tick, and does nothing when waiting", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		game.tick();
		expect(game.players.get("a")?.piece).toBeUndefined();
		game.start("a");
		const y = game.players.get("a")?.piece?.pos.y ?? 0;
		game.tick();
		expect(game.players.get("a")?.piece?.pos.y).toBe(y + 1);
	});
});

/** Cells ("x,y") the current piece of a player will fill once hard dropped. */
function landingCells(game: Game, id: string): Set<string> {
	const player = getPlayer(game, id);
	if (!player.piece) throw new Error("no piece");
	const dropped = player.piece.dropped(player.grid);
	const cells = new Set<string>();
	dropped.shape.forEach((row, y) => {
		row.forEach((cell, x) => {
			if (cell !== " ") cells.add(`${dropped.pos.x + x},${dropped.pos.y + y}`);
		});
	});
	return cells;
}

/** Fills the given rows with blocks, except where the piece will land. */
function fillAroundLanding(game: Game, id: string, rows: number[]) {
	const player = getPlayer(game, id);
	const cells = landingCells(game, id);
	for (const y of rows) {
		player.grid[y] = player.grid[y].map((_, x) =>
			cells.has(`${x},${y}`) ? " " : "Z",
		);
	}
}

function landingRows(game: Game, id: string): number[] {
	const rows = [...landingCells(game, id)].map((k) => Number(k.split(",")[1]));
	return [...new Set(rows)].sort((a, b) => a - b);
}

function countPenaltyRows(game: Game, id: string): number {
	return getPlayer(game, id).grid.filter((row) =>
		row.every((c) => c === PENALTY_CELL),
	).length;
}

describe("Game: penalties and spectrum", () => {
	it("sends n - 1 penalty lines to every opponent", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.join("c", "carol");
		game.start("a");
		const rows = landingRows(game, "a");
		// With the fixed random, the first piece is an O: it clears 2 lines.
		expect(rows.length).toBe(2);
		fillAroundLanding(game, "a", rows);

		game.handleAction("a", { type: "hardDrop" });

		expect(countPenaltyRows(game, "b")).toBe(1);
		expect(countPenaltyRows(game, "c")).toBe(1);
		expect(countPenaltyRows(game, "a")).toBe(0);
	});

	it("works the same whichever player clears (not only the host)", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.start("a");
		fillAroundLanding(game, "b", landingRows(game, "b"));

		game.handleAction("b", { type: "hardDrop" });

		expect(countPenaltyRows(game, "a")).toBe(1);
		expect(countPenaltyRows(game, "b")).toBe(0);
	});

	it("sends nothing for a single line", () => {
		const { game } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.start("a");
		const rows = landingRows(game, "a");
		fillAroundLanding(game, "a", [rows[rows.length - 1]]);

		game.handleAction("a", { type: "hardDrop" });

		expect(countPenaltyRows(game, "b")).toBe(0);
	});

	it("broadcasts the spectra when a piece locks", () => {
		const { game, rooms } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.start("a");
		const before = rooms.length;
		game.handleAction("a", { type: "move", direction: "left" });
		expect(rooms.length).toBe(before);
		game.handleAction("a", { type: "hardDrop" });
		expect(rooms.length).toBe(before + 1);
		const alice = rooms.at(-1)?.players.find((p) => p.id === "a");
		expect(Math.max(...(alice?.spectrum ?? []))).toBeGreaterThan(0);
	});
});

describe("Game: end of game", () => {
	/** Fills the board so that the next hard drop kills the player. */
	function prepareDeath(game: Game, id: string) {
		prepareRows(game, id, GRID_ROWS - 2, [0]);
	}

	it("announces the last survivor and goes back to waiting", () => {
		const { game, ends, states } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.start("a");
		prepareDeath(game, "b");
		game.handleAction("b", { type: "hardDrop" });

		expect(game.players.get("b")?.alive).toBe(false);
		expect(ends).toEqual([{ winner: { id: "a", username: "alice" } }]);
		expect(game.status).toBe("waiting");
		expect(states.at(-1)?.state.playing).toBe(false);
		// A new player can now join, and the host can restart.
		expect(game.join("c", "carol").ok).toBe(true);
		expect(game.start("a")).toBe(true);
	});

	it("declares the remaining player winner when the others leave", () => {
		const { game, ends } = makeGame();
		game.join("a", "alice");
		game.join("b", "bob");
		game.start("a");
		game.leave("a");
		expect(ends).toEqual([{ winner: { id: "b", username: "bob" } }]);
		expect(game.hostId).toBe("b");
	});

	it("ends a solo game without a winner when the player dies", () => {
		const { game, ends } = makeGame();
		game.join("a", "alice");
		game.start("a");
		game.tick();
		expect(ends).toEqual([]);
		prepareDeath(game, "a");
		game.handleAction("a", { type: "hardDrop" });
		expect(ends).toEqual([{ winner: null }]);
		expect(game.status).toBe("waiting");
	});
});

describe("Game: server-side action limit", () => {
	it("refuses an action repeated too fast, accepts it after the delay", () => {
		let time = 0;
		const game = new Game("room", recorder().listener, { now: () => time });
		game.join("a", "alice");
		game.start("a");

		expect(game.handleAction("a", { type: "move", direction: "left" })).toBe(
			true,
		);
		time += 10;
		expect(game.handleAction("a", { type: "move", direction: "left" })).toBe(
			false,
		);
		// Another action type has its own delay.
		expect(game.handleAction("a", { type: "rotate" })).toBe(true);
		time += 100;
		expect(game.handleAction("a", { type: "move", direction: "left" })).toBe(
			true,
		);
	});
});
