import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { routes } from './app.routes';
import { GridStore } from './store/grid.service';
import { WaypointsStore } from './store/waypoints.service';
import { PathfinderStore } from './store/pathfinder.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    GridStore,
    WaypointsStore,
    PathfinderStore
  ]
};
