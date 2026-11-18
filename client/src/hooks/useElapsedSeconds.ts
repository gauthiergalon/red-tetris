import { useEffect, useState } from "react";

export function useElapsedSeconds(running: boolean): number {
	const [seconds, setSeconds] = useState(0);

	useEffect(() => {
		if (!running) return;
		setSeconds(0);
		const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
		return () => clearInterval(interval);
	}, [running]);

	return seconds;
}
