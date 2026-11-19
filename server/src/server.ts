import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { Server } from "socket.io";

import { isDifficulty, isDirection } from "./game.ts";
import { Game, type GameListener } from "./models/Game.ts";

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

function hasValidLength(value: string, max: number): boolean {
	return value.length > 0 && value.length <= max;
}

export function parseHandshake(auth: Record<string, unknown>): Handshake {
	const { roomId, username } = auth;
	if (typeof roomId !== "string" || typeof username !== "string") {
		return { ok: false, reason: "Invalid room ID or username." };
	}

	const room = roomId.trim();
	const name = username.trim();
	if (
		!hasValidLength(room, MAX_ROOM_ID_LENGTH) ||
		!hasValidLength(name, MAX_USERNAME_LENGTH)
	) {
		return { ok: false, reason: "Room ID or username has an invalid length." };
	}
	return { ok: true, roomId: room, username: name };
}

function playerChannel(playerId: string): string {
	return `player:${playerId}`;
}

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
	const removalTimers = new Map<string, NodeJS.Timeout>();

	function broadcastTo(roomId: string): GameListener {
		return {
			playerState(playerId, state) {
				io.to(playerChannel(playerId)).emit("gameState", state);
			},
			roomUpdate(snapshot) {
				io.to(roomId).emit("room", snapshot);
			},
			gameEnd(result) {
				io.to(roomId).emit("gameEnd", result);
			},
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
		const timer = setTimeout(() => {
			removalTimers.delete(playerId);
			game.leave(playerId);
			if (game.isEmpty) games.delete(game.id);
		}, graceMs);
		removalTimers.set(playerId, timer);
	}

	function cancelRemoval(playerId: string): void {
		clearTimeout(removalTimers.get(playerId));
		removalTimers.delete(playerId);
	}

	io.on("connection", (socket) => {
		function reject(reason: string): void {
			socket.emit("connectionError", { message: reason });
			socket.disconnect(true);
		}

		const handshake = parseHandshake(socket.handshake.auth);
		if (!handshake.ok) {
			reject(handshake.reason);
			return;
		}

		const game = findOrCreateGame(handshake.roomId);
		if (!game) {
			reject("Maximum number of rooms reached.");
			return;
		}

		socket.join(game.id);
		const joined = game.join(randomUUID(), handshake.username);
		if (!joined.ok) {
			if (game.isEmpty) games.delete(game.id);
			reject(joined.reason);
			return;
		}

		const { player } = joined;
		cancelRemoval(player.id);
		socket.join(playerChannel(player.id));
		socket.emit("welcome", { playerId: player.id });
		socket.emit("gameState", player.toState(game.isPlaying));
		socket.emit("room", game.snapshot());

		socket.on("start", () => {
			if (!rateLimiter.allow(socket.id)) return;
			game.start(player.id);
		});

		socket.on("difficulty", (difficulty: unknown) => {
			if (!rateLimiter.allow(socket.id)) return;
			if (isDifficulty(difficulty)) game.setDifficulty(player.id, difficulty);
		});

		socket.on("move", (direction: unknown) => {
			if (!rateLimiter.allow(socket.id)) return;
			if (isDirection(direction)) {
				game.handleAction(player.id, { type: "move", direction });
			}
		});

		socket.on("rotate", (direction: unknown) => {
			if (!rateLimiter.allow(socket.id)) return;
			if (direction === "ccw") {
				game.handleAction(player.id, { type: "rotate", direction: "ccw" });
			} else {
				game.handleAction(player.id, { type: "rotate", direction: "cw" });
			}
		});

		socket.on("softDrop", (held: unknown) => {
			if (!rateLimiter.allow(socket.id)) return;
			if (typeof held === "boolean") {
				game.handleAction(player.id, { type: "setSoftDrop", active: held });
			} else {
				game.handleAction(player.id, { type: "softDrop" });
			}
		});

		socket.on("hardDrop", () => {
			if (!rateLimiter.allow(socket.id)) return;
			game.handleAction(player.id, { type: "hardDrop" });
		});

		socket.on("hold", () => {
			if (!rateLimiter.allow(socket.id)) return;
			game.handleAction(player.id, { type: "hold" });
		});

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
		await io.close();
	}

	return { httpServer, io, games, close };
}
