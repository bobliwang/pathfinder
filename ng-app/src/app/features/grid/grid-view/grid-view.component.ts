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
  mode$: Observable<string>;

  private isMouseDown = false;
  private dragMode: 'draw' | 'erase' | null = null;

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
    this.mode$ = this.gridQuery.mode$;
  }

  getCellClass(
    cell: boolean,
    y: number,
    x: number,
    waypoints: Array<{ y: number; x: number }> = [],
    path: Array<{ y: number; x: number }> | null = null
  ): any {
    return {
      wall: cell,
      waypoint: waypoints.some(wp => wp.y === y && wp.x === x),
      path: path ? path.some(p => p.y === y && p.x === x) : false
    };
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
          this.gridService.drawAt(y, x, true);
        } else if (event.button === 2) { // Right click
          this.isMouseDown = true;
          this.dragMode = 'erase';
          this.gridService.drawAt(y, x, false);
        }
        break;

      case 'erase':
        this.isMouseDown = true;
        this.dragMode = 'erase';
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
    if (!this.isMouseDown || !this.dragMode) return;

    const grid = this.gridQuery.getSnapshot().grid;
    
    // Check bounds
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return;

    if (this.dragMode === 'draw') {
      this.gridService.drawAt(y, x, true);
    } else if (this.dragMode === 'erase') {
      this.gridService.drawAt(y, x, false);
    }
  }

  onMouseUp(event: MouseEvent) {
    this.isMouseDown = false;
    this.dragMode = null;
  }
}