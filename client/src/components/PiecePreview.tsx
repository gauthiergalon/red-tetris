import { EMPTY } from "../board";
import { PIECE_COLORS } from "../colors";

export function PiecePreview({ shape }: { shape: string[][] }) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(${shape[0].length}, 12px)`,
				gap: "1px",
				marginBottom: 8,
			}}
		>
			{shape.flatMap((row, y) =>
				row.map((cell, x) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed by position
						key={`${y}-${x}`}
						style={{
							width: 12,
							height: 12,
							backgroundColor:
								cell === EMPTY ? "transparent" : PIECE_COLORS[cell],
						}}
					/>
				)),
			)}
		</div>
	);
}
