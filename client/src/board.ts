import type { Grid, Piece } from "./types";

export const GRID_ROWS = 20;
export const GRID_COLS = 10;
export const EMPTY = " ";

export interface BoardCell {
	value: string;
	ghost: boolean;
}

export function createEmptyGrid(): Grid {
	return Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(EMPTY));
}

function filledCells(piece: Piece, y = piece.pos.y) {
	return piece.shape.flatMap((row, dy) =>
		row.flatMap((value, dx) =>
			value === EMPTY ? [] : [{ x: piece.pos.x + dx, y: y + dy, value }],
		),
	);
}

function fits(grid: Grid, piece: Piece, y: number): boolean {
	return filledCells(piece, y).every(
		(cell) =>
			cell.y < GRID_ROWS && (cell.y < 0 || grid[cell.y][cell.x] === EMPTY),
	);
}

export function findGhostY(grid: Grid, piece: Piece): number {
	let y = piece.pos.y;
	while (fits(grid, piece, y + 1)) y++;
	return y;
}

export function composeBoard(grid: Grid, piece?: Piece): BoardCell[][] {
	const board = grid.map((row) =>
		row.map((value) => ({ value, ghost: false })),
	);
	if (!piece) return board;

	const paint = (y: number, ghost: boolean) => {
		for (const cell of filledCells(piece, y)) {
			if (board[cell.y]?.[cell.x])
				board[cell.y][cell.x] = { value: cell.value, ghost };
		}
	};
	const ghostY = findGhostY(grid, piece);
	if (ghostY > piece.pos.y) paint(ghostY, true);
	paint(piece.pos.y, false);
	return board;
}
