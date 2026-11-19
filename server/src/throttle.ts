export type ActionType = "move" | "rotate" | "softDrop" | "hardDrop" | "hold";

export const ACTION_INTERVALS_MS: Record<ActionType, number> = {
	move: 50,
	rotate: 50,
	softDrop: 40,
	hardDrop: 50,
	hold: 200,
};

export interface LastActionTimes {
	move?: number;
	rotate?: number;
	softDrop?: number;
	hardDrop?: number;
	hold?: number;
}

export function canAct(
	lastActionAt: LastActionTimes,
	type: ActionType,
	now: number,
	intervals: Record<ActionType, number> = ACTION_INTERVALS_MS,
): boolean {
	const last = lastActionAt[type];
	if (last === undefined) return true;
	return now - last >= intervals[type];
}
