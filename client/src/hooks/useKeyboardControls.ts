import { useEffect, useRef } from "react";
import { type Command, commandForKey, scrollsThePage } from "../controls";
import type { Send } from "./useGameConnection";

export const AUTO_REPEAT_DELAY_MS = 170;
export const AUTO_REPEAT_INTERVAL_MS = 60;

type Side = "left" | "right";

export function useKeyboardControls(send: Send, canPlay: boolean) {
	const canPlayRef = useRef(canPlay);
	canPlayRef.current = canPlay;

	useEffect(() => {
		const repeaters = new Map<Side, ReturnType<typeof setTimeout>>();

		const stopMoving = (side: Side) => {
			clearTimeout(repeaters.get(side));
			repeaters.delete(side);
		};

		const startMoving = (side: Side) => {
			stopMoving(side === "left" ? "right" : "left");
			send("move", side);
			const repeat = () => {
				send("move", side);
				repeaters.set(side, setTimeout(repeat, AUTO_REPEAT_INTERVAL_MS));
			};
			repeaters.set(side, setTimeout(repeat, AUTO_REPEAT_DELAY_MS));
		};

		const releaseEverything = () => {
			stopMoving("left");
			stopMoving("right");
			send("softDrop", false);
		};

		const onPress: Record<Command, () => void> = {
			rotateClockwise: () => send("rotate", "cw"),
			rotateCounterClockwise: () => send("rotate", "ccw"),
			left: () => startMoving("left"),
			right: () => startMoving("right"),
			softDrop: () => send("softDrop", true),
			hardDrop: () => send("hardDrop"),
			hold: () => send("hold"),
		};

		const onRelease: Partial<Record<Command, () => void>> = {
			left: () => stopMoving("left"),
			right: () => stopMoving("right"),
			softDrop: () => send("softDrop", false),
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (!canPlayRef.current) return;
			if (scrollsThePage(event.key)) event.preventDefault();
			if (event.repeat) return;
			const command = commandForKey(event.key);
			if (command) onPress[command]();
		};

		const onKeyUp = (event: KeyboardEvent) => {
			const command = commandForKey(event.key);
			if (command) onRelease[command]?.();
		};

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", releaseEverything);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", releaseEverything);
			stopMoving("left");
			stopMoving("right");
		};
	}, [send]);
}
