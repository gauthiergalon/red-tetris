// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Home } from "./Home";

function Joined() {
	const { roomId, username } = useParams();
	return <p>joined {`${roomId}/${username}`}</p>;
}

function renderHome() {
	render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/:roomId/:username" element={<Joined />} />
			</Routes>
		</MemoryRouter>,
	);
}

afterEach(cleanup);

describe("Home page", () => {
	it("explains the controls, including hold", () => {
		renderHome();
		expect(screen.getByText("Controls")).toBeTruthy();
		expect(screen.getByText(/C or Shift: hold/)).toBeTruthy();
	});

	it("joins the room typed in the form", () => {
		renderHome();
		fireEvent.change(screen.getByPlaceholderText("Room"), {
			target: { value: " my room " },
		});
		fireEvent.change(screen.getByPlaceholderText("Username"), {
			target: { value: "alice" },
		});
		fireEvent.click(screen.getByText("Join"));
		expect(screen.getByText("joined my room/alice")).toBeTruthy();
	});

	it("does nothing while a field is empty", () => {
		renderHome();
		fireEvent.click(screen.getByText("Join"));
		expect(screen.getByText("Controls")).toBeTruthy();
	});
});
