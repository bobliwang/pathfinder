import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ControlsPanelComponent } from './controls-panel.component';

describe('ControlsPanelComponent', () => {
  let component: ControlsPanelComponent;
  let fixture: ComponentFixture<ControlsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ControlsPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ControlsPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
