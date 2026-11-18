// -----------------------------------------------------------------------------
// Pure Tetris engine.
//
// Every function in this file is pure: it never mutates its arguments and never
// reads global mutable state. The server classes (Game, Player, Piece) call
// these functions; that keeps the rules easy to test in isolation.
// -----------------------------------------------------------------------------

export type Grid = string[][];

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export interface Position {
	x: number;
	y: number;
}

/** Plain data describing a piece. The `Piece` class implements it. */
export interface PieceData {
	shape: string[][];
	pos: Position;
	type: PieceType;
	rotationState: number;
}

export const GRID_COLS = 10;
export const GRID_ROWS = 20;

export const EMPTY_CELL = " ";

/** Cell used for penalty lines. It blocks pieces but is never cleared. */
export const PENALTY_CELL = "X";

/**
 * Spawn position (top-left of the bounding box), as in the official games:
 * 3-wide pieces on columns 3-5, I on columns 3-6, O on columns 4-5. The I
 * bounding box starts one row above the board so that the I appears on the
 * top row (its first row is empty).
 */
export function spawnPosition(type: PieceType): Position {
	if (type === "O") return { x: 4, y: 0 };
	if (type === "I") return { x: 3, y: -1 };
	return { x: 3, y: 0 };
}

export type RotationDirection = "cw" | "ccw";

/**
 * Official SRS wall kicks, copied as they appear in the guideline, where
 * y points UP. Index = starting rotation state (0 = spawn, 1 = R, 2 = 2,
 * 3 = L); these are the clockwise tests (0->R, R->2, 2->L, L->0).
 *
 * Counter-clockwise tests are not stored: in SRS, the kicks of a->b are the
 * kicks of b->a with opposite signs.
 *
 * The board's y points DOWN, so kicksFor() flips the sign of y. Forgetting
 * that flip makes every vertical kick go the wrong way.
 */
const SRS_JLSTZ_CW_KICKS = [
	// 0 -> R
	[
		[0, 0],
		[-1, 0],
		[-1, 1],
		[0, -2],
		[-1, -2],
	],
	// R -> 2
	[
		[0, 0],
		[1, 0],
		[1, -1],
		[0, 2],
		[1, 2],
	],
	// 2 -> L
	[
		[0, 0],
		[1, 0],
		[1, 1],
		[0, -2],
		[1, -2],
	],
	// L -> 0
	[
		[0, 0],
		[-1, 0],
		[-1, -1],
		[0, 2],
		[-1, 2],
	],
];

const SRS_I_CW_KICKS = [
	// 0 -> R
	[
		[0, 0],
		[-2, 0],
		[1, 0],
		[-2, -1],
		[1, 2],
	],
	// R -> 2
	[
		[0, 0],
		[-1, 0],
		[2, 0],
		[-1, 2],
		[2, -1],
	],
	// 2 -> L
	[
		[0, 0],
		[2, 0],
		[-1, 0],
		[2, 1],
		[-1, -2],
	],
	// L -> 0
	[
		[0, 0],
		[1, 0],
		[-2, 0],
		[1, -2],
		[-2, 1],
	],
];

/**
 * Kick offsets to test, in board coordinates (y down), for a rotation of
 * `type` from rotation state `from` in `direction`.
 */
export function kicksFor(
	type: PieceType,
	from: number,
	direction: RotationDirection,
): Position[] {
	const table = type === "I" ? SRS_I_CW_KICKS : SRS_JLSTZ_CW_KICKS;
	if (direction === "cw") {
		return table[from].map(([x, y]) => ({ x, y: -y || 0 }));
	}
	// ccw from `from` = reverse of cw from `from - 1`.
	const previous = (from + 3) % 4;
	return table[previous].map(([x, y]) => ({ x: -x || 0, y }));
}

export const DIRECTIONS = {
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	down: { x: 0, y: 1 },
} as const;

export type Direction = keyof typeof DIRECTIONS;

export const PIECE_TYPES: readonly PieceType[] = [
	"I",
	"O",
	"T",
	"S",
	"Z",
	"J",
	"L",
];

