import { composeBoard, GRID_COLS } from "../board";
import { PIECE_COLORS } from "../colors";
import type { Grid, Piece } from "../types";

export function Board({ grid, piece }: { grid: Grid; piece?: Piece }) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(${GRID_COLS}, 20px)`,
				gap: "1px",
			}}
		>
			{composeBoard(grid, piece).flatMap((row, y) =>
				row.map((cell, x) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed by position
						key={`${y}-${x}`}
						style={{
							width: "20px",
							height: "20px",
							backgroundColor: PIECE_COLORS[cell.value] ?? PIECE_COLORS[" "],
							opacity: cell.ghost ? 0.5 : 1,
						}}
					/>
				)),
			)}
		</div>
	);
}
