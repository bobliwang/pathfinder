import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GridService, GridQuery } from '../../../store/grid.service';
import { WaypointsService } from '../../../store/waypoints.service';
import { PathfinderService, PathfinderQuery } from '../../../store/pathfinder.service';
import { PathfinderUtilsService } from '../../../utils/pathfinder.service';
import { CameraService } from '../../../services/camera.service';
import { MapStorageService, SavedMap } from '../../../services/map-storage.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-controls-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './controls-panel.component.html',
  styleUrls: ['./controls-panel.component.scss']
})
export class ControlsPanelComponent implements OnInit {
  mode$: Observable<string>;
  optimizeOrder$: Observable<boolean>;
  optimizationStrategy$: Observable<'strategy1' | 'strategy2'>;
  cameraRange$: Observable<number>;
  isCalculating = false;
  isCalculatingCameras = false;

  mapName = '';
  savedMaps: SavedMap[] = [];
  showOpenDialog = false;

  constructor(
    private gridService: GridService,
    private gridQuery: GridQuery,
    private waypointsService: WaypointsService,
    private pathfinderService: PathfinderService,
    private pathfinderQuery: PathfinderQuery,
    private pathfinderUtils: PathfinderUtilsService,
    private cameraService: CameraService,
    private mapStorageService: MapStorageService
  ) {
    this.mode$ = this.gridQuery.mode$;
    this.optimizeOrder$ = this.pathfinderQuery.optimizeOrder$;
    this.optimizationStrategy$ = this.pathfinderQuery.optimizationStrategy$;
    this.cameraRange$ = this.gridQuery.cameraRange$;
  }

  ngOnInit() {
    this.loadSavedMaps();
  }

  loadSavedMaps() {
    this.savedMaps = this.mapStorageService.getSavedMaps();
  }

  saveCurrentMap() {
    const grid = this.gridQuery.getSnapshot().grid;
    this.mapStorageService.saveMap(this.mapName, grid);
    this.mapName = '';
    this.loadSavedMaps();
  }

  openMap(map: SavedMap) {
    this.gridService.updateGrid(map.grid);
    this.showOpenDialog = false;
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
    // Clear existing camera positions when range changes
    this.gridService.clearCameraPositions();
  }

  async findPath() {
    this.setMode('find_path');
    this.isCalculating = true;
    try {
      await this.pathfinderUtils.planPath();
    } finally {
      this.isCalculating = false;
    }
  }

  async findCameraPoses() {
    this.isCalculatingCameras = true;
    try {
      const grid = this.gridQuery.getSnapshot().grid;
      const cameraRange = this.gridQuery.getSnapshot().cameraRange;
      
      // Set camera range in service
      this.cameraService.setCameraRange(cameraRange);
      
      // Find optimal camera positions
      const positions = this.cameraService.findCameraPositions(grid);
      
      // Update grid service with camera positions
      this.gridService.setCameraPositions(positions);
      
      console.log(`Found ${positions.length} camera positions:`, positions);
      
      // Check if all cells are covered
      const isFullyCovered = this.cameraService.isFullyCovered(grid, positions);
      console.log('Full coverage:', isFullyCovered);

      // Show results to user
      if (positions.length === 0) {
        alert('No camera positions could be found. Try adjusting the camera range or map layout.');
      } else if (isFullyCovered) {
        alert(`Successfully placed ${positions.length} cameras with full coverage!`);
      }
      
    } finally {
      this.isCalculatingCameras = false;
    }
  }

  replayAnimation() {
    this.pathfinderUtils.replayAnimation();
  }
}
