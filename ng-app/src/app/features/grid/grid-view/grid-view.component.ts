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
  mode$: Observable<string>;

  private isMouseDown = false;
  private dragMode: 'draw' | 'erase' | null = null;
  private lastDrawPosition: { y: number; x: number } | null = null;

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
    this.mode$ = this.gridQuery.mode$;
  }

  getCellClass(
    cell: boolean,
    y: number,
    x: number,
    waypoints: Array<{ y: number; x: number }> = [],
    path: Array<{ y: number; x: number }> | null = null,
    returnPathStartIndex: number = -1
  ): any {
    const isWaypoint = waypoints.some(wp => wp.y === y && wp.x === x);
    let isPath = false;
    let isReturnPath = false;
    
    if (path) {
      const pathIndex = path.findIndex(p => p.y === y && p.x === x);
      if (pathIndex >= 0) {
        isPath = true;
        // Check if this cell is part of the return path
        if (returnPathStartIndex >= 0 && pathIndex >= returnPathStartIndex) {
          isReturnPath = true;
        }
      }
    }
    
    return {
      wall: cell,
      waypoint: isWaypoint,
      path: isPath && !isReturnPath,
      'return-path': isReturnPath
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
  }
}