import { Injectable } from '@angular/core';

export interface SavedMap {
  id: string;
  name: string;
  grid: boolean[][];
  createdAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class MapStorageService {
  private readonly STORAGE_KEY = 'path-finder-saved-maps';

  saveMap(name: string, grid: boolean[][]): SavedMap {
    const maps = this.getSavedMaps();
    const newMap: SavedMap = {
      id: crypto.randomUUID(),
      name: name || `Map ${maps.length + 1}`,
      grid: grid,
      createdAt: Date.now()
    };
    
    maps.push(newMap);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(maps));
    return newMap;
  }

  getSavedMaps(): SavedMap[] {
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  getMapById(id: string): SavedMap | null {
    const maps = this.getSavedMaps();
    return maps.find(m => m.id === id) || null;
  }

  updateMap(id: string, name: string, grid: boolean[][]): SavedMap | null {
    const maps = this.getSavedMaps();
    const index = maps.findIndex(m => m.id === id);
    if (index === -1) return null;

    maps[index] = {
      ...maps[index],
      name: name || maps[index].name,
      grid: grid
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(maps));
    return maps[index];
  }

  deleteMap(id: string) {
    const maps = this.getSavedMaps();
    const filtered = maps.filter(m => m.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
  }
}