export const PIECES_SHAPES: Record<PieceType, string[][]> = {
	I: [
		[" ", " ", " ", " "],
		["I", "I", "I", "I"],
		[" ", " ", " ", " "],
		[" ", " ", " ", " "],
	],
	O: [
		["O", "O"],
		["O", "O"],
	],
	T: [
		[" ", "T", " "],
		["T", "T", "T"],
		[" ", " ", " "],
	],
	S: [
		[" ", "S", "S"],
		["S", "S", " "],
		[" ", " ", " "],
	],
	Z: [
		["Z", "Z", " "],
		[" ", "Z", "Z"],
		[" ", " ", " "],
	],
	J: [
		["J", " ", " "],
		["J", "J", "J"],
		[" ", " ", " "],
	],
	L: [
		[" ", " ", "L"],
		["L", "L", "L"],
		[" ", " ", " "],
	],
};

// -----------------------------------------------------------------------------
// Grid
// -----------------------------------------------------------------------------

export function createEmptyRow(fill: string = EMPTY_CELL): string[] {
	return Array(GRID_COLS).fill(fill);
}

export function createEmptyGrid(): Grid {
	return Array.from({ length: GRID_ROWS }, () => createEmptyRow());
}

/** Returns a copy of the grid with the piece written into it. */
export function mergePiece(grid: Grid, piece: PieceData): Grid {
	const newGrid = grid.map((row) => [...row]);

	for (let y = 0; y < piece.shape.length; y++) {
		for (let x = 0; x < piece.shape[y].length; x++) {
			const cell = piece.shape[y][x];
			if (cell === EMPTY_CELL) continue;

			const gridX = piece.pos.x + x;
			const gridY = piece.pos.y + y;
			const row = newGrid[gridY];

			// Cells outside the board are not written.
			if (!row || gridX < 0 || gridX >= row.length) continue;

			row[gridX] = cell;
		}
	}

	return newGrid;
}

function isClearableRow(row: string[]): boolean {
	return row.every((cell) => cell !== EMPTY_CELL && cell !== PENALTY_CELL);
}

/**
 * Removes every full row and returns the new grid plus the number of rows
 * removed. Rows containing a penalty cell are never cleared.
 */
export function clearLines(grid: Grid): { grid: Grid; cleared: number } {
	const keptRows = grid.filter((row) => !isClearableRow(row));
	const cleared = grid.length - keptRows.length;
	const newRows = Array.from({ length: cleared }, () => createEmptyRow());

	return { grid: [...newRows, ...keptRows.map((row) => [...row])], cleared };
}

/**
 * Pushes `count` indestructible lines from the bottom. The top rows are pushed
 * out of the board; `overflow` tells whether one of them was not empty.
 */
export function addPenaltyLines(
	grid: Grid,
	count: number,
): { grid: Grid; overflow: boolean } {
	const n = Math.max(0, Math.min(count, grid.length));
	const removedRows = grid.slice(0, n);
	const overflow = removedRows.some((row) =>
		row.some((cell) => cell !== EMPTY_CELL),
	);
	const penaltyRows = Array.from({ length: n }, () =>
		createEmptyRow(PENALTY_CELL),
	);

	return {
		grid: [...grid.slice(n).map((row) => [...row]), ...penaltyRows],
		overflow,
	};
}

/** Points for 0, 1, 2, 3 and 4 lines cleared at once (guideline, level 1). */
export const LINE_CLEAR_SCORES = [0, 100, 300, 500, 800];
/** Points per row for a soft drop and a hard drop (guideline). */
export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;

export function lineClearScore(cleared: number): number {
	return LINE_CLEAR_SCORES[Math.max(0, Math.min(cleared, 4))];
}

/**
 * Number of penalty lines sent to each opponent when a player clears `cleared`
 * lines at once (n - 1, as required by the subject).
 */
export function penaltyFor(cleared: number): number {
	return Math.max(0, cleared - 1);
}

/**
 * Spectrum of a board: for each column, the height of the highest occupied
 * cell (0 for an empty column, GRID_ROWS for a full one).
 */
