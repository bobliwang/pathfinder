import { Injectable, inject, signal } from '@angular/core';
import { GridQuery } from '../store/grid.service';
import { WaypointsService, Waypoint, WaypointsQuery } from '../store/waypoints.service';
import { PathfinderUtilsService } from '../utils/pathfinder.service';
import { interval, Subscription } from 'rxjs';

export interface ScanResult {
  [angleDeg: number]: number;
}

@Injectable({
  providedIn: 'root'
})
export class AutoNavService {
  private readonly gridQuery = inject(GridQuery);
  private readonly waypointsService = inject(WaypointsService);
  private readonly waypointsQuery = inject(WaypointsQuery);
  private readonly pathfinderUtils = inject(PathfinderUtilsService);

  // Configuration Parameters
  readonly scanRange = signal(100);
  readonly binSize = signal(30);
  readonly scannedRadius = signal(10);
  readonly speed = signal(10); // cells/second
  readonly wallGap = signal(2); // cells
  readonly peerGap = signal(4); // cells

  // State Signals
  readonly isActive = signal(false);
  readonly scannerPosition = signal<{ y: number; x: number } | null>(null);
  readonly lidarRays = signal<Array<{ y: number; x: number }>>([]);
  readonly scannedCells = signal<Set<string>>(new Set());
  readonly failedAnchors = signal<Array<{ y: number; x: number }>>([]);
  private dfsStack: number[] = [];

  private moveSubscription: Subscription | null = null;
  private currentPath: Array<{ y: number; x: number }> = [];
  private pathIndex = 0;

  async startAutoNav() {
    const waypoints = this.waypointsQuery.getSnapshot().waypoints;
    if (waypoints.length !== 1) {
      alert('Please ensure one and only one starting point');
      return;
    }

    this.isActive.set(true);
    this.scannedCells.set(new Set());
    this.failedAnchors.set([]);
    this.dfsStack = [];
    this.scannerPosition.set({ ...waypoints[0] });
    this.waypointsService.updateWaypointStatus(0, 'visited');

    this.runCycle();
  }

  stopAutoNav() {
    this.isActive.set(false);
    this.moveSubscription?.unsubscribe();
    this.lidarRays.set([]);
  }

  private async runCycle() {
    if (!this.isActive()) return;

    const pos = this.scannerPosition();
    if (!pos) return;

    // 1. Perform LiDAR scan (also marks scanned area)
    const scanResults = this.performLidarScan(pos);

    // 2. Generate new anchor points
    this.generateAnchors(pos, scanResults);

    // Wait 1s to show the scan result/rays
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!this.isActive()) return;

