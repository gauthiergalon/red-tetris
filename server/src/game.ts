export type Grid = string[][];

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export interface Position {
	x: number;
	y: number;
}

export interface PieceData {
	shape: string[][];
	pos: Position;
	type: PieceType;
	rotationState: number;
}

export const GRID_COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const GRID_ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const EMPTY_CELL = " ";

export const PENALTY_CELL = "X";

export function spawnPosition(type: PieceType): Position {
	return { x: type === "O" ? 4 : 3, y: HIDDEN_ROWS - 1 };
}

export type RotationDirection = "cw" | "ccw";

type Kick = [number, number];

const JLSTZ_CLOCKWISE_KICKS: Kick[][] = [
	[
		[0, 0],
		[-1, 0],
		[-1, 1],
		[0, -2],
		[-1, -2],
	],
	[
		[0, 0],
		[1, 0],
		[1, -1],
		[0, 2],
		[1, 2],
	],
	[
		[0, 0],
		[1, 0],
		[1, 1],
		[0, -2],
		[1, -2],
	],
	[
		[0, 0],
		[-1, 0],
		[-1, -1],
		[0, 2],
		[-1, 2],
	],
];

const I_CLOCKWISE_KICKS: Kick[][] = [
	[
		[0, 0],
		[-2, 0],
		[1, 0],
		[-2, -1],
		[1, 2],
	],
	[
		[0, 0],
		[-1, 0],
		[2, 0],
		[-1, 2],
		[2, -1],
	],
	[
		[0, 0],
		[2, 0],
		[-1, 0],
		[2, 1],
		[-1, -2],
	],
	[
		[0, 0],
		[1, 0],
		[-2, 0],
		[1, -2],
		[-2, 1],
	],
];

function negate(value: number): number {
	if (value === 0) return 0;
	return -value;
}

export function kicksFor(
	type: PieceType,
	fromState: number,
	direction: RotationDirection,
): Position[] {
	let table = JLSTZ_CLOCKWISE_KICKS;
	if (type === "I") table = I_CLOCKWISE_KICKS;

	const offsets: Position[] = [];
	if (direction === "cw") {
		for (const [x, yUp] of table[fromState]) {
			offsets.push({ x: x, y: negate(yUp) });
		}
	} else {
		const previousState = (fromState + 3) % 4;
		for (const [x, yUp] of table[previousState]) {
			offsets.push({ x: negate(x), y: yUp });
		}
	}
	return offsets;
}

export type Direction = "left" | "right" | "down";

export const DIRECTIONS: Record<Direction, Position> = {
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	down: { x: 0, y: 1 },
};

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

export function createEmptyRow(fill: string = EMPTY_CELL): string[] {
	return Array(GRID_COLS).fill(fill);
}

export function createEmptyGrid(): Grid {
	const grid: Grid = [];
	for (let y = 0; y < GRID_ROWS; y++) {
		grid.push(createEmptyRow());
	}
	return grid;
}

export interface Cell extends Position {
	value: string;
}

export function pieceCells(piece: PieceData): Cell[] {
	const cells: Cell[] = [];
	for (let dy = 0; dy < piece.shape.length; dy++) {
		for (let dx = 0; dx < piece.shape[dy].length; dx++) {
			const value = piece.shape[dy][dx];
			if (value !== EMPTY_CELL) {
				cells.push({ x: piece.pos.x + dx, y: piece.pos.y + dy, value });
			}
		}
	}
	return cells;
}

function isInsideBoard({ x, y }: Position): boolean {
	return x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS;
}

export function visibleRows(grid: Grid): Grid {
	return grid.slice(HIDDEN_ROWS);
}

export function toVisiblePosition({ x, y }: Position): Position {
	return { x, y: y - HIDDEN_ROWS };
}

export function isLockedOut(piece: PieceData): boolean {
	return pieceCells(piece).every((cell) => cell.y < HIDDEN_ROWS);
}

export function mergePiece(grid: Grid, piece: PieceData): Grid {
	const newGrid = grid.map((row) => [...row]);
	for (const cell of pieceCells(piece)) {
		if (isInsideBoard(cell)) newGrid[cell.y][cell.x] = cell.value;
	}
	return newGrid;
}

function isClearable(row: string[]): boolean {
	return row.every((cell) => cell !== EMPTY_CELL && cell !== PENALTY_CELL);
}

export function clearLines(grid: Grid): { grid: Grid; cleared: number } {
	const keptRows: Grid = [];
	for (const row of grid) {
		if (!isClearable(row)) keptRows.push([...row]);
	}
	const cleared = grid.length - keptRows.length;

	const newGrid: Grid = [];
	for (let i = 0; i < cleared; i++) {
		newGrid.push(createEmptyRow());
	}
	for (const row of keptRows) {
		newGrid.push(row);
	}
	return { grid: newGrid, cleared: cleared };
}

