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

type GuidelineKick = readonly [x: number, yPointingUp: number];

const JLSTZ_CLOCKWISE_KICKS: GuidelineKick[][] = [
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

const I_CLOCKWISE_KICKS: GuidelineKick[][] = [
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

function toBoardOffset([x, yPointingUp]: GuidelineKick): Position {
	return { x: x || 0, y: -yPointingUp || 0 };
}

function opposite([x, y]: GuidelineKick): GuidelineKick {
	return [-x, -y];
}

export function kicksFor(
	type: PieceType,
	fromState: number,
	direction: RotationDirection,
): Position[] {
	const clockwiseKicks =
		type === "I" ? I_CLOCKWISE_KICKS : JLSTZ_CLOCKWISE_KICKS;
	if (direction === "cw") return clockwiseKicks[fromState].map(toBoardOffset);

	const previousState = (fromState + 3) % 4;
	return clockwiseKicks[previousState].map((kick) =>
		toBoardOffset(opposite(kick)),
	);
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

export function createEmptyRow(fill: string = EMPTY_CELL): string[] {
	return Array(GRID_COLS).fill(fill);
}

export function createEmptyGrid(): Grid {
	return Array.from({ length: GRID_ROWS }, () => createEmptyRow());
}

export interface Cell extends Position {
	value: string;
}

export function pieceCells(piece: PieceData): Cell[] {
	return piece.shape.flatMap((row, dy) =>
		row.flatMap((value, dx) =>
			value === EMPTY_CELL
				? []
				: [{ x: piece.pos.x + dx, y: piece.pos.y + dy, value }],
		),
	);
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
	const keptRows = grid.filter((row) => !isClearable(row));
	const cleared = grid.length - keptRows.length;
	const newRows = Array.from({ length: cleared }, () => createEmptyRow());

	return { grid: [...newRows, ...keptRows.map((row) => [...row])], cleared };
}

export function addPenaltyLines(
	grid: Grid,
	count: number,
): { grid: Grid; overflow: boolean } {
	const added = Math.max(0, Math.min(count, grid.length));
	const pushedOutRows = grid.slice(0, added);
	const overflow = pushedOutRows.some((row) =>
		row.some((cell) => cell !== EMPTY_CELL),
	);
	const penaltyRows = Array.from({ length: added }, () =>
		createEmptyRow(PENALTY_CELL),
	);

	return {
		grid: [...grid.slice(added).map((row) => [...row]), ...penaltyRows],
		overflow,
	};
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
	return (
		typeof value === "string" && DIFFICULTIES.includes(value as Difficulty)
	);
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
	const highestBlock = grid.findIndex((row) => row[x] !== EMPTY_CELL);
	return highestBlock === -1 ? 0 : grid.length - highestBlock;
}

export function computeSpectrum(grid: Grid): number[] {
	return grid[0].map((_, x) => columnHeight(grid, x));
}

export function getShape(type: PieceType): string[][] {
	return PIECES_SHAPES[type].map((row) => [...row]);
}

export function rotateShape(shape: string[][]): string[][] {
	const rows = shape.length;
	return shape[0].map((_, x) =>
		Array.from({ length: rows }, (_, k) => shape[rows - 1 - k][x]),
	);
}

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

export function dropPosition(grid: Grid, piece: PieceData): Position {
	let pos = piece.pos;
	while (!isColliding(grid, { ...piece, pos: offsetPosition(pos, 0, 1) })) {
		pos = offsetPosition(pos, 0, 1);
	}
	return pos;
}

export function generateBag(random: () => number = Math.random): PieceType[] {
	const bag = [...PIECE_TYPES];
	for (let i = bag.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[bag[i], bag[j]] = [bag[j], bag[i]];
	}
	return bag;
}
