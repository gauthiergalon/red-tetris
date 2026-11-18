export type ActionType = "move" | "rotate" | "softDrop" | "hardDrop" | "hold";

export const ACTION_INTERVALS_MS: Record<ActionType, number> = {
	move: 50,
	rotate: 50,
	softDrop: 40,
	hardDrop: 50,
	hold: 200,
};

export function canAct(
	lastActionAt: Partial<Record<ActionType, number>>,
	type: ActionType,
	now: number,
	intervals: Record<ActionType, number> = ACTION_INTERVALS_MS,
): boolean {
	const last = lastActionAt[type];
	return last === undefined || now - last >= intervals[type];
}
