import { describe, expect, it } from "vitest";
import {
	composeBoard,
	createEmptyGrid,
	findGhostY,
	GRID_ROWS,
} from "./board.ts";
import type { Piece } from "./types.ts";

const square = (x: number, y: number): Piece => ({
	shape: [
		["O", "O"],
		["O", "O"],
	],
	pos: { x, y },
});

describe("findGhostY", () => {
	it("finds where the piece would land", () => {
		expect(findGhostY(createEmptyGrid(), square(0, 0))).toBe(GRID_ROWS - 2);
		const grid = createEmptyGrid();
		grid[10][0] = "X";
		expect(findGhostY(grid, square(0, 0))).toBe(8);
	});

	it("handles a piece whose box starts above the board", () => {
		const iPiece: Piece = {
			shape: [
				[" ", " ", " ", " "],
				["I", "I", "I", "I"],
			],
			pos: { x: 3, y: -1 },
		};
		expect(findGhostY(createEmptyGrid(), iPiece)).toBe(GRID_ROWS - 2);
	});
});

describe("composeBoard", () => {
	it("returns the grid alone when there is no piece", () => {
		const board = composeBoard(createEmptyGrid());
		expect(
			board.flat().every((cell) => cell.value === " " && !cell.ghost),
		).toBe(true);
	});

	it("draws the piece and its ghost below it", () => {
		const board = composeBoard(createEmptyGrid(), square(4, 0));
		expect(board[0][4]).toEqual({ value: "O", ghost: false });
		expect(board[GRID_ROWS - 1][4]).toEqual({ value: "O", ghost: true });
		expect(board[5][4].value).toBe(" ");
	});

	it("draws no ghost when the piece already rests on the floor", () => {
		const board = composeBoard(createEmptyGrid(), square(0, GRID_ROWS - 2));
		expect(board.flat().some((cell) => cell.ghost)).toBe(false);
	});
});
