import { Injectable } from '@angular/core';

export interface CameraPosition {
  x: number;
  y: number;
}

@Injectable({
  providedIn: 'root'
})
export class CameraService {
  private camR = 10; // Default camera range in cells

  constructor() {}

  /**
   * Set the camera range
   */
  setCameraRange(range: number) {
    this.camR = range;
  }

  /**
   * Get the camera range
   */
  getCameraRange(): number {
    return this.camR;
  }

  /**
   * Find optimal camera positions using a systematic non-greedy approach
   */
  findCameraPositions(grid: boolean[][]): CameraPosition[] {
    // Define boundary constants once for the entire method
    const BOUNDS = {
      GRID_WIDTH: grid[0].length,
      GRID_HEIGHT: grid.length,
      MIN_X: 4,
      MIN_Y: 4,
      get MAX_X() { return this.GRID_WIDTH - 5; },
      get MAX_Y() { return this.GRID_HEIGHT - 5; }
    };
    
    console.log(`🔍 CAMERA PLACEMENT DEBUG START`);
    console.log(`📏 Grid dimensions: WIDTH=${BOUNDS.GRID_WIDTH}, HEIGHT=${BOUNDS.GRID_HEIGHT}`);
    console.log(`📡 Camera range: ${this.camR}`);
    console.log(`🚧 Ultra-strict boundaries: X=[${BOUNDS.MIN_X}, ${BOUNDS.MAX_X}], Y=[${BOUNDS.MIN_Y}, ${BOUNDS.MAX_Y}]`);
    
    const cameraPositions: CameraPosition[] = [];
    const coveredCells = new Set<string>();
    
    // First, mark all wall cells as "covered" so we only track free cells
    this.initializeCoveredCells(grid, coveredCells);
    
    // Find room corners and start systematic placement
    const corners = this.findRoomCorners(grid);
    console.log(`Found ${corners.length} room corners:`, corners);
    
    for (const corner of corners) {
      this.placeSystematicCameras(grid, corner, cameraPositions, coveredCells);
    }
    
    // Validate connectivity constraint for all cameras
    const connectivityDistance = this.camR * 3 / 2;
    const validCameras = this.validateConnectivity(cameraPositions, connectivityDistance);
    console.log(`Connectivity validation: ${validCameras.length}/${cameraPositions.length} cameras meet connectivity constraint`);
    
    // FINAL BOUNDARY VALIDATION - Remove any cameras outside ultra-strict bounds
    const minX = 4, maxX = grid[0].length - 5;
    const minY = 4, maxY = grid.length - 5;
    
    const safeCameras = validCameras.filter((camera, index) => {
      const isInBounds = camera.x >= minX && camera.x <= maxX && 
                        camera.y >= minY && camera.y <= maxY;
      if (!isInBounds) {
        console.error(`🚨 FINAL CHECK: Removing camera ${index + 1} at (${camera.x}, ${camera.y}) - outside ultra-strict bounds [${minX}-${maxX}, ${minY}-${maxY}]`);
        console.error(`🚨 DETAILS: Camera X=${camera.x} (valid: ${minX}-${maxX}), Y=${camera.y} (valid: ${minY}-${maxY})`);
      } else {
        console.log(`✅ Camera ${index + 1} at (${camera.x}, ${camera.y}) is within bounds`);
      }
      return isInBounds;
    });
    
    if (safeCameras.length < validCameras.length) {
      console.warn(`Removed ${validCameras.length - safeCameras.length} out-of-bounds cameras`);
    }
    
    // Check final coverage
    const finalCoverage = this.calculateSystematicCoverage(grid, safeCameras);
    console.log(`Final coverage: ${finalCoverage.coveredCells}/${finalCoverage.totalCells} (${(finalCoverage.percentage * 100).toFixed(1)}%)`);
    
    // DEBUG: Log all final camera positions
    console.log(`🎯 FINAL CAMERA POSITIONS (${safeCameras.length} cameras):`);
    safeCameras.forEach((camera, index) => {
      const cameraNum = index + 1;
      console.log(`📷 Camera ${cameraNum}: (${camera.x}, ${camera.y}) - ${camera.x >= 4 && camera.x <= 75 && camera.y >= 4 && camera.y <= 55 ? '✅ VALID' : '❌ INVALID'}`);
    });
    console.log(`🔍 CAMERA PLACEMENT DEBUG END`);
    
    return safeCameras;
  }

