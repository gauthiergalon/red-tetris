export type Command =
	| "rotateClockwise"
	| "rotateCounterClockwise"
	| "left"
	| "right"
	| "softDrop"
	| "hardDrop"
	| "hold";

const KEY_COMMANDS = new Map<string, Command>([
	["ArrowUp", "rotateClockwise"],
	["x", "rotateClockwise"],
	["X", "rotateClockwise"],
	["z", "rotateCounterClockwise"],
	["Z", "rotateCounterClockwise"],
	["ArrowLeft", "left"],
	["ArrowRight", "right"],
	["ArrowDown", "softDrop"],
	[" ", "hardDrop"],
	["c", "hold"],
	["C", "hold"],
	["Shift", "hold"],
]);

const SCROLLING_KEYS = new Set([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	" ",
]);

export function commandForKey(key: string): Command | undefined {
	return KEY_COMMANDS.get(key);
}

export function scrollsThePage(key: string): boolean {
	return SCROLLING_KEYS.has(key);
}
