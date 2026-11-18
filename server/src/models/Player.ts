import type { Direction, Grid, PieceType, RotationDirection } from "../game.ts";
import {
	addPenaltyLines,
	clearLines,
	computeSpectrum,
	createEmptyGrid,
	getShape,
	HARD_DROP_POINTS,
	lineClearScore,
	mergePiece,
	SOFT_DROP_POINTS,
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
	score: number;
	lines: number;
	/** The next pieces of the sequence, in order. */
	next: { type: PieceType; shape: string[][] }[];
	/** The piece kept aside with Hold, if any. */
	hold: { type: PieceType; shape: string[][] } | null;
	/** False once Hold was used, until the current piece locks. */
	canHold: boolean;
}

/** How many upcoming pieces the client can see. */
export const NEXT_QUEUE_SIZE = 3;

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
	/** Piece kept aside with Hold. */
	held: PieceType | null = null;
	/** One Hold per piece: reset to true when a piece locks. */
	canHold = true;
	score = 0;
	/** Total number of lines cleared in the current game. */
	lines = 0;
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
		this.score = 0;
		this.lines = 0;
		this.alive = true;
		this.inGame = true;
		this.lastActionAt = {};
		this.softDropping = false;
		this.held = null;
		this.canHold = true;
		this.#spawnNextPiece();
	}

	toState(gamePlaying: boolean): PlayerState {
		return {
			grid: this.grid,
			piece: this.piece,
			playing: gamePlaying && this.alive,
			score: this.score,
			lines: this.lines,
			next: this.inGame ? this.nextPieces() : [],
			hold: this.held ? { type: this.held, shape: getShape(this.held) } : null,
			canHold: this.canHold,
		};
	}

	move(direction: Direction): boolean {
		if (!this.alive || !this.piece) return false;
		const next = this.piece.moved(this.grid, direction);
		if (!next) return false;
		this.piece = next;
		return true;
	}

	/** Upcoming piece types, read from the game's sequence. */
	nextPieces(count = NEXT_QUEUE_SIZE): PlayerState["next"] {
		return Array.from({ length: count }, (_, i) => {
			const type = this.#pieceSource(this.sequenceIndex + i);
			return { type, shape: getShape(type) };
		});
	}

	rotate(direction: RotationDirection = "cw"): boolean {
		if (!this.alive || !this.piece) return false;
		const next = this.piece.rotated(this.grid, direction);
		if (!next) return false;
		this.piece = next;
		return true;
	}

	/**
	 * Hold (guideline): puts the current piece aside and takes the held one,
	 * or the next piece of the sequence if nothing was held yet. Allowed once
	 * per piece. The swapped-in piece starts again from the spawn position.
	 * Returns true when it happened.
	 */
	hold(): boolean {
		if (!this.alive || !this.piece || !this.canHold) return false;

		const current = this.piece.type;
		if (this.held) {
			this.piece = Piece.spawn(this.held);
			if (this.piece.collides(this.grid)) this.alive = false;
		} else {
			// Takes the next piece of the sequence, like a normal spawn: every
			// player keeps reading the same shared sequence in the same order.
			this.#spawnNextPiece();
		}
		this.held = current;
		this.canHold = false;
		return true;
	}

	/** Moves down by one row. Never locks: locking happens on the next tick. */
	softDrop(): boolean {
		if (!this.move("down")) return false;
		this.score += SOFT_DROP_POINTS;
		return true;
	}

	/** Gravity: falls by one row, or locks the piece when it cannot fall. */
	tick(): StepResult {
		if (!this.alive || !this.piece) return UNCHANGED;
		if (this.move("down")) {
			if (this.softDropping) this.score += SOFT_DROP_POINTS;
			return MOVED;
		}
		return this.#lock(this.piece);
	}

	hardDrop(): StepResult {
		if (!this.alive || !this.piece) return UNCHANGED;
		const dropped = this.piece.dropped(this.grid);
		this.score += HARD_DROP_POINTS * (dropped.pos.y - this.piece.pos.y);
		return this.#lock(dropped);
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
		this.lines += cleared;
		this.score += lineClearScore(cleared);
		this.canHold = true;
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
