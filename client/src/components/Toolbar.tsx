import type { Send } from "../hooks/useGameConnection";
import { DIFFICULTIES, type Difficulty } from "../types";

interface ToolbarProps {
	send: Send;
	canConfigure: boolean;
	canPlay: boolean;
	canHold: boolean;
	difficulty: Difficulty;
	elapsedSeconds: number | null;
}

export function Toolbar({
	send,
	canConfigure,
	canPlay,
	canHold,
	difficulty,
	elapsedSeconds,
}: ToolbarProps) {
	const actions: [label: string, event: string, ...args: unknown[]][] = [
		["Rotate ↺", "rotate", "ccw"],
		["Rotate ↻", "rotate", "cw"],
		["←", "move", "left"],
		["→", "move", "right"],
		["↓", "softDrop"],
		["Hard Drop", "hardDrop"],
	];

	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				flexWrap: "wrap",
				alignItems: "center",
			}}
		>
			<button
				type="button"
				onClick={() => send("start")}
				disabled={!canConfigure}
			>
				Start Game
			</button>
			{actions.map(([label, event, ...args]) => (
				<button
					key={label}
					type="button"
					onClick={() => send(event, ...args)}
					disabled={!canPlay}
				>
					{label}
				</button>
			))}
			<button
				type="button"
				onClick={() => send("hold")}
				disabled={!canPlay || !canHold}
			>
				Hold
			</button>
			<label>
				Difficulty:{" "}
				<select
					value={difficulty}
					onChange={(event) => send("difficulty", event.target.value)}
					disabled={!canConfigure}
				>
					{DIFFICULTIES.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</label>
			{elapsedSeconds !== null && <span>Timer: {elapsedSeconds}s</span>}
		</div>
	);
}
