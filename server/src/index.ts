import { createRedTetrisServer } from "./server.ts";

const PORT = Number(process.env.PORT ?? 3000);

const server = createRedTetrisServer();

let isShuttingDown = false;

async function shutdown(): Promise<void> {
	if (isShuttingDown) return;
	isShuttingDown = true;
	await server.close();
	process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.httpServer.listen(PORT, () => {
	console.log(`Express + Socket.IO server started on http://localhost:${PORT}`);
});
