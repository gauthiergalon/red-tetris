import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
	type GameResult,
	getOpponents,
	getStatusMessage,
	type RoomSnapshot,
	spectrumToRows,
} from "./display";

const COLORS: Record<string, string> = {
	" ": "#222",
	I: "#00f0f0",
	O: "#f0f000",
	T: "#a000f0",
	S: "#00f000",
	Z: "#f00000",
	J: "#0000f0",
	L: "#f0a000",
	// Indestructible penalty line
	X: "#777",
};

/** Delay before a held left/right key starts repeating (ms). */
const DAS_MS = 170;
/** Delay between two repeated moves while the key stays held (ms). */
const ARR_MS = 60;

const GRID_COLS = 10;
const GRID_ROWS = 20;

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

export function Game({
	roomId,
	username,
}: {
	roomId: string;
	username: string;
}) {
	const [gameState, setGameState] = useState<GameState>({
		piece: undefined,
		grid: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(" ")),
		lockDelay: 0,
		playing: false,
	});

	const [socket, setSocket] = useState<Socket | null>(null);
	const [room, setRoom] = useState<RoomSnapshot | null>(null);
	const [result, setResult] = useState<GameResult | null>(null);
	const [myId, setMyId] = useState<string | undefined>(undefined);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const socketRef = useRef(socket);
	const gameStateRef = useRef(gameState);
	// Auto-repeat timers of the held horizontal keys.
	const repeatTimersRef = useRef(
		new Map<"left" | "right", ReturnType<typeof setTimeout>>(),
	);

	useEffect(() => {
		socketRef.current = socket;
	}, [socket]);

	useEffect(() => {
		gameStateRef.current = gameState;
	}, [gameState]);

	const [timer, setTimer] = useState(0);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		if (gameState.playing) {
			setTimer(0);
			timerRef.current = setInterval(() => {
				setTimer((t) => t + 1);
			}, 1000);
		} else {
			if (timerRef.current) clearInterval(timerRef.current);
			timerRef.current = null;
		}
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [gameState.playing]);

	const isDisabled = !gameState.playing || !gameState.piece;

	const startGame = useCallback(() => {
		socket?.emit("start");
	}, [socket]);

	const rotate = useCallback(() => {
		socket?.emit("rotate");
	}, [socket]);

	const moveLeft = useCallback(() => {
		socket?.emit("move", "left");
	}, [socket]);

	const moveRight = useCallback(() => {
		socket?.emit("move", "right");
	}, [socket]);

	const softDrop = useCallback(() => {
		socket?.emit("softDrop");
	}, [socket]);

	const hardDrop = useCallback(() => {
		socket?.emit("hardDrop");
	}, [socket]);

	useEffect(() => {
		const timers = repeatTimersRef.current;

		// One move on press, then auto-repeat only once the key has been held
		// for DAS_MS (like the official games). Before, a shared 150 ms timer
		// could fire right after the press and move the piece twice.
		const startRepeat = (direction: "left" | "right") => {
			socketRef.current?.emit("move", direction);
			const repeat = () => {
				socketRef.current?.emit("move", direction);
				timers.set(direction, setTimeout(repeat, ARR_MS));
			};
			timers.set(direction, setTimeout(repeat, DAS_MS));
		};

		const stopRepeat = (direction: "left" | "right") => {
			clearTimeout(timers.get(direction));
			timers.delete(direction);
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			const s = socketRef.current;
			const currentState = gameStateRef.current;
			if (!currentState.playing || !currentState.piece) return;

			if (
				["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
			) {
				e.preventDefault();
			}
			// Holding a key fires keydown again and again: ignore those.
			if (e.repeat) return;

			if (e.key === "ArrowUp") {
				s?.emit("rotate");
			} else if (e.key === "ArrowLeft") {
				stopRepeat("right");
				startRepeat("left");
			} else if (e.key === "ArrowRight") {
				stopRepeat("left");
				startRepeat("right");
			} else if (e.key === "ArrowDown") {
				// Held: the server makes the piece fall faster instead of gravity.
				s?.emit("softDrop", true);
			} else if (e.key === " ") {
				s?.emit("hardDrop");
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft") stopRepeat("left");
			if (e.key === "ArrowRight") stopRepeat("right");
			if (e.key === "ArrowDown") socketRef.current?.emit("softDrop", false);
		};

		// Releasing a key outside the window never fires keyup.
		const handleBlur = () => {
			stopRepeat("left");
			stopRepeat("right");
			socketRef.current?.emit("softDrop", false);
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		window.addEventListener("blur", handleBlur);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("blur", handleBlur);
			stopRepeat("left");
			stopRepeat("right");
		};
	}, []);

	// Drop shadow / ghost piece calculation
	const ghostY = (() => {
		if (!gameState.piece || !gameState.grid) return 0;
		const { shape, pos } = gameState.piece;
		let y = pos.y;
		while (true) {
			const nextY = y + 1;
			let collision = false;
			for (let ry = 0; ry < shape.length; ry++) {
				for (let rx = 0; rx < shape[ry].length; rx++) {
					if (shape[ry][rx] !== " ") {
						const gy = nextY + ry;
						const gx = pos.x + rx;
						if (
							gy >= 20 ||
							(gx >= 0 && gx < 10 && gameState.grid[gy][gx] !== " ")
						) {
							collision = true;
							break;
						}
					}
				}
				if (collision) break;
			}
			if (collision) {
				return y;
			}
			y = nextY;
		}
		return y;
	})();

	const opponents = getOpponents(room, myId);
	const statusMessage = getStatusMessage(room, result, myId);

	useEffect(() => {
		const s = io({ auth: { roomId, username } });
		setSocket(s);
		s.on("welcome", (info: { playerId: string }) => setMyId(info.playerId));
		s.on("gameState", (state: GameState) => setGameState(state));
		s.on("room", (snapshot: RoomSnapshot) => {
			setRoom(snapshot);
			// A new game started: forget the previous result.
			if (snapshot.status === "playing") setResult(null);
		});
		s.on("gameEnd", (gameResult: GameResult) => setResult(gameResult));
		s.on("connectionError", (error: { message: string }) =>
			setConnectionError(error.message),
		);
		return () => {
			s.disconnect();
		};
	}, [roomId, username]);

	return (
		<div>
			<h2>
				Tetris Game: {username}
				{room && room.hostId === myId ? " (host)" : ""}
			</h2>
			<div
				style={{
					display: "flex",
					gap: 8,
					flexWrap: "wrap",
					alignItems: "center",
				}}
			>
				<button
					type="button"
					onClick={startGame}
					disabled={room?.status !== "waiting" || room.hostId !== myId}
				>
					Start Game
				</button>
				<button type="button" onClick={rotate} disabled={isDisabled}>
					Rotate
				</button>
				<button type="button" onClick={moveLeft} disabled={isDisabled}>
					←
				</button>
				<button type="button" onClick={moveRight} disabled={isDisabled}>
					→
				</button>
				<button type="button" onClick={softDrop} disabled={isDisabled}>
					↓
				</button>
				<button type="button" onClick={hardDrop} disabled={isDisabled}>
					Hard Drop
				</button>
				{gameState.playing && <span>Timer: {timer}s</span>}
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: `repeat(${GRID_COLS}, 20px)`,
					gap: "1px",
					marginTop: "10px",
				}}
			>
				{gameState.grid.map((row, rowIndex) =>
					row.map((cell, colIndex) => {
						// Ghost/drop shadow
						let ghostChar = " ";
						if (gameState.piece && ghostY > (gameState.piece?.pos.y ?? 0)) {
							const { shape } = gameState.piece;
							for (let y = 0; y < shape.length; y++) {
								for (let x = 0; x < shape[y].length; x++) {
									if (
										shape[y][x] !== " " &&
										rowIndex === ghostY + y &&
										colIndex === gameState.piece!.pos.x + x
									) {
										ghostChar = shape[y][x];
									}
								}
							}
						}

						let pieceChar = " ";
						if (gameState.piece) {
							const { shape, pos } = gameState.piece;
							for (let y = 0; y < shape.length; y++) {
								for (let x = 0; x < shape[y].length; x++) {
									if (
										shape[y][x] !== " " &&
										rowIndex === pos.y + y &&
										colIndex === pos.x + x
									) {
										pieceChar = shape[y][x];
									}
								}
							}
						}
						const isGhost = ghostChar !== " ";
						const cellValue =
							pieceChar !== " " ? pieceChar : isGhost ? ghostChar : cell;
						return (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: grid cells are fixed by position
								key={`${rowIndex}-${colIndex}`}
								style={{
									width: "20px",
									height: "20px",
									backgroundColor: COLORS[cellValue] ?? "#222",
									opacity: isGhost && pieceChar === " " ? 0.5 : 1,
								}}
							/>
						);
					}),
				)}
			</div>

			{statusMessage && <p>{statusMessage}</p>}
			{connectionError && <p>{connectionError}</p>}

			<h3>Opponents</h3>
			{opponents.length === 0 && <p>No one else in this room.</p>}
			<div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
				{opponents.map((opponent) => (
					<div key={opponent.id}>
						<div>
							{opponent.username}
							{opponent.id === room?.hostId ? " (host)" : ""}
							{!opponent.connected ? " (disconnected)" : ""}
							{!opponent.inGame
								? " (waiting)"
								: !opponent.alive && room?.status === "playing"
									? " (out)"
									: ""}
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: `repeat(${GRID_COLS}, 6px)`,
								gap: "1px",
							}}
						>
							{spectrumToRows(opponent.spectrum, GRID_ROWS).flatMap((row, y) =>
								row.map((filled, x) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed by position
										key={`${y}-${x}`}
										style={{
											width: 6,
											height: 6,
											backgroundColor: filled ? "#aaa" : "#222",
										}}
									/>
								)),
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
