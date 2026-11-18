import { describe, expect, it } from "vitest";
import {
	createEmptyGrid,
	GRID_ROWS,
	HIDDEN_ROWS,
	pieceCells,
	spawnPosition,
} from "../game.ts";
import { Piece } from "./Piece.ts";

describe("Piece", () => {
	it("spawns at the spawn position with rotation 0", () => {
		const piece = Piece.spawn("T");
		expect(piece).toBeInstanceOf(Piece);
		expect(piece.pos).toEqual(spawnPosition("T"));
		expect(piece.rotationState).toBe(0);
	});

	it("is immutable: moving returns a new piece", () => {
		const piece = Piece.spawn("O");
		const moved = piece.moved(createEmptyGrid(), "left");
		expect(moved).not.toBe(piece);
		expect(moved?.pos.x).toBe(spawnPosition("O").x - 1);
		expect(piece.pos).toEqual(spawnPosition("O"));
	});

	it("returns null when a move collides", () => {
		const piece = new Piece("O", Piece.spawn("O").shape, { x: 0, y: 0 });
		expect(piece.moved(createEmptyGrid(), "left")).toBeNull();
	});

	it("spawns like the official games: lowest row on the top visible row", () => {
		expect(Piece.spawn("O").pos).toEqual({ x: 4, y: HIDDEN_ROWS - 1 });
		for (const type of ["I", "O", "T"] as const) {
			const piece = Piece.spawn(type);
			const rows = pieceCells(piece).map((cell) => cell.y);
			expect(Math.max(...rows)).toBe(HIDDEN_ROWS);
			expect(piece.collides(createEmptyGrid())).toBe(false);
		}
	});

	it("rotates, or returns null when blocked", () => {
		const grid = createEmptyGrid();
		expect(Piece.spawn("T").rotated(grid)?.rotationState).toBe(1);
		const full = grid.map((row) => row.map(() => "X"));
		expect(Piece.spawn("T").rotated(full)).toBeNull();
	});

	it("drops to the floor", () => {
		const dropped = Piece.spawn("O").dropped(createEmptyGrid());
		expect(dropped.pos.y).toBe(GRID_ROWS - 2);
	});

	it("serializes only its data (what the client receives)", () => {
		const json = JSON.parse(JSON.stringify(Piece.spawn("I")));
		expect(Object.keys(json).sort()).toEqual(
			["pos", "rotationState", "shape", "type"].sort(),
		);
	});
});
