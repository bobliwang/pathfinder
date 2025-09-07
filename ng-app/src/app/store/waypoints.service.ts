import { Store, StoreConfig } from '@datorama/akita';
import { Injectable } from '@angular/core';
import { Query } from '@datorama/akita';

export interface WaypointsState {
  waypoints: Array<{ y: number; x: number }>;
}

export function createInitialWaypointsState(): WaypointsState {
  return {
    waypoints: [],
  };
}

@StoreConfig({ name: 'waypoints' })
export class WaypointsStore extends Store<WaypointsState> {
  constructor() {
    super(createInitialWaypointsState());
  }
}

@Injectable({ providedIn: 'root' })
export class WaypointsService {
  constructor(private waypointsStore: WaypointsStore) {}

  addWaypoint(y: number, x: number) {
    const state = this.waypointsStore.getValue();
    this.waypointsStore.update({ waypoints: [...state.waypoints, { y, x }] });
  }

  removeLastWaypoint() {
    const state = this.waypointsStore.getValue();
    this.waypointsStore.update({ waypoints: state.waypoints.slice(0, -1) });
  }

  removeWaypointAt(index: number) {
    const state = this.waypointsStore.getValue();
    if (index >= 0 && index < state.waypoints.length) {
      const newWaypoints = [...state.waypoints];
      newWaypoints.splice(index, 1);
      this.waypointsStore.update({ waypoints: newWaypoints });
    }
  }

  clearWaypoints() {
    this.waypointsStore.update({ waypoints: [] });
  }
}

@Injectable({ providedIn: 'root' })
export class WaypointsQuery extends Query<WaypointsState> {
  constructor(store: WaypointsStore) {
    super(store);
  }

  waypoints$ = this.select(state => state.waypoints);
  getSnapshot(): WaypointsState {
    return this.getValue();
  }
}
