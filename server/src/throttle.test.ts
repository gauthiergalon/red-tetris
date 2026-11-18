import { describe, expect, it } from "vitest";
import { ACTION_INTERVALS_MS, canAct } from "./throttle.ts";

describe("canAct", () => {
	it("accepts the first action of a type", () => {
		expect(canAct({}, "move", 0)).toBe(true);
	});

	it("refuses until the interval has passed", () => {
		const last = { move: 1000 };
		expect(canAct(last, "move", 1000 + ACTION_INTERVALS_MS.move - 1)).toBe(
			false,
		);
		expect(canAct(last, "move", 1000 + ACTION_INTERVALS_MS.move)).toBe(true);
	});

	it("keeps each action type independent", () => {
		expect(canAct({ move: 1000 }, "rotate", 1000)).toBe(true);
	});
});
