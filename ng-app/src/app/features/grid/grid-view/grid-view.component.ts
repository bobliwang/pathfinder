import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GridService, GridQuery } from '../../../store/grid.service';
import { WaypointsService, WaypointsQuery } from '../../../store/waypoints.service';
import { PathfinderService, PathfinderQuery } from '../../../store/pathfinder.service';
import { ControlsPanelComponent } from '../../controls/controls-panel/controls-panel.component';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-grid-view',
  standalone: true,
  imports: [CommonModule, ControlsPanelComponent],
  templateUrl: './grid-view.component.html',
  styleUrls: ['./grid-view.component.scss']
})
export class GridViewComponent {
  grid$: Observable<boolean[][]>;
  waypoints$: Observable<Array<{ y: number; x: number }>>;
  path$: Observable<Array<{ y: number; x: number }> | null>;
  returnPathStartIndex$: Observable<number>;
  pathDrawIndex$: Observable<number>;
  mode$: Observable<string>;

  private isMouseDown = false;
  private dragMode: 'draw' | 'erase' | null = null;
  private lastDrawPosition: { y: number; x: number } | null = null;
  
  // Turning point dragging state
  private draggingTurningPoint = false;
  private draggingPointIndex = -1;
  private dragOffset = { x: 0, y: 0 };

  constructor(
    private gridService: GridService,
    private gridQuery: GridQuery,
    private waypointsService: WaypointsService,
    private waypointsQuery: WaypointsQuery,
    private pathfinderService: PathfinderService,
    private pathfinderQuery: PathfinderQuery
  ) {
    this.grid$ = this.gridQuery.grid$;
    this.waypoints$ = this.waypointsQuery.waypoints$;
    this.path$ = this.pathfinderQuery.path$;
    this.returnPathStartIndex$ = this.pathfinderQuery.returnPathStartIndex$;
    this.pathDrawIndex$ = this.pathfinderQuery.pathDrawIndex$;
    this.mode$ = this.gridQuery.mode$;
  }

  getCellClass(
    cell: boolean,
    y: number,
    x: number,
    waypoints: Array<{ y: number; x: number }> = []
  ): any {
    const isWaypoint = waypoints.some(wp => wp.y === y && wp.x === x);
    
    return {
      wall: cell,
      waypoint: isWaypoint
    };
  }

  getWaypointNumber(y: number, x: number, waypoints: Array<{ y: number; x: number }> = []): string {
    const index = waypoints.findIndex(wp => wp.y === y && wp.x === x);
    return index >= 0 ? (index + 1).toString() : '';
  }

  /**
   * Bresenham's line algorithm to get all cells between two points
   */
  private getLineCells(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
    const cells: Array<{ x: number; y: number }> = [];
    
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    let x = x0;
    let y = y0;
    
    while (true) {
      cells.push({ x, y });
      
      if (x === x1 && y === y1) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    
    return cells;
  }

  private drawLine(startY: number, startX: number, endY: number, endX: number, isWall: boolean) {
    const cells = this.getLineCells(startX, startY, endX, endY);
    const grid = this.gridQuery.getSnapshot().grid;
    
    // Check bounds and draw each cell
    cells.forEach(cell => {
      if (cell.y >= 0 && cell.y < grid.length && cell.x >= 0 && cell.x < grid[0].length) {
        this.gridService.drawAt(cell.y, cell.x, isWall);
      }
    });
  }

  onCellClick(y: number, x: number, event: MouseEvent) {
    event.preventDefault();
    const mode = this.gridQuery.getSnapshot().mode;
    const grid = this.gridQuery.getSnapshot().grid;

    // Check bounds
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return;

    switch (mode) {
      case 'draw':
        if (event.button === 0) { // Left click
          this.isMouseDown = true;
          this.dragMode = 'draw';
          this.lastDrawPosition = { y, x };
          this.gridService.drawAt(y, x, true);
        } else if (event.button === 2) { // Right click
          this.isMouseDown = true;
          this.dragMode = 'erase';
          this.lastDrawPosition = { y, x };
          this.gridService.drawAt(y, x, false);
        }
        break;

      case 'erase':
        this.isMouseDown = true;
        this.dragMode = 'erase';
        this.lastDrawPosition = { y, x };
        this.gridService.drawAt(y, x, false);
        break;

      case 'set_points':
        if (event.button === 0) { // Left click to add waypoint
          if (!grid[y][x]) { // Only on free spaces
            this.waypointsService.addWaypoint(y, x);
            // Clear existing path when adding waypoints
            this.pathfinderService.setPath(null);
          }
        } else if (event.button === 2) { // Right click to remove last waypoint
          this.waypointsService.removeLastWaypoint();
          this.pathfinderService.setPath(null);
        }
        break;
    }
  }

  onCellMouseEnter(y: number, x: number, event: MouseEvent) {
    if (!this.isMouseDown || !this.dragMode || !this.lastDrawPosition) return;

    const grid = this.gridQuery.getSnapshot().grid;
    
    // Check bounds
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return;

    // Draw a line from the last position to current position
    if (this.dragMode === 'draw') {
      this.drawLine(this.lastDrawPosition.y, this.lastDrawPosition.x, y, x, true);
    } else if (this.dragMode === 'erase') {
      this.drawLine(this.lastDrawPosition.y, this.lastDrawPosition.x, y, x, false);
    }
    
    // Update last position
    this.lastDrawPosition = { y, x };
  }

  onMouseUp(event: MouseEvent) {
    this.isMouseDown = false;
    this.dragMode = null;
    this.lastDrawPosition = null;
    
    // Handle turning point drag end
    if (this.draggingTurningPoint) {
      this.draggingTurningPoint = false;
      this.draggingPointIndex = -1;
      // Remove any dragging class
      const draggingElements = document.querySelectorAll('.turning-point.dragging');
      draggingElements.forEach(el => el.classList.remove('dragging'));
    }
  }

  // Turning point helper methods
  isWaypoint(point: { y: number; x: number }, waypoints: Array<{ y: number; x: number }>): boolean {
    return waypoints.some(wp => wp.y === point.y && wp.x === point.x);
  }

  getTurningPoints(path: Array<{ y: number; x: number }>, waypoints: Array<{ y: number; x: number }>): Array<{ point: { y: number; x: number }, index: number }> {
    if (!path || path.length < 3) return []; // Need at least 3 points to detect a turn
    
    const turningPoints: Array<{ point: { y: number; x: number }, index: number }> = [];
    
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const current = path[i];
      const next = path[i + 1];
      
      // Skip if current point is a waypoint
      if (this.isWaypoint(current, waypoints)) continue;
      
      // Calculate direction vectors
      const dir1 = {
        x: current.x - prev.x,
        y: current.y - prev.y
      };
      
      const dir2 = {
        x: next.x - current.x,
        y: next.y - current.y
      };
      
      // Check if direction changed (not collinear)
      // Two vectors are collinear if their cross product is zero
      const crossProduct = dir1.x * dir2.y - dir1.y * dir2.x;
      
      if (Math.abs(crossProduct) > 0) {
        // Direction changed, this is a turning point
        turningPoints.push({ point: current, index: i });
      }
    }
    
    return turningPoints;
  }

