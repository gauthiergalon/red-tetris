import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import {
  PIECES,
  GRID_COLS,
  GRID_ROWS,
  createInitialState,
  checkCollision,
  rotatePiece,
  removePiece,
  placePiece,
  clearLines,
} from './game.js';
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

function spawnPiece(): GameState | null {
  const randomIndex = Math.floor(Math.random() * PIECES.length);
  const newPiece = PIECES[randomIndex];
  const newPos = { x: Math.floor((GRID_COLS - newPiece[0].length) / 2), y: 0 };

  if (checkCollision(newPiece, newPos, gameState.grid)) {
    return { ...gameState, playing: false, spawning: false };
  }

  const grid = placePiece(gameState.grid, newPiece, newPos);
  return {
    ...gameState,
    spawning: false,
    piece: newPiece,
    pos: newPos,
    grid,
  };
}

function processDrop(): GameState | null {
  if (!gameState.playing || gameState.spawning || !gameState.piece) return null;

  const piece = gameState.piece;
  const pos = gameState.pos;
  const nextPos = { x: pos.x, y: pos.y + 1 };
  const cleanGrid = removePiece(gameState.grid, piece, pos);

  if (checkCollision(piece, nextPos, cleanGrid)) {
    const grid = placePiece(cleanGrid, piece, pos);
    const { grid: clearedGrid, linesCleared } = clearLines(grid);
    return {
      ...gameState,
      spawning: true,
      grid: clearedGrid,
      score: gameState.score + linesCleared * 100,
    };
  }

  const grid = placePiece(cleanGrid, piece, nextPos);
  return {
    ...gameState,
    grid,
    pos: nextPos,
  };
}

function tick() {
  if (!gameState.playing) return;

  if (gameState.spawning) {
    const spawned = spawnPiece();
    if (spawned) {
      gameState = spawned;
    }
  } else {
    const dropped = processDrop();
    if (dropped) {
      gameState = dropped;
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
    const newPos = { x: Math.floor((GRID_COLS - newPiece[0].length) / 2), y: 0 };
    gameState = {
      ...createInitialState(),
      playing: true,
      spawning: true,
      piece: newPiece,
      pos: newPos,
    };
    emitState();
  });

  socket.on('softDrop', () => {
    const dropped = processDrop();
    if (dropped) {
      gameState = dropped;
    }
    emitState();
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

  socket.on('hardDrop', () => {
    if (!gameState.playing || gameState.spawning || !gameState.piece) return;
    const bottomPos = { ...gameState.pos };
    const cleanGrid = removePiece(gameState.grid, gameState.piece, gameState.pos);
    while (!checkCollision(gameState.piece, { x: bottomPos.x, y: bottomPos.y + 1 }, cleanGrid)) {
      bottomPos.y += 1;
    }
    const newGrid = placePiece(cleanGrid, gameState.piece, bottomPos);
    const { grid: clearedGrid, linesCleared } = clearLines(newGrid);
    gameState = {
      ...gameState,
      spawning: true,
      grid: clearedGrid,
      score: gameState.score + linesCleared * 100,
    };
    emitState();
  });
});

const tickInterval = setInterval(() => {
  tick();
}, 500);

function cleanup() {
  clearInterval(tickInterval);
  httpServer.close();
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

httpServer.listen(PORT, () => {
  console.log(`Express + Socket.IO server started on http://localhost:${PORT}`);
});
