import math
import heapq
from typing import Optional
import numpy as np


def astar(occ: np.ndarray, start: tuple[int, int], goal: tuple[int, int], diag: bool = True) -> Optional[list[tuple[int, int]]]:
  """A* pathfinding algorithm.
  
  Args:
    occ: 2D numpy array where True indicates obstacles
    start: (y, x) tuple for start position
    goal: (y, x) tuple for goal position  
    diag: bool, whether diagonal moves are allowed
    
  Returns:
    List of (y, x) tuples representing the path, or None if no path found
  """
  H, W = occ.shape
  if occ[start] or occ[goal]:
    return None
    
  if diag:
    moves = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1),
             (1, 1, math.sqrt(2)), (1, -1, math.sqrt(2)),
             (-1, 1, math.sqrt(2)), (-1, -1, math.sqrt(2))]
  else:
    moves = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1)]
    
  def heuristic(a: tuple[int, int], b: tuple[int, int]) -> float:
    """Heuristic function for A* (octile distance)."""
    (ay, ax), (by, bx) = a, b
    dy, dx = abs(ay - by), abs(ax - bx)
    if diag:
      D, D2 = 1, math.sqrt(2)
      return D * (dy + dx) + (D2 - 2 * D) * min(dy, dx)
    return dy + dx
    
  open_heap = []
  heapq.heappush(open_heap, (heuristic(start, goal), 0, start, None))
  best_cost = {start: 0}
  parent = {}
  
  while open_heap:
    f_cost, g_cost, node, par = heapq.heappop(open_heap)
    if node in parent: 
      continue
    parent[node] = par
    
    if node == goal:
      # Reconstruct path
      path = []
      current = node
      while current is not None:
        path.append(current)
        current = parent[current]
      path.reverse()
      return path
      
    y, x = node
    for dy, dx, cost in moves:
      ny, nx = y + dy, x + dx
      if not (0 <= ny < H and 0 <= nx < W): 
        continue
      if occ[ny, nx]: 
        continue
      
      new_g_cost = g_cost + cost
      neighbor = (ny, nx)
      if new_g_cost < best_cost.get(neighbor, float('inf')):
        best_cost[neighbor] = new_g_cost
        f_cost = new_g_cost + heuristic(neighbor, goal)
        heapq.heappush(open_heap, (f_cost, new_g_cost, neighbor, node))
        
  return None