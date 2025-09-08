import { Injectable } from '@angular/core';
import { Query } from '@datorama/akita';
import { Store, StoreConfig } from '@datorama/akita';

export interface CameraPosition {
  x: number;
  y: number;
}

export interface GridState {
  grid: boolean[][]; // true = wall, false = free
  mode: 'draw' | 'erase' | 'set_points' | 'find_path';
  cameraPositions: CameraPosition[];
  cameraRange: number;
}

export function createInitialGridState(): GridState {
  // Create a default map with walls and obstacles (similar to Pygame version)
  const GRID_HEIGHT = 60;
  const GRID_WIDTH = 80;
  
  // Initialize empty grid (false = free space, true = wall)
  const grid = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(false));
  
  // Add border walls
  const borderThickness = 1;
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (y < borderThickness || y >= GRID_HEIGHT - borderThickness ||
          x < borderThickness || x >= GRID_WIDTH - borderThickness) {
        grid[y][x] = true;
      }
    }
  }
  
  // Add vertical wall in the middle with a door
  const middleX = Math.floor(GRID_WIDTH / 2);
  const wallThickness = 1;
  const wallStartX = middleX - Math.floor(wallThickness / 2);
  const wallEndX = wallStartX + wallThickness;
  
  // Create vertical wall
  for (let y = borderThickness; y < GRID_HEIGHT - borderThickness; y++) {
    for (let x = wallStartX; x < wallEndX && x < GRID_WIDTH; x++) {
      grid[y][x] = true;
    }
  }
  
  // Create door in the middle of the wall
  const doorHeight = 14;
  const doorStartY = Math.floor((GRID_HEIGHT - doorHeight) / 2);
  const doorEndY = doorStartY + doorHeight;
  
  for (let y = doorStartY; y < doorEndY && y < GRID_HEIGHT; y++) {
    for (let x = wallStartX; x < wallEndX && x < GRID_WIDTH; x++) {
      grid[y][x] = false; // Cut out the door
    }
  }
  
  // Add some additional obstacles
  // Top-left room obstacle
  for (let y = 4; y < 8; y++) {
    for (let x = 4; x < 8; x++) {
      grid[y][x] = true;
    }
  }
  
  // Bottom-right room obstacle
  for (let y = GRID_HEIGHT - 8; y < GRID_HEIGHT - 4; y++) {
    for (let x = GRID_WIDTH - 8; x < GRID_WIDTH - 4; x++) {
      grid[y][x] = true;
    }
  }
  
  return {
    grid,
    mode: 'draw',
    cameraPositions: [],
    cameraRange: 20
  };
}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'grid' })
export class GridStore extends Store<GridState> {
  constructor() {
    super(createInitialGridState());
  }
}

@Injectable({ providedIn: 'root' })
export class GridService {
  constructor(private gridStore: GridStore) {}

  setMode(mode: GridState['mode']) {
    this.gridStore.update({ mode });
  }

  updateGrid(grid: boolean[][]) {
    this.gridStore.update({ grid });
  }

  drawAt(y: number, x: number, isWall: boolean) {
    const state = this.gridStore.getValue();
    const grid = state.grid.map(row => [...row]);
    if (grid[y] && grid[y][x] !== undefined) {
      grid[y][x] = isWall;
      this.gridStore.update({ grid });
    }
  }

  setCameraPositions(positions: CameraPosition[]) {
    this.gridStore.update({ cameraPositions: positions });
  }

  setCameraRange(range: number) {
    this.gridStore.update({ cameraRange: range });
  }

  clearCameraPositions() {
    this.gridStore.update({ cameraPositions: [] });
  }
}

@Injectable({ providedIn: 'root' })
export class GridQuery extends Query<GridState> {
  constructor(private gridStore: GridStore) {
    super(gridStore);
  }

  grid$ = this.select(state => state.grid);
  mode$ = this.select(state => state.mode);
  cameraPositions$ = this.select(state => state.cameraPositions);
  cameraRange$ = this.select(state => state.cameraRange);
  
  getSnapshot(): GridState {
    return this.getValue();
  }
}
