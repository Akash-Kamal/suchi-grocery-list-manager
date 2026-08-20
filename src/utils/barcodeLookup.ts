import type { CatalogItem } from '../types/database';

/**
 * Normalizes a scanned or manually entered barcode string:
 * - Trims leading and trailing whitespace
 * - Preserves leading zeros (e.g. "0891234567890" remains "0891234567890")
 * - Handles null / undefined / non-string gracefully
 * - String comparison only — never coerced to number
 */
export function normalizeBarcode(barcode?: string | null): string {
  if (!barcode || typeof barcode !== 'string') {
    return '';
  }
  return barcode.trim();
}

/**
 * Builds an in-memory lookup map from catalog items for O(1) instant local barcode resolution.
 * Indexes both item.barcode and item.id for maximum local resolution.
 */
export function buildBarcodeLookupMap(catalogItems?: CatalogItem[] | null): Map<string, CatalogItem> {
  const map = new Map<string, CatalogItem>();
  if (!catalogItems || catalogItems.length === 0) {
    return map;
  }

  for (const item of catalogItems) {
    if (!item) continue;

    if (item.barcode) {
      const normalized = normalizeBarcode(item.barcode);
      if (normalized) {
        map.set(normalized, item);
      }
    }

    // Also index item ID in case QR contains exact catalog ID
    if (item.id) {
      const normalizedId = normalizeBarcode(item.id);
      if (normalizedId) {
        map.set(normalizedId, item);
      }
    }
  }

  return map;
}

/**
 * Resolves a catalog item by its exact barcode or QR product code locally in O(1).
 * Uses exact matching only (never fuzzy).
 */
export function lookupCatalogItemByBarcode(
  barcode: string | null | undefined,
  catalogItems: CatalogItem[],
  prebuiltMap?: Map<string, CatalogItem>
): CatalogItem | null {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) {
    return null;
  }

  const lookupMap = prebuiltMap || buildBarcodeLookupMap(catalogItems);
  return lookupMap.get(normalized) || null;
}
