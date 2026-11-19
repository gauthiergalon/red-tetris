import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { createEmptyGrid } from "../board";
import type { GameResult, GameState, RoomSnapshot } from "../types";

const INITIAL_STATE: GameState = {
	grid: createEmptyGrid(),
	piece: undefined,
	playing: false,
	score: 0,
	lines: 0,
	next: [],
	hold: null,
	canHold: true,
};

export type Send = (event: string, value?: string | boolean) => void;

export function useGameConnection(roomId: string, username: string) {
	const socketRef = useRef<Socket | null>(null);
	const [gameState, setGameState] = useState(INITIAL_STATE);
	const [room, setRoom] = useState<RoomSnapshot | null>(null);
	const [result, setResult] = useState<GameResult | null>(null);
	const [myId, setMyId] = useState<string>();
	const [connectionError, setConnectionError] = useState<string | null>(null);

	useEffect(() => {
		const socket = io({ auth: { roomId, username } });
		socketRef.current = socket;
		socket.on("welcome", (data: { playerId: string }) => {
			setMyId(data.playerId);
		});
		socket.on("gameState", (state: GameState) => {
			setGameState(state);
		});
		socket.on("room", (snapshot: RoomSnapshot) => {
			setRoom(snapshot);
			if (snapshot.status === "playing") setResult(null);
		});
		socket.on("gameEnd", (gameResult: GameResult) => {
			setResult(gameResult);
		});
		socket.on("connectionError", (error: { message: string }) => {
			setConnectionError(error.message);
		});
		return () => {
			socket.disconnect();
		};
	}, [roomId, username]);

	const send: Send = useCallback((event, value) => {
		const socket = socketRef.current;
		if (!socket) return;
		if (value === undefined) socket.emit(event);
		else socket.emit(event, value);
	}, []);

	return { gameState, room, result, myId, connectionError, send };
}
