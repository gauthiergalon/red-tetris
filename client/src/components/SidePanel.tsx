import type { GameState } from "../types";
import { PiecePreview } from "./PiecePreview";

export function SidePanel({ state }: { state: GameState }) {
	return (
		<div>
			<div>Score: {state.score}</div>
			<div>Lines: {state.lines}</div>
			<h4>Hold</h4>
			<div style={{ opacity: state.canHold ? 1 : 0.4 }}>
				{state.hold ? (
					<PiecePreview shape={state.hold.shape} />
				) : (
					<div>(empty)</div>
				)}
			</div>
			<h4>Next</h4>
			{state.next.map((piece, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: the queue order is the identity
				<PiecePreview key={index} shape={piece.shape} />
			))}
		</div>
	);
}
