// -----------------------------------------------------------------------------
// Server-side action throttle.
//
// The client has its own auto-repeat, but the server cannot trust it: a
// modified client could send hundreds of moves per second. So the server
// enforces a minimum delay between two actions of the same type.
// -----------------------------------------------------------------------------

export type ActionType = "move" | "rotate" | "softDrop" | "hardDrop" | "hold";

/** Minimum delay (ms) between two accepted actions of the same type. */
export const ACTION_INTERVALS_MS: Record<ActionType, number> = {
	move: 50,
	rotate: 100,
	softDrop: 40,
	hardDrop: 50,
	hold: 200,
};

/** Pure check: can an action of this type be accepted at time `now`? */
export function canAct(
	lastActionAt: Partial<Record<ActionType, number>>,
	type: ActionType,
	now: number,
	intervals: Record<ActionType, number> = ACTION_INTERVALS_MS,
): boolean {
	const last = lastActionAt[type];
	return last === undefined || now - last >= intervals[type];
}
