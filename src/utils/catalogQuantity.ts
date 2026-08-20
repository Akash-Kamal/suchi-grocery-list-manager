/**
 * Centralized smart default quantities and increment/decrement steps for grocery units.
 */

export const UNIT_CONFIG: Record<string, { defaultQty: number; step: number }> = {
  kg: { defaultQty: 1, step: 1 },
  g: { defaultQty: 500, step: 100 },
  l: { defaultQty: 1, step: 1 },
  ml: { defaultQty: 500, step: 100 },
  pack: { defaultQty: 1, step: 1 },
  pcs: { defaultQty: 1, step: 1 },
  bottle: { defaultQty: 1, step: 1 },
  dozen: { defaultQty: 1, step: 1 },
};

/**
 * Normalizes unit string for internal rule resolution (case-insensitive, trimmed).
 */
export function normalizeUnit(unit?: string): string {
  return (unit || '').trim().toLowerCase();
}

/**
 * Returns the recommended initial default quantity for a unit.
 * - g / ml -> 500
 * - kg, L, pack, pcs, bottle, dozen, unknown -> 1
 */
export function getDefaultQuantity(unit?: string): number {
  const normalized = normalizeUnit(unit);
  return UNIT_CONFIG[normalized]?.defaultQty ?? 1;
}

/**
 * Returns the smart quantity step for a unit.
 * - g / ml -> 100
 * - all other standard/unknown units -> 1
 */
export function getQuantityStep(unit?: string): number {
  const normalized = normalizeUnit(unit);
  return UNIT_CONFIG[normalized]?.step ?? 1;
}

/**
 * Increments a quantity by the appropriate unit step.
 */
export function incrementQuantity(currentQty: number, unit?: string): number {
  const step = getQuantityStep(unit);
  return Math.max(0, currentQty + step);
}

/**
 * Decrements a quantity by the appropriate unit step.
 * Returns 0 if decrement reaches zero or negative.
 */
export function decrementQuantity(currentQty: number, unit?: string): number {
  const step = getQuantityStep(unit);
  return Math.max(0, currentQty - step);
}
