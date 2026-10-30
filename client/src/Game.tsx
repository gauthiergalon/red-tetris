import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const COLORS: Record<string, string> = {
	" ": "#222",
	I: "#00f0f0",
	O: "#f0f000",
	T: "#a000f0",
	S: "#00f000",
	Z: "#f00000",
	J: "#0000f0",
	L: "#f0a000",
};

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
	const socketRef = useRef(socket);
	const gameStateRef = useRef(gameState);
	const pressedKeysRef = useRef(new Set<string>());

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
		const handleKeyDown = (e: KeyboardEvent) => {
			const s = socketRef.current;
			const currentState = gameStateRef.current;
			if (!currentState.playing || !currentState.piece) return;

			if (
				["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
			) {
				e.preventDefault();
			}

			if (e.key === "ArrowUp" && !e.repeat) {
				s?.emit("rotate");
			} else if (e.key === "ArrowLeft" && !e.repeat) {
				s?.emit("move", "left");
				pressedKeysRef.current.add("left");
			} else if (e.key === "ArrowRight" && !e.repeat) {
				s?.emit("move", "right");
				pressedKeysRef.current.add("right");
			} else if (e.key === "ArrowDown" && !e.repeat) {
				s?.emit("softDrop");
				pressedKeysRef.current.add("down");
			} else if (e.key === " ") {
				s?.emit("hardDrop");
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft") pressedKeysRef.current.delete("left");
			if (e.key === "ArrowRight") pressedKeysRef.current.delete("right");
			if (e.key === "ArrowDown") pressedKeysRef.current.delete("down");
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, []);

	useEffect(() => {
		const interval = setInterval(() => {
			const s = socketRef.current;
			const currentState = gameStateRef.current;
			if (!currentState.playing || !currentState.piece) return;

			const keys = pressedKeysRef.current;
			if (keys.has("down")) s?.emit("softDrop");
			if (keys.has("left")) s?.emit("move", "left");
			if (keys.has("right")) s?.emit("move", "right");
		}, 150);
		return () => clearInterval(interval);
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

	useEffect(() => {
		const s = io({ auth: { roomId, username } });
		setSocket(s);
		s.on("gameState", (state: GameState) => setGameState(state));
		return () => {
			s.disconnect();
		};
	}, [roomId, username]);

	return (
		<div>
			<h2>Tetris Game</h2>
			<div
				style={{
					display: "flex",
					gap: 8,
					flexWrap: "wrap",
					alignItems: "center",
				}}
			>
				<button type="button" onClick={startGame} disabled={gameState.playing}>
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

			{!gameState.playing && (
				<p style={{ marginTop: 8, color: "#ff4444", fontWeight: "bold" }}>
					Game Over
				</p>
			)}
		</div>
	);
}
