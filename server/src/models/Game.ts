import type { Direction, PieceType } from "../game.ts";
import { generateBag, penaltyFor } from "../game.ts";
import { type ActionType, canAct } from "../throttle.ts";
import { Player, type PlayerState, type StepResult } from "./Player.ts";

export type GameStatus = "waiting" | "playing";

export type PlayerAction =
	| { type: "move"; direction: Direction }
	| { type: "rotate" }
	| { type: "softDrop" }
	| { type: "hardDrop" }
	/** Soft drop held (true) or released (false): replaces gravity speed. */
	| { type: "setSoftDrop"; active: boolean };

/** Delay between two gravity steps (ms). */
export const GRAVITY_MS = 500;
/** Delay between two steps while soft drop is held (ms). */
export const SOFT_DROP_MS = 50;

export interface PlayerSummary {
	id: string;
	username: string;
	alive: boolean;
	/** False for a player who joined during the game and waits for the next. */
	inGame: boolean;
	/** False during the grace period after a disconnection. */
	connected: boolean;
	spectrum: number[];
}

/** Public information about a room, sent to every player in it. */
export interface RoomSnapshot {
	id: string;
	status: GameStatus;
	hostId: string | undefined;
	players: PlayerSummary[];
}

export interface GameResult {
	winner: { id: string; username: string } | null;
}

/**
 * How a Game talks to the outside world. index.ts plugs socket.io here;
 * tests plug simple recorders. The Game itself knows nothing about sockets.
 */
export interface GameListener {
	playerState(playerId: string, state: PlayerState): void;
	roomUpdate(snapshot: RoomSnapshot): void;
	gameEnd(result: GameResult): void;
}

export type JoinResult =
	| { ok: true; player: Player; resumed: boolean }
	| { ok: false; reason: string };

export interface GameOptions {
	maxPlayers?: number;
	random?: () => number;
	/** Clock used by gravity and the action throttle; injectable for tests. */
	now?: () => number;
}

/**
 * One room: its host, its players, its status and its own piece sequence.
 *
 * The sequence is generated lazily, one 7-bag at a time, and reset at every
 * start: two rooms never share pieces, but all players of a room get the same
 * pieces in the same order.
 */
export class Game {
	readonly id: string;
	status: GameStatus = "waiting";
	hostId: string | undefined = undefined;
	readonly players = new Map<string, Player>();
	readonly maxPlayers: number;
	#sequence: PieceType[] = [];
	/** True when the current game started with more than one player. */
	#multiplayer = false;
	readonly #random: () => number;
	readonly #listener: GameListener;
	readonly #now: () => number;

	constructor(id: string, listener: GameListener, options: GameOptions = {}) {
		this.id = id;
		this.#listener = listener;
		this.maxPlayers = options.maxPlayers ?? 8;
		this.#random = options.random ?? Math.random;
		this.#now = options.now ?? Date.now;
	}

	get isPlaying(): boolean {
		return this.status === "playing";
	}

	get isEmpty(): boolean {
		return this.players.size === 0;
	}

	/** Piece type at `index` of this game's sequence, extended on demand. */
	pieceAt(index: number): PieceType {
		while (index >= this.#sequence.length) {
			this.#sequence.push(...generateBag(this.#random));
		}
		return this.#sequence[index];
	}

	/**
	 * Adds a player. During a game the player is accepted but waits: it is not
	 * alive and not in the game, and takes part in the next start.
	 *
	 * If a disconnected player with the same username is still in its grace
	 * period, it gets its place back instead (`resumed: true`).
	 */
	join(id: string, username: string): JoinResult {
		const existing = this.#findByUsername(username);
		if (existing?.connected) {
			return { ok: false, reason: "This username is already taken here." };
		}
		if (existing) {
			existing.connected = true;
			this.#sendState(existing);
			this.#notifyRoom();
			return { ok: true, player: existing, resumed: true };
		}

		if (this.players.size >= this.maxPlayers) {
			return { ok: false, reason: "This room is full." };
		}

		const player = new Player(id, username, (index) => this.pieceAt(index));
		this.players.set(id, player);
		this.hostId ??= id;

		this.#listener.playerState(id, player.toState(false));
		this.#notifyRoom();
		return { ok: true, player, resumed: false };
	}

	/**
	 * Start of the grace period: the player keeps its place (and its host
	 * role) until it reconnects or `leave` is called.
	 */
	disconnect(id: string): void {
		const player = this.players.get(id);
		if (!player) return;
		player.connected = false;
		player.softDropping = false;
		this.#notifyRoom();
	}