export function computeSpectrum(grid: Grid): number[] {
	const rows = grid.length;
	const cols = grid[0]?.length ?? 0;
	const spectrum: number[] = [];

	for (let x = 0; x < cols; x++) {
		let height = 0;
		for (let y = 0; y < rows; y++) {
			if (grid[y][x] !== EMPTY_CELL) {
				height = rows - y;
				break;
			}
		}
		spectrum.push(height);
	}

	return spectrum;
}

// -----------------------------------------------------------------------------
// Pieces
// -----------------------------------------------------------------------------

export function getShape(type: PieceType): string[][] {
	return PIECES_SHAPES[type].map((row) => [...row]);
}

/** Clockwise rotation of a shape inside its bounding box. */
export function rotateShape(shape: string[][]): string[][] {
	const rows = shape.length;
	return shape[0].map((_, x) =>
		Array.from({ length: rows }, (_, k) => shape[rows - 1 - k][x]),
	);
}

/** Counter-clockwise rotation of a shape inside its bounding box. */
export function rotateShapeCounterClockwise(shape: string[][]): string[][] {
	const cols = shape[0].length;
	return Array.from({ length: cols }, (_, y) =>
		shape.map((row) => row[cols - 1 - y]),
	);
}

export function isDirection(value: unknown): value is Direction {
	return typeof value === "string" && Object.hasOwn(DIRECTIONS, value);
}

export function isColliding(grid: Grid, piece: PieceData): boolean {
	for (let y = 0; y < piece.shape.length; y++) {
		for (let x = 0; x < piece.shape[y].length; x++) {
			if (piece.shape[y][x] === EMPTY_CELL) continue;

			const gridX = piece.pos.x + x;
			const gridY = piece.pos.y + y;

			if (
				gridX < 0 ||
				gridX >= GRID_COLS ||
				gridY < 0 ||
				gridY >= GRID_ROWS ||
				grid[gridY][gridX] !== EMPTY_CELL
			) {
				return true;
			}
		}
	}
	return false;
}

export function offsetPosition(
	pos: Position,
	dx: number,
	dy: number,
): Position {
	return { x: pos.x + dx, y: pos.y + dy };
}

/**
 * Tries an SRS rotation: rotates the shape, then tests the 5 kick offsets in
 * order and keeps the first position that fits. Returns null when none fits.
 * The O piece never rotates (its shape and position would not change).
 */
export function rotateWithKicks(
	grid: Grid,
	piece: PieceData,
	direction: RotationDirection = "cw",
): Pick<PieceData, "shape" | "pos" | "rotationState"> | null {
	if (piece.type === "O") return null;

	const shape =
		direction === "cw"
			? rotateShape(piece.shape)
			: rotateShapeCounterClockwise(piece.shape);
	const rotationState =
		(piece.rotationState + (direction === "cw" ? 1 : 3)) % 4;

	for (const offset of kicksFor(piece.type, piece.rotationState, direction)) {
		const candidate: PieceData = {
			...piece,
			shape,
			rotationState,
			pos: offsetPosition(piece.pos, offset.x, offset.y),
		};
		if (!isColliding(grid, candidate)) {
			return { shape, pos: candidate.pos, rotationState };
		}
	}

	return null;
}

/** Lowest position the piece can reach by falling straight down. */
export function dropPosition(grid: Grid, piece: PieceData): Position {
	let pos = piece.pos;
	while (!isColliding(grid, { ...piece, pos: offsetPosition(pos, 0, 1) })) {
		pos = offsetPosition(pos, 0, 1);
	}
	return pos;
}

// -----------------------------------------------------------------------------
// Piece sequence
// -----------------------------------------------------------------------------

/** A shuffled "7-bag". `random` is injectable so tests are deterministic. */
export function generateBag(random: () => number = Math.random): PieceType[] {
	const bag = [...PIECE_TYPES];
	for (let i = bag.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[bag[i], bag[j]] = [bag[j], bag[i]];
	}
	return bag;
}
