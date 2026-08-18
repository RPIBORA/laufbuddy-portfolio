export type ShoeStatus = 'active' | 'replace_soon' | 'replace_now';

export interface Shoe {
  id: string;
  displayName: string;
  brand: string | null;
  model: string | null;
  shoeSize: number | null;
  startDate: string;
  startKm: number;
  currentKm: number;
  replacementKm: number;
  status: ShoeStatus;
  isActive: boolean;
}