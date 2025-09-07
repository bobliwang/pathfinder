import pygame
import numpy as np
from typing import Optional


def load_map(path: str) -> np.ndarray:
  """Load a map from an image file.
  
  Args:
    path: Path to the image file
    
  Returns:
    2D numpy boolean array where True indicates obstacles/walls
  """
  WALL_THRESH = 128
  
  surf = pygame.image.load(path).convert()
  arr = pygame.surfarray.pixels3d(surf)
  gray = (0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]).T.astype(np.uint8)
  
  # Use a threshold to determine walls - pixels darker than WALL_THRESH become walls
  occ = (gray < WALL_THRESH)
  return occ.copy()


def draw_grid(screen: pygame.Surface,
              occ: np.ndarray, waypoints: list[tuple[int, int]], 
              path: Optional[list[tuple[int, int]]], 
              drone: Optional[tuple[float, float]] = None,
              zoom: int = 4, 
              return_start_index: int = -1, margin: int = 20,
              path_draw_index: int = -1) -> None:
  """Draw the grid, path, and markers on the screen.
  
  Args:
    screen: Pygame surface to draw on
    occ: 2D numpy boolean array for occupancy grid
    waypoints: List of (y, x) waypoints to visit in order
    path: List of (y, x) tuples for path, or None
    drone: (y, x) tuple for current drone position during animation, or None
    zoom: Pixel size of each grid cell
    return_start_index: Index where return path segment begins (-1 if no return path)
    margin: Pixel margin from window edges
    path_draw_index: How much of the path to draw (for animation), -1 means draw all
  """
  H, W = occ.shape
  
  # Draw grid cells
  for y in range(H):
    for x in range(W):
      color_value = 0 if occ[y, x] else 255  # black for walls, white for free space
      cell_color = (color_value, color_value, color_value)
      cell_rect = (margin + x * zoom, margin + y * zoom, zoom, zoom)
      pygame.draw.rect(screen, cell_color, cell_rect)
      
  # Draw path with different colors for main path and return path
  if path and len(path) > 1:
    main_path_color = (50, 150, 255)  # blue for main path
    return_path_color = (255, 150, 50)  # orange for return path
    line_width = max(1, zoom // 3)
    
    # Determine how much of the path to draw
    draw_up_to = len(path) - 1 if path_draw_index == -1 else min(path_draw_index, len(path) - 1)
    
    for i in range(draw_up_to):
      if i + 1 < len(path):  # Make sure we have a next point
        (y0, x0), (y1, x1) = path[i], path[i + 1]
        start_pos = (margin + x0 * zoom + zoom // 2, margin + y0 * zoom + zoom // 2)
        end_pos = (margin + x1 * zoom + zoom // 2, margin + y1 * zoom + zoom // 2)
        
        # Choose color based on whether this segment is part of the return path
        if return_start_index >= 0 and i >= return_start_index:
          path_color = return_path_color
        else:
          path_color = main_path_color
        
        pygame.draw.line(screen, path_color, start_pos, end_pos, line_width)
        
  # Draw waypoints with numbers
  if waypoints:
    pygame.font.init()
    font = pygame.font.Font(None, max(16, zoom * 3))
    
    for i, waypoint in enumerate(waypoints):
      y, x = waypoint
      center_pos = (margin + x * zoom + zoom // 2, margin + y * zoom + zoom // 2)
      radius = zoom * 2
      
      # Choose color based on position: first is green, last is red, others are blue
      if i == 0:
        color = (0, 200, 0)  # Green for start
      elif i == len(waypoints) - 1:
        color = (220, 40, 40)  # Red for end
      else:
        color = (50, 150, 255)  # Blue for intermediate waypoints
      
      # Draw circle
      pygame.draw.circle(screen, color, center_pos, radius)
      
      # Draw number on the waypoint
      number_text = str(i + 1)
      text_surface = font.render(number_text, True, (255, 255, 255))  # White text
      text_rect = text_surface.get_rect(center=center_pos)
      screen.blit(text_surface, text_rect)
      
  # Draw animated drone (orange circle)
  if drone: 
    drone_color = (255, 180, 0)
    drone_pos = (margin + int(drone[1] * zoom + zoom // 2), margin + int(drone[0] * zoom + zoom // 2))
    drone_radius = zoom * 2
    pygame.draw.circle(screen, drone_color, drone_pos, drone_radius)