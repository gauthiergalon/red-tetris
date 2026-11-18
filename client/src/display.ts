// Pure display helpers (no React, no `this`): easy to test.

export interface PlayerSummary {
	id: string;
	username: string;
	alive: boolean;
	inGame: boolean;
	spectrum: number[];
}

export interface RoomSnapshot {
	id: string;
	status: "waiting" | "playing";
	hostId: string | undefined;
	players: PlayerSummary[];
}

export interface GameResult {
	winner: { id: string; username: string } | null;
}

/**
 * Turns a spectrum (height of each column) into rows of booleans:
 * true where the column is filled up to that row.
 */
export function spectrumToRows(spectrum: number[], rows: number): boolean[][] {
	return Array.from({ length: rows }, (_, y) =>
		spectrum.map((height) => y >= rows - height),
	);
}

/** Every player of the room except me. */
export function getOpponents(
	room: RoomSnapshot | null,
	myId: string | undefined,
): PlayerSummary[] {
	return room?.players.filter((player) => player.id !== myId) ?? [];
}

export type StatusMessage =
	| "Victory"
	| "Game Over"
	| "Waiting for the next game";

/**
 * What to show under my board:
 * - "Victory" if I am the winner of the last game,
 * - "Game Over" if I lost (dead during the game, or another player won),
 * - "Waiting for the next game" if I joined while a game was running,
 * - null before the first game and while I am playing.
 */
export function getStatusMessage(
	room: RoomSnapshot | null,
	result: GameResult | null,
	myId: string | undefined,
): StatusMessage | null {
	const me = room?.players.find((player) => player.id === myId);
	if (!room || !me) return null;
	if (!me.inGame)
		return room.status === "playing" ? "Waiting for the next game" : null;
	if (room.status === "playing") return me.alive ? null : "Game Over";
	if (!result) return null;
	return result.winner?.id === myId ? "Victory" : "Game Over";
}
