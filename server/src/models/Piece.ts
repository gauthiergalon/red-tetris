import type {
	Direction,
	Grid,
	PieceData,
	PieceType,
	Position,
} from "../game.ts";
import {
	DIRECTIONS,
	dropPosition,
	getShape,
	isColliding,
	offsetPosition,
	rotateWithKicks,
	SPAWN_POSITION,
} from "../game.ts";

/**
 * A falling tetromino.
 *
 * Instances are immutable: every move returns a new Piece. The class only
 * wraps the pure functions of game.ts. Its own fields (type, shape, pos,
 * rotationState) are what socket.io sends to the client.
 */
export class Piece implements PieceData {
	readonly type: PieceType;
	readonly shape: string[][];
	readonly pos: Position;
	readonly rotationState: number;

	constructor(
		type: PieceType,
		shape: string[][],
		pos: Position,
		rotationState = 0,
	) {
		this.type = type;
		this.shape = shape;
		this.pos = pos;
		this.rotationState = rotationState;
	}

	/** A new piece of the given type at the spawn position. */
	static spawn(type: PieceType): Piece {
		return new Piece(type, getShape(type), { ...SPAWN_POSITION });
	}

	collides(grid: Grid): boolean {
		return isColliding(grid, this);
	}

	/** Same piece shifted by (dx, dy), without any collision check. */
	translated(dx: number, dy: number): Piece {
		return new Piece(
			this.type,
			this.shape,
			offsetPosition(this.pos, dx, dy),
			this.rotationState,
		);
	}

	/** The moved piece, or null when the move collides. */
	moved(grid: Grid, direction: Direction): Piece | null {
		const { x, y } = DIRECTIONS[direction];
		const next = this.translated(x, y);
		return next.collides(grid) ? null : next;
	}

	/** The rotated piece (SRS kicks included), or null when it cannot rotate. */
	rotated(grid: Grid): Piece | null {
		const result = rotateWithKicks(grid, this);
		if (!result) return null;
		return new Piece(this.type, result.shape, result.pos, result.rotationState);
	}

	/** The piece moved as low as it can go. */
	dropped(grid: Grid): Piece {
		const pos = dropPosition(grid, this);
		return new Piece(this.type, this.shape, pos, this.rotationState);
	}
}
