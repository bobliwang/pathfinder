import pygame
from typing import Optional, Callable


class Button:
  """A simple button widget for pygame."""
  
  def __init__(self, x: int, y: int, width: int, height: int, text: str, 
               font_size: int = 16, callback: Optional[Callable[[], None]] = None):
    self.rect = pygame.Rect(x, y, width, height)
    self.text = text
    self.callback = callback
    self.is_pressed = False
    self.is_active = False
    
    # Colors
    self.normal_color = (200, 200, 200)
    self.hover_color = (220, 220, 220)
    self.pressed_color = (180, 180, 180)
    self.active_color = (100, 150, 255)
    self.text_color = (0, 0, 0)
    self.border_color = (100, 100, 100)
    
    # Font
    pygame.font.init()
    self.font = pygame.font.Font(None, font_size)
    
  def handle_event(self, event: pygame.event.Event) -> bool:
    """Handle mouse events for the button. Returns True if button was clicked."""
    if event.type == pygame.MOUSEBUTTONDOWN:
      if self.rect.collidepoint(event.pos):
        self.is_pressed = True
        return False
    elif event.type == pygame.MOUSEBUTTONUP:
      if self.is_pressed and self.rect.collidepoint(event.pos):
        self.is_pressed = False
        if self.callback:
          self.callback()
        return True
      self.is_pressed = False
    return False
    
  def set_active(self, active: bool) -> None:
    """Set whether this button is currently active/selected."""
    self.is_active = active
    
  def draw(self, screen: pygame.Surface) -> None:
    """Draw the button on the screen."""
    # Determine button color
    if self.is_active:
      color = self.active_color
    elif self.is_pressed:
      color = self.pressed_color
    else:
      mouse_pos = pygame.mouse.get_pos()
      if self.rect.collidepoint(mouse_pos):
        color = self.hover_color
      else:
        color = self.normal_color
    
    # Draw button background
    pygame.draw.rect(screen, color, self.rect)
    pygame.draw.rect(screen, self.border_color, self.rect, 2)
    
    # Draw button text
    text_surface = self.font.render(self.text, True, self.text_color)
    text_rect = text_surface.get_rect(center=self.rect.center)
    screen.blit(text_surface, text_rect)


class ToggleButton:
  """A toggle button (checkbox style) widget for pygame."""
  
  def __init__(self, x: int, y: int, width: int, height: int, text: str,
               initial_state: bool = True, font_size: int = 14, 
               callback: Optional[Callable[[bool], None]] = None):
    self.rect = pygame.Rect(x, y, width, height)
    self.text = text
    self.callback = callback
    self.is_pressed = False
    self.is_toggled = initial_state
    
    # Colors
    self.normal_color = (240, 240, 240)
    self.hover_color = (250, 250, 250)
    self.pressed_color = (220, 220, 220)
    self.toggled_color = (100, 200, 100)
    self.text_color = (0, 0, 0)
    self.border_color = (100, 100, 100)
    
    # Font
    pygame.font.init()
    self.font = pygame.font.Font(None, font_size)
    
  def handle_event(self, event: pygame.event.Event) -> bool:
    """Handle mouse events for the toggle button. Returns True if state changed."""
    if event.type == pygame.MOUSEBUTTONDOWN:
      if self.rect.collidepoint(event.pos):
        self.is_pressed = True
        return False
    elif event.type == pygame.MOUSEBUTTONUP:
      if self.is_pressed and self.rect.collidepoint(event.pos):
        self.is_pressed = False
        self.is_toggled = not self.is_toggled
        if self.callback:
          self.callback(self.is_toggled)
        return True
      self.is_pressed = False
    return False
    
  def set_state(self, state: bool) -> None:
    """Set the toggle state."""
    self.is_toggled = state
    
  def get_state(self) -> bool:
    """Get the current toggle state."""
    return self.is_toggled
    
  def draw(self, screen: pygame.Surface) -> None:
    """Draw the toggle button on the screen."""
    # Determine button color
    if self.is_toggled:
      color = self.toggled_color
    elif self.is_pressed:
      color = self.pressed_color
    else:
      mouse_pos = pygame.mouse.get_pos()
      if self.rect.collidepoint(mouse_pos):
        color = self.hover_color
      else:
        color = self.normal_color
    
    # Draw toggle background
    pygame.draw.rect(screen, color, self.rect)
    pygame.draw.rect(screen, self.border_color, self.rect, 2)
    
    # Draw checkmark if toggled
    if self.is_toggled:
      # Draw a simple checkmark
      center_x = self.rect.centerx
      center_y = self.rect.centery
      check_size = min(self.rect.width, self.rect.height) // 4
      
      # Checkmark lines
      pygame.draw.line(screen, (255, 255, 255), 
                      (center_x - check_size, center_y), 
                      (center_x - check_size//2, center_y + check_size//2), 3)
      pygame.draw.line(screen, (255, 255, 255), 
                      (center_x - check_size//2, center_y + check_size//2), 
                      (center_x + check_size, center_y - check_size//2), 3)
    
    # Draw label text to the right of the toggle
    text_surface = self.font.render(self.text, True, self.text_color)
    text_x = self.rect.right + 8
    text_y = self.rect.centery - text_surface.get_height() // 2
    screen.blit(text_surface, (text_x, text_y))