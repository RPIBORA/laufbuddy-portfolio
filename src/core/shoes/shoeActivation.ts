import { calculateShoeStatus } from './shoeStatus';
import type { Shoe } from './shoeTypes';

export const DEFAULT_REPLACEMENT_KM = 800;

export interface CreateShoeParams {
  id: string;
  displayName: string;
  createdAt: string;
  brand?: string | null;
  model?: string | null;
  shoeSize?: number | null;
  replacementKm?: number;
}

function normalizeDisplayName(displayName: string): string {
  const trimmed = displayName.trim();

  if (!trimmed) {
    throw new Error('Shoe displayName cannot be empty.');
  }

  return trimmed;
}

function deactivateAllShoes(shoes: Shoe[]): Shoe[] {
  return shoes.map((shoe) => ({
    ...shoe,
    isActive: false,
  }));
}

export function activateExistingShoe(shoes: Shoe[], shoeId: string): Shoe[] {
  const targetExists = shoes.some((shoe) => shoe.id === shoeId);

  if (!targetExists) {
    throw new Error('Target shoe was not found.');
  }

  return shoes.map((shoe) => ({
    ...shoe,
    isActive: shoe.id === shoeId,
  }));
}

export function createActiveShoe(params: CreateShoeParams): Shoe {
  const replacementKm = params.replacementKm ?? DEFAULT_REPLACEMENT_KM;
  const currentKm = 0;

  return {
    id: params.id,
    displayName: normalizeDisplayName(params.displayName),
    brand: params.brand ?? null,
    model: params.model ?? null,
    shoeSize: params.shoeSize ?? null,
    startDate: params.createdAt,
    startKm: 0,
    currentKm,
    replacementKm,
    status: calculateShoeStatus(currentKm, replacementKm),
    isActive: true,
  };
}

export function addNewActiveShoe(
  shoes: Shoe[],
  params: CreateShoeParams,
): Shoe[] {
  const duplicateIdExists = shoes.some((shoe) => shoe.id === params.id);

  if (duplicateIdExists) {
    throw new Error('Shoe id already exists.');
  }

  const nextShoes = deactivateAllShoes(shoes);
  const newActiveShoe = createActiveShoe(params);

  return [...nextShoes, newActiveShoe];
}