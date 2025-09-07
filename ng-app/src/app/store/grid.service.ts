import { Injectable } from '@angular/core';
import { Query } from '@datorama/akita';

import { Store, StoreConfig } from '@datorama/akita';

export interface GridState {
  grid: boolean[][]; // true = wall, false = free
  mode: 'draw' | 'erase' | 'set_points' | 'find_path';
}

export function createInitialGridState(): GridState {
  // Default: 20x20 empty grid
  return {
    grid: Array.from({ length: 20 }, () => Array(20).fill(false)),
    mode: 'draw',
  };
}

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
}

@Injectable({ providedIn: 'root' })
export class GridQuery extends Query<GridState> {
  constructor(store: GridStore) {
    super(store);
  }

  grid$ = this.select(state => state.grid);
  mode$ = this.select(state => state.mode);
  getSnapshot(): GridState {
    return this.getValue();
  }
}
