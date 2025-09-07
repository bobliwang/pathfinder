# Path Finder - 2D Pathfinding Visualization
# Modes:
#   - python main.py room.png   # load image as map
#   - python main.py            # blank canvas, draw walls manually

import sys
from typing import Optional
from dataclasses import dataclass
import pygame
import numpy as np

from .pathfinding.astar import astar
from .pathfinding.tsp import find_optimal_path_through_waypoints
from .gui.grid import load_map, draw_grid
from .gui.controls import Button, ToggleButton
from .utils.grid_utils import inflate, shortcut, resample

ZOOM = 3
DRONE_RADIUS_PIX = 3
INFLATION_PIX = 0
DRONE_SAFETY_BUFFER = 1
ALLOW_DIAGONALS = True
ANIM_SPEED = 2.0
MARGIN = 20

DRAW_SIZE = 280  # canvas size (HxW) if no image
DRAW_RADIUS = 3  # brush size


def create_default_map() -> np.ndarray:
  """Create a default map with a vertical wall and door in the middle."""
  # Calculate map dimensions (70% of the window size would be used)
  map_width = int(DRAW_SIZE * 0.8)
  map_height = int(DRAW_SIZE * 0.8)
  
  # Create empty map (False = free space, True = wall)
  occ = np.zeros((map_height, map_width), dtype=bool)
  
  # Add rectangular border (walls around the edges)
  border_thickness = 10
  occ[:border_thickness, :] = True  # top border
  occ[-border_thickness:, :] = True  # bottom border
  occ[:, :border_thickness] = True  # left border
  occ[:, -border_thickness:] = True  # right border
  
  # Add vertical wall in the middle
  middle_x = map_width // 2
  wall_thickness = 6
  wall_start_x = middle_x - wall_thickness // 2
  wall_end_x = wall_start_x + wall_thickness
  
  # Create the wall from top to bottom
  occ[border_thickness:-border_thickness, wall_start_x:wall_end_x] = True
  
  # Create door in the middle of the wall
  door_height = max(6, map_height // 8)  # door is 1/8 of map height, minimum 6 pixels
  door_start_y = (map_height - door_height) // 2
  door_end_y = door_start_y + door_height
  
  # Cut out the door (make it free space)
  occ[door_start_y:door_end_y, wall_start_x:wall_end_x] = False
  
  return occ


@dataclass
class GameState:
  """Game state container with all necessary game variables."""
  waypoints: list[tuple[int, int]] = None  # List of waypoints to visit
  path: Optional[list[tuple[int, int]]] = None
  return_start_index: int = -1  # Index where return path segment begins
  anim: Optional[list[tuple[float, float]]] = None
  ai: int = 0
  animating: bool = False
  path_draw_index: int = 0  # How much of the path to draw (for step-by-step animation)
  path_animating: bool = False  # Whether we're animating the path drawing
  optimize_order: bool = True  # Whether to optimize waypoint order using TSP
  radius: float = DRONE_RADIUS_PIX
  extra: float = DRONE_SAFETY_BUFFER
  base_occ: Optional[np.ndarray] = None
  occ: Optional[np.ndarray] = None
  mode: str = "draw"  # "draw", "erase", "set_points", "find_path"
  left_mouse_down: bool = False
  right_mouse_down: bool = False
  running: bool = True
  prev_mouse_pos: Optional[tuple[int, int]] = None
  
  def __post_init__(self):
    if self.waypoints is None:
      self.waypoints = []


def initialize_game() -> tuple[pygame.Surface, pygame.time.Clock, GameState, int, int, list[Button], ToggleButton]:
  """Initialize pygame and create the game state."""
  pygame.init()
  
  # Load map or create default map
  if len(sys.argv) >= 2:
    occ = load_map(sys.argv[1])
  else:
    occ = create_default_map()
  
  H, W = occ.shape
  
  # Add space at the bottom for buttons and toggle
  BUTTON_AREA_HEIGHT = 80
  screen_width = W * ZOOM + 2 * MARGIN  # Add margins on left and right
  screen_height = H * ZOOM + 2 * MARGIN + BUTTON_AREA_HEIGHT  # Add margins on top and bottom
  screen = pygame.display.set_mode((screen_width, screen_height))
  pygame.display.set_caption("2D Planner / Editor")
  clock = pygame.time.Clock()
  
  # Create game state
  game_state = GameState(
    base_occ=occ.copy(),
    mode="draw"  # Start in draw mode
  )
  
  game_state.occ = inflate(game_state.base_occ, game_state.radius, game_state.extra)
  
  # Create buttons
  button_width = 90
  button_height = 30
  button_y = H * ZOOM + 2 * MARGIN + 15  # 15px margin from grid, accounting for top margin
  button_spacing = 10

  # Calculate button positions to center them (we now have 5 buttons: Draw, Eraser, Set Points, Find Path, Replay)
  total_button_width = 5 * button_width + 4 * button_spacing
  start_x = (screen_width - total_button_width) // 2
  
  def set_draw_mode():
    game_state.mode = "draw"
    
  def set_erase_mode():
    game_state.mode = "erase"
    
  def set_points_mode():
    game_state.mode = "set_points"
    
  def set_find_mode():
    game_state.mode = "find_path"
    if len(game_state.waypoints) >= 2:
      plan_path(game_state)
  
  def replay_animation():
    if game_state.path:
      start_path_animation(game_state)
  
  def toggle_optimize_order(state: bool):
    game_state.optimize_order = state
    print(f"Optimize order: {'ON' if state else 'OFF'}")
  
  buttons = [
    Button(start_x, button_y, button_width, button_height, "Draw Map", callback=set_draw_mode),
    Button(start_x + 1 * (button_width + button_spacing), button_y, button_width, button_height, "Eraser", callback=set_erase_mode),
    Button(start_x + 2 * (button_width + button_spacing), button_y, button_width, button_height, "Set Points", callback=set_points_mode),
    Button(start_x + 3 * (button_width + button_spacing), button_y, button_width, button_height, "Find Path", callback=set_find_mode),
    Button(start_x + 4 * (button_width + button_spacing), button_y, button_width, button_height, "Replay", callback=replay_animation)
  ]
  
  # Create toggle for optimize order
  toggle_size = 20
  toggle_x = start_x
  toggle_y = button_y + button_height + 10
  optimize_toggle = ToggleButton(toggle_x, toggle_y, toggle_size, toggle_size, 
                                "Optimize Waypoint Order", initial_state=True, 
                                callback=toggle_optimize_order)
  
  # Set initial active button
  buttons[0].set_active(True)
  
  return screen, clock, game_state, H, W, buttons, optimize_toggle


def draw_at_position(base_occ: np.ndarray, y: int, x: int, H: int, W: int, is_drawing: bool) -> None:
  """Draw or erase at the given position with brush radius."""
  for dy in range(-DRAW_RADIUS, DRAW_RADIUS + 1):
    for dx in range(-DRAW_RADIUS, DRAW_RADIUS + 1):
      ny, nx = y + dy, x + dx
      if 0 <= ny < H and 0 <= nx < W:
        base_occ[ny, nx] = is_drawing


def draw_line_between_positions(base_occ: np.ndarray, start: tuple[int, int], end: tuple[int, int], 
                              H: int, W: int, is_drawing: bool) -> None:
  """Draw a line between two positions using Bresenham's algorithm."""
  y0, x0 = start
  y1, x1 = end
  
  # Bresenham's line algorithm
  dx = abs(x1 - x0)
  dy = abs(y1 - y0)
  sx = 1 if x0 < x1 else -1
  sy = 1 if y0 < y1 else -1
  err = dx - dy
  x, y = x0, y0
  
  while True:
    draw_at_position(base_occ, y, x, H, W, is_drawing)
    
    if x == x1 and y == y1:
      break
      
    e2 = 2 * err
    if e2 > -dy:
      err -= dy
      x += sx
    if e2 < dx:
      err += dx
      y += sy


def handle_mouse_button_down(event: pygame.event.Event, game_state: GameState, H: int, W: int) -> None:
  """Handle mouse button down events."""
  y = (event.pos[1] - MARGIN) // ZOOM
  x = (event.pos[0] - MARGIN) // ZOOM
  
  # Only handle clicks within the grid area
  if y >= H or x >= W or y < 0 or x < 0:
    return
  
  if game_state.mode == "draw":
    if event.button == 1:  # draw wall
      game_state.left_mouse_down = True
      game_state.prev_mouse_pos = (y, x)
      draw_at_position(game_state.base_occ, y, x, H, W, True)
    elif event.button == 3:  # erase (right click)
      game_state.right_mouse_down = True
      game_state.prev_mouse_pos = (y, x)
      draw_at_position(game_state.base_occ, y, x, H, W, False)
    
    game_state.occ = inflate(game_state.base_occ, game_state.radius, game_state.extra)

  elif game_state.mode == "erase":
    # In erase mode, left click acts as erase for convenience
    if event.button == 1:
      game_state.left_mouse_down = True
      game_state.prev_mouse_pos = (y, x)
      draw_at_position(game_state.base_occ, y, x, H, W, False)
    elif event.button == 3:
      # Right click also erases while in erase mode
      game_state.right_mouse_down = True
      game_state.prev_mouse_pos = (y, x)
      draw_at_position(game_state.base_occ, y, x, H, W, False)
    
    game_state.occ = inflate(game_state.base_occ, game_state.radius, game_state.extra)
    
  elif game_state.mode == "set_points":
    if event.button == 1:  # left click to add waypoint
      if not game_state.occ[y, x]:  # only set on free spaces
        game_state.waypoints.append((y, x))
        # Clear existing path when adding new waypoints
        game_state.path = None
        game_state.anim = None
        game_state.ai = 0
        game_state.animating = False
        game_state.path_draw_index = 0
        game_state.path_animating = False
    elif event.button == 3:  # right click to remove last waypoint
      if game_state.waypoints:
        game_state.waypoints.pop()
        # Clear existing path when removing waypoints
        game_state.path = None
        game_state.anim = None
        game_state.ai = 0
        game_state.animating = False
        game_state.path_draw_index = 0
        game_state.path_animating = False


def handle_mouse_button_up(event: pygame.event.Event, game_state: GameState) -> None:
  """Handle mouse button up events."""
  if event.button == 1:
    game_state.left_mouse_down = False
    game_state.prev_mouse_pos = None
  elif event.button == 3:
    game_state.right_mouse_down = False
    game_state.prev_mouse_pos = None


def handle_mouse_motion(event: pygame.event.Event, game_state: GameState, H: int, W: int) -> None:
  """Handle mouse motion events for drag drawing."""
  if game_state.mode != "draw":
    return
    
  if game_state.left_mouse_down or game_state.right_mouse_down:
    y = (event.pos[1] - MARGIN) // ZOOM
    x = (event.pos[0] - MARGIN) // ZOOM
    
    # Only draw within the grid area
    if y >= H or x >= W or y < 0 or x < 0:
      return
    
    # Draw line from previous position to current position for smooth lines
    if game_state.prev_mouse_pos is not None:
      if game_state.left_mouse_down:  # draw wall while dragging
        draw_line_between_positions(game_state.base_occ, game_state.prev_mouse_pos, (y, x), H, W, True)
      elif game_state.right_mouse_down:  # erase while dragging
        draw_line_between_positions(game_state.base_occ, game_state.prev_mouse_pos, (y, x), H, W, False)
    else:
      # Fallback for first point
      if game_state.left_mouse_down:
        draw_at_position(game_state.base_occ, y, x, H, W, True)
      elif game_state.right_mouse_down:
        draw_at_position(game_state.base_occ, y, x, H, W, False)
    
    # Update previous position for next motion event
    game_state.prev_mouse_pos = (y, x)
    game_state.occ = inflate(game_state.base_occ, game_state.radius, game_state.extra)


def save_map(game_state: GameState, W: int, H: int) -> None:
  """Save the current map to a PNG file."""
  arr = np.zeros((W, H, 3), dtype=np.uint8)
  arr[:, :, 0] = arr[:, :, 1] = arr[:, :, 2] = 255
  ys, xs = np.where(game_state.base_occ)
  for yy, xx in zip(ys, xs):
    arr[xx, yy] = [0, 0, 0]
  pygame.image.save(pygame.surfarray.make_surface(arr.swapaxes(0, 1)), "map.png")
  print("Saved map.png")


def start_path_animation(game_state: GameState) -> None:
  """Start the path drawing animation."""
  if game_state.path:
    game_state.path_draw_index = 0
    game_state.path_animating = True
    game_state.animating = False  # Stop drone animation during path drawing


def plan_path(game_state: GameState) -> None:
  """Plan a path through all waypoints using TSP optimization."""
  if len(game_state.waypoints) < 2:
    return  # Need at least 2 waypoints
    
  print(f"Planning path for {len(game_state.waypoints)} waypoints")
  for i, wp in enumerate(game_state.waypoints):
    print(f"Waypoint {i}: {wp}")
    
  # Find path through all waypoints using the toggle setting
  path_result = find_optimal_path_through_waypoints(
    game_state.occ,
    game_state.waypoints,
    ALLOW_DIAGONALS,
    optimize_order=game_state.optimize_order,
    include_return=True
  )
  
  print(f"Path found: {path_result is not None}")
  if path_result:
    path, return_start_index = path_result
    print(f"Path length before shortcut: {len(path)}")
    print(f"Return segment starts at index: {return_start_index}")
    
    # Temporarily disable shortcut to see if it's causing the issue
    # path = shortcut(game_state.occ, path, game_state.radius + game_state.extra)
    # print(f"Path length after shortcut: {len(path)}")
  else:
    path = None
    return_start_index = -1
  
  if path:
    game_state.path = path
    game_state.return_start_index = return_start_index
    game_state.anim = resample(path, 0.6)
    game_state.ai = 0
    game_state.animating = False
    # Start path drawing animation automatically
    start_path_animation(game_state)
  else:
    game_state.return_start_index = -1
    print("Failed to find any path!")


def handle_keyboard(event: pygame.event.Event, game_state: GameState, W: int, H: int) -> None:
  """Handle keyboard events."""
  if game_state.mode == "draw" and event.key == pygame.K_s:
    save_map(game_state, W, H)
  elif game_state.mode == "find_path":
    if event.key == pygame.K_SPACE:
      plan_path(game_state)
    elif event.key == pygame.K_a and game_state.path:
      game_state.animating = True
      game_state.ai = 0


def update_path_animation(game_state: GameState) -> None:
  """Update the path drawing animation."""
  if game_state.path_animating and game_state.path:
    # Draw path step by step, advancing by 3-5 points per frame for smooth animation
    if game_state.path_draw_index < len(game_state.path):
      game_state.path_draw_index = min(game_state.path_draw_index + 3, len(game_state.path))
    else:
      # Path drawing complete, start drone animation
      game_state.path_animating = False
      game_state.animating = True
      game_state.ai = 0


def update_animation(game_state: GameState) -> Optional[tuple[float, float]]:
  """Update the animation state and return current drone position."""
  if not (game_state.animating and game_state.anim):
    return None
    
  if game_state.ai < len(game_state.anim) - 1:
    y0, x0 = game_state.anim[game_state.ai]
    y1, x1 = game_state.anim[min(game_state.ai + 1, len(game_state.anim) - 1)]
    v = np.array([y1 - y0, x1 - x0])
    L = np.linalg.norm(v)
    
    if L < 1e-6:
      game_state.ai += 1
      return (y1, x1)
    else:
      step = ANIM_SPEED / max(1e-6, L)
      if step >= 1:
        game_state.ai += 1
        return (y1, x1)
      else:
        return (y0 + v[0] * step, x0 + v[1] * step)
  else:
    game_state.animating = False
    return game_state.anim[-1]


def update_button_states(buttons: list[Button], game_state: GameState) -> None:
  """Update button active states based on current mode."""
  mode_to_button = {"draw": 0, "erase": 1, "set_points": 2, "find_path": 3}
  for i, button in enumerate(buttons):
    if i == 4:  # Replay button (last index) is not a persistent mode
      button.set_active(False)  # Replay button is never "active" as a mode
    else:
      button.set_active(i == mode_to_button.get(game_state.mode, 0))


def main() -> None:
  """Main game loop."""
  screen, clock, game_state, H, W, buttons, optimize_toggle = initialize_game()
  
  while game_state.running:
    # Handle events
    for event in pygame.event.get():
      if event.type == pygame.QUIT:
        game_state.running = False
      else:
        # Handle button and toggle events first
        ui_clicked = False
        for button in buttons:
          if button.handle_event(event):
            ui_clicked = True
            break
        
        # Handle toggle if no button was clicked
        if not ui_clicked:
          ui_clicked = optimize_toggle.handle_event(event)
        
        # Only handle other events if no UI element was clicked
        if not ui_clicked:
          if event.type == pygame.MOUSEBUTTONDOWN:
            handle_mouse_button_down(event, game_state, H, W)
          elif event.type == pygame.MOUSEBUTTONUP:
            handle_mouse_button_up(event, game_state)
          elif event.type == pygame.MOUSEMOTION:
            handle_mouse_motion(event, game_state, H, W)
          elif event.type == pygame.KEYDOWN:
            handle_keyboard(event, game_state, W, H)
    
    # Update button states
    update_button_states(buttons, game_state)
    
    # Update path drawing animation
    update_path_animation(game_state)
    
    # Update drone animation
    drone = update_animation(game_state)
    
    # Render
    screen.fill((255, 255, 255))
    
    # Draw the grid (use base_occ for display to show original wall thickness)
    draw_grid(screen, game_state.base_occ, game_state.waypoints, 
              game_state.path, drone, ZOOM, game_state.return_start_index, MARGIN, game_state.path_draw_index)
    
    # Draw buttons
    for button in buttons:
      button.draw(screen)
    
    # Draw toggle
    optimize_toggle.draw(screen)
    
    pygame.display.flip()
    clock.tick(80)
  
  pygame.quit()


if __name__ == "__main__":
  main()