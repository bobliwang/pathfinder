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

  deleteMap(id: string) {
    const maps = this.getSavedMaps();
    const filtered = maps.filter(m => m.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
  }
}
