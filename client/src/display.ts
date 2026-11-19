import type { GameResult, PlayerSummary, RoomSnapshot } from "./types";

export function spectrumToRows(spectrum: number[], rows: number): boolean[][] {
	const result: boolean[][] = [];
	for (let y = 0; y < rows; y++) {
		const row: boolean[] = [];
		for (const height of spectrum) {
			row.push(y >= rows - height);
		}
		result.push(row);
	}
	return result;
}

export function getOpponents(
	room: RoomSnapshot | null,
	myId: string | undefined,
): PlayerSummary[] {
	if (!room) return [];
	return room.players.filter((player) => player.id !== myId);
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
	if (!room) return false;
	return room.status === "waiting" && isHost(room, myId);
}

export function opponentTags(
	opponent: PlayerSummary,
	room: RoomSnapshot | null,
): string {
	const playing = room !== null && room.status === "playing";
	let tags = "";
	if (isHost(room, opponent.id)) tags += " (host)";
	if (!opponent.connected) tags += " (disconnected)";
	if (playing && !opponent.inGame) tags += " (waiting)";
	if (playing && opponent.inGame && !opponent.alive) tags += " (out)";
	return tags;
}

export function getStatusMessage(
	room: RoomSnapshot | null,
	result: GameResult | null,
	myId: string | undefined,
): string | null {
	if (!room) return null;
	const me = room.players.find((player) => player.id === myId);
	if (!me) return null;

	if (room.status === "countdown") {
		if (room.countdown === null) return "Starting in 0";
		return `Starting in ${room.countdown}`;
	}
	if (room.status === "playing") {
		if (!me.inGame) return "Waiting for the next game";
		if (me.alive) return null;
		return "Game Over";
	}
	if (!me.inGame || !result) return null;
	if (result.winner && result.winner.id === myId) return "Victory";
	return "Game Over";
}
