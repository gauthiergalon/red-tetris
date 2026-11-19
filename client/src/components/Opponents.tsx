import { GRID_COLS, GRID_ROWS } from "../board";
import { SPECTRUM_COLORS } from "../colors";
import { isEliminated, opponentTags, spectrumToRows } from "../display";
import type { PlayerSummary, RoomSnapshot } from "../types";

function spectrumColor(filled: boolean, eliminated: boolean): string {
	if (eliminated && filled) return SPECTRUM_COLORS.eliminatedFilled;
	if (eliminated) return SPECTRUM_COLORS.eliminatedEmpty;
	if (filled) return SPECTRUM_COLORS.filled;
	return SPECTRUM_COLORS.empty;
}

function Spectrum({ player }: { player: PlayerSummary }) {
	const eliminated = isEliminated(player);
	return (
		<div
			aria-disabled={eliminated}
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(${GRID_COLS}, 6px)`,
				gap: "1px",
				opacity: eliminated ? 0.5 : 1,
			}}
		>
			{spectrumToRows(player.spectrum, GRID_ROWS).flatMap((row, y) =>
				row.map((filled, x) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed by position
						key={`${y}-${x}`}
						style={{
							width: 6,
							height: 6,
							backgroundColor: spectrumColor(filled, eliminated),
						}}
					/>
				)),
			)}
		</div>
	);
}

export function Opponents({
	opponents,
	room,
}: {
	opponents: PlayerSummary[];
	room: RoomSnapshot | null;
}) {
	return (
		<>
			<h3>Opponents</h3>
			{opponents.length === 0 && <p>No one else in this room.</p>}
			<div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
				{opponents.map((opponent) => (
					<div key={opponent.id}>
						<div>
							{opponent.username} ({opponent.score})
							{opponentTags(opponent, room)}
						</div>
						<Spectrum player={opponent} />
					</div>
				))}
			</div>
		</>
	);
}
