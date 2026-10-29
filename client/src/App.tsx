import "./App.css";
import { Game } from "./Game";

export function App() {
	return (
		<div className="container">
			<h1>Red Tetris</h1>
			<section>
				<Game />
			</section>
		</div>
	);
}

export default App;
