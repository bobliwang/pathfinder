import { Injectable } from '@angular/core';
import { GridQuery } from '../store/grid.service';
import { WaypointsQuery } from '../store/waypoints.service';
import { PathfinderService } from '../store/pathfinder.service';

interface Node {
  y: number;
  x: number;
  gCost: number;
  fCost: number;
  parent: Node | null;
}

interface Point {
  y: number;
  x: number;
}

const SAFETY_BUFFER = 1; // Distance to keep from walls (in grid cells)

@Injectable({
  providedIn: 'root'
})
export class PathfinderUtilsService {

  constructor(
    private gridQuery: GridQuery,
    private waypointsQuery: WaypointsQuery,
    private pathfinderService: PathfinderService
  ) { }

  /**
   * Inflate obstacles in the grid to create a safety buffer around walls
   */
  private inflateGrid(grid: boolean[][], waypoints: Point[], bufferSize: number = SAFETY_BUFFER): boolean[][] {
    const rows = grid.length;
    const cols = grid[0].length;
    const inflatedGrid = grid.map(row => [...row]); // Deep copy
    
    // Create a set of waypoint positions to avoid blocking them
    const waypointSet = new Set(waypoints.map(p => `${p.y},${p.x}`));
    
    console.log('Original obstacles:', grid.flat().filter(Boolean).length);
    console.log('Waypoints to preserve:', waypoints);
    
    // For each wall cell, mark surrounding cells as obstacles too
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x]) { // If this is a wall
          // Mark cells within buffer distance as obstacles
          for (let dy = -bufferSize; dy <= bufferSize; dy++) {
            for (let dx = -bufferSize; dx <= bufferSize; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              
              // Check if within buffer radius (using Manhattan distance for simplicity)
              const distance = Math.abs(dx) + Math.abs(dy);
              if (distance <= bufferSize && ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
                // Don't block waypoints
                const key = `${ny},${nx}`;
                if (!waypointSet.has(key)) {
                  inflatedGrid[ny][nx] = true;
                }
              }
            }
          }
        }
      }
    }
    
    console.log('Inflated obstacles:', inflatedGrid.flat().filter(Boolean).length);
    return inflatedGrid;
  }

  async planPath(): Promise<void> {
    const gridState = this.gridQuery.getSnapshot();
    const waypointsState = this.waypointsQuery.getSnapshot();
    const pathfinderState = this.pathfinderService['pathfinderStore'].getValue();

    if (waypointsState.waypoints.length < 2) {
      console.log('Need at least 2 waypoints');
      return;
    }

    console.log(`Planning path for ${waypointsState.waypoints.length} waypoints`);
    
    // Use original grid but with penalty for cells near walls
    console.log('Using wall penalty approach instead of grid inflation');
    
    // Find path through waypoints using proper A* algorithm
    const path = this.findPathThroughWaypoints(
      gridState.grid, 
      waypointsState.waypoints, 
      pathfinderState.optimizeOrder
    );
    
    console.log('Path found:', path ? `${path.length} points` : 'null');
    
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
    
    let orderedWaypoints = waypoints;
    
    // If optimization is enabled and we have more than 2 waypoints, optimize the order
    if (optimizeOrder && waypoints.length > 2) {
      orderedWaypoints = this.optimizeWaypointOrder(grid, waypoints);
    }
    
    const fullPath: Array<{ y: number; x: number }> = [];
    
    // Find path between consecutive waypoints using A*
    for (let i = 0; i < orderedWaypoints.length - 1; i++) {
      const start = orderedWaypoints[i];
      const end = orderedWaypoints[i + 1];
      
      // First try direct line if no obstacles
      let segment: Point[] | null = null;
      if (this.isLineFree(grid, start, end)) {
        segment = this.createStraightLinePath(start, end);
      } else {
        segment = this.astar(grid, start, end);
      }
      
      if (!segment) {
        console.log(`No path found between waypoints ${i} and ${i + 1}`);
        return null;
      }
      
      // Add segment to full path, avoiding duplicates at waypoints
      if (i === 0) {
        fullPath.push(...segment);
      } else {
        fullPath.push(...segment.slice(1)); // Skip first point to avoid duplicates
      }
    }
    
    return fullPath.length > 0 ? fullPath : null;
  }

  /**
   * A* pathfinding algorithm implementation
   */
  private astar(
    grid: boolean[][],
    start: Point,
    goal: Point,
    allowDiagonals: boolean = true
  ): Point[] | null {
    const rows = grid.length;
    const cols = grid[0].length;
    
    // Check if start or goal is blocked
    if (grid[start.y][start.x] || grid[goal.y][goal.x]) {
      return null;
    }

    // Helper function to calculate penalty for being near walls
    const getWallPenalty = (y: number, x: number): number => {
      let penalty = 0;
      const checkRadius = SAFETY_BUFFER;
      
      for (let dy = -checkRadius; dy <= checkRadius; dy++) {
        for (let dx = -checkRadius; dx <= checkRadius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny][nx]) {
            const distance = Math.abs(dx) + Math.abs(dy);
            if (distance <= checkRadius) {
              // Add penalty inversely proportional to distance
              penalty += (checkRadius - distance + 1) * 2;
            }
          }
        }
      }
      
      return penalty;
    };
    
    // Define possible moves (4-directional or 8-directional)
    const moves = allowDiagonals 
      ? [
          { dy: -1, dx: 0, cost: 1 },   // Up
          { dy: 1, dx: 0, cost: 1 },    // Down
          { dy: 0, dx: -1, cost: 1 },   // Left
          { dy: 0, dx: 1, cost: 1 },    // Right
          { dy: -1, dx: -1, cost: Math.sqrt(2) }, // Up-Left
          { dy: -1, dx: 1, cost: Math.sqrt(2) },  // Up-Right
          { dy: 1, dx: -1, cost: Math.sqrt(2) },  // Down-Left
          { dy: 1, dx: 1, cost: Math.sqrt(2) }    // Down-Right
        ]
      : [
          { dy: -1, dx: 0, cost: 1 },   // Up
          { dy: 1, dx: 0, cost: 1 },    // Down
          { dy: 0, dx: -1, cost: 1 },   // Left
          { dy: 0, dx: 1, cost: 1 }     // Right
        ];
    
    const openList: Node[] = [];
    const closedSet = new Set<string>();
    const gScoreMap = new Map<string, number>();
    
    const startNode: Node = {
      y: start.y,
      x: start.x,
      gCost: 0,
      fCost: this.heuristic(start, goal, allowDiagonals),
      parent: null
    };
    
    openList.push(startNode);
    gScoreMap.set(this.getNodeKey(start), 0);
    
    while (openList.length > 0) {
      // Find node with lowest f-cost
      openList.sort((a, b) => a.fCost - b.fCost);
      const currentNode = openList.shift()!;
      const currentKey = this.getNodeKey(currentNode);
      
      // Skip if already processed
      if (closedSet.has(currentKey)) {
        continue;
      }
      
      closedSet.add(currentKey);
      
      // Check if we reached the goal
      if (currentNode.y === goal.y && currentNode.x === goal.x) {
        return this.reconstructPath(currentNode);
      }
      
      // Explore neighbors
      for (const move of moves) {
        const neighborY = currentNode.y + move.dy;
        const neighborX = currentNode.x + move.dx;
        
        // Check bounds
        if (neighborY < 0 || neighborY >= rows || neighborX < 0 || neighborX >= cols) {
          continue;
        }
        
        // Check if blocked
        if (grid[neighborY][neighborX]) {
          continue;
        }
        
        const neighborKey = this.getNodeKey({ y: neighborY, x: neighborX });
        
        // Skip if already processed
        if (closedSet.has(neighborKey)) {
          continue;
        }
        
        // Calculate cost including wall penalty
        const wallPenalty = getWallPenalty(neighborY, neighborX);
        const tentativeGCost = currentNode.gCost + move.cost + wallPenalty;
        const existingGCost = gScoreMap.get(neighborKey);
        
        // If this path to neighbor is better than any previous one
        if (existingGCost === undefined || tentativeGCost < existingGCost) {
          gScoreMap.set(neighborKey, tentativeGCost);
          
          const neighborNode: Node = {
            y: neighborY,
            x: neighborX,
            gCost: tentativeGCost,
            fCost: tentativeGCost + this.heuristic({ y: neighborY, x: neighborX }, goal, allowDiagonals),
            parent: currentNode
          };
          
          openList.push(neighborNode);
        }
      }
    }
    
    return null; // No path found
  }

  /**
   * Heuristic function for A* (octile distance)
   */
  private heuristic(a: Point, b: Point, allowDiagonals: boolean): number {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    
    if (allowDiagonals) {
      // Octile distance
      const D = 1;
      const D2 = Math.sqrt(2);
      return D * (dx + dy) + (D2 - 2 * D) * Math.min(dx, dy);
    } else {
      // Manhattan distance
      return dx + dy;
    }
  }

  /**
   * Generate a unique key for a grid position
   */
  private getNodeKey(point: Point): string {
    return `${point.y},${point.x}`;
  }

  /**
   * Reconstruct the path from the goal node back to start
   */
  private reconstructPath(goalNode: Node): Point[] {
    const path: Point[] = [];
    let current: Node | null = goalNode;
    
    while (current !== null) {
      path.push({ y: current.y, x: current.x });
      current = current.parent;
    }
    
    return path.reverse();
  }

  /**
   * Check if a straight line between two points is free of obstacles
   */
  private isLineFree(grid: boolean[][], start: Point, end: Point): boolean {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return true;
    
    const numSteps = Math.max(2, Math.ceil(distance * 2));
    
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const y = Math.round(start.y * (1 - t) + end.y * t);
      const x = Math.round(start.x * (1 - t) + end.x * t);
      
      if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) {
        return false;
      }
      
      if (grid[y][x]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Create a straight line path using Bresenham's algorithm
   */
  private createStraightLinePath(start: Point, end: Point): Point[] {
    const path: Point[] = [];
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

  /**
   * Optimize waypoint order using simple nearest neighbor heuristic
   * (For full TSP, we'd need more complex algorithms for larger sets)
   */
  private optimizeWaypointOrder(grid: boolean[][], waypoints: Point[]): Point[] {
    if (waypoints.length <= 2) return waypoints;
    
    // Simple nearest neighbor starting from first waypoint
    const optimized = [waypoints[0]];
    const remaining = waypoints.slice(1);
    
    while (remaining.length > 0) {
      const current = optimized[optimized.length - 1];
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      
      for (let i = 0; i < remaining.length; i++) {
        const distance = this.heuristic(current, remaining[i], true);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }
      
      optimized.push(remaining[nearestIndex]);
      remaining.splice(nearestIndex, 1);
    }
    
    return optimized;
  }
}
