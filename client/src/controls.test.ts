import { describe, expect, it } from "vitest";
import { commandForKey, scrollsThePage } from "./controls.ts";

describe("commandForKey", () => {
	it("maps the guideline keys", () => {
		expect(commandForKey("ArrowUp")).toBe("rotateClockwise");
		expect(commandForKey("X")).toBe("rotateClockwise");
		expect(commandForKey("z")).toBe("rotateCounterClockwise");
		expect(commandForKey("ArrowLeft")).toBe("left");
		expect(commandForKey("ArrowDown")).toBe("softDrop");
		expect(commandForKey(" ")).toBe("hardDrop");
		expect(commandForKey("Shift")).toBe("hold");
	});

	it("ignores other keys, including inherited object keys", () => {
		expect(commandForKey("a")).toBeUndefined();
		expect(commandForKey("toString")).toBeUndefined();
	});
});

describe("scrollsThePage", () => {
	it("is true for arrows and space only", () => {
		expect(scrollsThePage("ArrowDown")).toBe(true);
		expect(scrollsThePage(" ")).toBe(true);
		expect(scrollsThePage("c")).toBe(false);
	});
});