  getTurningPointX(point: { y: number; x: number }): number {
    return point.x * 16 + 8.5;
  }

  getTurningPointY(point: { y: number; x: number }): number {
    return point.y * 16 + 8.5;
  }

  startDragTurningPoint(event: MouseEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    
    const target = event.target as HTMLElement;
    target.classList.add('dragging');
    
    this.draggingTurningPoint = true;
    this.draggingPointIndex = index;
    
    const rect = target.getBoundingClientRect();
    this.dragOffset = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2
    };

    // Add global mouse move and up listeners
    const onMouseMove = (e: MouseEvent) => this.onTurningPointDrag(e);
    const onMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.finishDragTurningPoint(e);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  private onTurningPointDrag(event: MouseEvent): void {
    if (!this.draggingTurningPoint || this.draggingPointIndex < 0) return;

    const gridCanvas = document.querySelector('.grid-wrapper') as HTMLElement;
    if (!gridCanvas) return;

    const rect = gridCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left - this.dragOffset.x;
    const y = event.clientY - rect.top - this.dragOffset.y;

    // Convert pixel coordinates to grid coordinates
    const gridX = Math.round((x - 8.5) / 16);
    const gridY = Math.round((y - 8.5) / 16);

    // Update the path with the new coordinates
    const currentPath = this.pathfinderQuery.getSnapshot().path;
    if (currentPath && this.draggingPointIndex < currentPath.length) {
      const newPath = [...currentPath];
      
      // Check bounds
      const grid = this.gridQuery.getSnapshot().grid;
      if (gridY >= 0 && gridY < grid.length && gridX >= 0 && gridX < grid[0].length) {
        // Don't allow dragging onto walls
        if (!grid[gridY][gridX]) {
          newPath[this.draggingPointIndex] = { y: gridY, x: gridX };
          this.pathfinderService.setPath(newPath);
        }
      }
    }
  }

  private finishDragTurningPoint(event: MouseEvent): void {
    this.draggingTurningPoint = false;
    this.draggingPointIndex = -1;
    
    // Remove dragging class
    const draggingElements = document.querySelectorAll('.turning-point.dragging');
    draggingElements.forEach(el => el.classList.remove('dragging'));
  }

  // SVG-related methods for path rendering
  getSvgWidth(grid: boolean[][]): number {
    if (!grid || grid.length === 0) return 0;
    // With border-collapse, each cell is effectively 16px + 0.5px border on each side
    // But collapsed borders mean we need 16px per cell + 1px total border
    return grid[0].length * 16 + 1;
  }

  getSvgHeight(grid: boolean[][]): number {
    if (!grid || grid.length === 0) return 0;
    return grid.length * 16 + 1;
  }

  getPathSegments(path: Array<{ y: number; x: number }>, returnPathStartIndex: number): Array<{
    x1: number; y1: number; x2: number; y2: number; isReturnPath: boolean;
  }> {
    return this.getAnimatedPathSegments(path, returnPathStartIndex, path.length);
  }

  getAnimatedPathSegments(path: Array<{ y: number; x: number }>, returnPathStartIndex: number, drawIndex: number): Array<{
    x1: number; y1: number; x2: number; y2: number; isReturnPath: boolean;
  }> {
    if (!path || path.length < 2 || drawIndex < 2) return [];
    
    // Only show segments up to the current draw index
    const visiblePath = path.slice(0, drawIndex);
    
    const segments = [];
    for (let i = 0; i < visiblePath.length - 1; i++) {
      const current = visiblePath[i];
      const next = visiblePath[i + 1];
      
      // Calculate center positions of cells accounting for collapsed borders
      const x1 = current.x * 16 + 8.5;
      const y1 = current.y * 16 + 8.5;
      const x2 = next.x * 16 + 8.5;
      const y2 = next.y * 16 + 8.5;
      
      const isReturnPath = returnPathStartIndex >= 0 && i >= returnPathStartIndex;
      
      segments.push({
        x1, y1, x2, y2, isReturnPath
      });
    }
    
    return segments;
  }
}