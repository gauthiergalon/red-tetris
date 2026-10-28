import { useState, useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';

interface GameState {
  piece: string[][] | undefined;
  pos: { x: number; y: number };
  grid: string[][];
  playing: boolean;
  spawning: boolean;
}

export function Game() {
  const [gameState, setGameState] = useState<GameState>({
    piece: undefined,
    pos: { x: 0, y: 0 },
    grid: Array.from({ length: 20 }, () => Array(10).fill(' ')),
    playing: false,
    spawning: false,
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

  const startGame = () => {
    socket?.emit('start');
  };

  const rotate = () => {
    socket?.emit('rotate');
  };

  const moveLeft = () => {
    socket?.emit('move', 'left');
  };

  const drop = () => {
    socket?.emit('down');
  };

  const moveRight = () => {
    socket?.emit('move', 'right');
  };

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
        drop();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState.playing, gameState.piece, socket]);

  return (
    <div>
      <h2>Tetris Game</h2>
      <button onClick={startGame} disabled={gameState.playing}>
        Start Game
      </button>
      <button onClick={rotate} disabled={!gameState.playing || !gameState.piece} style={{ marginLeft: 8 }}>
        Rotate
      </button>
      <button onClick={moveLeft} disabled={!gameState.playing || !gameState.piece} style={{ marginLeft: 8 }}>
        ←
      </button>
      <button onClick={drop} disabled={!gameState.playing || !gameState.piece} style={{ marginLeft: 8 }}>
        ↓
      </button>
      <button onClick={moveRight} disabled={!gameState.playing || !gameState.piece} style={{ marginLeft: 8 }}>
        →
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(10, 20px)',
          gap: '1px',
          marginTop: '10px',
        }}
      >
        {gameState.grid.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              style={{
                width: '20px',
                height: '20px',
                backgroundColor: cell === ' ' ? '#eee' : '#333',
                border: '1px solid #ccc',
              }}
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
