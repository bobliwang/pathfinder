import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface OpenMapDialogData {
  mapName: string;
}

export type OpenMapDialogResult = 'current' | 'newTab' | null;

@Component({
  selector: 'app-open-map-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Open Map</h2>
    <mat-dialog-content>
      <p>How would you like to open "{{ data.mapName }}"?</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-flat-button color="primary" (click)="openHere()">Open here</button>
      <button mat-flat-button (click)="openNewTab()">Open in new tab</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content p {
      margin: 0;
      font-size: 14px;
    }
    mat-dialog-actions {
      gap: 8px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OpenMapDialogComponent {
  readonly dialogRef = inject(MatDialogRef<OpenMapDialogComponent>);
  readonly data = inject<OpenMapDialogData>(MAT_DIALOG_DATA);

  cancel() {
    this.dialogRef.close(null);
  }

  openHere() {
    this.dialogRef.close('current' as OpenMapDialogResult);
  }

  openNewTab() {
    this.dialogRef.close('newTab' as OpenMapDialogResult);
  }
}
