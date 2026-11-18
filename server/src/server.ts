import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { Server } from "socket.io";

import { isDifficulty, isDirection } from "./game.ts";
import { Game, type GameListener, type PlayerAction } from "./models/Game.ts";

export interface ServerOptions {
	maxRooms?: number;
	maxPlayersPerRoom?: number;
	maxEventsPerSecond?: number;
	tickMs?: number;
	graceMs?: number;
	countdownMs?: number;
	distDir?: string;
}

export interface RedTetrisServer {
	httpServer: HttpServer;
	io: Server;
	games: Map<string, Game>;
	close(): Promise<void>;
}

type Handshake =
	| { ok: true; roomId: string; username: string }
	| { ok: false; reason: string };

const MAX_ROOM_ID_LENGTH = 64;
const MAX_USERNAME_LENGTH = 24;

const builtClientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../dist",
);

export function parseHandshake(auth: Record<string, unknown>): Handshake {
	const { roomId, username } = auth;
	if (typeof roomId !== "string" || typeof username !== "string") {
		return { ok: false, reason: "Invalid room ID or username." };
	}

	const room = roomId.trim();
	const name = username.trim();
	const validLength = (value: string, max: number) =>
		value.length > 0 && value.length <= max;

	if (
		!validLength(room, MAX_ROOM_ID_LENGTH) ||
		!validLength(name, MAX_USERNAME_LENGTH)
	) {
		return { ok: false, reason: "Room ID or username has an invalid length." };
	}
	return { ok: true, roomId: room, username: name };
}

const playerChannel = (playerId: string): string => `player:${playerId}`;

function createRateLimiter(maxEventsPerSecond: number) {
	const windows = new Map<string, { startedAt: number; count: number }>();

	return {
		allow(socketId: string): boolean {
			const now = Date.now();
			const window = windows.get(socketId);
			if (!window || now - window.startedAt >= 1_000) {
				windows.set(socketId, { startedAt: now, count: 1 });
				return true;
			}
			if (window.count >= maxEventsPerSecond) return false;
			window.count++;
			return true;
		},
		forget(socketId: string): void {
			windows.delete(socketId);
		},
	};
}

function serveClient(distDir: string) {
	const app = express();
	app.use(express.static(distDir));
	app.get(/.*/, (_req: Request, res: Response) => {
		res.sendFile(path.join(distDir, "index.html"));
	});
	return app;
}

export function createRedTetrisServer(
	options: ServerOptions = {},
): RedTetrisServer {
	const maxRooms = options.maxRooms ?? 1_000;
	const maxPlayersPerRoom = options.maxPlayersPerRoom ?? 8;
	const graceMs = options.graceMs ?? 5_000;
	const countdownMs = options.countdownMs ?? 3_000;

	const httpServer = createServer(
		serveClient(options.distDir ?? builtClientDir),
	);
	const io = new Server(httpServer);
	const games = new Map<string, Game>();
	const rateLimiter = createRateLimiter(options.maxEventsPerSecond ?? 30);
	const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function broadcastTo(roomId: string): GameListener {
		return {
			playerState: (playerId, state) =>
				io.to(playerChannel(playerId)).emit("gameState", state),
			roomUpdate: (snapshot) => io.to(roomId).emit("room", snapshot),
			gameEnd: (result) => io.to(roomId).emit("gameEnd", result),
		};
	}

	function findOrCreateGame(roomId: string): Game | undefined {
		const existing = games.get(roomId);
		if (existing) return existing;
		if (games.size >= maxRooms) return undefined;

		const game = new Game(roomId, broadcastTo(roomId), {
			maxPlayers: maxPlayersPerRoom,
			countdownMs,
		});
		games.set(roomId, game);
		return game;
	}

	function scheduleRemoval(game: Game, playerId: string): void {
		removalTimers.set(
			playerId,
			setTimeout(() => {
				removalTimers.delete(playerId);
				game.leave(playerId);
				if (game.isEmpty) games.delete(game.id);
			}, graceMs),
		);
	}

	function cancelRemoval(playerId: string): void {
		clearTimeout(removalTimers.get(playerId));
		removalTimers.delete(playerId);
	}

	io.on("connection", (socket) => {
		const reject = (reason: string): void => {
			socket.emit("connectionError", { message: reason });
			socket.disconnect(true);
		};

		const handshake = parseHandshake(socket.handshake.auth);
		if (!handshake.ok) return reject(handshake.reason);

		const game = findOrCreateGame(handshake.roomId);
		if (!game) return reject("Maximum number of rooms reached.");

		socket.join(game.id);
		const joined = game.join(randomUUID(), handshake.username);
		if (!joined.ok) {
			if (game.isEmpty) games.delete(game.id);
			return reject(joined.reason);
		}

		const { player } = joined;
		cancelRemoval(player.id);
		socket.join(playerChannel(player.id));
		socket.emit("welcome", { playerId: player.id });
		socket.emit("gameState", player.toState(game.isPlaying));
		socket.emit("room", game.snapshot());

		const whenAllowed =
			<Args extends unknown[]>(handler: (...args: Args) => void) =>
			(...args: Args) => {
				if (rateLimiter.allow(socket.id)) handler(...args);
			};
		const act = (action: PlayerAction) => game.handleAction(player.id, action);

		socket.on(
			"start",
			whenAllowed(() => game.start(player.id)),
		);
		socket.on(
			"difficulty",
			whenAllowed((difficulty: unknown) => {
				if (isDifficulty(difficulty)) game.setDifficulty(player.id, difficulty);
			}),
		);
		socket.on(
			"move",
			whenAllowed((direction: unknown) => {
				if (isDirection(direction)) act({ type: "move", direction });
			}),
		);
		socket.on(
			"rotate",
			whenAllowed((direction: unknown) =>
				act({ type: "rotate", direction: direction === "ccw" ? "ccw" : "cw" }),
			),
		);
		socket.on(
			"softDrop",
			whenAllowed((held: unknown) =>
				act(
					typeof held === "boolean"
						? { type: "setSoftDrop", active: held }
						: { type: "softDrop" },
				),
			),
		);
		socket.on(
			"hardDrop",
			whenAllowed(() => act({ type: "hardDrop" })),
		);
		socket.on(
			"hold",
			whenAllowed(() => act({ type: "hold" })),
		);

		socket.on("disconnect", () => {
			rateLimiter.forget(socket.id);
			game.disconnect(player.id);
			scheduleRemoval(game, player.id);
		});
	});

	const tickInterval = setInterval(() => {
		for (const game of games.values()) game.tick();
	}, options.tickMs ?? 25);

	async function close(): Promise<void> {
		clearInterval(tickInterval);
		for (const timer of removalTimers.values()) clearTimeout(timer);
		removalTimers.clear();
		await new Promise<void>((resolve) => io.close(() => resolve()));
	}

	return { httpServer, io, games, close };
}
