import type { Direction, Grid, PieceType } from "../game.ts";
import {
	addPenaltyLines,
	clearLines,
	computeSpectrum,
	createEmptyGrid,
	mergePiece,
} from "../game.ts";
import type { ActionType } from "../throttle.ts";
import { Piece } from "./Piece.ts";

/** Gives the piece type at a given index of the game's shared sequence. */
export type PieceSource = (index: number) => PieceType;

/** Outcome of an action that can lock the current piece. */
export interface StepResult {
	/** The player's state changed and must be sent again. */
	changed: boolean;
	/** The piece was locked into the grid (the board, so the spectrum, changed). */
	locked: boolean;
	/** Number of lines cleared by this lock. */
	cleared: number;
}

/** What the client receives for its own board. */
export interface PlayerState {
	grid: Grid;
	piece: Piece | undefined;
	playing: boolean;
}

const UNCHANGED: StepResult = { changed: false, locked: false, cleared: 0 };
const MOVED: StepResult = { changed: true, locked: false, cleared: 0 };

/**
 * One player of a Game: identity, board, current piece and alive status.
 *
 * The player does not choose its pieces: it reads them from the Game's
 * sequence through `pieceSource`, so every player of a room gets the same
 * pieces in the same order.
 */
export class Player {
	readonly id: string;
	readonly username: string;
	grid: Grid = createEmptyGrid();
	piece: Piece | undefined = undefined;
	alive = false;
	/** True once the player took part in a game (false while waiting). */
	inGame = false;
	/** False during the grace period after a disconnection. */
	connected = true;
	/** True while the soft drop key is held. */
	softDropping = false;
	/** Time (ms) of the last gravity step. */
	lastFallAt = 0;
	/** Last accepted time (ms) of each action type, for the throttle. */
	lastActionAt: Partial<Record<ActionType, number>> = {};
	/** Index of the next piece to take from the game's sequence. */
	sequenceIndex = 0;
	readonly #pieceSource: PieceSource;

	constructor(id: string, username: string, pieceSource: PieceSource) {
		this.id = id;
		this.username = username;
		this.#pieceSource = pieceSource;
	}

	get spectrum(): number[] {
		return computeSpectrum(this.grid);
	}

	/** Prepares a fresh board for a new game and spawns the first piece. */
	reset(): void {
		this.grid = createEmptyGrid();
		this.sequenceIndex = 0;
		this.alive = true;
		this.inGame = true;
		this.lastActionAt = {};
		this.softDropping = false;
		this.#spawnNextPiece();
	}

	toState(gamePlaying: boolean): PlayerState {
		return {
			grid: this.grid,
			piece: this.piece,
			playing: gamePlaying && this.alive,
		};
	}

	move(direction: Direction): boolean {
		if (!this.alive || !this.piece) return false;
		const next = this.piece.moved(this.grid, direction);
		if (!next) return false;
		this.piece = next;
		return true;
	}

	rotate(): boolean {
		if (!this.alive || !this.piece) return false;
		const next = this.piece.rotated(this.grid);
		if (!next) return false;
		this.piece = next;
		return true;
	}

	/** Moves down by one row. Never locks: locking happens on the next tick. */
	softDrop(): boolean {
		return this.move("down");
	}

	/** Gravity: falls by one row, or locks the piece when it cannot fall. */
	tick(): StepResult {
		if (!this.alive || !this.piece) return UNCHANGED;
		if (this.move("down")) return MOVED;
		return this.#lock(this.piece);
	}

	hardDrop(): StepResult {
		if (!this.alive || !this.piece) return UNCHANGED;
		return this.#lock(this.piece.dropped(this.grid));
	}

	/**
	 * Adds `count` indestructible lines at the bottom. The current piece is
	 * pushed up if needed; the player dies when there is no room left.
	 * Returns true when the state changed.
	 */
	receivePenalty(count: number): boolean {
		if (!this.alive || count <= 0) return false;

		const { grid, overflow } = addPenaltyLines(this.grid, count);
		this.grid = grid;

		if (overflow) {
			this.alive = false;
			return true;
		}

		if (this.piece?.collides(grid)) {
			let lifted: Piece | undefined;
			for (let dy = 1; dy <= count && !lifted; dy++) {
				const candidate = this.piece.translated(0, -dy);
				if (!candidate.collides(grid)) lifted = candidate;
			}
			if (lifted) this.piece = lifted;
			else this.alive = false;
		}

		return true;
	}

	#lock(piece: Piece): StepResult {
		const { grid, cleared } = clearLines(mergePiece(this.grid, piece));
		this.grid = grid;
		this.#spawnNextPiece();
		return { changed: true, locked: true, cleared };
	}

	/** Takes the next piece of the sequence. Spawning on a block is a game over. */
	#spawnNextPiece(): void {
		const type = this.#pieceSource(this.sequenceIndex);
		this.sequenceIndex++;
		this.piece = Piece.spawn(type);
		if (this.piece.collides(this.grid)) this.alive = false;
	}
}
