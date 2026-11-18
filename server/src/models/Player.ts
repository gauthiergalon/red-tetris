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

export type PieceSource = (index: number) => PieceType;

export interface StepResult {
	changed: boolean;
	locked: boolean;
	cleared: number;
}

export interface PiecePreview {
	type: PieceType;
	shape: string[][];
}

export interface PlayerState {
	grid: Grid;
	piece: Piece | undefined;
	playing: boolean;
	score: number;
	lines: number;
	next: PiecePreview[];
	hold: PiecePreview | null;
	canHold: boolean;
}

export const NEXT_QUEUE_SIZE = 3;

const UNCHANGED: StepResult = { changed: false, locked: false, cleared: 0 };
const MOVED: StepResult = { changed: true, locked: false, cleared: 0 };

function preview(type: PieceType): PiecePreview {
	return { type, shape: getShape(type) };
}

export class Player {
	readonly id: string;
	readonly username: string;
	readonly #pieceSource: PieceSource;

	grid: Grid = createEmptyGrid();
	piece: Piece | undefined = undefined;
	sequenceIndex = 0;
	held: PieceType | null = null;
	canHold = true;
	score = 0;
	lines = 0;

	alive = false;
	inGame = false;
	connected = true;

	softDropping = false;
	lastFallAt = 0;
	lastActionAt: Partial<Record<ActionType, number>> = {};

	constructor(id: string, username: string, pieceSource: PieceSource) {
		this.id = id;
		this.username = username;
		this.#pieceSource = pieceSource;
	}

	get spectrum(): number[] {
		return computeSpectrum(this.grid);
	}

	reset(): void {
		this.grid = createEmptyGrid();
		this.sequenceIndex = 0;
		this.held = null;
		this.canHold = true;
		this.score = 0;
		this.lines = 0;
		this.alive = true;
		this.inGame = true;
		this.softDropping = false;
		this.lastActionAt = {};
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
			hold: this.held ? preview(this.held) : null,
			canHold: this.canHold,
		};
	}

	nextPieces(count = NEXT_QUEUE_SIZE): PiecePreview[] {
		return Array.from({ length: count }, (_, i) =>
			preview(this.#pieceSource(this.sequenceIndex + i)),
		);
	}

	move(direction: Direction): boolean {
		return this.#replacePiece(this.#activePiece?.moved(this.grid, direction));
	}

	rotate(direction: RotationDirection = "cw"): boolean {
		return this.#replacePiece(this.#activePiece?.rotated(this.grid, direction));
	}

	softDrop(): boolean {
		if (!this.move("down")) return false;
		this.score += SOFT_DROP_POINTS;
		return true;
	}

	tick(): StepResult {
		const piece = this.#activePiece;
		if (!piece) return UNCHANGED;
		if (!this.move("down")) return this.#lock(piece);
		if (this.softDropping) this.score += SOFT_DROP_POINTS;
		return MOVED;
	}

	hardDrop(): StepResult {
		const piece = this.#activePiece;
		if (!piece) return UNCHANGED;
		const dropped = piece.dropped(this.grid);
		this.score += HARD_DROP_POINTS * (dropped.pos.y - piece.pos.y);
		return this.#lock(dropped);
	}

	hold(): boolean {
		const piece = this.#activePiece;
		if (!piece || !this.canHold) return false;

		if (this.held) this.#place(Piece.spawn(this.held));
		else this.#spawnNextPiece();

		this.held = piece.type;
		this.canHold = false;
		return true;
	}

	receivePenalty(count: number): boolean {
		if (!this.alive || count <= 0) return false;

		const { grid, overflow } = addPenaltyLines(this.grid, count);
		this.grid = grid;

		if (overflow) {
			this.alive = false;
		} else if (this.piece?.collides(grid)) {
			const lifted = this.#liftAboveBlocks(this.piece, count);
			if (lifted) this.piece = lifted;
			else this.alive = false;
		}
		return true;
	}

	get #activePiece(): Piece | undefined {
		return this.alive ? this.piece : undefined;
	}

	#replacePiece(next: Piece | null | undefined): boolean {
		if (!next) return false;
		this.piece = next;
		return true;
	}

	#liftAboveBlocks(piece: Piece, maxRows: number): Piece | undefined {
		for (let rows = 1; rows <= maxRows; rows++) {
			const lifted = piece.translated(0, -rows);
			if (!lifted.collides(this.grid)) return lifted;
		}
		return undefined;
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

	#spawnNextPiece(): void {
		this.#place(Piece.spawn(this.#pieceSource(this.sequenceIndex)));
		this.sequenceIndex++;
	}

	#place(piece: Piece): void {
		this.piece = piece;
		if (piece.collides(this.grid)) this.alive = false;
	}
}
