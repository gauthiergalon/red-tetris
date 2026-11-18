import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { io as connectClient, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import {
	createRedTetrisServer,
	type RedTetrisServer,
	type ServerOptions,
} from "./server.ts";

let server: RedTetrisServer | undefined;
const clients: Socket[] = [];

afterEach(async () => {
	for (const client of clients.splice(0)) client.close();
	await server?.close();
	server = undefined;
});

async function start(options: ServerOptions = {}): Promise<string> {
	server = createRedTetrisServer({ countdownMs: 0, ...options });
	const http = server.httpServer;
	await new Promise<void>((resolve) => http.listen(0, resolve));
	return `http://localhost:${(http.address() as AddressInfo).port}`;
}

function connect(url: string, auth: object): Socket {
	const client = connectClient(url, {
		auth,
		transports: ["websocket"],
		reconnection: false,
		forceNew: true,
	});
	clients.push(client);
	return client;
}

function next<T>(
	client: Socket,
	event: string,
	accept: (payload: T) => boolean = () => true,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`no "${event}" received`)),
			2_000,
		);
		const handler = (payload: T) => {
			if (!accept(payload)) return;
			clearTimeout(timer);
			client.off(event, handler);
			resolve(payload);
		};
		client.on(event, handler);
	});
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface State {
	playing: boolean;
	piece?: {
		type: string;
		pos: { x: number; y: number };
		rotationState: number;
	};
	hold: unknown;
	score: number;
}
interface Room {
	status: string;
	hostId: string;
	difficulty: string;
	players: { id: string; username: string; connected: boolean }[];
}

async function join(url: string, roomId: string, username: string) {
	const client = connect(url, { roomId, username });
	const { playerId } = await next<{ playerId: string }>(client, "welcome");
	return { client, playerId };
}

describe("server: connection checks", () => {
	it("refuses a missing or invalid room / username", async () => {
		const url = await start();
		const missing = connect(url, {});
		expect(await next(missing, "connectionError")).toEqual({
			message: "Invalid room ID or username.",
		});
		const tooLong = connect(url, { roomId: "r", username: "x".repeat(25) });
		expect(await next(tooLong, "connectionError")).toEqual({
			message: "Room ID or username has an invalid length.",
		});
	});

	it("refuses a full room, too many rooms and a taken username", async () => {
		const url = await start({ maxRooms: 1, maxPlayersPerRoom: 1 });
		await join(url, "r", "alice");
		const taken = connect(url, { roomId: "r", username: "alice" });
		expect(await next(taken, "connectionError")).toEqual({
			message: "This username is already taken here.",
		});
		const full = connect(url, { roomId: "r", username: "bob" });
		expect(await next(full, "connectionError")).toEqual({
			message: "This room is full.",
		});
		const other = connect(url, { roomId: "other", username: "bob" });
		expect(await next(other, "connectionError")).toEqual({
			message: "Maximum number of rooms reached.",
		});
	});
});

