# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a pathfinding algorithm demonstration project using Python and Pygame. The application allows users to:
- Design 2D floor plans by drawing on a grid map (black = walls, white = open space)
- Set source and target points
- Visualize pathfinding algorithms navigating from source to target while avoiding walls

## Tech Stack

- **Python**: Core programming language
- **Pygame**: GUI framework for grid drawing and visualization
- **NumPy**: Array operations and grid manipulation

## Code styles
- use 2 spaces indents
- prefer smaller functions
- add type info to functions/methods args and return type
- prefer to use list, dict, tuple (lower case) types.

## Development Commands

Since this is a Python project, typical development commands will include:

```bash
# Install dependencies (once requirements.txt is created)
pip install -r requirements.txt

# Run the main application (once main.py is created)
python main.py

# Run tests (once test files are created)
python -m pytest tests/

# Format code (if using formatters)
black .
isort .

# Lint code (if using linters)
flake8 .
pylint *.py
```

## Project Structure

The project will likely be structured as:

```
path-finder/
├──src
    ├── main.py              # Entry point for the application
    ├── pathfinding/         # Core pathfinding algorithms
    │   ├── __init__.py
    │   ├── astar.py        # A* algorithm implementation
    │   ├── dijkstra.py     # Dijkstra's algorithm
    │   └── bfs.py          # Breadth-first search
    ├── gui/                # Pygame GUI components
    │   ├── __init__.py
    │   ├── grid.py         # Grid drawing and interaction
    │   ├── controls.py     # UI controls and buttons
    │   └── visualization.py # Path visualization
    ├── utils/              # Utility functions
    │   ├── __init__.py
    │   └── grid_utils.py   # Grid manipulation utilities
    ├── tests/              # Unit tests
    ├── requirements.txt    # Python dependencies
    └── README.md          # Project documentation
```

## Key Architecture Concepts

- **Grid Representation**: The 2D world will be represented as a matrix where 0 = open space, 1 = wall
- **Pathfinding Interface**: Common interface for different pathfinding algorithms to allow easy swapping
- **Event-Driven GUI**: Pygame event system for handling mouse clicks, drawing, and real-time interaction
- **Visualization Layer**: Separate rendering logic for drawing the grid, path, and algorithm progress

## Development Notes

- Grid coordinates should follow standard (row, col) or (y, x) convention consistently
- Pathfinding algorithms should return a list of coordinates representing the path
- GUI should provide real-time feedback during pathfinding execution
- Consider making grid size and algorithm selection configurable