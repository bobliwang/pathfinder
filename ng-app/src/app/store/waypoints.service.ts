import { Store, StoreConfig } from '@datorama/akita';
import { Injectable } from '@angular/core';
import { Query } from '@datorama/akita';

export type WaypointStatus = 'pending' | 'visited' | 'failed';

export interface Waypoint {
  y: number;
  x: number;
  status: WaypointStatus;
}

export interface WaypointsState {
  waypoints: Waypoint[];
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

  addWaypoint(y: number, x: number, status: WaypointStatus = 'pending') {
    const state = this.waypointsStore.getValue();
    this.waypointsStore.update({ waypoints: [...state.waypoints, { y, x, status }] });
  }

  updateWaypointStatus(index: number, status: WaypointStatus) {
    const state = this.waypointsStore.getValue();
    if (index >= 0 && index < state.waypoints.length) {
      const newWaypoints = [...state.waypoints];
      newWaypoints[index] = { ...newWaypoints[index], status };
      this.waypointsStore.update({ waypoints: newWaypoints });
    }
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