	leave(id: string): void {
		if (!this.players.delete(id)) return;

		if (this.hostId === id) {
			// The oldest remaining player becomes the host.
			this.hostId = this.players.keys().next().value;
		}

		if (this.isEmpty) {
			this.status = "waiting";
			return;
		}

		this.#notifyRoom();
		this.#checkEnd();
	}

	/** Starts a game. Only the host can do it, and only while waiting. */
	start(requesterId: string): boolean {
		if (requesterId !== this.hostId || this.isPlaying) return false;

		this.#sequence = [];
		this.#multiplayer = this.players.size > 1;
		this.status = "playing";

		const now = this.#now();
		for (const player of this.players.values()) {
			player.reset();
			player.lastFallAt = now;
			this.#listener.playerState(player.id, player.toState(true));
		}

		this.#notifyRoom();
		this.#checkEnd();
		return true;
	}

	/** Applies a player's input. Returns true when something changed. */
	handleAction(playerId: string, action: PlayerAction): boolean {
		const player = this.players.get(playerId);
		if (!this.isPlaying || !player?.alive) return false;

		if (action.type === "setSoftDrop") {
			return this.#setSoftDrop(player, action.active);
		}

		// Server-side limit: each action type has a minimum interval.
		const now = this.#now();
		if (!canAct(player.lastActionAt, action.type, now)) return false;
		player.lastActionAt[action.type satisfies ActionType] = now;

		switch (action.type) {
			case "move":
				return this.#applyMove(player, player.move(action.direction));
			case "rotate":
				return this.#applyMove(player, player.rotate());
			case "softDrop":
				return this.#applyMove(player, player.softDrop());
			case "hardDrop":
				return this.#applyStep(player, player.hardDrop());
		}
	}

	/**
	 * Gravity. Called often (every few ms); each player falls by one row when
	 * its own delay has passed: GRAVITY_MS normally, SOFT_DROP_MS while soft
	 * drop is held. Soft drop replaces gravity, it does not add to it.
	 */
	tick(): void {
		if (!this.isPlaying) return;
		const now = this.#now();
		for (const player of this.players.values()) {
			if (!this.isPlaying) return;
			if (!player.alive) continue;
			const delay = player.softDropping ? SOFT_DROP_MS : GRAVITY_MS;
			if (now - player.lastFallAt < delay) continue;
			player.lastFallAt = now;
			this.#applyStep(player, player.tick());
		}
	}

	snapshot(): RoomSnapshot {
		return {
			id: this.id,
			status: this.status,
			hostId: this.hostId,
			players: [...this.players.values()].map((player) => ({
				id: player.id,
				username: player.username,
				alive: player.alive,
				inGame: player.inGame,
				connected: player.connected,
				spectrum: player.spectrum,
			})),
		};
	}

	#findByUsername(username: string): Player | undefined {
		for (const player of this.players.values()) {
			if (player.username === username) return player;
		}
		return undefined;
	}

	#setSoftDrop(player: Player, active: boolean): boolean {
		if (player.softDropping === active) return false;
		player.softDropping = active;
		// Pressing: fall right away. Releasing: gravity restarts from now.
		player.lastFallAt = this.#now();
		if (active) return this.#applyStep(player, player.tick());
		return false;
	}

	#applyMove(player: Player, changed: boolean): boolean {
		if (changed) this.#sendState(player);
		return changed;
	}

	#applyStep(player: Player, result: StepResult): boolean {
		if (!result.changed) return false;
		this.#sendState(player);
		if (!result.locked) return true;

		const penalty = penaltyFor(result.cleared);
		if (penalty > 0) {
			for (const opponent of this.players.values()) {
				if (opponent !== player && opponent.receivePenalty(penalty)) {
					this.#sendState(opponent);
				}
			}
		}

		// The board changed, so the spectra changed: tell the whole room.
		this.#notifyRoom();
		this.#checkEnd();
		return true;
	}

	/**
	 * Ends the game when nobody can win anymore: at most one survivor in
	 * multiplayer, no survivor in solo. The room goes back to "waiting".
	 */
	#checkEnd(): void {
		if (!this.isPlaying) return;

		const alive = [...this.players.values()].filter((p) => p.alive);
		const finished = this.#multiplayer ? alive.length <= 1 : alive.length === 0;
		if (!finished) return;

		this.status = "waiting";
		const survivor = this.#multiplayer ? alive[0] : undefined;

		for (const player of this.players.values()) {
			this.#sendState(player);
		}

		this.#listener.gameEnd({
			winner: survivor
				? { id: survivor.id, username: survivor.username }
				: null,
		});
		this.#notifyRoom();
	}

	#sendState(player: Player): void {
		this.#listener.playerState(player.id, player.toState(this.isPlaying));
	}

	#notifyRoom(): void {
		this.#listener.roomUpdate(this.snapshot());
	}
}
