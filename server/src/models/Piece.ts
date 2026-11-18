import type {
	Direction,
	Grid,
	PieceData,
	PieceType,
	Position,
	RotationDirection,
} from "../game.ts";
import {
	DIRECTIONS,
	dropPosition,
	getShape,
	isColliding,
	offsetPosition,
	rotateWithKicks,
	spawnPosition,
} from "../game.ts";

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

	static spawn(type: PieceType): Piece {
		return new Piece(type, getShape(type), spawnPosition(type));
	}

	collides(grid: Grid): boolean {
		return isColliding(grid, this);
	}

	translated(dx: number, dy: number): Piece {
		return new Piece(
			this.type,
			this.shape,
			offsetPosition(this.pos, dx, dy),
			this.rotationState,
		);
	}

	moved(grid: Grid, direction: Direction): Piece | null {
		const { x, y } = DIRECTIONS[direction];
		const next = this.translated(x, y);
		return next.collides(grid) ? null : next;
	}

	rotated(grid: Grid, direction: RotationDirection = "cw"): Piece | null {
		const result = rotateWithKicks(grid, this, direction);
		if (!result) return null;
		return new Piece(this.type, result.shape, result.pos, result.rotationState);
	}

	dropped(grid: Grid): Piece {
		const pos = dropPosition(grid, this);
		return new Piece(this.type, this.shape, pos, this.rotationState);
	}
}
