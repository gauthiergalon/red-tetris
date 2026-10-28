import { useState, useEffect, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

const GRID_COLS = 10;
const GRID_ROWS = 20;

interface GameState {
  piece: string[][] | undefined;
  pos: { x: number; y: number };
  grid: string[][];
  playing: boolean;
  spawning: boolean;
  score: number;
}

export function Game() {
  const [gameState, setGameState] = useState<GameState>({
    piece: undefined,
    pos: { x: 0, y: 0 },
    grid: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(' ')),
    playing: false,
    spawning: false,
    score: 0,
  });

  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const s = io();
    setSocket(s);
    s.on('gameState', (state: GameState) => {
      setGameState(state);
    });
    return () => {
      s.disconnect();
    };
  }, []);

  const isDisabled = !gameState.playing || !gameState.piece;

  const startGame = useCallback(() => {
    socket?.emit('start');
  }, [socket]);

  const rotate = useCallback(() => {
    socket?.emit('rotate');
  }, [socket]);

  const moveLeft = useCallback(() => {
    socket?.emit('move', 'left');
  }, [socket]);

  const softDrop = useCallback(() => {
    socket?.emit('softDrop');
  }, [socket]);

  const moveRight = useCallback(() => {
    socket?.emit('move', 'right');
  }, [socket]);

  const hardDrop = useCallback(() => {
    socket?.emit('hardDrop');
  }, [socket]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!gameState.playing || !gameState.piece) return;
      if (e.key === 'ArrowUp' || e.key === 'r') {
        e.preventDefault();
        rotate();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveLeft();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveRight();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        softDrop();
      } else if (e.key === ' ') {
        e.preventDefault();
        hardDrop();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState.playing, gameState.piece, rotate, moveLeft, moveRight, softDrop, hardDrop]);

  return (
    <div>
      <h2>Tetris Game</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={startGame} disabled={gameState.playing}>
          Start Game
        </button>
        <button onClick={rotate} disabled={isDisabled}>Rotate</button>
        <button onClick={moveLeft} disabled={isDisabled}>←</button>
        <button onClick={moveRight} disabled={isDisabled}>→</button>
        <button onClick={softDrop} disabled={isDisabled}>↓</button>
        <button onClick={hardDrop} disabled={isDisabled}>Hard Drop</button>
        <span>Score: {gameState.score}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID_COLS}, 20px)`,
          gap: '1px',
          marginTop: '10px',
        }}
        role="grid"
        aria-label="Tetris grid"
      >
        {gameState.grid.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              style={{
                width: '20px',
                height: '20px',
                backgroundColor: cell === ' ' ? '#222' : '#ff4444',
                border: '1px solid #555',
              }}
              aria-label={`row ${rowIndex} col ${colIndex}`}
            />
          ))
        )}
      </div>

      {!gameState.playing && (
        <p style={{ marginTop: 8, color: '#ff4444', fontWeight: 'bold' }}>
          Game Over
        </p>
      )}
    </div>
  );
}
