
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { Server } from "socket.io";

import type { Direction, GameState, Piece } from "./game.js";
import {
	clearLines,
	createInitialState,
	isColliding,
	rotateShape,
	isDirection,
	DIRECTIONS,
	getNextShape,
	SRS_COMMON_TABLES,
	SRS_I_TABLES,
} from "./game.js";

const PORT = Number(process.env.PORT ?? 3000);

// Limits
const MAX_ROOMS = 1_000;
const MAX_PLAYERS_PER_ROOM = 8;
const MAX_GAME_EVENTS_PER_SECOND = 30;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../../dist");

const app: Express = express();

app.use(express.static(distDir));

app.get(/.*/, (_req: Request, res: Response) => {
	res.sendFile(path.join(distDir, "index.html"));
});

const httpServer = createServer(app);
const io = new Server(httpServer);

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Player {
	username: string;
	state: GameState;
}

interface Room {
	owner: string;
	players: Map<string, Player>;
}

interface RateLimitWindow {
	startedAt: number;
	count: number;
}

type StateUpdater = (state: GameState) => GameState;

// -----------------------------------------------------------------------------
// Storage
// -----------------------------------------------------------------------------

const rooms = new Map<string, Room>();

const rateLimitWindows = new Map<string, RateLimitWindow>();

// -----------------------------------------------------------------------------
// Rate limiting
// -----------------------------------------------------------------------------

function canProcessAction(socketId: string): boolean {
	const now = Date.now();
	const window = rateLimitWindows.get(socketId);

	if (!window || now - window.startedAt >= 1_000) {
		rateLimitWindows.set(socketId, {
			startedAt: now,
			count: 1,
		});

		return true;
	}

	if (window.count >= MAX_GAME_EVENTS_PER_SECOND) {
		return false;
	}

	window.count++;

	return true;
}

// -----------------------------------------------------------------------------
// Game helpers
// -----------------------------------------------------------------------------

function setPiece(grid: string[][], piece: Piece): string[][] {
	const newGrid = grid.map((row) => [...row]);

	for (let y = 0; y < piece.shape.length; y++) {
		for (let x = 0; x < piece.shape[y].length; x++) {
			const cell = piece.shape[y][x];

			if (cell === " ") continue;

			const gridX = piece.pos.x + x;
			const gridY = piece.pos.y + y;

			// Cells above the visible board are not written.
			if (gridY < 0) continue;

			const row = newGrid[gridY];

			// Defensive bounds check.
			if (!row || gridX < 0 || gridX >= row.length) continue;

			row[gridX] = cell;
		}
	}

	return newGrid;
}

function createNewPiece(sequenceIndex: number): {
	piece: Piece;
	newSequenceIndex: number;
} {
	const { shape, type } = getNextShape(sequenceIndex);

	const piece: Piece = {
		shape,
		pos: { x: 3, y: 0 },
		type,
		rotationState: 0,
	};

	return {
		piece,
		newSequenceIndex: sequenceIndex + 1,
	};
}

function movePiece(piece: Piece, direction: Direction): Piece {
	return {
		...piece,
		pos: {
			x: piece.pos.x + DIRECTIONS[direction].x,
			y: piece.pos.y + DIRECTIONS[direction].y,
		},
	};
}

// -----------------------------------------------------------------------------
// Piece locking
// -----------------------------------------------------------------------------

function lockPiece(
	gameState: GameState,
	piece: Piece,
): GameState {
	const grid = setPiece(gameState.grid, piece);
	const clearedGrid = clearLines(grid);

	const {
		piece: newPiece,
		newSequenceIndex,
	} = createNewPiece(gameState.sequenceIndex);

	const gameOver = isColliding(clearedGrid, newPiece);

	return {
		...gameState,
		grid: clearedGrid,
		piece: newPiece,
		sequenceIndex: newSequenceIndex,
		playing: gameState.playing && !gameOver,
	};
}

// -----------------------------------------------------------------------------
// Game actions
// -----------------------------------------------------------------------------

function drop(gameState: GameState): GameState {
	if (!gameState.playing || !gameState.piece) {
		return gameState;
	}

	const nextPiece = movePiece(gameState.piece, "down");

	if (!isColliding(gameState.grid, nextPiece)) {
		return {
			...gameState,
			piece: nextPiece,
		};
	}

	return lockPiece(gameState, gameState.piece);
}

function rotate(gameState: GameState): GameState {
	if (!gameState.playing || !gameState.piece) {
		return gameState;
	}

	const currentState = gameState.piece.rotationState;
	const nextState = (currentState + 1) % 4;

	const rotatedShape = rotateShape(gameState.piece.shape);

	const isIPiece = gameState.piece.type === "I";

	const tables = isIPiece
		? SRS_I_TABLES
		: SRS_COMMON_TABLES;

	const offsets = tables[currentState];

	for (const offset of offsets) {
		const testPiece: Piece = {
			...gameState.piece,
			shape: rotatedShape,
			pos: {
				x: gameState.piece.pos.x + offset.x,
				y: gameState.piece.pos.y + offset.y,
			},
			rotationState: nextState,
		};

		if (!isColliding(gameState.grid, testPiece)) {
			return {
				...gameState,
				piece: testPiece,
			};
		}
	}

	return gameState;
}

function move(
	gameState: GameState,
	direction: Direction,
): GameState {
	if (!gameState.playing || !gameState.piece) {
		return gameState;
	}

	const nextPiece = movePiece(gameState.piece, direction);

	if (isColliding(gameState.grid, nextPiece)) {
		return gameState;
	}

	return {
		...gameState,
		piece: nextPiece,
	};
}

