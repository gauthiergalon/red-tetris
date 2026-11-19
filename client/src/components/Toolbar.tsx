import type { Send } from "../hooks/useGameConnection";
import { DIFFICULTIES, type Difficulty } from "../types";

interface ToolbarAction {
	label: string;
	event: string;
	value?: string;
}

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
	const actions: ToolbarAction[] = [
		{ label: "Rotate ↺", event: "rotate", value: "ccw" },
		{ label: "Rotate ↻", event: "rotate", value: "cw" },
		{ label: "←", event: "move", value: "left" },
		{ label: "→", event: "move", value: "right" },
		{ label: "↓", event: "softDrop" },
		{ label: "Hard Drop", event: "hardDrop" },
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
			{actions.map((action) => (
				<button
					key={action.label}
					type="button"
					onClick={() => send(action.event, action.value)}
					disabled={!canPlay}
				>
					{action.label}
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
