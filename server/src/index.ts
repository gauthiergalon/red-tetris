import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import { PIECES, createInitialState, checkCollision, rotatePiece, removePiece, placePiece, clearLines } from './game.js';
import type { GameState } from './game.js';

const PORT = Number(process.env.PORT ?? 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../../dist');

const app: Express = express();
app.use(express.static(distDir));
app.use((_req: Request, res: Response) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const httpServer = createServer(app);
const io = new Server(httpServer);

let gameState: GameState = createInitialState();

function emitState() {
  io.emit('gameState', gameState);
}

function tick() {
  if (!gameState.playing) return;

  if (gameState.spawning) {
    const randomIndex = Math.floor(Math.random() * PIECES.length);
    const newPiece = PIECES[randomIndex];
    const newPos = { x: Math.floor((10 - newPiece[0].length) / 2), y: 0 };

    if (checkCollision(newPiece, newPos, gameState.grid)) {
      gameState = { ...gameState, playing: false, spawning: false };
    }

    else {
      let grid = placePiece(gameState.grid, newPiece, newPos);

      gameState = {
        ...gameState,
        spawning: false,
        piece: newPiece,
        pos: newPos,
        grid,
      };
    }
  }

  else {
    const piece = gameState.piece;
    const pos = gameState.pos;

    if (!piece) return;

    const nextPos = { x: pos.x, y: pos.y + 1 };
    const cleanGrid = removePiece(gameState.grid, piece, pos);

    if (checkCollision(piece, nextPos, cleanGrid)) {
      let grid = placePiece(cleanGrid, piece, pos);
      const { grid: clearedGrid, linesCleared } = clearLines(grid);
      gameState = {
        ...gameState,
        spawning: true,
        grid: clearedGrid,
        score: gameState.score + linesCleared * 100,
      };
    }
    else {
      let grid = placePiece(cleanGrid, piece, nextPos);
      gameState = {
        ...gameState,
        grid,
        pos: nextPos,
      };
    }
  }

  emitState();
}

io.on('connection', (socket) => {
  socket.emit('hello', 'Server responds!');
  socket.emit('gameState', gameState);

  socket.on('start', () => {
    const randomIndex = Math.floor(Math.random() * PIECES.length);
    const newPiece = PIECES[randomIndex];
    const newPos = { x: Math.floor((10 - newPiece[0].length) / 2), y: 0 };
    gameState = {
      ...createInitialState(),
      playing: true,
      spawning: true,
      piece: newPiece,
      pos: newPos,
    };
    emitState();
  });

  function dropPiece() {
    if (!gameState.playing || gameState.spawning || !gameState.piece) return;
    const piece = gameState.piece;
    const pos = gameState.pos;
    const nextPos = { x: pos.x, y: pos.y + 1 };
    const cleanGrid = removePiece(gameState.grid, piece, pos);
    if (checkCollision(piece, nextPos, cleanGrid)) {
      let grid = placePiece(cleanGrid, piece, pos);
      const { grid: clearedGrid, linesCleared } = clearLines(grid);
      gameState = {
        ...gameState,
        spawning: true,
        grid: clearedGrid,
        score: gameState.score + linesCleared * 100,
      };
    } else {
      let grid = placePiece(cleanGrid, piece, nextPos);
      gameState = {
        ...gameState,
        grid,
        pos: nextPos,
      };
    }
    emitState();
  }

  socket.on('down', () => {
    dropPiece();
  });

  socket.on('rotate', () => {
    if (!gameState.playing || gameState.spawning || !gameState.piece) return;
    const rotated = rotatePiece(gameState.piece);
    const cleanGrid = removePiece(gameState.grid, gameState.piece, gameState.pos);
    if (!checkCollision(rotated, gameState.pos, cleanGrid)) {
      const newGrid = placePiece(cleanGrid, rotated, gameState.pos);
      gameState = { ...gameState, piece: rotated, grid: newGrid };
      emitState();
    }
  });

  socket.on('move', (dir: unknown) => {
    if (!gameState.playing || gameState.spawning || !gameState.piece) return;
    if (dir !== 'left' && dir !== 'right') return;
    const newPos = { ...gameState.pos, x: gameState.pos.x + (dir === 'left' ? -1 : 1) };
    const cleanGrid = removePiece(gameState.grid, gameState.piece, gameState.pos);
    if (!checkCollision(gameState.piece, newPos, cleanGrid)) {
      const newGrid = placePiece(cleanGrid, gameState.piece, newPos);
      gameState = { ...gameState, pos: newPos, grid: newGrid };
      emitState();
    }
  });
});

const tickInterval = setInterval(() => {
  tick();
}, 800);

function cleanup() {
  clearInterval(tickInterval);
  httpServer.close();
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

httpServer.listen(PORT, () => {
  console.log(`Express + Socket.IO server started on http://localhost:${PORT}`);
});
