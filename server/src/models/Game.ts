import type {
	Difficulty,
	Direction,
	PieceType,
	RotationDirection,
} from "../game.ts";
import { generateBag, gravityDelay, penaltyFor } from "../game.ts";
import { canAct } from "../throttle.ts";
import { Player, type PlayerState, type StepResult } from "./Player.ts";

export type GameStatus = "waiting" | "countdown" | "playing";

export type PlayerAction =
	| { type: "move"; direction: Direction }
	| { type: "rotate"; direction?: RotationDirection }
	| { type: "softDrop" }
	| { type: "hardDrop" }
	| { type: "hold" }
	| { type: "setSoftDrop"; active: boolean };

export const SOFT_DROP_MS = 50;

export interface PlayerSummary {
	id: string;
	username: string;
	alive: boolean;
	inGame: boolean;
	connected: boolean;
	score: number;
	spectrum: number[];
}

export interface RoomSnapshot {
	id: string;
	status: GameStatus;
	hostId: string | undefined;
	countdown: number | null;
	difficulty: Difficulty;
	players: PlayerSummary[];
}

export interface GameResult {
	winner: { id: string; username: string } | null;
}

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
	now?: () => number;
	countdownMs?: number;
}

export class Game {
	readonly id: string;
	readonly players = new Map<string, Player>();
	readonly maxPlayers: number;
	status: GameStatus = "waiting";
	difficulty: Difficulty = "medium";
	hostId: string | undefined = undefined;

	readonly #listener: GameListener;
	readonly #random: () => number;
	readonly #now: () => number;
	readonly #countdownMs: number;
	#sequence: PieceType[] = [];
	#multiplayer = false;
	#startsAt = 0;
	#lastAnnouncedCountdown: number | null = null;

	constructor(id: string, listener: GameListener, options: GameOptions = {}) {
		this.id = id;
		this.#listener = listener;
		this.maxPlayers = options.maxPlayers ?? 8;
		this.#random = options.random ?? Math.random;
		this.#now = options.now ?? Date.now;
		this.#countdownMs = options.countdownMs ?? 3_000;
	}

	get isPlaying(): boolean {
		return this.status === "playing";
	}

	get isEmpty(): boolean {
		return this.players.size === 0;
	}

	pieceAt(index: number): PieceType {
		while (index >= this.#sequence.length) {
			this.#sequence.push(...generateBag(this.#random));
		}
		return this.#sequence[index];
	}

	join(id: string, username: string): JoinResult {
		const existing = this.#findByUsername(username);
		if (existing?.connected) {
			return { ok: false, reason: "This username is already taken here." };
		}
		if (existing) return this.#resume(existing);
		if (this.players.size >= this.maxPlayers) {
			return { ok: false, reason: "This room is full." };
		}

		const player = new Player(id, username, (index) => this.pieceAt(index));
		this.players.set(id, player);
		if (this.hostId === undefined) this.hostId = id;
		this.#sendState(player);
		this.#notifyRoom();
		return { ok: true, player, resumed: false };
	}

	disconnect(id: string): void {
		const player = this.players.get(id);
		if (!player) return;
		player.connected = false;
		player.softDropping = false;
		this.#notifyRoom();
	}

	leave(id: string): void {
		if (!this.players.delete(id)) return;
		if (this.hostId === id) this.hostId = this.#firstPlayerId();

		if (this.isEmpty) {
			this.status = "waiting";
			return;
		}
		this.#notifyRoom();
		this.#endIfOver();
	}

	start(requesterId: string): boolean {
		if (!this.#canConfigure(requesterId)) return false;

		if (this.#countdownMs <= 0) {
			this.#begin();
		} else {
			this.status = "countdown";
			this.#startsAt = this.#now() + this.#countdownMs;
			this.#lastAnnouncedCountdown = this.#secondsBeforeStart();
			this.#notifyRoom();
		}
		return true;
	}

	setDifficulty(requesterId: string, difficulty: Difficulty): boolean {
		if (!this.#canConfigure(requesterId)) return false;
		if (difficulty === this.difficulty) return false;
		this.difficulty = difficulty;
		this.#notifyRoom();
		return true;
	}

	handleAction(playerId: string, action: PlayerAction): boolean {
		const player = this.players.get(playerId);
		if (!this.isPlaying || !player?.alive) return false;

		if (action.type === "setSoftDrop") {
			return this.#setSoftDrop(player, action.active);
		}

		const now = this.#now();
		if (!canAct(player.lastActionAt, action.type, now)) return false;
		player.lastActionAt[action.type] = now;

		switch (action.type) {
			case "move":
				return this.#reportMove(player, player.move(action.direction));
			case "rotate":
				return this.#reportMove(player, player.rotate(action.direction));
			case "softDrop":
				return this.#reportMove(player, player.softDrop());
			case "hardDrop":
				return this.#reportStep(player, player.hardDrop());
			case "hold":
				return this.#hold(player);
		}
	}

	tick(): void {
		if (this.status === "countdown") this.#tickCountdown();
		else if (this.isPlaying) this.#applyGravity();
	}

	snapshot(): RoomSnapshot {
		let countdown: number | null = null;
		if (this.status === "countdown") countdown = this.#secondsBeforeStart();

		const players: PlayerSummary[] = [];
		for (const player of this.players.values()) {
			players.push({
				id: player.id,
				username: player.username,
				alive: player.alive,
				inGame: player.inGame,
				connected: player.connected,
				score: player.score,
				spectrum: player.spectrum,
			});
		}

		return {
			id: this.id,
			status: this.status,
			hostId: this.hostId,
			countdown: countdown,
			difficulty: this.difficulty,
			players: players,
		};
	}

	#findByUsername(username: string): Player | undefined {
		for (const player of this.players.values()) {
			if (player.username === username) return player;
		}
		return undefined;
	}

	#firstPlayerId(): string | undefined {
		const ids = Array.from(this.players.keys());
		return ids[0];
	}

