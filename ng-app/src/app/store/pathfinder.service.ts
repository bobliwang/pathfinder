import { Store, StoreConfig } from '@datorama/akita';
import { Injectable } from '@angular/core';
import { Query } from '@datorama/akita';

export interface PathfinderState {
  path: Array<{ y: number; x: number }> | null;
  animating: boolean;
  pathDrawIndex: number;
  optimizeOrder: boolean;
}

export function createInitialPathfinderState(): PathfinderState {
  return {
    path: null,
    animating: false,
    pathDrawIndex: 0,
    optimizeOrder: true,
  };
}

@StoreConfig({ name: 'pathfinder' })
export class PathfinderStore extends Store<PathfinderState> {
  constructor() {
    super(createInitialPathfinderState());
  }
}

@Injectable({ providedIn: 'root' })
export class PathfinderService {
  constructor(private pathfinderStore: PathfinderStore) {}

  setPath(path: Array<{ y: number; x: number }> | null) {
    this.pathfinderStore.update({ path });
  }

  setAnimating(animating: boolean) {
    this.pathfinderStore.update({ animating });
  }

  setPathDrawIndex(index: number) {
    this.pathfinderStore.update({ pathDrawIndex: index });
  }

  setOptimizeOrder(optimizeOrder: boolean) {
    this.pathfinderStore.update({ optimizeOrder });
  }
}

@Injectable({ providedIn: 'root' })
export class PathfinderQuery extends Query<PathfinderState> {
  constructor(store: PathfinderStore) {
    super(store);
  }

  path$ = this.select(state => state.path);
  animating$ = this.select(state => state.animating);
  pathDrawIndex$ = this.select(state => state.pathDrawIndex);
  optimizeOrder$ = this.select(state => state.optimizeOrder);
  getSnapshot(): PathfinderState {
    return this.getValue();
  }
}
