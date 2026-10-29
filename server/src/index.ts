import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { Server } from "socket.io";
import type { Direction, GameState, Piece } from "./game.js";
import {
	clearLines,
	createInitialState,
	PIECES,
	isColliding,
	rotateShape,
	isDirection,
	DIRECTIONS,
} from "./game.js";

const PORT = Number(process.env.PORT ?? 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../../dist");

const app: Express = express();
app.use(express.static(distDir));
app.use((_req: Request, res: Response) => {
	res.sendFile(path.join(distDir, "index.html"));
});

const httpServer = createServer(app);
const io = new Server(httpServer);

let gameState: GameState = createInitialState();

function emitState() {
	io.emit("gameState", gameState);
}

function setPiece(grid: string[][], piece: Piece): string[][] {
	const newGrid = grid.map((row) => [...row]);

	for (let y = 0; y < piece.shape.length; y++) {
		for (let x = 0; x < piece.shape[y].length; x++) {
			if (piece.shape[y][x] !== " ") {
				const gridX = piece.pos.x + x;
				const gridY = piece.pos.y + y;
				newGrid[gridY][gridX] = piece.shape[y][x];
			}
		}
	}

	return newGrid;
}

function spawnPiece(): Piece {
	const newPiece: Piece = {
		shape: PIECES[1].map((row) => [...row]),
		pos: { x: 3, y: 0 },
	};

	if (isColliding(gameState.grid, newPiece)) {
		gameState.playing = false;
		emitState();
	}
	return newPiece;
}

function drop(gameState: GameState): GameState {
	if (!gameState.piece) return gameState;

	const nextPiece = movePiece(gameState.piece, "down");

	if (!isColliding(gameState.grid, nextPiece)) {
		return {
			...gameState,
			piece: nextPiece,
		};
	}

	const grid = setPiece(gameState.grid, gameState.piece);
	const clearedGrid = clearLines(grid);
	const newPiece = spawnPiece();

	return {
		...gameState,
		grid: clearedGrid,
		piece: newPiece,
	};
}

function rotate(gameState: GameState): GameState {
	if (!gameState.piece) return gameState;

	const rotatedPiece = rotatePiece(gameState.piece);

	if (!isColliding(gameState.grid, rotatedPiece)) {
		return {
			...gameState,
			piece: rotatedPiece,
		};
	}

	return gameState;
}

function rotatePiece(piece: Piece): Piece {
	return {
		...piece,
		shape: rotateShape(piece.shape),
	};
}

function movePiece(piece: Piece, direction: Direction): Piece {
	return {
		...piece,
		pos: {
			...piece.pos,
			x: piece.pos.x + DIRECTIONS[direction].x,
			y: piece.pos.y + DIRECTIONS[direction].y,
		},
	};
}

function move(gameState: GameState, direction: Direction): GameState {
	if (!gameState.piece) return gameState;

	const nextPiece = movePiece(gameState.piece, direction);

	if (!isColliding(gameState.grid, nextPiece)) {
		return {
			...gameState,
			piece: nextPiece,
		};
	}

	return gameState;
}

function softDrop(gameState: GameState): GameState {
	if (!gameState.piece) return gameState;

	const nextPiece = movePiece(gameState.piece, "down");

	if (!isColliding(gameState.grid, nextPiece)) {
		return {
			...gameState,
			piece: nextPiece,
		};
	}

	return gameState;
}

function hardDrop(gameState: GameState): GameState {
	if (!gameState.piece) return gameState;

	let droppedPiece = gameState.piece;

	while (true) {
		const nextPiece = movePiece(droppedPiece, "down");

		if (isColliding(gameState.grid, nextPiece)) {
			break;
		}

		droppedPiece = nextPiece;
	}

	const grid = setPiece(gameState.grid, droppedPiece);
	const clearedGrid = clearLines(grid);
	const newPiece = spawnPiece();

	return {
		...gameState,
		grid: clearedGrid,
		piece: newPiece,
	};
}

function tick() {
	if (!gameState.playing) return;

	gameState = drop(gameState);
	emitState();
}

io.on("connection", (socket) => {
	socket.emit("hello", "Server responds!");
	socket.emit("gameState", gameState);

	socket.on("start", () => {
		gameState = createInitialState();
		const newPiece = spawnPiece();

		[gameState.playing, gameState.piece] = [true, newPiece];

		emitState();
	});

	socket.on("rotate", () => {
		gameState = rotate(gameState);
		emitState();
	});

	socket.on("move", (direction: Direction) => {
		if (!isDirection(direction)) return;
		gameState = move(gameState, direction);
		emitState();
	});

	socket.on("softDrop", () => {
		gameState = softDrop(gameState);
		emitState();
	});

	socket.on("hardDrop", () => {
		gameState = hardDrop(gameState);
		emitState();
	});
});

const tickInterval = setInterval(() => {
	tick();
}, 500);

function cleanup() {
	clearInterval(tickInterval);
	httpServer.close();
}

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

httpServer.listen(PORT, () => {
	console.log(`Express + Socket.IO server started on http://localhost:${PORT}`);
});
