import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import "./App.css";
import { Game } from "./Game";

function GamePage() {
	const { roomId, username } = useParams();
	return <Game roomId={roomId ?? ""} username={username ?? ""} />;
}

export function App() {
	return (
		<BrowserRouter>
			<div className="container">
				<h1>Red Tetris</h1>
				<section>
					<Routes>
						<Route path="/:roomId/:username" element={<GamePage />} />
						<Route path="*" element={<div>404</div>} />
					</Routes>
				</section>
			</div>
		</BrowserRouter>
	);
}

export default App;
