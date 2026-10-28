export type Char = string;

export interface GameState {
  piece: Char[][] | undefined;
  pos: { x: number; y: number };
  grid: Char[][];
  playing: boolean;
  spawning: boolean;
  score: number;
}

export const PIECES: Char[][][] = [
  [
    [' ', ' ', ' ', ' '],
    ['I', 'I', 'I', 'I'],
    [' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' '],
  ],
  [
    ['O', 'O'],
    ['O', 'O'],
  ],
  [
    [' ', 'T', ' '],
    ['T', 'T', 'T'],
    [' ', ' ', ' '],
  ],
  [
    [' ', 'S', 'S'],
    ['S', 'S', ' '],
    [' ', ' ', ' '],
  ],
  [
    ['Z', 'Z', ' '],
    [' ', 'Z', 'Z'],
    [' ', ' ', ' '],
  ],
  [
    ['J', ' ', ' '],
    ['J', 'J', 'J'],
    [' ', ' ', ' '],
  ],
  [
    [' ', ' ', 'L'],
    ['L', 'L', 'L'],
    [' ', ' ', ' '],
  ],
];

export function createInitialState(): GameState {
  return {
    piece: undefined,
    pos: { x: 0, y: 0 },
    grid: Array.from({ length: 20 }, () => Array(10).fill(' ')),
    playing: false,
    spawning: false,
    score: 0,
  };
}

export function rotatePiece(piece: Char[][]): Char[][] {
  const rows = piece.length;
  const cols = piece[0].length;
  const rotated: Char[][] = Array.from({ length: cols }, () => Array(rows).fill(' '));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      rotated[x][rows - 1 - y] = piece[y][x];
    }
  }
  return rotated;
}

export function checkCollision(piece: Char[][], pos: { x: number; y: number }, grid: Char[][]): boolean {
  for (let y = 0; y < piece.length; y++) {
    for (let x = 0; x < piece[y].length; x++) {
      if (piece[y][x] !== ' ') {
        const gridX = pos.x + x;
        const gridY = pos.y + y;
        if (gridY >= grid.length || gridX < 0 || gridX >= grid[0].length || grid[gridY][gridX] !== ' ') {
          return true;
        }
      }
    }
  }
  return false;
}

export function removePiece(grid: Char[][], piece: Char[][], pos: { x: number; y: number }): Char[][] {
  const newGrid = grid.map(row => [...row]);
  for (let y = 0; y < piece.length; y++) {
    for (let x = 0; x < piece[y].length; x++) {
      if (piece[y][x] !== ' ') {
        const gridX = pos.x + x;
        const gridY = pos.y + y;
        if (gridY >= 0 && gridY < newGrid.length && gridX >= 0 && gridX < newGrid[0].length) {
          newGrid[gridY][gridX] = ' ';
        }
      }
    }
  }
  return newGrid;
}

export function placePiece(grid: Char[][], piece: Char[][], pos: { x: number; y: number }): Char[][] {
  const newGrid = grid.map(row => [...row]);
  for (let y = 0; y < piece.length; y++) {
    for (let x = 0; x < piece[y].length; x++) {
      if (piece[y][x] !== ' ') {
        const gridX = pos.x + x;
        const gridY = pos.y + y;
        if (gridY >= 0 && gridY < newGrid.length && gridX >= 0 && gridX < newGrid[0].length) {
          newGrid[gridY][gridX] = piece[y][x];
        }
      }
    }
  }
  return newGrid;
}

export function clearLines(grid: Char[][]): { grid: Char[][]; linesCleared: number } {
  let linesCleared = 0;
  const newGrid: Char[][] = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    const isFull = row.every(cell => cell !== ' ');
    if (isFull) {
      linesCleared++;
    } else {
      newGrid.push([...row]);
    }
  }
  while (newGrid.length < grid.length) {
    newGrid.unshift(Array(grid[0].length).fill(' '));
  }
  return { grid: newGrid, linesCleared };
}
