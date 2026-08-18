export interface Run {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  distanceKm: number;
  shoeId: string;
  isCompleted: boolean;
}   