import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { Server } from "socket.io";

import { isDirection } from "./game.ts";
import { Game, type GameListener, type PlayerAction } from "./models/Game.ts";

const PORT = Number(process.env.PORT ?? 3000);

// Limits
const MAX_ROOMS = 1_000;
const MAX_PLAYERS_PER_ROOM = 8;
const MAX_GAME_EVENTS_PER_SECOND = 30;
/** How often the server runs gravity; each player has its own fall delay. */
const TICK_MS = 25;
/** A disconnected player keeps its place this long (ms). */
const RECONNECT_GRACE_MS = 5_000;

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
// Storage
// -----------------------------------------------------------------------------

const games = new Map<string, Game>();

interface RateLimitWindow {
	startedAt: number;
	count: number;
}

const rateLimitWindows = new Map<string, RateLimitWindow>();

/** Pending removals of disconnected players, by player id. */
const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// -----------------------------------------------------------------------------
// Rate limiting
// -----------------------------------------------------------------------------

function canProcessAction(socketId: string): boolean {
	const now = Date.now();
	const window = rateLimitWindows.get(socketId);

	if (!window || now - window.startedAt >= 1_000) {
		rateLimitWindows.set(socketId, { startedAt: now, count: 1 });
		return true;
	}

	if (window.count >= MAX_GAME_EVENTS_PER_SECOND) return false;

	window.count++;
	return true;
}

// -----------------------------------------------------------------------------
// Game <-> socket.io bridge
//
// A player's id is stable (it survives a reconnection), unlike socket.id.
// Each socket joins a socket.io room named after its player id, and the
// player's own messages are sent to that room.
// -----------------------------------------------------------------------------

const playerRoom = (playerId: string): string => `player:${playerId}`;

function createSocketListener(roomId: string): GameListener {
	return {
		playerState: (playerId, state) => {
			io.to(playerRoom(playerId)).emit("gameState", state);
		},
		roomUpdate: (snapshot) => {
			io.to(roomId).emit("room", snapshot);
		},
		gameEnd: (result) => {
			io.to(roomId).emit("gameEnd", result);
		},
	};
}

function getOrCreateGame(roomId: string): Game | undefined {
	const existing = games.get(roomId);
	if (existing) return existing;
	if (games.size >= MAX_ROOMS) return undefined;

	const game = new Game(roomId, createSocketListener(roomId), {
		maxPlayers: MAX_PLAYERS_PER_ROOM,
	});
	games.set(roomId, game);
	return game;
}

// -----------------------------------------------------------------------------
// Socket.IO
// -----------------------------------------------------------------------------

io.on("connection", (socket) => {
	const reject = (message: string): void => {
		socket.emit("connectionError", { message });
		socket.disconnect(true);
	};

	const auth = socket.handshake.auth ?? {};
	const rawRoomId = auth.roomId;
	const rawUsername = auth.username;

	// Validate handshake data.
	if (typeof rawRoomId !== "string" || typeof rawUsername !== "string") {
		reject("Invalid room ID or username.");
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
		reject("Room ID or username has an invalid length.");
		return;
	}

	const game = getOrCreateGame(roomId);

	if (!game) {
		reject("Maximum number of rooms reached.");
		return;
	}

	// Join the socket.io rooms first, so this socket receives the updates
	// sent by game.join(). The player room is joined once the id is known.
	socket.join(roomId);

	const joined = game.join(randomUUID(), username);

	if (!joined.ok) {
		if (game.isEmpty) games.delete(roomId);
		reject(joined.reason);
		return;
	}

	const playerId = joined.player.id;

	// Reconnection within the grace period: cancel the pending removal.
	clearTimeout(graceTimers.get(playerId));
	graceTimers.delete(playerId);

	socket.join(playerRoom(playerId));
	socket.emit("welcome", { playerId });
	// Send the state again now that this socket is in the player room.
	socket.emit("gameState", joined.player.toState(game.isPlaying));
	socket.emit("room", game.snapshot());

	const act = (action: PlayerAction): void => {
		if (!canProcessAction(socket.id)) return;
		game.handleAction(playerId, action);
	};

	socket.on("start", () => {
		if (!canProcessAction(socket.id)) return;
		game.start(playerId);
	});

	socket.on("rotate", () => act({ type: "rotate" }));
	socket.on("hardDrop", () => act({ type: "hardDrop" }));
	// softDrop(true/false) = key held/released; softDrop() = one row.
	socket.on("softDrop", (active: unknown) => {
		if (typeof active === "boolean") act({ type: "setSoftDrop", active });
		else act({ type: "softDrop" });
	});
	socket.on("move", (direction: unknown) => {
		if (!isDirection(direction)) return;
		act({ type: "move", direction });
	});

	socket.on("disconnect", () => {
		rateLimitWindows.delete(socket.id);
		game.disconnect(playerId);
		graceTimers.set(
			playerId,
			setTimeout(() => {
				graceTimers.delete(playerId);
				game.leave(playerId);
				if (game.isEmpty) games.delete(roomId);
			}, RECONNECT_GRACE_MS),
		);
	});
});

// -----------------------------------------------------------------------------
// Server lifecycle
// -----------------------------------------------------------------------------

const tickInterval = setInterval(() => {
	for (const game of games.values()) game.tick();
}, TICK_MS);

let isShuttingDown = false;

function cleanup(): void {
	if (isShuttingDown) return;
	isShuttingDown = true;
	clearInterval(tickInterval);
	for (const timer of graceTimers.values()) clearTimeout(timer);
	io.close();
}

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

httpServer.listen(PORT, () => {
	console.log(`Express + Socket.IO server started on http://localhost:${PORT}`);
});
