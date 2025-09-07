import itertools
import math
from typing import Optional, Tuple
import numpy as np
from .astar import astar
from ..utils.grid_utils import line_free


def create_straight_line_path(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
  """Create a straight line path between two points using Bresenham's line algorithm.
  
  Args:
    start: (y, x) starting point
    end: (y, x) ending point
    
  Returns:
    List of (y, x) points forming a straight line from start to end
  """
  y0, x0 = start
  y1, x1 = end
  
  points = []
  dx = abs(x1 - x0)
  dy = abs(y1 - y0)
  
  # Determine direction
  sx = 1 if x0 < x1 else -1
  sy = 1 if y0 < y1 else -1
  
  err = dx - dy
  x, y = x0, y0
  
  while True:
    points.append((y, x))
    
    if x == x1 and y == y1:
      break
      
    e2 = 2 * err
    if e2 > -dy:
      err -= dy
      x += sx
    if e2 < dx:
      err += dx
      y += sy
  
  return points


def find_optimal_path_between_points(occ: np.ndarray, start: tuple[int, int], end: tuple[int, int], 
                                   allow_diagonals: bool = True) -> Optional[list[tuple[int, int]]]:
  """Find path between two points, using straight line if possible, A* otherwise.
  
  Args:
    occ: 2D numpy array where True indicates obstacles
    start: (y, x) starting point
    end: (y, x) ending point
    allow_diagonals: Whether diagonal movement is allowed for A*
    
  Returns:
    Path between points, or None if impossible
  """
  # First check if we have direct line of sight
  if line_free(occ, start, end):
    print(f"  Line of sight available from {start} to {end} - using straight line")
    return create_straight_line_path(start, end)
  else:
    print(f"  No line of sight from {start} to {end} - using A* pathfinding")
    return astar(occ, start, end, allow_diagonals)


def calculate_distance_matrix(occ: np.ndarray, points: list[tuple[int, int]], 
                            allow_diagonals: bool = True) -> Optional[list[list[float]]]:
  """Calculate distance matrix between all pairs of points using A* pathfinding.
  
  Args:
    occ: 2D numpy array where True indicates obstacles
    points: List of (y, x) waypoint coordinates
    allow_diagonals: Whether diagonal movement is allowed
    
  Returns:
    Distance matrix where matrix[i][j] is the shortest path distance from point i to point j,
    or None if any path is impossible
  """
  n = len(points)
  distance_matrix = [[0.0 for _ in range(n)] for _ in range(n)]
  
  for i in range(n):
    for j in range(n):
      if i == j:
        distance_matrix[i][j] = 0.0
      else:
        # Find path from point i to point j using line of sight optimization
        path = find_optimal_path_between_points(occ, points[i], points[j], allow_diagonals)
        if path is None:
          return None  # No path possible
        
        # Calculate path length
        distance = 0.0
        for k in range(len(path) - 1):
          y1, x1 = path[k]
          y2, x2 = path[k + 1]
          distance += math.sqrt((y2 - y1)**2 + (x2 - x1)**2)
        
        distance_matrix[i][j] = distance
  
  return distance_matrix


def solve_tsp_brute_force(distance_matrix: list[list[float]]) -> tuple[list[int], float]:
  """Solve TSP starting and ending at first point using brute force.
  
  Args:
    distance_matrix: Matrix of distances between all pairs of points
    
  Returns:
    Tuple of (optimal_order, total_distance) where optimal_order starts and ends
    with point 0, visiting all other points in the optimal sequence
  """
  n = len(distance_matrix)
  if n <= 1:
    return list(range(n)), 0.0
  if n == 2:
    return [0, 1, 0], distance_matrix[0][1] + distance_matrix[1][0]
  
  # Fix first point as start, permute remaining points, then return to start
  best_distance = float('inf')
  best_order = None
  
  # Try all permutations of points 1 through n-1 (excluding the fixed start point 0)
  for perm in itertools.permutations(range(1, n)):
    order = [0] + list(perm) + [0]  # Start at 0, visit all others, return to 0
    
    # Calculate total distance for this circular path
    total_distance = 0.0
    for i in range(len(order) - 1):
      total_distance += distance_matrix[order[i]][order[i + 1]]
    
    if total_distance < best_distance:
      best_distance = total_distance
      best_order = order
  
  return best_order, best_distance


def solve_tsp_nearest_neighbor(distance_matrix: list[list[float]], 
                              start_idx: int = 0) -> tuple[list[int], float]:
  """Solve TSP using nearest neighbor heuristic, returning to start point.
  
  Args:
    distance_matrix: Matrix of distances between all pairs of points
    start_idx: Index of starting point (will also be ending point)
    
  Returns:
    Tuple of (order, total_distance) using nearest neighbor heuristic,
    where order starts and ends with start_idx
  """
  n = len(distance_matrix)
  if n <= 1:
    return list(range(n)), 0.0
  if n == 2:
    return [start_idx, 1-start_idx, start_idx], distance_matrix[start_idx][1-start_idx] + distance_matrix[1-start_idx][start_idx]
  
  unvisited = set(range(n))
  current = start_idx
  order = [current]
  unvisited.remove(current)
  total_distance = 0.0
  
  while unvisited:
    # Find nearest unvisited point
    nearest_dist = float('inf')
    nearest_point = None
    
    for point in unvisited:
      dist = distance_matrix[current][point]
      if dist < nearest_dist:
        nearest_dist = dist
        nearest_point = point
    
    # Move to nearest point
    order.append(nearest_point)
    total_distance += nearest_dist
    current = nearest_point
    unvisited.remove(nearest_point)
  
  # Add return path to start
  order.append(start_idx)
  total_distance += distance_matrix[current][start_idx]
  
  return order, total_distance


def find_optimal_path_through_waypoints(occ: np.ndarray, waypoints: list[tuple[int, int]], 
                                      allow_diagonals: bool = True, optimize_order: bool = True, 
                                      include_return: bool = True) -> Optional[Tuple[list[tuple[int, int]], int]]:
  """Find the shortest path that visits all waypoints.
  
  Args:
    occ: 2D numpy array where True indicates obstacles
    waypoints: List of (y, x) waypoint coordinates to visit
    allow_diagonals: Whether diagonal movement is allowed
    optimize_order: If True, find optimal order. If False, visit in given order.
    include_return: If True, add return path from last waypoint back to first
    
  Returns:
    Tuple of (complete_path, return_start_index) where:
    - complete_path: List of (y,x) points for the full path
    - return_start_index: Index in path where return segment begins (-1 if no return)
    Returns None if path is impossible
  """
  if len(waypoints) <= 1:
    return (waypoints, -1) if waypoints else None
  
  if optimize_order:
    # Calculate distance matrix
    distance_matrix = calculate_distance_matrix(occ, waypoints, allow_diagonals)
    if distance_matrix is None:
      return None  # Some waypoints are unreachable
    
    # Solve TSP problem (starting and ending at first point)
    if len(waypoints) <= 8:  # Use brute force for small sets
      optimal_order, total_dist = solve_tsp_brute_force(distance_matrix)
    else:  # Use heuristic for larger sets
      optimal_order, total_dist = solve_tsp_nearest_neighbor(distance_matrix)
    
    # Debug: Print the optimal order
    print(f"Waypoints: {waypoints}")
    print(f"Optimal TSP order indices: {optimal_order}")
    print(f"Total distance: {total_dist}")
    
    # Remove the duplicate ending point for path building (we'll handle return separately)
    if len(optimal_order) > 1 and optimal_order[-1] == optimal_order[0]:
      path_order = optimal_order[:-1]  # Remove the final return to start
    else:
      path_order = optimal_order
  else:
    # Use waypoints in the order they were added, then return to first if requested
    path_order = list(range(len(waypoints)))
    if include_return and len(waypoints) >= 2:
      optimal_order = path_order + [0]  # For return path calculation
    else:
      optimal_order = path_order
    print(f"Using waypoints in given order: {waypoints}")
  
  # Build complete path by connecting waypoints in optimal order
  complete_path = []
  
  for i in range(len(path_order) - 1):
    start_idx = path_order[i]
    end_idx = path_order[i + 1]
    start_point = waypoints[start_idx]
    end_point = waypoints[end_idx]
    
    print(f"Connecting waypoint {start_idx} {start_point} to waypoint {end_idx} {end_point}")
    
    # Find path between consecutive waypoints using line-of-sight optimization
    segment_path = find_optimal_path_between_points(occ, start_point, end_point, allow_diagonals)
    if segment_path is None:
      print(f"No path found between {start_point} and {end_point}")
      return None  # Path segment is impossible
    
    print(f"Segment path length: {len(segment_path)}")
    
    # Add segment to complete path (avoid duplicating waypoints)
    if i == 0:
      complete_path.extend(segment_path)
    else:
      complete_path.extend(segment_path[1:])  # Skip first point to avoid duplication
  
  print(f"Complete path length: {len(complete_path)}")
  
  # Verify that all waypoints are actually in the path
  waypoints_in_path = []
  for waypoint in waypoints:
    if waypoint in complete_path:
      waypoints_in_path.append(waypoint)
      print(f"✓ Waypoint {waypoint} found in path")
    else:
      print(f"✗ Waypoint {waypoint} NOT found in path")
  
  print(f"Total waypoints in path: {len(waypoints_in_path)}/{len(waypoints)}")
  
  return_start_index = -1
  
  # Add return path from last waypoint back to first waypoint
  if include_return and len(waypoints) >= 2:
    return_start_index = len(complete_path)  # Mark where return segment starts
    
    last_waypoint_idx = path_order[-1]
    first_waypoint_idx = path_order[0]
    last_point = waypoints[last_waypoint_idx]
    first_point = waypoints[first_waypoint_idx]
    
    print(f"Adding return path from waypoint {last_waypoint_idx} {last_point} to waypoint {first_waypoint_idx} {first_point}")
    print(f"Return segment will start at index: {return_start_index}")
    
    # Find return path using line-of-sight optimization
    return_path = find_optimal_path_between_points(occ, last_point, first_point, allow_diagonals)
    if return_path is None:
      print(f"Warning: No return path found from {last_point} to {first_point}")
      return_start_index = -1  # Reset if return path fails
    else:
      print(f"Return path length: {len(return_path)}")
      # Add return path, skipping the first point to avoid duplication
      complete_path.extend(return_path[1:])
      print(f"Complete path length with return: {len(complete_path)}")
  
  return (complete_path, return_start_index)