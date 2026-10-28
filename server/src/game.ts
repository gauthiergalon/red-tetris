export interface GameState {
  piece: string[][] | undefined;
  pos: { x: number; y: number };
  grid: string[][];
  playing: boolean;
  spawning: boolean;
  score: number;
}

export const GRID_COLS = 10;
export const GRID_ROWS = 20;

export const PIECES: string[][][] = [
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
    grid: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(' ')),
    playing: false,
    spawning: false,
    score: 0,
  };
}

export function rotatePiece(piece: string[][]): string[][] {
  const rows = piece.length;
  const cols = piece[0].length;
  const rotated: string[][] = Array.from({ length: cols }, () => Array(rows).fill(' '));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      rotated[x][rows - 1 - y] = piece[y][x];
    }
  }
  return rotated;
}

export function checkCollision(piece: string[][], pos: { x: number; y: number }, grid: string[][]): boolean {
  for (let y = 0; y < piece.length; y++) {
    for (let x = 0; x < piece[y].length; x++) {
      if (piece[y][x] !== ' ') {
        const gridX = pos.x + x;
        const gridY = pos.y + y;
        if (gridY < 0 || gridY >= grid.length || gridX < 0 || gridX >= grid[0].length || grid[gridY][gridX] !== ' ') {
          return true;
        }
      }
    }
  }
  return false;
}

export function cloneGrid(grid: string[][]): string[][] {
  return grid.map((row) => [...row]);
}

export function removePiece(grid: string[][], piece: string[][], pos: { x: number; y: number }): string[][] {
  const newGrid = cloneGrid(grid);
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

export function placePiece(grid: string[][], piece: string[][], pos: { x: number; y: number }): string[][] {
  const newGrid = cloneGrid(grid);
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

export function clearLines(grid: string[][]): { grid: string[][]; linesCleared: number } {
  let linesCleared = 0;
  const newGrid: string[][] = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    const isFull = row.every((cell) => cell !== ' ');
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
