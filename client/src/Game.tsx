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

export function Game() {
	const [gameState, setGameState] = useState<GameState>({
		piece: undefined,
		grid: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(" ")),
		lockDelay: 0,
		playing: false,
	});

	const [socket, setSocket] = useState<Socket | null>(null);

	useEffect(() => {
		const s = io();
		setSocket(s);
		s.on("gameState", (state: GameState) => {
			setGameState(state);
		});
		return () => {
			s.disconnect();
		};
	}, []);

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

	function getShadowPos() {

	}

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
		const handleKey = (e: KeyboardEvent) => {
			if (!gameState.playing || !gameState.piece) return;
			if (e.key === "ArrowUp" || e.key === "r") {
				e.preventDefault();
				rotate();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				moveLeft();
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				moveRight();
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				softDrop();
			} else if (e.key === " ") {
				e.preventDefault();
				hardDrop();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [
		gameState.playing,
		gameState.piece,
		rotate,
		moveLeft,
		moveRight,
		softDrop,
		hardDrop,
	]);

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
						const cellValue = pieceChar !== " " ? pieceChar : cell;
						return (
							<div
								key={`${rowIndex}-${colIndex}`}
								style={{
									width: "20px",
									height: "20px",
									backgroundColor: COLORS[cellValue] ?? "#222",
									border: "1px solid #555",
								}}
							/>
						);
					})
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
