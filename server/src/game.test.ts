import { describe, expect, it } from "vitest";
import {
	addPenaltyLines,
	clearLines,
	computeSpectrum,
	createEmptyGrid,
	createEmptyRow,
	dropPosition,
	GRID_COLS,
	GRID_ROWS,
	generateBag,
	getShape,
	isColliding,
	isDirection,
	kicksFor,
	LINE_CLEAR_SCORES,
	lineClearScore,
	mergePiece,
	PENALTY_CELL,
	PIECE_TYPES,
	type PieceData,
	penaltyFor,
	rotateShape,
	rotateShapeCounterClockwise,
	rotateWithKicks,
} from "./game.ts";

function piece(type: PieceData["type"], x: number, y: number): PieceData {
	return { type, shape: getShape(type), pos: { x, y }, rotationState: 0 };
}

/** Grid whose last rows are given as strings ("." = empty). */
function gridWithBottom(...rows: string[]) {
	const grid = createEmptyGrid();
	rows.forEach((row, i) => {
		grid[GRID_ROWS - rows.length + i] = [...row].map((c) =>
			c === "." ? " " : c,
		);
	});
	return grid;
}

describe("createEmptyGrid", () => {
	it("creates a 10x20 board of empty cells", () => {
		const grid = createEmptyGrid();
		expect(grid).toHaveLength(GRID_ROWS);
		expect(grid.every((row) => row.length === GRID_COLS)).toBe(true);
		expect(grid.flat().every((cell) => cell === " ")).toBe(true);
	});
});

describe("clearLines", () => {
	it("returns the grid unchanged and 0 when no line is full", () => {
		const grid = gridWithBottom("TTT.......");
		const result = clearLines(grid);
		expect(result.cleared).toBe(0);
		expect(result.grid).toEqual(grid);
	});

	it("removes full lines, counts them and adds empty lines on top", () => {
		const grid = gridWithBottom("T.........", "IIIIIIIIII", "OOOOOOOOOO");
		const result = clearLines(grid);
		expect(result.cleared).toBe(2);
		expect(result.grid).toHaveLength(GRID_ROWS);
		expect(result.grid[GRID_ROWS - 1]).toEqual(["T", ...Array(9).fill(" ")]);
		expect(result.grid[0]).toEqual(createEmptyRow());
	});

	it("never clears penalty lines", () => {
		const grid = gridWithBottom("XXXXXXXXXX", "XXXXXXXXXX");
		const result = clearLines(grid);
		expect(result.cleared).toBe(0);
		expect(result.grid[GRID_ROWS - 1]).toEqual(createEmptyRow(PENALTY_CELL));
	});

	it("does not mutate its input", () => {
		const grid = gridWithBottom("IIIIIIIIII");
		const copy = grid.map((row) => [...row]);
		clearLines(grid);
		expect(grid).toEqual(copy);
	});
});

describe("addPenaltyLines", () => {
	it("pushes the board up and adds indestructible lines at the bottom", () => {
		const grid = gridWithBottom("T.........");
		const result = addPenaltyLines(grid, 2);
		expect(result.overflow).toBe(false);
		expect(result.grid).toHaveLength(GRID_ROWS);
		expect(result.grid[GRID_ROWS - 3][0]).toBe("T");
		expect(result.grid[GRID_ROWS - 1]).toEqual(createEmptyRow(PENALTY_CELL));
		expect(result.grid[GRID_ROWS - 2]).toEqual(createEmptyRow(PENALTY_CELL));
	});

	it("reports an overflow when a block is pushed out of the board", () => {
		const grid = createEmptyGrid();
		grid[0][4] = "I";
		expect(addPenaltyLines(grid, 1).overflow).toBe(true);
	});

	it("does nothing for 0 or negative counts", () => {
		const grid = gridWithBottom("T.........");
		expect(addPenaltyLines(grid, 0).grid).toEqual(grid);
		expect(addPenaltyLines(grid, -3).grid).toEqual(grid);
	});
});

describe("penaltyFor", () => {
	it("sends n - 1 lines, never a negative number", () => {
		expect(penaltyFor(0)).toBe(0);
		expect(penaltyFor(1)).toBe(0);
		expect(penaltyFor(2)).toBe(1);
		expect(penaltyFor(4)).toBe(3);
	});
});

describe("computeSpectrum", () => {
	it("is all zeros for an empty board", () => {
		expect(computeSpectrum(createEmptyGrid())).toEqual(
			Array(GRID_COLS).fill(0),
		);
	});

	it("gives the height of the highest block of each column", () => {
		// Column 0 has a block 3 rows high with a hole below it.
		const grid = gridWithBottom("T.........", "..........", "XXXXXXXXXX");
		const spectrum = computeSpectrum(grid);
		expect(spectrum[0]).toBe(3);
		expect(spectrum[1]).toBe(1);
	});

	it("is GRID_ROWS for a column filled to the top", () => {
		const grid = createEmptyGrid();
		grid[0][9] = "I";
		expect(computeSpectrum(grid)[9]).toBe(GRID_ROWS);
	});
});

describe("mergePiece", () => {
	it("writes the piece cells without mutating the grid", () => {
		const grid = createEmptyGrid();
		const merged = mergePiece(grid, piece("O", 0, 0));
		expect(merged[0].slice(0, 2)).toEqual(["O", "O"]);
		expect(merged[1].slice(0, 2)).toEqual(["O", "O"]);
		expect(grid[0][0]).toBe(" ");
	});

	it("ignores cells outside the board", () => {
		const merged = mergePiece(createEmptyGrid(), piece("O", 9, -1));
		expect(merged[0][9]).toBe("O");
		expect(merged.flat().filter((c) => c === "O")).toHaveLength(1);
	});
});

