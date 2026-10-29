export interface GameState {
	piece: Piece | undefined;
	grid: string[][];
	lockDelay: number;
	playing: boolean;
}

export interface Piece {
	shape: string[][];
	pos: { x: number; y: number };
}

export const GRID_COLS = 10;
export const GRID_ROWS = 20;

export const DIRECTIONS = {
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	down: { x: 0, y: 1 },
} as const;

export type Direction = keyof typeof DIRECTIONS;

export const PIECES: string[][][] = [
	[
		[" ", " ", " ", " "],
		["I", "I", "I", "I"],
		[" ", " ", " ", " "],
		[" ", " ", " ", " "],
	],
	[
		["O", "O"],
		["O", "O"],
	],
	[
		[" ", "T", " "],
		["T", "T", "T"],
		[" ", " ", " "],
	],
	[
		[" ", "S", "S"],
		["S", "S", " "],
		[" ", " ", " "],
	],
	[
		["Z", "Z", " "],
		[" ", "Z", "Z"],
		[" ", " ", " "],
	],
	[
		["J", " ", " "],
		["J", "J", "J"],
		[" ", " ", " "],
	],
	[
		[" ", " ", "L"],
		["L", "L", "L"],
		[" ", " ", " "],
	],
];

export function createInitialState(): GameState {
	return {
		piece: undefined,
		grid: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(" ")),
		lockDelay: 0,
		playing: false,
	};
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

export function isColliding(grid: string[][], piece: Piece): boolean {
	if (!piece) return false;
	for (let y = 0; y < piece.shape.length; y++) {
		for (let x = 0; x < piece.shape[y].length; x++) {
			if (piece.shape[y][x] !== " ") {
				const gridX = piece.pos.x + x;
				const gridY = piece.pos.y + y;
				if (
					gridX < 0 ||
					gridX >= GRID_COLS ||
					gridY < 0 ||
					gridY >= GRID_ROWS ||
					grid[gridY][gridX] !== " "
				) {
					return true;
				}
			}
		}
	}
	return false;
}

export function clearLines(grid: string[][]): string[][] {
	const keptRows = grid.filter((row) => !row.every((cell) => cell !== " "));
	const removedCount = grid.length - keptRows.length;
	const newRows = Array.from({ length: removedCount }, () =>
		Array(GRID_COLS).fill(" "),
	);
	return [...newRows, ...keptRows];
}
