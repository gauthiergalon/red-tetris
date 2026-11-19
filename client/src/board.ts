import type { Grid, Piece } from "./types";

export const GRID_ROWS = 20;
export const GRID_COLS = 10;
export const EMPTY = " ";

export interface BoardCell {
	value: string;
	ghost: boolean;
}

interface Cell {
	x: number;
	y: number;
	value: string;
}

export function createEmptyGrid(): Grid {
	const grid: Grid = [];
	for (let y = 0; y < GRID_ROWS; y++) {
		grid.push(Array(GRID_COLS).fill(EMPTY));
	}
	return grid;
}

function filledCells(piece: Piece, top: number): Cell[] {
	const cells: Cell[] = [];
	for (let dy = 0; dy < piece.shape.length; dy++) {
		for (let dx = 0; dx < piece.shape[dy].length; dx++) {
			const value = piece.shape[dy][dx];
			if (value !== EMPTY) {
				cells.push({ x: piece.pos.x + dx, y: top + dy, value: value });
			}
		}
	}
	return cells;
}

function fits(grid: Grid, piece: Piece, y: number): boolean {
	for (const cell of filledCells(piece, y)) {
		if (cell.y >= GRID_ROWS) return false;
		if (cell.y >= 0 && grid[cell.y][cell.x] !== EMPTY) return false;
	}
	return true;
}

function isOnBoard(board: BoardCell[][], cell: Cell): boolean {
	if (cell.y < 0 || cell.y >= board.length) return false;
	return cell.x >= 0 && cell.x < board[cell.y].length;
}

function paint(board: BoardCell[][], piece: Piece, y: number, ghost: boolean) {
	for (const cell of filledCells(piece, y)) {
		if (isOnBoard(board, cell)) {
			board[cell.y][cell.x] = { value: cell.value, ghost: ghost };
		}
	}
}

export function findGhostY(grid: Grid, piece: Piece): number {
	let y = piece.pos.y;
	while (fits(grid, piece, y + 1)) y++;
	return y;
}

export function composeBoard(grid: Grid, piece?: Piece): BoardCell[][] {
	const board: BoardCell[][] = [];
	for (const row of grid) {
		const boardRow: BoardCell[] = [];
		for (const value of row) {
			boardRow.push({ value: value, ghost: false });
		}
		board.push(boardRow);
	}
	if (!piece) return board;

	const ghostY = findGhostY(grid, piece);
	if (ghostY > piece.pos.y) paint(board, piece, ghostY, true);
	paint(board, piece, piece.pos.y, false);
	return board;
}
