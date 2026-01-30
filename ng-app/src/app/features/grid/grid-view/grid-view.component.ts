import { Component, ChangeDetectionStrategy, inject, signal, computed, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { GridService, GridQuery } from '../../../store/grid.service';
import { WaypointsService, WaypointsQuery } from '../../../store/waypoints.service';
import { PathfinderService, PathfinderQuery } from '../../../store/pathfinder.service';
import { MapStorageService } from '../../../services/map-storage.service';
import { AutoNavService } from '../../../services/auto-nav.service';
import { Waypoint } from '../../../store/waypoints.service';
import { ControlsPanelComponent } from '../../controls/controls-panel/controls-panel.component';

interface GridViewState {
  hoveredCell: { x: number; y: number } | null;
  showPopover: boolean;
  popoverPosition: { x: number; y: number };
  isAltPressed: boolean;
  isMouseDown: boolean;
  dragMode: 'draw' | 'erase' | null;
  lastDrawPosition: { y: number; x: number } | null;
  draggingTurningPoint: boolean;
  draggingPointIndex: number;
  dragOffset: { x: number; y: number };
}

const initialState: GridViewState = {
  hoveredCell: null,
  showPopover: false,
  popoverPosition: { x: 0, y: 0 },
  isAltPressed: false,
  isMouseDown: false,
  dragMode: null,
  lastDrawPosition: null,
  draggingTurningPoint: false,
  draggingPointIndex: -1,
  dragOffset: { x: 0, y: 0 }
};

@Component({
  selector: 'app-grid-view',
  standalone: true,
  imports: [CommonModule, ControlsPanelComponent],
  templateUrl: './grid-view.component.html',
  styleUrls: ['./grid-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GridViewComponent implements OnInit {
  // Services via field injection
  private readonly gridService = inject(GridService);
  private readonly gridQuery = inject(GridQuery);
  private readonly waypointsService = inject(WaypointsService);
  private readonly waypointsQuery = inject(WaypointsQuery);
  private readonly pathfinderService = inject(PathfinderService);
  private readonly pathfinderQuery = inject(PathfinderQuery);
  private readonly route = inject(ActivatedRoute);
  private readonly mapStorageService = inject(MapStorageService);
  readonly autoNavService = inject(AutoNavService);

  // Single writable signal for component state
  readonly state = signal<GridViewState>(initialState);

  // Computed signals for view bindings
  readonly hoveredCell = computed(() => this.state().hoveredCell);
  readonly showPopover = computed(() => this.state().showPopover);
  readonly popoverPosition = computed(() => this.state().popoverPosition);

  // Convert observables to signals
  readonly grid = toSignal(this.gridQuery.grid$, { initialValue: [] as boolean[][] });
  readonly waypoints = toSignal(this.waypointsQuery.waypoints$, { initialValue: [] as Waypoint[] });
  readonly path = toSignal(this.pathfinderQuery.path$, { initialValue: null as Array<{ y: number; x: number }> | null });
  readonly returnPathStartIndex = toSignal(this.pathfinderQuery.returnPathStartIndex$, { initialValue: -1 });
  readonly pathDrawIndex = toSignal(this.pathfinderQuery.pathDrawIndex$, { initialValue: 0 });
  readonly pathLength = toSignal(this.pathfinderQuery.pathLength$, { initialValue: 0 });
  readonly mode = toSignal(this.gridQuery.mode$, { initialValue: 'draw' });
  readonly cameraPositions = toSignal(this.gridQuery.cameraPositions$, { initialValue: [] as { x: number; y: number }[] });
  readonly cameraRange = toSignal(this.gridQuery.cameraRange$, { initialValue: 0 });

  // Computed signals for derived view data
  readonly cursorClass = computed(() => {
    const mode = this.mode();
    switch (mode) {
      case 'draw': return 'cursor-pencil';
      case 'erase': return 'cursor-eraser';
      case 'set_points': return 'cursor-flag';
      default: return 'cursor-default';
    }
  });

  readonly svgWidth = computed(() => {
    const grid = this.grid();
    if (!grid || grid.length === 0) return 0;
    return grid[0].length * 16 + 1;
  });

  readonly svgHeight = computed(() => {
    const grid = this.grid();
    if (!grid || grid.length === 0) return 0;
    return grid.length * 16 + 1;
  });

  readonly scannedCellsArray = computed(() => {
    return Array.from(this.autoNavService.scannedCells()).map(key => {
      const [y, x] = key.split(',').map(Number);
      return { y, x };
    });
  });

  readonly pathSegments = computed(() => {
    const path = this.path();
    const returnPathStartIndex = this.returnPathStartIndex();
    const drawIndex = this.pathDrawIndex();

    if (!path || path.length < 2 || drawIndex < 2) return [];

    const visiblePath = path.slice(0, drawIndex);
    const segments = [];

    for (let i = 0; i < visiblePath.length - 1; i++) {
      const current = visiblePath[i];
      const next = visiblePath[i + 1];

      segments.push({
        x1: current.x * 16 + 8.5,
        y1: current.y * 16 + 8.5,
        x2: next.x * 16 + 8.5,
        y2: next.y * 16 + 8.5,
        isReturnPath: returnPathStartIndex >= 0 && i >= returnPathStartIndex
      });
    }

    return segments;
  });

  readonly turningPoints = computed(() => {
    const path = this.path();
    const drawIndex = this.pathDrawIndex();
    const waypoints = this.waypoints();

    if (!path || path.length < 3) return [];

    const visiblePath = path.slice(0, drawIndex || path.length);
    const points: Array<{ point: { y: number; x: number }, index: number }> = [];

    for (let i = 1; i < visiblePath.length - 1; i++) {
      const prev = visiblePath[i - 1];
      const current = visiblePath[i];
      const next = visiblePath[i + 1];

      if (waypoints.some(wp => wp.y === current.y && wp.x === current.x)) continue;

      const dir1 = { x: current.x - prev.x, y: current.y - prev.y };
      const dir2 = { x: next.x - current.x, y: next.y - current.y };
      const crossProduct = dir1.x * dir2.y - dir1.y * dir2.x;

      if (Math.abs(crossProduct) > 0) {
        points.push({ point: current, index: i });
      }
    }

    return points;
  });

  private readonly modes: Array<'draw' | 'erase' | 'set_points' | 'find_path'> = ['draw', 'erase', 'set_points', 'find_path'];

  // State update helper
  private updateState(partial: Partial<GridViewState>) {
    this.state.update(s => ({ ...s, ...partial }));
  }

  ngOnInit() {
    const mapId = this.route.snapshot.paramMap.get('mapId');
    if (mapId) {
      const savedMap = this.mapStorageService.getMapById(mapId);
      if (savedMap) {
        this.gridService.updateGrid(savedMap.grid);
        this.gridService.setCurrentMap(savedMap.id, savedMap.name);
      }
    } else {
      this.gridService.clearCurrentMap();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Alt') {
      event.preventDefault();
      const s = this.state();
      if (!s.isAltPressed) {
        this.updateState({ isAltPressed: true });
        this.cycleMode();
      }
      if (s.hoveredCell) {
        this.updateState({ showPopover: true });
      }
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (event.key === 'Alt') {
      this.updateState({ isAltPressed: false, showPopover: false });
    }
  }

  private cycleMode() {
    const currentMode = this.gridQuery.getSnapshot().mode;
    const currentIndex = this.modes.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % this.modes.length;
    this.gridService.setMode(this.modes[nextIndex]);
  }

  getCellClass(cell: boolean, y: number, x: number): Record<string, boolean> {
    const waypoints = this.waypoints();
    const wp = waypoints.find(wp => wp.y === y && wp.x === x);
    return {
      wall: cell,
      waypoint: !!wp,
      'waypoint-pending': wp?.status === 'pending',
      'waypoint-visited': wp?.status === 'visited',
      'waypoint-failed': wp?.status === 'failed'
    };
  }

  getWaypointSymbol(y: number, x: number): string {
    const waypoints = this.waypoints();
    const wp = waypoints.find(wp => wp.y === y && wp.x === x);
    if (!wp) return '';
    
    if (wp.status === 'visited') return '✓';
    if (wp.status === 'pending') return '?';
    
    const index = waypoints.indexOf(wp);
    return (index + 1).toString();
  }

  private getLineCells(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
    const cells: Array<{ x: number; y: number }> = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;

    while (true) {
      cells.push({ x, y });
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }

    return cells;
  }

  private drawLine(startY: number, startX: number, endY: number, endX: number, isWall: boolean) {
    const cells = this.getLineCells(startX, startY, endX, endY);
    const grid = this.grid();

    cells.forEach(cell => {
      if (cell.y >= 0 && cell.y < grid.length && cell.x >= 0 && cell.x < grid[0].length) {
        this.gridService.drawAt(cell.y, cell.x, isWall);
      }
    });
  }

  private eraseLine(startY: number, startX: number, endY: number, endX: number) {
    const cells = this.getLineCells(startX, startY, endX, endY);
    const grid = this.grid();

    cells.forEach(cell => {
      if (cell.y >= 0 && cell.y < grid.length && cell.x >= 0 && cell.x < grid[0].length) {
        this.eraseAt(cell.y, cell.x);
      }
    });
  }

  private eraseAt(y: number, x: number) {
    const waypoints = this.waypoints();
    const waypointIndex = waypoints.findIndex(wp => wp.y === y && wp.x === x);

    if (waypointIndex >= 0) {
      this.waypointsService.removeWaypointAt(waypointIndex);
      this.pathfinderService.setPath(null);
      this.pathfinderService.setPathLength(0);
    }

    this.gridService.drawAt(y, x, false);
  }

  onCellClick(y: number, x: number, event: MouseEvent) {
    event.preventDefault();
    const mode = this.mode();
    const grid = this.grid();

    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return;

    switch (mode) {
      case 'draw':
        if (event.button === 0) {
          this.updateState({ isMouseDown: true, dragMode: 'draw', lastDrawPosition: { y, x } });
          this.gridService.drawAt(y, x, true);
        } else if (event.button === 2) {
          this.updateState({ isMouseDown: true, dragMode: 'erase', lastDrawPosition: { y, x } });
          this.gridService.drawAt(y, x, false);
        }
        break;

      case 'erase':
        this.updateState({ isMouseDown: true, dragMode: 'erase', lastDrawPosition: { y, x } });
        this.eraseAt(y, x);
        break;

      case 'set_points':
        if (event.button === 0) {
          if (!grid[y][x]) {
            this.waypointsService.addWaypoint(y, x);
            this.pathfinderService.setPath(null);
            this.pathfinderService.setPathLength(0);
          }
        } else if (event.button === 2) {
          this.waypointsService.removeLastWaypoint();
          this.pathfinderService.setPath(null);
          this.pathfinderService.setPathLength(0);
        }
        break;
    }
  }

  onCellMouseEnter(y: number, x: number, event: MouseEvent) {
    const s = this.state();
    this.updateState({
      hoveredCell: { x, y },
      popoverPosition: { x: event.clientX, y: event.clientY },
      showPopover: s.isAltPressed
    });

    if (!s.isMouseDown || !s.dragMode || !s.lastDrawPosition) return;

    const grid = this.grid();
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return;

    if (s.dragMode === 'draw') {
      this.drawLine(s.lastDrawPosition.y, s.lastDrawPosition.x, y, x, true);
    } else if (s.dragMode === 'erase') {
      this.eraseLine(s.lastDrawPosition.y, s.lastDrawPosition.x, y, x);
    }

    this.updateState({ lastDrawPosition: { y, x } });
  }

  onCellMouseMove(y: number, x: number, event: MouseEvent) {
    if (this.state().showPopover) {
      this.updateState({ popoverPosition: { x: event.clientX, y: event.clientY } });
    }
  }

  onCellMouseLeave() {
    this.updateState({ hoveredCell: null, showPopover: false });
  }

  onMouseUp(event: MouseEvent) {
    const s = this.state();
    this.updateState({
      isMouseDown: false,
      dragMode: null,
      lastDrawPosition: null
    });

    if (s.draggingTurningPoint) {
      this.updateState({ draggingTurningPoint: false, draggingPointIndex: -1 });
      document.querySelectorAll('.turning-point.dragging')
        .forEach(el => el.classList.remove('dragging'));
    }
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

    const rect = target.getBoundingClientRect();
    this.updateState({
      draggingTurningPoint: true,
      draggingPointIndex: index,
      dragOffset: {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2
      }
    });

    const onMouseMove = (e: MouseEvent) => this.onTurningPointDrag(e);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.finishDragTurningPoint();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  private onTurningPointDrag(event: MouseEvent): void {
    const s = this.state();
    if (!s.draggingTurningPoint || s.draggingPointIndex < 0) return;

    const gridCanvas = document.querySelector('.table-container') as HTMLElement;
    if (!gridCanvas) return;

    const rect = gridCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left - s.dragOffset.x;
    const y = event.clientY - rect.top - s.dragOffset.y;

    const gridX = Math.round((x - 8.5) / 16);
    const gridY = Math.round((y - 8.5) / 16);

    const currentPath = this.path();
    const grid = this.grid();

    if (currentPath && s.draggingPointIndex < currentPath.length) {
      if (gridY >= 0 && gridY < grid.length && gridX >= 0 && gridX < grid[0].length) {
        if (!grid[gridY][gridX]) {
          const newPath = [...currentPath];
          newPath[s.draggingPointIndex] = { y: gridY, x: gridX };
          this.pathfinderService.setPath(newPath);
        }
      }
    }
  }

  private finishDragTurningPoint(): void {
    this.updateState({ draggingTurningPoint: false, draggingPointIndex: -1 });
    document.querySelectorAll('.turning-point.dragging')
      .forEach(el => el.classList.remove('dragging'));
  }

  // Camera position methods
  getCameraX(position: { x: number; y: number }): number {
    return position.x * 14 + 7;
  }

  getCameraY(position: { x: number; y: number }): number {
    return position.y * 14 + 7;
  }

  getCameraRangeRadius(cameraRange: number): number {
    return cameraRange * 14;
  }
}