export function addPenaltyLines(
	grid: Grid,
	count: number,
): { grid: Grid; overflow: boolean } {
	const added = Math.max(0, Math.min(count, grid.length));

	let overflow = false;
	for (let y = 0; y < added; y++) {
		if (grid[y].some((cell) => cell !== EMPTY_CELL)) overflow = true;
	}

	const newGrid: Grid = [];
	for (let y = added; y < grid.length; y++) {
		newGrid.push([...grid[y]]);
	}
	for (let i = 0; i < added; i++) {
		newGrid.push(createEmptyRow(PENALTY_CELL));
	}
	return { grid: newGrid, overflow: overflow };
}

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export const BASE_GRAVITY_MS: Record<Difficulty, number> = {
	easy: 800,
	medium: 500,
	hard: 250,
};

export const LINES_PER_LEVEL = 10;

export const LEVEL_SPEEDUP = 0.8;

export const MIN_GRAVITY_MS = 50;

export function isDifficulty(value: unknown): value is Difficulty {
	return value === "easy" || value === "medium" || value === "hard";
}

export function gravityDelay(difficulty: Difficulty, lines: number): number {
	const level = Math.floor(Math.max(0, lines) / LINES_PER_LEVEL);
	const delay = BASE_GRAVITY_MS[difficulty] * LEVEL_SPEEDUP ** level;
	return Math.max(MIN_GRAVITY_MS, Math.round(delay));
}

export const LINE_CLEAR_SCORES = [0, 100, 300, 500, 800];

export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;

export function lineClearScore(cleared: number): number {
	return LINE_CLEAR_SCORES[Math.max(0, Math.min(cleared, 4))];
}

export function penaltyFor(cleared: number): number {
	return Math.max(0, cleared - 1);
}

function columnHeight(grid: Grid, x: number): number {
	for (let y = 0; y < grid.length; y++) {
		if (grid[y][x] !== EMPTY_CELL) return grid.length - y;
	}
	return 0;
}

export function computeSpectrum(grid: Grid): number[] {
	const heights: number[] = [];
	for (let x = 0; x < grid[0].length; x++) {
		heights.push(columnHeight(grid, x));
	}
	return heights;
}

export function getShape(type: PieceType): string[][] {
	return PIECES_SHAPES[type].map((row) => [...row]);
}

export function rotateShape(shape: string[][]): string[][] {
	const rows = shape.length;
	const cols = shape[0].length;
	const rotated: string[][] = [];
	for (let x = 0; x < cols; x++) {
		const newRow: string[] = [];
		for (let y = rows - 1; y >= 0; y--) {
			newRow.push(shape[y][x]);
		}
		rotated.push(newRow);
	}
	return rotated;
}

export function rotateShapeCounterClockwise(shape: string[][]): string[][] {
	const rows = shape.length;
	const cols = shape[0].length;
	const rotated: string[][] = [];
	for (let x = cols - 1; x >= 0; x--) {
		const newRow: string[] = [];
		for (let y = 0; y < rows; y++) {
			newRow.push(shape[y][x]);
		}
		rotated.push(newRow);
	}
	return rotated;
}

export function isDirection(value: unknown): value is Direction {
	return value === "left" || value === "right" || value === "down";
}

export function isColliding(grid: Grid, piece: PieceData): boolean {
	return pieceCells(piece).some(
		(cell) => !isInsideBoard(cell) || grid[cell.y][cell.x] !== EMPTY_CELL,
	);
}

export function offsetPosition(
	pos: Position,
	dx: number,
	dy: number,
): Position {
	return { x: pos.x + dx, y: pos.y + dy };
}

export interface Rotation {
	shape: string[][];
	pos: Position;
	rotationState: number;
}

export function rotateWithKicks(
	grid: Grid,
	piece: PieceData,
	direction: RotationDirection = "cw",
): Rotation | null {
	if (piece.type === "O") return null;

	let shape: string[][];
	let rotationState: number;
	if (direction === "cw") {
		shape = rotateShape(piece.shape);
		rotationState = (piece.rotationState + 1) % 4;
	} else {
		shape = rotateShapeCounterClockwise(piece.shape);
		rotationState = (piece.rotationState + 3) % 4;
	}

	for (const offset of kicksFor(piece.type, piece.rotationState, direction)) {
		const candidate: PieceData = {
			type: piece.type,
			shape: shape,
			rotationState: rotationState,
			pos: offsetPosition(piece.pos, offset.x, offset.y),
		};
		if (!isColliding(grid, candidate)) {
			return { shape, pos: candidate.pos, rotationState };
		}
	}

	return null;
}

export function dropPosition(grid: Grid, piece: PieceData): Position {
	let pos = piece.pos;
	while (true) {
		const below = offsetPosition(pos, 0, 1);
		const candidate: PieceData = {
			type: piece.type,
			shape: piece.shape,
			rotationState: piece.rotationState,
			pos: below,
		};
		if (isColliding(grid, candidate)) return pos;
		pos = below;
	}
}

export function generateBag(random: () => number = Math.random): PieceType[] {
	const bag = [...PIECE_TYPES];
	for (let i = bag.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		const temp = bag[i];
		bag[i] = bag[j];
		bag[j] = temp;
	}
	return bag;
}
