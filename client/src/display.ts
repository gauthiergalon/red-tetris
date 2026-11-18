import type { GameResult, PlayerSummary, RoomSnapshot } from "./types";

export function spectrumToRows(spectrum: number[], rows: number): boolean[][] {
	return Array.from({ length: rows }, (_, y) =>
		spectrum.map((height) => y >= rows - height),
	);
}

export function getOpponents(
	room: RoomSnapshot | null,
	myId: string | undefined,
): PlayerSummary[] {
	return room?.players.filter((player) => player.id !== myId) ?? [];
}

export function isEliminated(player: PlayerSummary): boolean {
	return player.inGame && !player.alive;
}

export function isHost(room: RoomSnapshot | null, playerId?: string): boolean {
	return room !== null && room.hostId === playerId;
}

export function canConfigureGame(
	room: RoomSnapshot | null,
	myId: string | undefined,
): boolean {
	return room?.status === "waiting" && isHost(room, myId);
}

export function opponentTags(
	opponent: PlayerSummary,
	room: RoomSnapshot | null,
): string {
	const playing = room?.status === "playing";
	const tags = [
		isHost(room, opponent.id) && "host",
		!opponent.connected && "disconnected",
		playing && !opponent.inGame && "waiting",
		playing && opponent.inGame && !opponent.alive && "out",
	];
	return tags
		.filter(Boolean)
		.map((tag) => ` (${tag})`)
		.join("");
}

export type StatusMessage =
	| "Victory"
	| "Game Over"
	| "Waiting for the next game"
	| `Starting in ${number}`;

export function getStatusMessage(
	room: RoomSnapshot | null,
	result: GameResult | null,
	myId: string | undefined,
): StatusMessage | null {
	const me = room?.players.find((player) => player.id === myId);
	if (!room || !me) return null;
	if (room.status === "countdown") return `Starting in ${room.countdown ?? 0}`;
	if (room.status === "playing") {
		if (!me.inGame) return "Waiting for the next game";
		return me.alive ? null : "Game Over";
	}
	if (!me.inGame || !result) return null;
	return result.winner?.id === myId ? "Victory" : "Game Over";
}
