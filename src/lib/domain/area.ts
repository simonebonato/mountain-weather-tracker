export interface KeyPoint {
  label: string;
  latitude: number;
  longitude: number;
  elevationM: number;
}

export interface AreaDraft {
  name: string;
  keyPoints: KeyPoint[];
  sourceUrl?: string;
  sourceProvider?: string;
}

export interface StoredArea extends AreaDraft {
  id: number;
  createdAt: string;
}