    // 3. Move to next anchor
    await this.moveToNextAnchor();
  }

  private markScannedPoint(y: number, x: number, grid: boolean[][], newScanned: Set<string>) {
    if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
      newScanned.add(`${Math.round(y)},${Math.round(x)}`);
    }
  }

  private performLidarScan(pos: { y: number; x: number }): ScanResult {
    const results: ScanResult = {};
    const grid = this.gridQuery.getSnapshot().grid;
    const range = this.scanRange();
    const scannedRadiusNum = this.scannedRadius();
    const rays: Array<{ y: number; x: number }> = [];
    const newScanned = new Set(this.scannedCells());

    for (let angle = 0; angle < 360; angle += 10) {
      const rad = (angle * Math.PI) / 180;
      const target = {
        y: pos.y + Math.sin(rad) * range,
        x: pos.x + Math.cos(rad) * range
      };

      const dist = this.castRay(pos, target, grid);
      results[angle] = dist;

      // Mark area as scanned along the ray up to scannedRadius or dist
      const markDist = Math.min(dist, scannedRadiusNum);
      for (let d = 0; d <= markDist; d += 0.5) {
        const sy = pos.y + Math.sin(rad) * d;
        const sx = pos.x + Math.cos(rad) * d;
        this.markScannedPoint(sy, sx, grid, newScanned);
      }

      // For visualization
      const endY = Math.round(pos.y + Math.sin(rad) * dist);
      const endX = Math.round(pos.x + Math.cos(rad) * dist);
      rays.push({ y: endY, x: endX });
    }
    this.scannedCells.set(newScanned);
    this.lidarRays.set(rays);
    return results;
  }

  private castRay(start: { y: number; x: number }, target: { y: number; x: number }, grid: boolean[][]): number {
    // DDA implementation
    const dy = target.y - start.y;
    const dx = target.x - start.x;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    
    if (steps === 0) return 0;

    const yInc = dy / steps;
    const xInc = dx / steps;

    let currY = start.y;
    let currX = start.x;

    for (let i = 0; i < steps; i++) {
        currY += yInc;
        currX += xInc;
        const ry = Math.round(currY);
        const rx = Math.round(currX);

        if (ry < 0 || ry >= grid.length || rx < 0 || rx >= grid[0].length || grid[ry][rx]) {
            const dist = Math.sqrt(Math.pow(ry - start.y, 2) + Math.pow(rx - start.x, 2));
            return dist;
        }
    }
    return Math.sqrt(Math.pow(target.y - start.y, 2) + Math.pow(target.x - start.x, 2));
  }

  private generateAnchors(pos: { y: number; x: number }, scanResults: ScanResult) {
    const binSizeNum = this.binSize();
    const grid = this.gridQuery.getSnapshot().grid;
    const potentialNewAnchors: Array<{ y: number; x: number }> = [];

    for (let binStart = 0; binStart < 360; binStart += binSizeNum) {
      let maxDist = 0;
      for (let angle = binStart; angle < binStart + binSizeNum; angle += 10) {
        maxDist = Math.max(maxDist, scanResults[angle] || 0);
      }

      if (maxDist > 12) {
        const bisector = binStart + binSizeNum / 2;
        const rad = (bisector * Math.PI) / 180;
        const anchorY = Math.round(pos.y + Math.sin(rad) * 8);
        const anchorX = Math.round(pos.x + Math.cos(rad) * 8);

        const currentWaypoints = this.waypointsQuery.getSnapshot().waypoints;
        if (this.isValidAnchor(anchorY, anchorX, grid, currentWaypoints)) {
          potentialNewAnchors.push({ y: anchorY, x: anchorX });
        } else {
          // 8-neighbor adjustment
          let found = false;
          for (let dy = -1; dy <= 1 && !found; dy++) {
            for (let dx = -1; dx <= 1 && !found; dx++) {
              if (dy === 0 && dx === 0) continue;
              if (this.isValidAnchor(anchorY + dy, anchorX + dx, grid, currentWaypoints)) {
                potentialNewAnchors.push({ y: anchorY + dy, x: anchorX + dx });
                found = true;
              }
            }
          }
        }
      }
    }

    // Sort potential anchors by distance descending (to push them onto stack so nearest is at the top)
    potentialNewAnchors.sort((a, b) => {
      const distA = Math.pow(a.y - pos.y, 2) + Math.pow(a.x - pos.x, 2);
      const distB = Math.pow(b.y - pos.y, 2) + Math.pow(b.x - pos.x, 2);
      return distB - distA;
    });

    for (const anchor of potentialNewAnchors) {
      const currentWaypoints = this.waypointsQuery.getSnapshot().waypoints;
      if (this.isValidAnchor(anchor.y, anchor.x, grid, currentWaypoints)) {
        this.waypointsService.addWaypoint(anchor.y, anchor.x, 'pending');
        this.dfsStack.push(this.waypointsQuery.getSnapshot().waypoints.length - 1);
      }
    }
  }

  private isValidAnchor(y: number, x: number, grid: boolean[][], existing: Waypoint[]): boolean {
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length || grid[y][x]) return false;

    // wallGap cells away from walls
    const wg = this.wallGap();
    for (let dy = -wg; dy <= wg; dy++) {
      for (let dx = -wg; dx <= wg; dx++) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length && grid[ny][nx]) return false;
      }
    }

    // peerGap cells away from other anchors
    const pg = this.peerGap();
    for (const wp of existing) {
      const dist = Math.sqrt(Math.pow(wp.y - y, 2) + Math.pow(wp.x - x, 2));
      if (dist < pg) return false;
    }

    return true;
  }

  private async moveToNextAnchor() {
    if (!this.isActive()) return;
    
    // Find next pending anchor from DFS stack
    let nextIdx: number | undefined;
    while (this.dfsStack.length > 0) {
      const idx = this.dfsStack.pop()!;
      const wp = this.waypointsQuery.getSnapshot().waypoints[idx];
      if (wp && wp.status === 'pending') {
        nextIdx = idx;
        break;
      }
    }

    if (nextIdx === undefined) {
      this.finishAutoNav();
      return;
    }

    const next = this.waypointsQuery.getSnapshot().waypoints[nextIdx];
    const pos = this.scannerPosition()!;
    const grid = this.gridQuery.getSnapshot().grid;
    
    // Use A* from utils
    const path = await this.pathfinderUtils.astar(grid, pos, next);

    if (path) {
      this.currentPath = path;
      this.pathIndex = 0;
      this.startMoving(nextIdx);
    } else {
      this.waypointsService.updateWaypointStatus(nextIdx, 'failed');
      this.failedAnchors.update(f => [...f, { y: next.y, x: next.x }]);
      // Try next one from stack
      await this.moveToNextAnchor();
    }
  }

  private startMoving(targetIdx: number) {
    const msPerCell = 1000 / this.speed();
    this.lidarRays.set([]); // Turn off LiDAR rays during movement
    this.moveSubscription = interval(msPerCell).subscribe(() => {
      this.pathIndex++;
      if (this.pathIndex < this.currentPath.length) {
        this.scannerPosition.set(this.currentPath[this.pathIndex]);
      } else {
        this.moveSubscription?.unsubscribe();
        this.waypointsService.updateWaypointStatus(targetIdx, 'visited');
        this.runCycle();
      }
    });
  }

  private finishAutoNav() {
    this.isActive.set(false);
    this.lidarRays.set([]);
    
    const scannedCount = this.scannedCells().size;
    const failed = this.failedAnchors();
    let msg = `Auto Nav Complete!\nTotal area scanned: ${scannedCount} cells.`;
    if (failed.length > 0) {
      msg += `\nFailed anchors: ${failed.map(f => `(${f.y}, ${f.x})`).join(', ')}`;
    }
    alert(msg);
  }
}
