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

const SAFETY_BUFFER = 0.5; // Minimal safety distance to keep from walls (in grid cells)

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
   * Create a buffered grid that adds a small safety margin around walls
   */
  private createBufferedGrid(grid: boolean[][], waypoints: Point[]): boolean[][] {
    const rows = grid.length;
    const cols = grid[0].length;
    const bufferedGrid = grid.map(row => [...row]); // Deep copy
    const bufferRadius = Math.ceil(SAFETY_BUFFER); // Round up to ensure integer for array indexing
    
    // Create a set of waypoint positions to avoid blocking them
    const waypointSet = new Set(waypoints.map(p => `${p.y},${p.x}`));
    
    // Add buffer around walls using Manhattan distance
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x]) { // If this is a wall
          // Check all cells within buffer distance
          for (let dy = -bufferRadius; dy <= bufferRadius; dy++) {
            for (let dx = -bufferRadius; dx <= bufferRadius; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              
              // Use Manhattan distance for buffer calculation
              const distance = Math.abs(dx) + Math.abs(dy);
              
              if (distance <= bufferRadius && ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
                const key = `${ny},${nx}`;
                // Only add buffer if it's not already a wall and not a waypoint
                if (!grid[ny][nx] && !waypointSet.has(key)) {
                  bufferedGrid[ny][nx] = true;
                }
              }
            }
          }
        }
      }
    }
    
    return bufferedGrid;
  }

  async planPath(): Promise<void> {
    const gridState = this.gridQuery.getSnapshot();
    const waypointsState = this.waypointsQuery.getSnapshot();
    const pathfinderState = this.pathfinderService['pathfinderStore'].getValue();

    if (waypointsState.waypoints.length < 2) {
      console.log(`Need at least 2 waypoints, currently have ${waypointsState.waypoints.length}`);
      console.log('Waypoints:', waypointsState.waypoints);
      return;
    }

    console.log(`Planning path for ${waypointsState.waypoints.length} waypoints`);
    
    // First try with a conservative buffer approach
    let bufferedGrid = this.createBufferedGrid(gridState.grid, waypointsState.waypoints);
    
    // Find path through waypoints using proper A* algorithm
    let path = this.findPathThroughWaypoints(
      bufferedGrid, 
      waypointsState.waypoints, 
      pathfinderState.optimizeOrder
    );

    // If buffered approach fails, try without buffer (direct on original grid)
    if (!path) {
      console.log('Buffered pathfinding failed, trying without buffer...');
      path = this.findPathThroughWaypoints(
        gridState.grid, 
        waypointsState.waypoints, 
        pathfinderState.optimizeOrder
      );
    }
    
    console.log('Path found:', path ? `${path.length} points` : 'null');
    
    if (path) {
      const pathLength = this.calculatePathLength(path);
      this.pathfinderService.setPath(path);
      this.pathfinderService.setPathLength(pathLength);
      this.pathfinderService.setReturnPathStartIndex((this as any).returnPathStartIndex || -1);
      this.pathfinderService.setPathDrawIndex(1); // Start with just the first point
      this.startPathAnimation(path);
    } else {
      console.log('Failed to find path!');
      this.pathfinderService.setPath(null);
      this.pathfinderService.setPathLength(0);
      this.pathfinderService.setReturnPathStartIndex(-1);
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
      const strategy = this.pathfinderService['pathfinderStore'].getValue().optimizationStrategy;
      if (strategy === 'strategy2') {
        orderedWaypoints = this.optimizeWaypointOrderStrategy2(grid, waypoints);
      } else {
        orderedWaypoints = this.optimizeWaypointOrderStrategy1(grid, waypoints);
      }
    }
    
    const fullPath: Array<{ y: number; x: number }> = [];
    
    // Find path between consecutive waypoints using A*
    for (let i = 0; i < orderedWaypoints.length - 1; i++) {
      const start = orderedWaypoints[i];
      const end = orderedWaypoints[i + 1];
      
      console.log(`Finding path from waypoint ${i} (${start.y},${start.x}) to waypoint ${i+1} (${end.y},${end.x})`);
      
      // First try direct line if no obstacles
      let segment: Point[] | null = null;
      if (this.isLineFree(grid, start, end)) {
        segment = this.createStraightLinePath(start, end);
        console.log(`Direct line path found with ${segment.length} points`);
      } else {
        console.log('Direct line blocked, using A* algorithm...');
        segment = this.astar(grid, start, end);
        if (segment) {
          console.log(`A* path found with ${segment.length} points`);
        } else {
          console.log('A* algorithm failed to find path');
        }
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

    // Add return path from last waypoint back to first waypoint
    let returnPathStartIndex = fullPath.length; // Track where return path begins
    if (orderedWaypoints.length >= 2) {
      const lastWaypoint = orderedWaypoints[orderedWaypoints.length - 1];
      const firstWaypoint = orderedWaypoints[0];
      
      // Find path from last waypoint back to first
      let returnSegment: Point[] | null = null;
      if (this.isLineFree(grid, lastWaypoint, firstWaypoint)) {
        returnSegment = this.createStraightLinePath(lastWaypoint, firstWaypoint);
      } else {
        returnSegment = this.astar(grid, lastWaypoint, firstWaypoint);
      }
      
      if (!returnSegment) {
        console.log('No return path found from last waypoint to first waypoint');
        return null;
      }
      
      // Add return segment to full path, skipping first point to avoid duplicate
      fullPath.push(...returnSegment.slice(1));
    }
    
    // Store the return path start index for rendering purposes
    (this as any).returnPathStartIndex = returnPathStartIndex;
    
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
        
        const tentativeGCost = currentNode.gCost + move.cost;
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
   * Strategy 1: Optimize waypoint order using simple nearest neighbor heuristic (fast)
   */
  private optimizeWaypointOrderStrategy1(grid: boolean[][], waypoints: Point[]): Point[] {
    if (waypoints.length <= 2) return waypoints;
    
    console.log('Using Strategy 1: Heuristic-based nearest neighbor');
    
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

  /**
   * Strategy 2: Optimize waypoint order using actual A* pathfinding distances (accurate but slower)
   */
  private optimizeWaypointOrderStrategy2(grid: boolean[][], waypoints: Point[]): Point[] {
    if (waypoints.length <= 2) return waypoints;
    
    console.log('Using Strategy 2: A* distance-based nearest neighbor');
    
    // Calculate distance matrix using actual pathfinding
    const distanceMatrix = this.calculateDistanceMatrix(grid, waypoints);
    if (!distanceMatrix) {
      console.warn('Strategy 2 failed, falling back to Strategy 1');
      return this.optimizeWaypointOrderStrategy1(grid, waypoints);
    }
    
    // Use brute force for small sets (≤ 6 waypoints), nearest neighbor for larger sets
    if (waypoints.length <= 6) {
      console.log('Using brute force optimization for small waypoint set');
      return this.solveTspBruteForce(distanceMatrix, waypoints);
    } else {
      console.log('Using nearest neighbor with A* distances for large waypoint set');
      return this.solveTspNearestNeighbor(distanceMatrix, waypoints);
    }
  }

  /**
   * Calculate distance matrix using actual A* pathfinding between all waypoint pairs
   */
  private calculateDistanceMatrix(grid: boolean[][], waypoints: Point[]): number[][] | null {
    const n = waypoints.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 0;
        } else {
          // Find actual path using A*
          const path = this.findOptimalPathBetweenPoints(grid, waypoints[i], waypoints[j]);
          if (!path) {
            console.error(`No path found between waypoint ${i} and ${j}`);
            return null;
          }
          
          // Calculate actual path distance
          let distance = 0;
          for (let k = 0; k < path.length - 1; k++) {
            const dx = path[k + 1].x - path[k].x;
            const dy = path[k + 1].y - path[k].y;
            distance += Math.sqrt(dx * dx + dy * dy);
          }
          matrix[i][j] = distance;
        }
      }
    }
    
    return matrix;
  }

  /**
   * Find optimal path between two points (with line-of-sight optimization)
   */
  private findOptimalPathBetweenPoints(grid: boolean[][], start: Point, end: Point): Point[] | null {
    // First try direct line if no obstacles
    if (this.isLineFree(grid, start, end)) {
      return this.createStraightLinePath(start, end);
    }
    
    // Otherwise use A*
    return this.astar(grid, start, end);
  }

  /**
   * Solve TSP using brute force (optimal for small sets)
   */
  private solveTspBruteForce(distanceMatrix: number[][], waypoints: Point[]): Point[] {
    const n = waypoints.length;
    if (n <= 1) return waypoints;
    
    let bestOrder = waypoints.slice();
    let bestDistance = Infinity;
    
    // Generate all permutations of indices (excluding first point which stays fixed)
    const indices = Array.from({ length: n - 1 }, (_, i) => i + 1);
    const permutations = this.generatePermutations(indices);
    
    for (const perm of permutations) {
      const order = [0, ...perm]; // Always start with first waypoint
      let totalDistance = 0;
      
      // Calculate total distance for this order
      for (let i = 0; i < order.length - 1; i++) {
        totalDistance += distanceMatrix[order[i]][order[i + 1]];
      }
      // Add return to start
      totalDistance += distanceMatrix[order[order.length - 1]][0];
      
      if (totalDistance < bestDistance) {
        bestDistance = totalDistance;
        bestOrder = order.map(i => waypoints[i]);
      }
    }
    
    console.log(`Brute force found optimal distance: ${bestDistance.toFixed(2)}`);
    return bestOrder;
  }

  /**
   * Solve TSP using nearest neighbor with actual distances
   */
  private solveTspNearestNeighbor(distanceMatrix: number[][], waypoints: Point[]): Point[] {
    const n = waypoints.length;
    const visited = new Set<number>();
    const order = [0]; // Start with first waypoint
    visited.add(0);
    let totalDistance = 0;
    
    while (visited.size < n) {
      const current = order[order.length - 1];
      let nearestIndex = -1;
      let nearestDistance = Infinity;
      
      for (let i = 0; i < n; i++) {
        if (!visited.has(i) && distanceMatrix[current][i] < nearestDistance) {
          nearestDistance = distanceMatrix[current][i];
          nearestIndex = i;
        }
      }
      
      if (nearestIndex !== -1) {
        order.push(nearestIndex);
        visited.add(nearestIndex);
        totalDistance += nearestDistance;
      }
    }
    
    console.log(`Nearest neighbor with A* distances found total distance: ${totalDistance.toFixed(2)}`);
    return order.map(i => waypoints[i]);
  }

  /**
   * Generate all permutations of an array
   */
  private generatePermutations<T>(arr: T[]): T[][] {
    if (arr.length <= 1) return [arr];
    
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      const perms = this.generatePermutations(rest);
      for (const perm of perms) {
        result.push([arr[i], ...perm]);
      }
    }
    return result;
  }

  /**
   * Animate the path drawing by progressively increasing the draw index
   */
  private startPathAnimation(path: Array<{ y: number; x: number }>): void {
    this.pathfinderService.setAnimating(true);
    
    const animationSpeed = 20; // milliseconds between each segment
    let currentIndex = 2; // Start from 2 (first segment)
    
    const animate = () => {
      if (currentIndex <= path.length) {
        this.pathfinderService.setPathDrawIndex(currentIndex);
        currentIndex++;
        setTimeout(animate, animationSpeed);
      } else {
        this.pathfinderService.setAnimating(false);
      }
    };
    
    setTimeout(animate, animationSpeed);
  }

  /**
   * Replay the path animation from the beginning
   */
  async replayAnimation(): Promise<void> {
    const pathfinderState = this.pathfinderService['pathfinderStore'].getValue();
    const path = pathfinderState.path;
    
    if (!path || path.length === 0) {
      console.log('No path to replay');
      return;
    }
    
    console.log('Replaying path animation');
    this.pathfinderService.setPathDrawIndex(1);
    this.startPathAnimation(path);
  }

  /**
   * Calculate the total length of a path
   */
  private calculatePathLength(path: Array<{ y: number; x: number }>): number {
    if (!path || path.length < 2) return 0;
    
    let totalLength = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const current = path[i];
      const next = path[i + 1];
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
    }
    
    return totalLength;
  }
}
