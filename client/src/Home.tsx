import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

/** Home page: how to play, the controls, and a form to join a room. */
export function Home() {
	const navigate = useNavigate();
	const [room, setRoom] = useState("");
	const [username, setUsername] = useState("");

	const join = (event: FormEvent) => {
		event.preventDefault();
		const r = room.trim();
		const u = username.trim();
		if (!r || !u) return;
		navigate(`/${encodeURIComponent(r)}/${encodeURIComponent(u)}`);
	};

	return (
		<div>
			<h2>Join a game</h2>
			<form onSubmit={join}>
				<input
					placeholder="Room"
					value={room}
					maxLength={64}
					onChange={(e) => setRoom(e.target.value)}
				/>{" "}
				<input
					placeholder="Username"
					value={username}
					maxLength={24}
					onChange={(e) => setUsername(e.target.value)}
				/>{" "}
				<button type="submit">Join</button>
			</form>
			<p>
				You can also go straight to <code>/&lt;room&gt;/&lt;username&gt;</code>,
				for example <code>/friends/alice</code>. Share the room name to play
				together.
			</p>

			<h2>Controls</h2>
			<ul>
				<li>← / →: move left / right (hold to repeat)</li>
				<li>↑ or X: rotate clockwise</li>
				<li>Z: rotate counter-clockwise</li>
				<li>↓ (hold): soft drop, the piece falls faster</li>
				<li>Space: hard drop, the piece falls at once and locks</li>
				<li>
					C or Shift: hold, keeps the current piece aside for later (once per
					piece)
				</li>
			</ul>

			<h2>How to play</h2>
			<ul>
				<li>
					Complete horizontal lines to clear them. A piece locks when it can no
					longer fall.
				</li>
				<li>
					The first player in a room is the host: only the host can start a
					game. After a 3-second countdown, everyone gets the same pieces in the
					same order.
				</li>
				<li>
					Clearing n lines at once sends n − 1 indestructible lines to every
					opponent (2 lines send 1, a Tetris of 4 lines sends 3).
				</li>
				<li>
					You see each opponent's spectrum: the height of each column of their
					board. It turns red when they are out.
				</li>
				<li>
					You lose when a new piece cannot appear. The last player standing
					wins.
				</li>
				<li>
					Difficulty (chosen by the host before the start): easy, medium or hard
					sets the starting speed. Every 10 lines you clear, your pieces fall 20
					% faster.
				</li>
				<li>
					Score: 100 / 300 / 500 / 800 points for 1 / 2 / 3 / 4 lines, plus 1
					point per row of soft drop and 2 per row of hard drop.
				</li>
				<li>
					Joining during a game: you wait and play the next one. If you get
					disconnected, come back within 5 seconds with the same username to
					keep your place.
				</li>
			</ul>
		</div>
	);
}
