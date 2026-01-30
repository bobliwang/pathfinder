1. Add a new button "Auto Nav" to controls panel
2. By clicking this button:
   - if there is no point or more than 1 point set, alert 'Please ensure one and only one starting point'.
   - else, starting from this only point,
     - imagine we have a single beam lidar scanner that can scan 100 (parameterized) cells far. Although single beam, it rotates 360 degree by 10 degree interval (so, 36 scans to cover a circle, 360 deg). The scanner shoots a ray and the ray reflects when it hits a wall or other obstacles (cells in black).
     - we place this lidar scanner at this point, let it scan a circle, we store the scan results angle (deg)=>dist (cells) mappings like {[angleDeg: number]: number }:
     ```json
     {      
      0: 10, // dist is 10 at 0 degree
      10: 11,
      ...
      350: 9
     }
     ```
    - Then every 30 (parameterized) degrees as a bin, if max dist is greater than 12, let's drop a anchor point (aka waypoint, path point) at the bisector of the bin at dist = 8. 
    - When dropping a new anchor point, it should be at least 2 cells away from other walls, and at least 4 cells away from other existing anchor points, regardless visited or not. If not matching, we allow ajust it location in its directly connected 8 cells around it.
    - We shall keep track of the anchor points and their status (visited in green|not_visited in gray). Once no new anchor points detected, we shall move to previously detected un-visited anchor points to continue the process, following depth first searching (DFS) order.
    - Meanwhile, for each angle:dist pair in the scan result, we can calculate a local point (x, y) and add current scanners position (X_cam, Y_cam) to get world point (X_world, Y_world). We will only keep points whose local distance lower than or equal to 10 (parameterized) cells, and mark them green with opcity .8.
    - Keep moving the lidar scanner to next anchor point not visited, until all cells visited and no more new anchor points found, and not more non-visited anchor points pending.
    - Move the lidar scanner at speed of 10 cells/second (parameterized).
    
  