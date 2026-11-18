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

export const SPAWN_POSITION: Position = { x: 3, y: 0 };

export const SRS_COMMON_TABLES = [
	// 0 -> 1
	[
		{ x: 0, y: 0 },
		{ x: -1, y: 0 },
		{ x: -1, y: 1 },
		{ x: 0, y: -2 },
		{ x: -1, y: -2 },
	],
	// 1 -> 2
	[
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 1, y: -1 },
		{ x: 0, y: 2 },
		{ x: 1, y: 2 },
	],
	// 2 -> 3
	[
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 1, y: 1 },
		{ x: 0, y: -2 },
		{ x: 1, y: -2 },
	],
	// 3 -> 0
	[
		{ x: 0, y: 0 },
		{ x: -1, y: 0 },
		{ x: -1, y: -1 },
		{ x: 0, y: 2 },
		{ x: -1, y: 2 },
	],
];

export const SRS_I_TABLES = [
	// 0 -> 1
	[
		{ x: 0, y: 0 },
		{ x: -2, y: 0 },
		{ x: 1, y: 0 },
		{ x: -2, y: -1 },
		{ x: 1, y: 2 },
	],
	// 1 -> 2
	[
		{ x: 0, y: 0 },
		{ x: -1, y: 0 },
		{ x: 2, y: 0 },
		{ x: -1, y: 2 },
		{ x: 2, y: -1 },
	],
	// 2 -> 3
	[
		{ x: 0, y: 0 },
		{ x: 2, y: 0 },
		{ x: -1, y: 0 },
		{ x: 2, y: 1 },
		{ x: -1, y: -2 },
	],
	// 3 -> 0
	[
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: -2, y: 0 },
		{ x: 1, y: -2 },
		{ x: -2, y: 1 },
	],
];

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

export function rotateShape(shape: string[][]): string[][] {
	const rotatedShape: string[][] = [];
	const rows = shape.length;
	const cols = shape[0].length;

	for (let x = 0; x < cols; x++) {
		const newRow: string[] = [];
		for (let y = rows - 1; y >= 0; y--) {
			newRow.push(shape[y][x]);
		}
		rotatedShape.push(newRow);
	}

	return rotatedShape;
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
 * Tries an SRS clockwise rotation. Returns the new shape, position and
 * rotation state, or null when every kick collides.
 */
export function rotateWithKicks(
	grid: Grid,
	piece: PieceData,
): Pick<PieceData, "shape" | "pos" | "rotationState"> | null {
	const shape = rotateShape(piece.shape);
	const rotationState = (piece.rotationState + 1) % 4;
	const tables = piece.type === "I" ? SRS_I_TABLES : SRS_COMMON_TABLES;

	for (const offset of tables[piece.rotationState]) {
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