describe("isColliding", () => {
	it("detects walls, floor and blocks", () => {
		const grid = gridWithBottom("X.........");
		expect(isColliding(grid, piece("O", 3, 0))).toBe(false);
		expect(isColliding(grid, piece("O", -1, 0))).toBe(true);
		expect(isColliding(grid, piece("O", 9, 0))).toBe(true);
		expect(isColliding(grid, piece("O", 3, GRID_ROWS - 1))).toBe(true);
		expect(isColliding(grid, piece("O", 0, GRID_ROWS - 2))).toBe(true);
	});
});

describe("rotation", () => {
	it("rotates a shape clockwise", () => {
		expect(rotateShape(getShape("T"))).toEqual([
			[" ", "T", " "],
			[" ", "T", "T"],
			[" ", "T", " "],
		]);
	});

	it("rotates with the first free kick", () => {
		const result = rotateWithKicks(createEmptyGrid(), piece("T", 3, 0));
		expect(result?.rotationState).toBe(1);
		expect(result?.pos).toEqual({ x: 3, y: 0 });
	});

	it("uses the I table and returns null when nothing fits", () => {
		const grid = createEmptyGrid().map(() => createEmptyRow(PENALTY_CELL));
		const blocked = { ...piece("I", 3, 0) };
		expect(rotateWithKicks(grid, blocked)).toBeNull();
	});
});

describe("dropPosition", () => {
	it("finds the lowest reachable position", () => {
		const grid = gridWithBottom("XXXXXXXXXX");
		expect(dropPosition(grid, piece("O", 0, 0))).toEqual({
			x: 0,
			y: GRID_ROWS - 3,
		});
	});
});

describe("generateBag", () => {
	it("contains each of the 7 pieces exactly once", () => {
		const bag = generateBag();
		expect([...bag].sort()).toEqual([...PIECE_TYPES].sort());
	});

	it("is deterministic for a given random function", () => {
		const random = () => 0.42;
		expect(generateBag(random)).toEqual(generateBag(random));
	});
});

describe("isDirection", () => {
	it("accepts only known directions", () => {
		expect(isDirection("left")).toBe(true);
		expect(isDirection("down")).toBe(true);
		expect(isDirection("up")).toBe(false);
		expect(isDirection("toString")).toBe(false);
		expect(isDirection(42)).toBe(false);
	});
});

describe("SRS (official rotation system)", () => {
	it("rotates counter-clockwise, the inverse of clockwise", () => {
		for (const type of PIECE_TYPES) {
			const shape = getShape(type);
			expect(rotateShapeCounterClockwise(rotateShape(shape))).toEqual(shape);
		}
		expect(rotateShapeCounterClockwise(getShape("T"))).toEqual([
			[" ", "T", " "],
			["T", "T", " "],
			[" ", "T", " "],
		]);
	});

	it("uses the official kick tables with y flipped for a y-down board", () => {
		// Guideline 0->R for J, L, S, T, Z: (0,0) (-1,0) (-1,+1) (0,-2) (-1,-2)
		// with y up. On our board, +1 up becomes -1.
		expect(kicksFor("T", 0, "cw")).toEqual([
			{ x: 0, y: 0 },
			{ x: -1, y: 0 },
			{ x: -1, y: -1 },
			{ x: 0, y: 2 },
			{ x: -1, y: 2 },
		]);
		// Guideline 0->R for I: (0,0) (-2,0) (+1,0) (-2,-1) (+1,+2).
		expect(kicksFor("I", 0, "cw")[4]).toEqual({ x: 1, y: -2 });
	});

	it("derives counter-clockwise kicks: kicks(a->b) = -kicks(b->a)", () => {
		for (const type of ["T", "I"] as const) {
			for (let state = 0; state < 4; state++) {
				const next = (state + 1) % 4;
				const back = kicksFor(type, next, "ccw");
				kicksFor(type, state, "cw").forEach((kick, i) => {
					expect(back[i]).toEqual({ x: -kick.x || 0, y: -kick.y || 0 });
				});
			}
		}
		// Guideline 0->L for J, L, S, T, Z: (0,0) (+1,0) (+1,+1) (0,-2) (+1,-2).
		expect(kicksFor("T", 0, "ccw")[2]).toEqual({ x: 1, y: -1 });
	});

	it("kicks a T up (not down) when rotating against the floor", () => {
		// T in state 0 resting on the floor: rows 18-19, columns 4-6.
		const t = { ...piece("T", 4, GRID_ROWS - 2) };
		const result = rotateWithKicks(createEmptyGrid(), t, "cw");
		// (0,0) and (-1,0) leave the R shape out of the board; the third test
		// moves it one column left and one row UP.
		expect(result?.pos).toEqual({ x: 3, y: GRID_ROWS - 3 });
		expect(result?.rotationState).toBe(1);
	});

	it("rotates counter-clockwise to state L", () => {
		const result = rotateWithKicks(createEmptyGrid(), piece("T", 3, 0), "ccw");
		expect(result?.rotationState).toBe(3);
	});

	it("never rotates the O", () => {
		expect(rotateWithKicks(createEmptyGrid(), piece("O", 4, 0))).toBeNull();
	});
});

describe("lineClearScore", () => {
	it("follows the guideline: 100 / 300 / 500 / 800", () => {
		expect(LINE_CLEAR_SCORES).toEqual([0, 100, 300, 500, 800]);
		expect(lineClearScore(0)).toBe(0);
		expect(lineClearScore(2)).toBe(300);
		expect(lineClearScore(4)).toBe(800);
		expect(lineClearScore(9)).toBe(800);
	});
});
