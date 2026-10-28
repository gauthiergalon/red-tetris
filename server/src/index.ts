import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT ?? 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../../dist');

const app: Express = express();

// Serve static files from Vite build
app.use(express.static(distDir));

// Fallback SPA routing
app.use((_req: Request, res: Response) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const httpServer = createServer(app);
const io = new Server(httpServer);

io.on('connection', (socket) => {
  socket.emit('hello', 'Server responds!');
});

httpServer.listen(PORT, () => {
  console.log(`Express + Socket.IO server started on http://localhost:${PORT}`);
});
