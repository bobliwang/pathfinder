import math
import numpy as np
import random


def disk_offsets(radius: float) -> list[tuple[int, int]]:
  """Generate offsets for a disk of given radius.
  
  Args:
    radius: Radius of the disk
    
  Returns:
    List of (dy, dx) offset tuples within the disk
  """
  max_offset = int(math.ceil(radius))
  offsets = []
  radius_squared = radius * radius
  
  for dy in range(-max_offset, max_offset + 1):
    for dx in range(-max_offset, max_offset + 1):
      if dx * dx + dy * dy <= radius_squared:
        offsets.append((dy, dx))
  
  return offsets


def inflate(occ: np.ndarray, base_radius: float, extra_radius: float = 0) -> np.ndarray:
  """Inflate obstacles in the occupancy grid by a given radius.
  
  Args:
    occ: 2D numpy boolean array where True indicates obstacles
    base_radius: Base radius for inflation
    extra_radius: Additional inflation amount
    
  Returns:
    2D numpy boolean array with inflated obstacles
  """
  H, W = occ.shape
  total_radius = base_radius + extra_radius
  offsets = disk_offsets(total_radius)
  inflated = occ.copy()
  
  obstacle_ys, obstacle_xs = np.where(occ)
  for y, x in zip(obstacle_ys, obstacle_xs):
    for dy, dx in offsets:
      ny, nx = y + dy, x + dx
      if is_valid_position(ny, nx, H, W):
        inflated[ny, nx] = True
  
  return inflated


def is_valid_position(y: int, x: int, height: int, width: int) -> bool:
  """Check if position is within grid bounds."""
  return 0 <= y < height and 0 <= x < width


def is_point_free(occ: np.ndarray, y: int, x: int) -> bool:
  """Check if a single point is free of obstacles."""
  if not is_valid_position(y, x, occ.shape[0], occ.shape[1]):
    return False
  return not occ[y, x]


def line_free(occ: np.ndarray, start_point: tuple[int, int], end_point: tuple[int, int], radius: float = 0) -> bool:
  """Check if a line segment between two points is free of obstacles.
  
  Args:
    occ: 2D numpy boolean array where True indicates obstacles
    start_point: (y, x) tuple for start point
    end_point: (y, x) tuple for end point
    radius: Safety radius around the line (unused in current implementation)
    
  Returns:
    bool: True if line is free, False if it intersects obstacles
  """
  (y0, x0), (y1, x1) = start_point, end_point
  dy, dx = y1 - y0, x1 - x0
  distance = math.hypot(dy, dx)
  
  if distance == 0: 
    return True
    
  num_steps = int(max(2, math.ceil(distance * 2)))
  
  for t in np.linspace(0, 1, num_steps):
    y = y0 * (1 - t) + y1 * t
    x = x0 * (1 - t) + x1 * t
    yi, xi = int(round(y)), int(round(x))
    
    if not is_point_free(occ, yi, xi):
      return False
  
  return True


def try_shortcut(occ: np.ndarray, points: list[tuple[int, int]], start_idx: int, end_idx: int, radius: float) -> list[tuple[int, int]]:
  """Try to create a shortcut between two points in a path."""
  if line_free(occ, points[start_idx], points[end_idx], radius):
    return points[:start_idx + 1] + points[end_idx:]
  return points


def shortcut(occ: np.ndarray, path: list[tuple[int, int]], radius: float = 0, max_iterations: int = 200) -> list[tuple[int, int]]:
  """Apply shortcut optimization to a path.
  
  Args:
    occ: 2D numpy boolean array where True indicates obstacles
    path: List of (y, x) tuples representing the path
    radius: Safety radius for line collision checking
    max_iterations: Number of shortcut attempts
    
  Returns:
    List of (y, x) tuples representing the optimized path
  """
  if not path or len(path) <= 2: 
    return path
    
  points = path[:]
  
  for _ in range(max_iterations):
    if len(points) <= 2: 
      break
      
    # Pick random start and end points with at least one point in between
    start_idx = random.randint(0, len(points) - 3)
    end_idx = random.randint(start_idx + 2, len(points) - 1)
    
    new_points = try_shortcut(occ, points, start_idx, end_idx, radius)
    if len(new_points) < len(points):
      points = new_points
      
  return points


def calculate_segment_points(start_point: np.ndarray, end_point: np.ndarray, step_size: float) -> tuple[list[np.ndarray], float]:
  """Calculate intermediate points along a path segment."""
  segment_vector = end_point - start_point
  segment_length = np.linalg.norm(segment_vector)
  
  if segment_length == 0:
    return [], segment_length
    
  direction_vector = segment_vector / segment_length
  intermediate_points = []
  
  distance = 0
  while distance + step_size <= segment_length + 1e-9:
    point = start_point + (distance + step_size) * direction_vector
    intermediate_points.append(point)
    distance += step_size
    
  return intermediate_points, segment_length - distance


def resample(path: list[tuple[int, int]], step_size: float = 0.5) -> list[tuple[float, float]]:
  """Resample a path with uniform spacing.
  
  Args:
    path: List of (y, x) tuples representing the path
    step_size: Desired spacing between points
    
  Returns:
    List of (y, x) tuples representing the resampled path
  """
  if not path or len(path) < 2: 
    return path
    
  # Convert to numpy arrays for easier math
  points = [np.array([float(y), float(x)]) for (y, x) in path]
  resampled_points = [points[0].copy()]
  accumulated_distance = 0
  
  for i in range(1, len(points)):
    intermediate_points, remaining_distance = calculate_segment_points(
      points[i - 1], points[i], step_size - accumulated_distance
    )
    
    resampled_points.extend(intermediate_points)
    accumulated_distance = remaining_distance
  
  # Always include the final point
  resampled_points.append(points[-1].copy())
  
  # Convert back to tuples
  return [(point[0], point[1]) for point in resampled_points]