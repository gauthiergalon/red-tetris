export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export type Grid = string[][];

export interface Piece {
	shape: string[][];
	pos: { x: number; y: number };
}

export interface PiecePreview {
	type: string;
	shape: string[][];
}

export interface GameState {
	grid: Grid;
	piece: Piece | undefined;
	playing: boolean;
	score: number;
	lines: number;
	next: PiecePreview[];
	hold: PiecePreview | null;
	canHold: boolean;
}

export interface PlayerSummary {
	id: string;
	username: string;
	alive: boolean;
	inGame: boolean;
	connected: boolean;
	score: number;
	spectrum: number[];
}

export interface RoomSnapshot {
	id: string;
	status: "waiting" | "countdown" | "playing";
	hostId: string | undefined;
	countdown: number | null;
	difficulty: Difficulty;
	players: PlayerSummary[];
}

export interface GameResult {
	winner: { id: string; username: string } | null;
}