	#canConfigure(requesterId: string): boolean {
		return requesterId === this.hostId && this.status === "waiting";
	}

	#resume(player: Player): JoinResult {
		player.connected = true;
		this.#sendState(player);
		this.#notifyRoom();
		return { ok: true, player, resumed: true };
	}

	#secondsBeforeStart(): number {
		return Math.max(0, Math.ceil((this.#startsAt - this.#now()) / 1000));
	}

	#tickCountdown(): void {
		const seconds = this.#secondsBeforeStart();
		if (seconds <= 0) {
			this.#begin();
		} else if (seconds !== this.#lastAnnouncedCountdown) {
			this.#lastAnnouncedCountdown = seconds;
			this.#notifyRoom();
		}
	}

	#begin(): void {
		this.#sequence = [];
		this.#multiplayer = this.players.size > 1;
		this.status = "playing";

		const now = this.#now();
		for (const player of this.players.values()) {
			player.reset();
			player.lastFallAt = now;
			this.#sendState(player);
		}
		this.#notifyRoom();
		this.#endIfOver();
	}

	#applyGravity(): void {
		const now = this.#now();
		for (const player of this.players.values()) {
			if (!this.isPlaying) return;
			if (!player.alive) continue;
			if (now - player.lastFallAt < this.#fallDelay(player)) continue;
			player.lastFallAt = now;
			this.#reportStep(player, player.tick());
		}
	}

	#fallDelay(player: Player): number {
		if (player.softDropping) return SOFT_DROP_MS;
		return gravityDelay(this.difficulty, player.lines);
	}

	#setSoftDrop(player: Player, active: boolean): boolean {
		if (player.softDropping === active) return false;
		player.softDropping = active;
		player.lastFallAt = this.#now();
		if (!active) return false;
		return this.#reportStep(player, player.tick());
	}

	#hold(player: Player): boolean {
		if (!player.hold()) return false;
		this.#sendState(player);
		if (!player.alive) this.#boardsChanged();
		return true;
	}

	#reportMove(player: Player, moved: boolean): boolean {
		if (moved) this.#sendState(player);
		return moved;
	}

	#reportStep(player: Player, result: StepResult): boolean {
		this.#sendState(player);
		if (result.locked) {
			this.#sendPenalty(player, penaltyFor(result.cleared));
			this.#boardsChanged();
		}
		return true;
	}

	#sendPenalty(sender: Player, lines: number): void {
		if (lines <= 0) return;
		for (const opponent of this.players.values()) {
			if (opponent !== sender && opponent.receivePenalty(lines)) {
				this.#sendState(opponent);
			}
		}
	}

	#boardsChanged(): void {
		this.#notifyRoom();
		this.#endIfOver();
	}

	#endIfOver(): void {
		if (!this.isPlaying) return;

		const alive: Player[] = [];
		for (const player of this.players.values()) {
			if (player.alive) alive.push(player);
		}

		if (this.#multiplayer && alive.length > 1) return;
		if (!this.#multiplayer && alive.length > 0) return;

		this.status = "waiting";
		for (const player of this.players.values()) this.#sendState(player);

		let result: GameResult = { winner: null };
		if (this.#multiplayer && alive.length === 1) {
			result = { winner: { id: alive[0].id, username: alive[0].username } };
		}
		this.#listener.gameEnd(result);
		this.#notifyRoom();
	}

	#sendState(player: Player): void {
		this.#listener.playerState(player.id, player.toState(this.isPlaying));
	}

	#notifyRoom(): void {
		this.#listener.roomUpdate(this.snapshot());
	}
}