function softDrop(gameState: GameState): GameState {
	return move(gameState, "down");
}

function hardDrop(gameState: GameState): GameState {
	if (!gameState.playing || !gameState.piece) {
		return gameState;
	}

	let droppedPiece = gameState.piece;

	while (true) {
		const nextPiece = movePiece(droppedPiece, "down");

		if (isColliding(gameState.grid, nextPiece)) {
			break;
		}

		droppedPiece = nextPiece;
	}

	return lockPiece(gameState, droppedPiece);
}

// -----------------------------------------------------------------------------
// Player state management
// -----------------------------------------------------------------------------

function updatePlayerState(
	roomId: string,
	socketId: string,
	updater: StateUpdater,
): void {
	const room = rooms.get(roomId);
	const player = room?.players.get(socketId);

	if (!room || !player) return;

	if (!canProcessAction(socketId)) return;

	const newState = updater(player.state);

	// Avoid unnecessary updates and socket emissions.
	if (newState === player.state) return;

	room.players.set(socketId, {
		...player,
		state: newState,
	});

	io.to(socketId).emit("gameState", newState);
}

// -----------------------------------------------------------------------------
// Game loop
// -----------------------------------------------------------------------------

function tick(): void {
	for (const room of rooms.values()) {
		for (const [socketId, player] of room.players) {
			const newState = player.state.playing
				? drop(player.state)
				: player.state;

			if (newState !== player.state) {
				room.players.set(socketId, {
					...player,
					state: newState,
				});
			}

			// Always emit the latest state, not the previous one.
			io.to(socketId).emit("gameState", newState);
		}
	}
}

// -----------------------------------------------------------------------------
// Socket.IO
// -----------------------------------------------------------------------------

io.on("connection", (socket) => {
	const auth = socket.handshake.auth ?? {};

	const rawRoomId = auth.roomId;
	const rawUsername = auth.username;

	// Validate handshake data.
	if (
		typeof rawRoomId !== "string" ||
		typeof rawUsername !== "string"
	) {
		socket.emit("connectionError", {
			message: "Invalid room ID or username.",
		});

		socket.disconnect(true);
		return;
	}

	const roomId = rawRoomId.trim();
	const username = rawUsername.trim();

	if (
		roomId.length === 0 ||
		roomId.length > 64 ||
		username.length === 0 ||
		username.length > 24
	) {
		socket.emit("connectionError", {
			message: "Room ID or username has an invalid length.",
		});

		socket.disconnect(true);
		return;
	}

	// Find or create the room.
	let room = rooms.get(roomId);

	if (!room) {
		if (rooms.size >= MAX_ROOMS) {
			socket.emit("connectionError", {
				message: "Maximum number of rooms reached.",
			});

			socket.disconnect(true);
			return;
		}

		room = {
			owner: socket.id,
			players: new Map(),
		};

		rooms.set(roomId, room);
	}

	// Check room capacity.
	if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
		socket.emit("connectionError", {
			message: "This room is full.",
		});

		socket.disconnect(true);
		return;
	}

	socket.data.roomId = roomId;
	socket.data.username = username;

	socket.join(roomId);

	// Register player.
	const initialState = createInitialState();

	room.players.set(socket.id, {
		username,
		state: initialState,
	});

	socket.emit("gameState", initialState);

	// -------------------------------------------------------------------------
	// Start / restart
	// -------------------------------------------------------------------------

	socket.on("start", () => {
		if (socket.id !== room.owner) return;

		if (!canProcessAction(socket.id)) return;

		for (const [playerId, player] of room.players) {
			const newState = createInitialState();

			const {
				piece: newPiece,
				newSequenceIndex,
			} = createNewPiece(newState.sequenceIndex);

			const gameState: GameState = {
				...newState,
				playing: true,
				piece: newPiece,
				sequenceIndex: newSequenceIndex,
			};

			room.players.set(playerId, {
				...player,
				state: gameState,
			});

			io.to(playerId).emit("gameState", gameState);
		}
	});

	// -------------------------------------------------------------------------
	// Game controls
	// -------------------------------------------------------------------------

	socket.on("rotate", () => {
		updatePlayerState(roomId, socket.id, rotate);
	});

	socket.on("move", (direction: Direction) => {
		if (!isDirection(direction)) return;

		updatePlayerState(
			roomId,
			socket.id,
			(state) => move(state, direction),
		);
	});

	socket.on("softDrop", () => {
		updatePlayerState(roomId, socket.id, softDrop);
	});

	socket.on("hardDrop", () => {
		updatePlayerState(roomId, socket.id, hardDrop);
	});

	// -------------------------------------------------------------------------
	// Disconnect
	// -------------------------------------------------------------------------

	socket.on("disconnect", () => {
		const currentRoom = rooms.get(roomId);

		rateLimitWindows.delete(socket.id);

		if (!currentRoom) return;

		currentRoom.players.delete(socket.id);

		if (currentRoom.players.size === 0) {
			rooms.delete(roomId);
			return;
		}

		// Transfer ownership to the first remaining player.
		if (socket.id === currentRoom.owner) {
			const nextOwner = currentRoom.players.keys().next().value;

			if (nextOwner) {
				currentRoom.owner = nextOwner;
			}
		}
	});
});

// -----------------------------------------------------------------------------
// Server lifecycle
// -----------------------------------------------------------------------------

const tickInterval = setInterval(tick, 500);

let isShuttingDown = false;

function cleanup(): void {
	if (isShuttingDown) return;

	isShuttingDown = true;

	clearInterval(tickInterval);

	io.close();
}

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

httpServer.listen(PORT, () => {
	console.log(
		`Express + Socket.IO server started on http://localhost:${PORT}`,
	);
});
