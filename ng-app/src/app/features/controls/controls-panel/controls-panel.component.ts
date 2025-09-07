import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GridService, GridQuery } from '../../../store/grid.service';
import { WaypointsService } from '../../../store/waypoints.service';
import { PathfinderService, PathfinderQuery } from '../../../store/pathfinder.service';
import { PathfinderUtilsService } from '../../../utils/pathfinder.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-controls-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './controls-panel.component.html',
  styleUrls: ['./controls-panel.component.scss']
})
export class ControlsPanelComponent {
  mode$: Observable<string>;
  optimizeOrder$: Observable<boolean>;
  optimizationStrategy$: Observable<'strategy1' | 'strategy2'>;
  isCalculating = false;

  constructor(
    private gridService: GridService,
    private gridQuery: GridQuery,
    private waypointsService: WaypointsService,
    private pathfinderService: PathfinderService,
    private pathfinderQuery: PathfinderQuery,
    private pathfinderUtils: PathfinderUtilsService
  ) {
    this.mode$ = this.gridQuery.mode$;
    this.optimizeOrder$ = this.pathfinderQuery.optimizeOrder$;
    this.optimizationStrategy$ = this.pathfinderQuery.optimizationStrategy$;
  }

  setMode(mode: 'draw' | 'erase' | 'set_points' | 'find_path') {
    this.gridService.setMode(mode);
  }

  clearWaypoints() {
    this.waypointsService.clearWaypoints();
    this.pathfinderService.setPath(null);
    this.pathfinderService.setPathLength(0);
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

  async findPath() {
    this.setMode('find_path');
    this.isCalculating = true;
    try {
      await this.pathfinderUtils.planPath();
    } finally {
      this.isCalculating = false;
    }
  }

  replayAnimation() {
    this.pathfinderUtils.replayAnimation();
  }
}
