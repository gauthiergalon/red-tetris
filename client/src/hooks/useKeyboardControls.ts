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
		const repeaters = new Map<Side, number>();

		function stopMoving(side: Side) {
			window.clearTimeout(repeaters.get(side));
			repeaters.delete(side);
		}

		function repeatMove(side: Side) {
			send("move", side);
			const timer = window.setTimeout(
				() => repeatMove(side),
				AUTO_REPEAT_INTERVAL_MS,
			);
			repeaters.set(side, timer);
		}

		function startMoving(side: Side) {
			if (side === "left") stopMoving("right");
			else stopMoving("left");
			send("move", side);
			const timer = window.setTimeout(
				() => repeatMove(side),
				AUTO_REPEAT_DELAY_MS,
			);
			repeaters.set(side, timer);
		}

		function releaseEverything() {
			stopMoving("left");
			stopMoving("right");
			send("softDrop", false);
		}

		function press(command: Command) {
			switch (command) {
				case "rotateClockwise":
					send("rotate", "cw");
					break;
				case "rotateCounterClockwise":
					send("rotate", "ccw");
					break;
				case "left":
					startMoving("left");
					break;
				case "right":
					startMoving("right");
					break;
				case "softDrop":
					send("softDrop", true);
					break;
				case "hardDrop":
					send("hardDrop");
					break;
				case "hold":
					send("hold");
					break;
			}
		}

		function release(command: Command) {
			switch (command) {
				case "left":
					stopMoving("left");
					break;
				case "right":
					stopMoving("right");
					break;
				case "softDrop":
					send("softDrop", false);
					break;
			}
		}

		function onKeyDown(event: KeyboardEvent) {
			if (!canPlayRef.current) return;
			if (scrollsThePage(event.key)) event.preventDefault();
			if (event.repeat) return;
			const command = commandForKey(event.key);
			if (command) press(command);
		}

		function onKeyUp(event: KeyboardEvent) {
			const command = commandForKey(event.key);
			if (command) release(command);
		}

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