  /**
   * Initialize covered cells with all wall positions
   */
  private initializeCoveredCells(grid: boolean[][], coveredCells: Set<string>) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x]) { // Wall cell
          coveredCells.add(`${x},${y}`);
        }
      }
    }
  }

  /**
   * Find corners where walls intersect (room corners)
   */
  private findRoomCorners(grid: boolean[][]): CameraPosition[] {
    const corners: CameraPosition[] = [];
    const height = grid.length;
    const width = grid[0].length;
    
    // Check each cell to see if it's a corner, but stay away from edges
    const margin = 3; // Stay at least 3 cells from boundaries
    for (let y = margin; y < height - margin; y++) {
      for (let x = margin; x < width - margin; x++) {
        if (!grid[y][x]) { // Free cell
          // Check if this is near a corner (has walls on two perpendicular sides)
          if (this.isNearCorner(grid, x, y)) {
            corners.push({ x, y });
          }
        }
      }
    }
    
    // If no corners found, start from safe room centers
    if (corners.length === 0) {
      console.log('No corners found, using safe room centers');
      const safeMargin = Math.max(5, this.camR); // Use larger margin for safety
      if (width > 2 * safeMargin && height > 2 * safeMargin) {
        corners.push({ x: safeMargin, y: safeMargin });
        corners.push({ x: width - safeMargin, y: safeMargin });
        corners.push({ x: safeMargin, y: height - safeMargin });
        corners.push({ x: width - safeMargin, y: height - safeMargin });
      }
    }
    
    return corners;
  }

  /**
   * Check if a position is near a corner (walls on two perpendicular sides)
   */
  private isNearCorner(grid: boolean[][], x: number, y: number): boolean {
    const directions = [
      { dx: -1, dy: 0 }, // left
      { dx: 1, dy: 0 },  // right
      { dx: 0, dy: -1 }, // up
      { dx: 0, dy: 1 }   // down
    ];
    
    let wallCount = 0;
    let hasPerpendicularWalls = false;
    
    // Check for walls in each direction
    for (let i = 0; i < directions.length; i++) {
      const dir = directions[i];
      const checkX = x + dir.dx;
      const checkY = y + dir.dy;
      
      if (checkY >= 0 && checkY < grid.length && checkX >= 0 && checkX < grid[0].length) {
        if (grid[checkY][checkX]) { // Wall found
          wallCount++;
          
          // Check for perpendicular walls
          const perpDir = directions[(i + 1) % 4];
          const perpX = x + perpDir.dx;
          const perpY = y + perpDir.dy;
          
          if (perpY >= 0 && perpY < grid.length && perpX >= 0 && perpX < grid[0].length) {
            if (grid[perpY][perpX]) {
              hasPerpendicularWalls = true;
            }
          }
        }
      }
    }
    
    return wallCount >= 2 && hasPerpendicularWalls;
  }

  /**
   * Place cameras systematically starting from a corner
   */
  private placeSystematicCameras(
    grid: boolean[][], 
    startCorner: CameraPosition, 
    cameraPositions: CameraPosition[], 
    coveredCells: Set<string>
  ) {
    console.log(`Starting systematic placement from corner (${startCorner.x}, ${startCorner.y})`);
    
    const placementQueue: CameraPosition[] = [];
    const visited = new Set<string>();
    const connectivityDistance = this.camR * 3 / 4; // Cameras must be within 3/4 camR of each other
    
    // Start at 2/3 camR from the corner
    const startDistance = Math.round(this.camR * 2 / 3);
    const startPositions = this.getStartPositions(grid, startCorner, startDistance);
    
    for (const startPos of startPositions) {
      if (this.isValidSystematicPosition(grid, startPos, cameraPositions)) {
        placementQueue.push(startPos);
      }
    }
    
    while (placementQueue.length > 0) {
      const currentPos = placementQueue.shift()!;
      const posKey = `${currentPos.x},${currentPos.y}`;
      
      if (visited.has(posKey)) continue;
      visited.add(posKey);
      
      // Check if this position would provide useful coverage
      if (this.wouldProvideUsefulCoverage(grid, currentPos, coveredCells)) {
        // Check connectivity constraint (except for the first camera)
        if (cameraPositions.length === 0 || this.hasNearbyCamera(currentPos, cameraPositions, connectivityDistance)) {
          
          // FINAL SAFETY CHECK - Ultra-strict boundary validation
          const minX = 4, maxX = grid[0].length - 5;
          const minY = 4, maxY = grid.length - 5;
          
          if (currentPos.x < minX || currentPos.x > maxX || 
              currentPos.y < minY || currentPos.y > maxY) {
            console.warn(`🚫 SAFETY CHECK: Rejecting camera at (${currentPos.x}, ${currentPos.y}) - outside ultra-strict bounds [${minX}-${maxX}, ${minY}-${maxY}]`);
            console.warn(`🚫 DETAILS: X=${currentPos.x} (valid: ${minX}-${maxX}), Y=${currentPos.y} (valid: ${minY}-${maxY})`);
            continue;
          }
          
          cameraPositions.push(currentPos);
          console.log(`📍 Placed camera ${cameraPositions.length} at (${currentPos.x}, ${currentPos.y}) - within ultra-strict bounds [${minX}-${maxX}, ${minY}-${maxY}]`);
          
          // Mark cells as covered
          this.markCellsCovered(grid, currentPos, coveredCells);
          
          // Add next camera positions at distances that ensure connectivity
          const nextDistance = Math.min(this.camR / 2, connectivityDistance * 0.8); // Slightly less than connectivity limit
          const nextPositions = this.getNextCameraPositions(grid, currentPos, nextDistance);
          for (const nextPos of nextPositions) {
            const nextKey = `${nextPos.x},${nextPos.y}`;
            if (!visited.has(nextKey) && this.isValidSystematicPosition(grid, nextPos, cameraPositions)) {
              placementQueue.push(nextPos);
            }
          }
        } else {
          console.log(`Position (${currentPos.x}, ${currentPos.y}) rejected due to connectivity constraint`);
        }
      }
    }
  }

  /**
   * Check if a position has a nearby camera within the connectivity distance
   */
  private hasNearbyCamera(pos: CameraPosition, existingCameras: CameraPosition[], maxDistance: number): boolean {
    for (const camera of existingCameras) {
      const distance = Math.sqrt((pos.x - camera.x) ** 2 + (pos.y - camera.y) ** 2);
      if (distance <= maxDistance) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get alternative camera positions near a given position
   */
  private getAlternativePositions(grid: boolean[][], around: CameraPosition, uncoveredCells: CameraPosition[]): CameraPosition[] {
    const alternatives: CameraPosition[] = [];
    const validPositions = this.getValidCameraPositions(grid);
    
    // Find positions within a small radius of the original position
    for (const candidate of validPositions) {
      const distance = Math.sqrt((candidate.x - around.x) ** 2 + (candidate.y - around.y) ** 2);
      if (distance <= this.camR / 2) {
        alternatives.push(candidate);
      }
    }
    
    // Sort by coverage potential
    alternatives.sort((a, b) => {
      const coverageA = this.getCoveredCells(grid, a).filter(cell => 
        uncoveredCells.some(uncovered => uncovered.x === cell.x && uncovered.y === cell.y)
      ).length;
      const coverageB = this.getCoveredCells(grid, b).filter(cell => 
        uncoveredCells.some(uncovered => uncovered.x === cell.x && uncovered.y === cell.y)
      ).length;
      return coverageB - coverageA;
    });
    
    console.log(`Found ${alternatives.length} alternative positions`);
    return alternatives;
  }

  /**
   * Get starting positions around a corner at specified distance
   */
  private getStartPositions(grid: boolean[][], corner: CameraPosition, distance: number): CameraPosition[] {
    const positions: CameraPosition[] = [];
    
    // Try positions in different directions from the corner
    const directions = [
      { dx: 1, dy: 0 },   // right
      { dx: 0, dy: 1 },   // down
      { dx: 1, dy: 1 },   // diagonal down-right
      { dx: -1, dy: 0 },  // left
      { dx: 0, dy: -1 },  // up
      { dx: -1, dy: -1 }, // diagonal up-left
      { dx: 1, dy: -1 },  // diagonal up-right
      { dx: -1, dy: 1 }   // diagonal down-left
    ];
    
    for (const dir of directions) {
      const newX = corner.x + Math.round(dir.dx * distance);
      const newY = corner.y + Math.round(dir.dy * distance);
      
      // ULTRA-STRICT BOUNDARY CHECK - Use same bounds as validation
      const GRID_WIDTH = grid[0].length;
      const GRID_HEIGHT = grid.length;
      const MIN_X = 4, MAX_X = GRID_WIDTH - 5;
      const MIN_Y = 4, MAX_Y = GRID_HEIGHT - 5;
      
      if (newX >= MIN_X && newX <= MAX_X && newY >= MIN_Y && newY <= MAX_Y) {
        positions.push({ x: newX, y: newY });
        console.log(`✅ Start position candidate: (${newX}, ${newY}) within ultra-strict bounds`);
      } else {
        console.log(`❌ Start position (${newX}, ${newY}) rejected: outside ultra-strict bounds [${MIN_X}-${MAX_X}, ${MIN_Y}-${MAX_Y}]`);
      }
    }
    
    return positions;
  }

  /**
   * Check if a position is valid for systematic camera placement - STRICT VERSION
   */
  private isValidSystematicPosition(grid: boolean[][], pos: CameraPosition, existingCameras: CameraPosition[] = []): boolean {
    const { x, y } = pos;
    
    // ULTRA-STRICT BOUNDARY CHECK: Use 4-cell margin from all edges
    const GRID_WIDTH = grid[0].length;  // Should be 80
    const GRID_HEIGHT = grid.length;    // Should be 60
    
    const MIN_X = 4;
    const MAX_X = GRID_WIDTH - 5;  // 80 - 5 = 75
    const MIN_Y = 4;
    const MAX_Y = GRID_HEIGHT - 5; // 60 - 5 = 55
    
    if (x < MIN_X || x > MAX_X || y < MIN_Y || y > MAX_Y) {
      console.log(`❌ BOUNDARY: Position (${x}, ${y}) outside ultra-strict bounds [${MIN_X}-${MAX_X}, ${MIN_Y}-${MAX_Y}]`);
      return false;
    }
    
    // Must be on a free cell
    if (grid[y][x]) {
      console.log(`❌ WALL: Position (${x}, ${y}) is on a wall cell`);
      return false;
    }
    
    // COMPREHENSIVE WALL DISTANCE CHECK: Check 3x3 area around camera
    // This ensures cameras are at least 2 cells away from any wall
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue; // Skip center
        
        const checkX = x + dx;
        const checkY = y + dy;
        
        // Skip if out of grid bounds (shouldn't happen with our boundary check)
        if (checkX < 0 || checkX >= GRID_WIDTH || checkY < 0 || checkY >= GRID_HEIGHT) {
          continue;
        }
        
        // Reject if wall found within 2-cell radius
        if (grid[checkY][checkX]) {
          console.log(`❌ WALL_PROXIMITY: Position (${x}, ${y}) too close to wall at (${checkX}, ${checkY})`);
          return false;
        }
      }
    }
    
    // STRICT CAMERA SPACING: Minimum 4-cell distance between cameras
    const MIN_CAMERA_DISTANCE = Math.max(4, Math.floor(this.camR / 2));
    for (const existingCamera of existingCameras) {
      const distance = Math.sqrt((x - existingCamera.x) ** 2 + (y - existingCamera.y) ** 2);
      if (distance < MIN_CAMERA_DISTANCE) {
        console.log(`❌ SPACING: Position (${x}, ${y}) too close to camera at (${existingCamera.x}, ${existingCamera.y}) - distance: ${distance.toFixed(1)}, min: ${MIN_CAMERA_DISTANCE}`);
        return false;
      }
    }
    
    console.log(`✅ VALID: Position (${x}, ${y}) passed ALL strict checks`);
    return true;
  }

  /**
   * Check if placing a camera at this position would provide useful coverage
   */
  private wouldProvideUsefulCoverage(grid: boolean[][], pos: CameraPosition, coveredCells: Set<string>): boolean {
    const potentialCoverage = this.getCoveredCells(grid, pos);
    
    // Count how many uncovered cells this camera would cover
    let newCoverage = 0;
    for (const cell of potentialCoverage) {
      const cellKey = `${cell.x},${cell.y}`;
      if (!coveredCells.has(cellKey)) {
        newCoverage++;
      }
    }
    
    // Only place camera if it covers at least a few new cells
    const minUsefulCoverage = Math.max(1, Math.floor(this.camR));
    return newCoverage >= minUsefulCoverage;
  }

  /**
   * Mark cells as covered by a camera
   */
  private markCellsCovered(grid: boolean[][], cameraPos: CameraPosition, coveredCells: Set<string>) {
    const covered = this.getCoveredCells(grid, cameraPos);
    let newlyCovered = 0;
    
    for (const cell of covered) {
      const cellKey = `${cell.x},${cell.y}`;
      if (!coveredCells.has(cellKey)) {
        coveredCells.add(cellKey);
        newlyCovered++;
      }
    }
    
    console.log(`Camera covers ${newlyCovered} new cells (${covered.length} total)`);
  }

  /**
   * Get next camera positions at specified distance from current position
   */
  private getNextCameraPositions(grid: boolean[][], currentPos: CameraPosition, distance: number): CameraPosition[] {
    const positions: CameraPosition[] = [];
    
    // Try positions in a grid pattern around the current position
    const step = Math.round(distance);
    const directions = [
      { dx: step, dy: 0 },     // right
      { dx: -step, dy: 0 },    // left
      { dx: 0, dy: step },     // down
      { dx: 0, dy: -step },    // up
      { dx: step, dy: step },  // diagonal down-right
      { dx: -step, dy: step }, // diagonal down-left
      { dx: step, dy: -step }, // diagonal up-right
      { dx: -step, dy: -step } // diagonal up-left
    ];
    
    for (const dir of directions) {
      const newX = currentPos.x + dir.dx;
      const newY = currentPos.y + dir.dy;
      
      // ULTRA-STRICT BOUNDARY CHECK - Use same bounds as validation
      const GRID_WIDTH = grid[0].length;
      const GRID_HEIGHT = grid.length;
      const MIN_X = 4, MAX_X = GRID_WIDTH - 5;
      const MIN_Y = 4, MAX_Y = GRID_HEIGHT - 5;
      
      if (newX >= MIN_X && newX <= MAX_X && newY >= MIN_Y && newY <= MAX_Y) {
        positions.push({ x: newX, y: newY });
      }
    }
    
    console.log(`Generated ${positions.length} next positions from (${currentPos.x}, ${currentPos.y})`);
    return positions;
  }

  /**
   * Validate and filter cameras to ensure connectivity constraint
   */
  private validateConnectivity(cameras: CameraPosition[], maxDistance: number): CameraPosition[] {
    if (cameras.length <= 1) return cameras;
    
    const validCameras: CameraPosition[] = [];
    const connectedCameras = new Set<number>();
    
    // Start with the first camera
    if (cameras.length > 0) {
      validCameras.push(cameras[0]);
      connectedCameras.add(0);
    }
    
    // Build connected network
    let addedInThisRound = true;
    while (addedInThisRound && connectedCameras.size < cameras.length) {
      addedInThisRound = false;
      
      for (let i = 0; i < cameras.length; i++) {
        if (connectedCameras.has(i)) continue;
        
        // Check if this camera is within connectivity distance of any connected camera
        let isConnected = false;
        for (const connectedIndex of connectedCameras) {
          const distance = Math.sqrt(
            (cameras[i].x - cameras[connectedIndex].x) ** 2 + 
            (cameras[i].y - cameras[connectedIndex].y) ** 2
          );
          
          if (distance <= maxDistance) {
            isConnected = true;
            break;
          }
        }
        
        if (isConnected) {
          validCameras.push(cameras[i]);
          connectedCameras.add(i);
          addedInThisRound = true;
        }
      }
    }
    
    // Log which cameras were removed due to connectivity
    const removedCount = cameras.length - validCameras.length;
    if (removedCount > 0) {
      console.log(`Removed ${removedCount} cameras due to connectivity constraint`);
    }
    
    return validCameras;
  }

  /**
   * Calculate coverage statistics for systematic approach
   */
  private calculateSystematicCoverage(grid: boolean[][], cameras: CameraPosition[]): { coveredCells: number, totalCells: number, percentage: number } {
    const freeCells = this.getFreeCells(grid);
    const allCoveredCells = new Set<string>();

    cameras.forEach(camera => {
      const covered = this.getCoveredCells(grid, camera);
      covered.forEach(cell => {
        allCoveredCells.add(`${cell.x},${cell.y}`);
      });
    });

    const coveredCount = Array.from(allCoveredCells).filter(cellStr => {
      const [x, y] = cellStr.split(',').map(Number);
      return freeCells.some(free => free.x === x && free.y === y);
    }).length;

    return {
      coveredCells: coveredCount,
      totalCells: freeCells.length,
      percentage: coveredCount / freeCells.length
    };
  }

  /**
   * Get all free cells (white cells) in the grid
   */
  private getFreeCells(grid: boolean[][]): CameraPosition[] {
    const freeCells: CameraPosition[] = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (!grid[y][x]) { // false = free cell
          freeCells.push({ x, y });
        }
      }
    }
    console.log(`Total free cells before validation: ${freeCells.length}`);
    return freeCells;
  }

  /**
   * Get valid camera positions (subset of free cells)
   */
  private getValidCameraPositions(grid: boolean[][]): CameraPosition[] {
    const validPositions: CameraPosition[] = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (this.isValidCameraPosition(grid, { x, y })) {
          validPositions.push({ x, y });
        }
      }
    }
    console.log(`Valid camera positions: ${validPositions.length}`);
    return validPositions;
  }

  /**
   * Check if a position is valid for placing a camera
   */
  private isValidCameraPosition(grid: boolean[][], pos: CameraPosition): boolean {
    const { x, y } = pos;
    
    // Must be within bounds with margin from edges
    const margin = 2; // Keep cameras at least 2 cells from the boundary
    if (y < margin || y >= grid.length - margin || x < margin || x >= grid[0].length - margin) {
      return false;
    }
    
    // Must be on a free cell
    if (grid[y][x]) {
      return false;
    }
    
    // Ensure there's clearance around the camera position
    // Check a 3x3 area around the camera position
    const clearance = 1;
    for (let dy = -clearance; dy <= clearance; dy++) {
      for (let dx = -clearance; dx <= clearance; dx++) {
        const checkY = y + dy;
        const checkX = x + dx;
        
        // Check bounds
        if (checkY < 0 || checkY >= grid.length || checkX < 0 || checkX >= grid[0].length) {
          return false; // Too close to boundary
        }
        
        // All cells in the clearance area must be free
        if (grid[checkY][checkX]) {
          return false; // Too close to walls
        }
      }
    }
    
    return true;
  }

  /**
   * Find the best camera position that covers the most uncovered cells
   */
  private findBestCameraPosition(grid: boolean[][], uncoveredCells: CameraPosition[]): CameraPosition | null {
    let bestPosition: CameraPosition | null = null;
    let maxCoverage = 0;

    const freeCells = this.getFreeCells(grid);
    console.log(`Evaluating ${freeCells.length} potential camera positions`);

    // If we have uncovered cells, prioritize positions that can cover them
    if (uncoveredCells.length > 0) {
      // Try to find cameras near uncovered areas
      const strategicPositions = this.getStrategicPositions(grid, uncoveredCells);
      const candidatePositions = strategicPositions.length > 0 ? strategicPositions : this.getValidCameraPositions(grid);
      
      // Sample positions to speed up computation if there are too many
      const sampleStep = Math.max(1, Math.floor(candidatePositions.length / 300));
      const sampledCells = candidatePositions.filter((_, index) => index % sampleStep === 0);
      
      console.log(`Sampling ${sampledCells.length} positions for evaluation`);

      for (const candidate of sampledCells) {
        const coveredCells = this.getCoveredCells(grid, candidate);
        const relevantCoverage = coveredCells.filter(cell => 
          uncoveredCells.some(uncovered => uncovered.x === cell.x && uncovered.y === cell.y)
        ).length;

        // Also consider total coverage to break ties
        const totalCoverage = coveredCells.length;

        if (relevantCoverage > maxCoverage || 
            (relevantCoverage === maxCoverage && totalCoverage > (bestPosition ? this.getCoveredCells(grid, bestPosition).length : 0))) {
          maxCoverage = relevantCoverage;
          bestPosition = candidate;
        }
      }
    }

    console.log(`Best position covers ${maxCoverage} uncovered cells`);
    return bestPosition;
  }

  /**
   * Get strategic camera positions near uncovered areas
   */
  private getStrategicPositions(grid: boolean[][], uncoveredCells: CameraPosition[]): CameraPosition[] {
    const strategicPositions: CameraPosition[] = [];
    const validCameraPositions = this.getValidCameraPositions(grid);
    
    // For each uncovered cell, find nearby valid camera positions
    for (const uncovered of uncoveredCells) {
      for (const candidate of validCameraPositions) {
        const distance = Math.sqrt((candidate.x - uncovered.x) ** 2 + (candidate.y - uncovered.y) ** 2);
        
        // If the candidate is within camera range of the uncovered cell
        if (distance <= this.camR) {
          // Check if this position is not already in our strategic positions
          if (!strategicPositions.some(pos => pos.x === candidate.x && pos.y === candidate.y)) {
            strategicPositions.push(candidate);
          }
        }
      }
    }
    
    console.log(`Strategic positions found: ${strategicPositions.length}`);
    return strategicPositions;
  }

  /**
   * Get all cells covered by a camera at the given position
   */
  private getCoveredCells(grid: boolean[][], cameraPos: CameraPosition): CameraPosition[] {
    const coveredCells: CameraPosition[] = [];
    
    // Check all cells within camera range
    for (let y = Math.max(0, cameraPos.y - this.camR); 
         y <= Math.min(grid.length - 1, cameraPos.y + this.camR); 
         y++) {
      for (let x = Math.max(0, cameraPos.x - this.camR); 
           x <= Math.min(grid[0].length - 1, cameraPos.x + this.camR); 
           x++) {
        
        // Check if within circular range
        const distance = Math.sqrt((x - cameraPos.x) ** 2 + (y - cameraPos.y) ** 2);
        if (distance <= this.camR) {
          // Check line of sight using ray casting
          if (this.hasLineOfSight(grid, cameraPos, { x, y })) {
            coveredCells.push({ x, y });
          }
        }
      }
    }
    
    return coveredCells;
  }

  /**
   * Check if there's a clear line of sight between two points using ray casting
   */
  private hasLineOfSight(grid: boolean[][], from: CameraPosition, to: CameraPosition): boolean {
    // If it's the same position, always has line of sight
    if (from.x === to.x && from.y === to.y) {
      return true;
    }

    // Use Bresenham's line algorithm for ray casting
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const sx = from.x < to.x ? 1 : -1;
    const sy = from.y < to.y ? 1 : -1;
    let err = dx - dy;
    
    let x = from.x;
    let y = from.y;
    
    while (x !== to.x || y !== to.y) {
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
      
      // Check if current cell is a wall (but don't check the destination)
      if ((x !== to.x || y !== to.y) && 
          y >= 0 && y < grid.length && 
          x >= 0 && x < grid[0].length && 
          grid[y][x]) {
        return false; // Line of sight blocked
      }
    }
    
    return true; // Clear line of sight
  }

  /**
   * Ensure connectivity constraint: each camera should have another camera within camR/2 distance
   */
  private ensureConnectivity(grid: boolean[][], cameras: CameraPosition[]): CameraPosition[] {
    if (cameras.length <= 1) return cameras;

    // Build connectivity graph
    const connected = new Set<number>();
    const toProcess = [0]; // Start with first camera
    connected.add(0);

    while (toProcess.length > 0) {
      const currentIndex = toProcess.shift()!;
      const current = cameras[currentIndex];

      for (let i = 0; i < cameras.length; i++) {
        if (connected.has(i)) continue;

        const other = cameras[i];
        const distance = Math.sqrt((current.x - other.x) ** 2 + (current.y - other.y) ** 2);
        
        if (distance <= this.camR / 2 && this.hasLineOfSight(grid, current, other)) {
          connected.add(i);
          toProcess.push(i);
        }
      }
    }

    // If not all cameras are connected, try to add intermediate cameras
    if (connected.size < cameras.length) {
      // For now, return only connected cameras
      // In a more sophisticated implementation, we could add intermediate cameras
      return cameras.filter((_, index) => connected.has(index));
    }

    return cameras;
  }

  /**
   * Check if all free cells are covered by the camera positions
   */
  isFullyCovered(grid: boolean[][], cameras: CameraPosition[]): boolean {
    const freeCells = this.getFreeCells(grid);
    const allCoveredCells = new Set<string>();

    cameras.forEach(camera => {
      const covered = this.getCoveredCells(grid, camera);
      covered.forEach(cell => {
        allCoveredCells.add(`${cell.x},${cell.y}`);
      });
    });

    return freeCells.every(cell => allCoveredCells.has(`${cell.x},${cell.y}`));
  }
}
