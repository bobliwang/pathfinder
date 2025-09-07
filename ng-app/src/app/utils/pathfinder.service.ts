import { Injectable } from '@angular/core';
import { GridQuery } from '../store/grid.service';
import { WaypointsQuery } from '../store/waypoints.service';
import { PathfinderService } from '../store/pathfinder.service';

@Injectable({
  providedIn: 'root'
})
export class PathfinderUtilsService {

  constructor(
    private gridQuery: GridQuery,
    private waypointsQuery: WaypointsQuery,
    private pathfinderService: PathfinderService
  ) { }

  async planPath(): Promise<void> {
    const gridState = this.gridQuery.getSnapshot();
    const waypointsState = this.waypointsQuery.getSnapshot();
    const pathfinderState = this.pathfinderService['pathfinderStore'].getValue();

    if (waypointsState.waypoints.length < 2) {
      console.log('Need at least 2 waypoints');
      return;
    }

    console.log(`Planning path for ${waypointsState.waypoints.length} waypoints`);
    
    // Simple pathfinding - connect waypoints in order
    const path = this.findPathThroughWaypoints(
      gridState.grid, 
      waypointsState.waypoints, 
      pathfinderState.optimizeOrder
    );
    
    if (path) {
      this.pathfinderService.setPath(path);
      this.pathfinderService.setPathDrawIndex(0);
    } else {
      console.log('Failed to find path!');
      this.pathfinderService.setPath(null);
    }
  }

  private findPathThroughWaypoints(
    grid: boolean[][],
    waypoints: Array<{ y: number; x: number }>,
    optimizeOrder: boolean
  ): Array<{ y: number; x: number }> | null {
    
    // For now, just return a simple direct path between waypoints
    // TODO: Implement A* algorithm
    const path: Array<{ y: number; x: number }> = [];
    
    for (let i = 0; i < waypoints.length - 1; i++) {
      const start = waypoints[i];
      const end = waypoints[i + 1];
      const segment = this.findDirectPath(start, end);
      
      if (i === 0) {
        path.push(...segment);
      } else {
        // Skip first point to avoid duplicates
        path.push(...segment.slice(1));
      }
    }
    
    return path.length > 0 ? path : null;
  }

  private findDirectPath(
    start: { y: number; x: number },
    end: { y: number; x: number }
  ): Array<{ y: number; x: number }> {
    const path: Array<{ y: number; x: number }> = [];
    
    // Simple line algorithm (Bresenham-like)
    let x0 = start.x, y0 = start.y;
    const x1 = end.x, y1 = end.y;
    
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      path.push({ y: y0, x: x0 });
      
      if (x0 === x1 && y0 === y1) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
    
    return path;
  }
}
