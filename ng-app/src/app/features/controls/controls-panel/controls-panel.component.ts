import { Component, OnInit, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { GridService, GridQuery } from '../../../store/grid.service';
import { WaypointsService } from '../../../store/waypoints.service';
import { PathfinderService, PathfinderQuery } from '../../../store/pathfinder.service';
import { PathfinderUtilsService } from '../../../utils/pathfinder.service';
import { CameraService } from '../../../services/camera.service';
import { AutoNavService } from '../../../services/auto-nav.service';
import { MapStorageService, SavedMap } from '../../../services/map-storage.service';
import { OpenMapDialogComponent, OpenMapDialogResult } from '../open-map-dialog/open-map-dialog.component';

interface ControlsPanelState {
  isCalculating: boolean;
  isCalculatingCameras: boolean;
  savedMaps: SavedMap[];
  showOpenDialog: boolean;
}

const initialState: ControlsPanelState = {
  isCalculating: false,
  isCalculatingCameras: false,
  savedMaps: [],
  showOpenDialog: false
};

@Component({
  selector: 'app-controls-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './controls-panel.component.html',
  styleUrls: ['./controls-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControlsPanelComponent implements OnInit {
  // Services via field injection
  private readonly gridService = inject(GridService);
  private readonly gridQuery = inject(GridQuery);
  private readonly waypointsService = inject(WaypointsService);
  private readonly pathfinderService = inject(PathfinderService);
  private readonly pathfinderQuery = inject(PathfinderQuery);
  private readonly pathfinderUtils = inject(PathfinderUtilsService);
  private readonly cameraService = inject(CameraService);
  readonly autoNavService = inject(AutoNavService);
  private readonly mapStorageService = inject(MapStorageService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  // Single writable signal for component state
  readonly state = signal<ControlsPanelState>(initialState);

  // Computed signals for view bindings
  readonly isCalculating = computed(() => this.state().isCalculating);
  readonly isCalculatingCameras = computed(() => this.state().isCalculatingCameras);
  readonly savedMaps = computed(() => this.state().savedMaps);
  readonly showOpenDialog = computed(() => this.state().showOpenDialog);

  // Convert observables to signals
  readonly mode = toSignal(this.gridQuery.mode$, { initialValue: 'draw' });
  readonly optimizeOrder = toSignal(this.pathfinderQuery.optimizeOrder$, { initialValue: false });
  readonly optimizationStrategy = toSignal(this.pathfinderQuery.optimizationStrategy$, { initialValue: 'strategy1' as const });
  readonly cameraRange = toSignal(this.gridQuery.cameraRange$, { initialValue: 20 });
  readonly currentMapId = toSignal(this.gridQuery.currentMapId$, { initialValue: null as string | null });
  readonly mapName = toSignal(this.gridQuery.currentMapName$, { initialValue: '' });

  // State update helper
  private updateState(partial: Partial<ControlsPanelState>) {
    this.state.update(s => ({ ...s, ...partial }));
  }

  ngOnInit() {
    this.loadSavedMaps();
  }

  loadSavedMaps() {
    const maps = this.mapStorageService.getSavedMaps();
    this.updateState({ savedMaps: maps });
  }

  toggleAutoNav() {
    if (this.autoNavService.isActive()) {
      this.autoNavService.stopAutoNav();
    } else {
      this.autoNavService.startAutoNav();
    }
  }

  updateAutoNavParam(param: 'scanRange' | 'binSize' | 'scannedRadius' | 'speed' | 'wallGap' | 'peerGap' | 'redundancyThreshold', value: number) {
    this.autoNavService[param].set(value);
  }

  updateMapName(name: string) {
    this.gridService.setCurrentMapName(name);
  }

  saveCurrentMap() {
    const snapshot = this.gridQuery.getSnapshot();
    const { grid, currentMapId, currentMapName } = snapshot;

    if (currentMapId) {
      // Update existing map
      this.mapStorageService.updateMap(currentMapId, currentMapName, grid);
    } else {
      // Create new map and navigate to it
      const savedMap = this.mapStorageService.saveMap(currentMapName, grid);
      this.gridService.setCurrentMap(savedMap.id, savedMap.name);
      this.router.navigate(['/grid', savedMap.id]);
    }
    this.loadSavedMaps();
  }

  openMap(map: SavedMap) {
    const dialogRef = this.dialog.open(OpenMapDialogComponent, {
      data: { mapName: map.name },
      width: '350px'
    });

    dialogRef.afterClosed().subscribe((result: OpenMapDialogResult) => {
      if (result === 'current') {
        this.gridService.updateGrid(map.grid);
        this.gridService.setCurrentMap(map.id, map.name);
        this.updateState({ showOpenDialog: false });
        this.router.navigate(['/grid', map.id]);
      } else if (result === 'newTab') {
        const url = this.router.serializeUrl(
          this.router.createUrlTree(['/grid', map.id])
        );
        window.open(url, '_blank');
        this.updateState({ showOpenDialog: false });
      }
    });
  }

  toggleOpenDialog() {
    this.updateState({ showOpenDialog: !this.state().showOpenDialog });
  }

  deleteMap(id: string, event: Event) {
    event.stopPropagation();
    this.mapStorageService.deleteMap(id);
    this.loadSavedMaps();
  }

  setMode(mode: 'draw' | 'erase' | 'set_points' | 'find_path') {
    this.gridService.setMode(mode);
  }

  clearWaypoints() {
    this.waypointsService.clearWaypoints();
    this.pathfinderService.setPath(null);
    this.pathfinderService.setPathLength(0);
  }

  clearCameras() {
    this.gridService.clearCameraPositions();
  }

  toggleOptimizeOrder() {
    const currentValue = this.pathfinderQuery.getSnapshot().optimizeOrder;
    this.pathfinderService.setOptimizeOrder(!currentValue);
  }

  setOptimizationStrategy(event: Event) {
    const target = event.target as HTMLSelectElement;
    const strategy = target.value as 'strategy1' | 'strategy2';
    this.pathfinderService.setOptimizationStrategy(strategy);
  }

  setCameraRange(event: Event) {
    const target = event.target as HTMLInputElement;
    const range = parseInt(target.value);
    this.gridService.setCameraRange(range);
    this.gridService.clearCameraPositions();
  }

  async findPath() {
    this.setMode('find_path');
    this.updateState({ isCalculating: true });
    try {
      await this.pathfinderUtils.planPath();
    } finally {
      this.updateState({ isCalculating: false });
    }
  }

  async findCameraPoses() {
    this.updateState({ isCalculatingCameras: true });
    try {
      const grid = this.gridQuery.getSnapshot().grid;
      const cameraRange = this.gridQuery.getSnapshot().cameraRange;

      this.cameraService.setCameraRange(cameraRange);
      const positions = this.cameraService.findCameraPositions(grid);
      this.gridService.setCameraPositions(positions);

      console.log(`Found ${positions.length} camera positions:`, positions);

      const isFullyCovered = this.cameraService.isFullyCovered(grid, positions);
      console.log('Full coverage:', isFullyCovered);

      if (positions.length === 0) {
        alert('No camera positions could be found. Try adjusting the camera range or map layout.');
      } else if (isFullyCovered) {
        alert(`Successfully placed ${positions.length} cameras with full coverage!`);
      }
    } finally {
      this.updateState({ isCalculatingCameras: false });
    }
  }

  replayAnimation() {
    this.pathfinderUtils.replayAnimation();
  }
}