describe("server: playing", () => {
	it("welcomes players, then lets the host configure and start", async () => {
		const url = await start();
		const alice = await join(url, "r", "alice");
		const bob = await join(url, "r", "bob");

		const room = await next<Room>(alice.client, "room", (r) =>
			r.players.some((p) => p.username === "bob"),
		);
		expect(room.hostId).toBe(alice.playerId);

		bob.client.emit("difficulty", "easy");
		alice.client.emit("difficulty", "insane");
		alice.client.emit("difficulty", "hard");
		const hard = await next<Room>(
			bob.client,
			"room",
			(r) => r.difficulty !== "medium",
		);
		expect(hard.difficulty).toBe("hard");

		const playing = next<State>(bob.client, "gameState", (s) => s.playing);
		alice.client.emit("start");
		expect((await playing).piece).toBeDefined();
	});

	it("applies every action sent by the client", async () => {
		const url = await start();
		const { client } = await join(url, "solo", "alice");
		const started = next<State>(client, "gameState", (s) => s.playing);
		client.emit("start");
		const first = await started;
		const x = first.piece?.pos.x ?? 0;

		const moved = next<State>(
			client,
			"gameState",
			(s) => s.piece?.pos.x === x - 1,
		);
		client.emit("move", "up");
		client.emit("move", "left");
		await moved;

		const held = next<State>(client, "gameState", (s) => s.hold !== null);
		client.emit("hold");
		let latest = await held;

		while (latest.piece?.type === "O") {
			const placed = next<State>(
				client,
				"gameState",
				(s) => s.piece?.type !== "O" || s.score > latest.score,
			);
			await wait(60);
			client.emit("hardDrop");
			latest = await placed;
		}

		await wait(60);
		const rotated = next<State>(
			client,
			"gameState",
			(s) => s.piece?.rotationState === 3,
		);
		client.emit("rotate", "ccw");
		await rotated;
		await wait(60);
		const back = next<State>(
			client,
			"gameState",
			(s) => s.piece?.rotationState === 0,
		);
		client.emit("rotate");
		await back;

		const stepped = next<State>(client, "gameState", (s) => s.score >= 1);
		client.emit("softDrop");
		await stepped;

		const falling = next<State>(client, "gameState", (s) => s.score >= 3);
		client.emit("softDrop", true);
		await falling;
		client.emit("softDrop", false);

		const dropped = next<State>(client, "gameState", (s) => s.score >= 10);
		client.emit("hardDrop");
		await dropped;
	});

	it("runs gravity on its own", async () => {
		const url = await start({ tickMs: 10 });
		const { client } = await join(url, "solo", "alice");
		client.emit("difficulty", "hard");
		await next<Room>(client, "room", (r) => r.difficulty === "hard");
		const started = next<State>(client, "gameState", (s) => s.playing);
		client.emit("start");
		const y = (await started).piece?.pos.y ?? 0;
		await next<State>(client, "gameState", (s) => (s.piece?.pos.y ?? 0) > y);
	});

	it("ignores events beyond the per-socket rate limit", async () => {
		const url = await start({ maxEventsPerSecond: 1 });
		const { client } = await join(url, "r", "alice");
		const rooms: Room[] = [];
		client.on("room", (r: Room) => rooms.push(r));
		client.emit("difficulty", "easy");
		client.emit("difficulty", "hard");
		await wait(150);
		expect(rooms.map((r) => r.difficulty)).toEqual(["easy"]);
	});
});

describe("server: reconnection grace period", () => {
	it("gives the place back to the same username within the delay", async () => {
		const url = await start({ graceMs: 300 });
		const alice = await join(url, "r", "alice");
		const bob = await join(url, "r", "bob");

		const gone = next<Room>(bob.client, "room", (r) =>
			r.players.some((p) => p.id === alice.playerId && !p.connected),
		);
		alice.client.close();
		await gone;

		const again = await join(url, "r", "alice");
		expect(again.playerId).toBe(alice.playerId);
		await wait(400);
		expect(server?.games.get("r")?.players.has(alice.playerId)).toBe(true);
	});

	it("removes the player, then the empty room, after the delay", async () => {
		const url = await start({ graceMs: 50 });
		const alice = await join(url, "r", "alice");
		alice.client.close();
		await wait(30);
		expect(server?.games.has("r")).toBe(true);
		await wait(120);
		expect(server?.games.has("r")).toBe(false);
	});
});

describe("server: HTTP", () => {
	it("serves the client for every path (single-page app)", async () => {
		const distDir = mkdtempSync(path.join(tmpdir(), "red-tetris-dist-"));
		writeFileSync(path.join(distDir, "index.html"), "<p>red tetris</p>");
		const url = await start({ distDir });
		for (const route of ["/", "/room/alice"]) {
			const response = await fetch(url + route);
			expect(await response.text()).toBe("<p>red tetris</p>");
		}
	});
});
