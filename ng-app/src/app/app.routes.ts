import { Routes } from '@angular/router';
import { GridViewComponent } from './features/grid/grid-view/grid-view.component';

export const routes: Routes = [
  { path: 'grid', component: GridViewComponent },
  { path: 'grid/:mapId', component: GridViewComponent },
  { path: '', redirectTo: '/grid', pathMatch: 'full' },
];
