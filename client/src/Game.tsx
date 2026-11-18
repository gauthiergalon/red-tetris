import { Board } from "./components/Board";
import { Opponents } from "./components/Opponents";
import { SidePanel } from "./components/SidePanel";
import { Toolbar } from "./components/Toolbar";
import {
	canConfigureGame,
	getOpponents,
	getStatusMessage,
	isHost,
} from "./display";
import { useElapsedSeconds } from "./hooks/useElapsedSeconds";
import { useGameConnection } from "./hooks/useGameConnection";
import { useKeyboardControls } from "./hooks/useKeyboardControls";

export function Game({
	roomId,
	username,
}: {
	roomId: string;
	username: string;
}) {
	const { gameState, room, result, myId, connectionError, send } =
		useGameConnection(roomId, username);
	const canPlay = gameState.playing && gameState.piece !== undefined;
	const elapsedSeconds = useElapsedSeconds(gameState.playing);
	useKeyboardControls(send, canPlay);

	const statusMessage = getStatusMessage(room, result, myId);

	return (
		<div>
			<h2>
				Room: {roomId} | Player: {username}
				{isHost(room, myId) ? " (host)" : ""}
			</h2>
			<Toolbar
				send={send}
				canConfigure={canConfigureGame(room, myId)}
				canPlay={canPlay}
				canHold={gameState.canHold}
				difficulty={room?.difficulty ?? "medium"}
				elapsedSeconds={gameState.playing ? elapsedSeconds : null}
			/>
			<div style={{ display: "flex", gap: 16, marginTop: 10 }}>
				<Board grid={gameState.grid} piece={gameState.piece} />
				<SidePanel state={gameState} />
			</div>
			{statusMessage && <p>{statusMessage}</p>}
			{connectionError && <p>{connectionError}</p>}
			<Opponents opponents={getOpponents(room, myId)} room={room} />
		</div>
	);
}
