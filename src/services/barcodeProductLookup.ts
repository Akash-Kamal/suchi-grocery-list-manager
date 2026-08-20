import { normalizeBarcode } from '../utils/barcodeLookup';
import { mapOnlineCategoryToSoochiCategoryId, getCategoryNameById } from '../utils/catalogCategoryMapping';
import { getDefaultQuantity, normalizeUnit } from '../utils/catalogQuantity';

export interface OnlineBarcodeProduct {
  barcode: string;
  productName: string;
  brand: string | null;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  quantity: number;
  unit: string;
  rawQuantityText: string | null;
  source: string;
}

/**
 * Parses raw product quantity string into numerical quantity and normalized unit.
 * Examples: "500 g" -> { quantity: 500, unit: "g" }, "1.5 L" -> { quantity: 1.5, unit: "L" }, "10 pcs" -> { quantity: 10, unit: "pcs" }
 */
export function parseQuantityAndUnit(quantityStr?: string | null): {
  quantity: number;
  unit: string;
  rawQuantityText: string | null;
} {
  if (!quantityStr || typeof quantityStr !== 'string') {
    return { quantity: 1, unit: 'pack', rawQuantityText: null };
  }

  const clean = quantityStr.trim();
  if (!clean) {
    return { quantity: 1, unit: 'pack', rawQuantityText: null };
  }

  // Regex matching number (e.g. 500, 1.5, 0.75) and unit string (e.g. g, kg, l, ml, pack, pcs, oz, fl oz)
  const match = clean.match(/^([\d.,]+)\s*([a-zA-Z\s]+)$/i);
  if (match) {
    const numStr = match[1].replace(',', '.');
    const parsedNum = parseFloat(numStr);
    const rawUnit = match[2].trim().toLowerCase();

    let recognizedUnit = 'pack';
    if (rawUnit === 'g' || rawUnit === 'gm' || rawUnit === 'grams' || rawUnit === 'gram') {
      recognizedUnit = 'g';
    } else if (rawUnit === 'kg' || rawUnit === 'kgs' || rawUnit === 'kilo' || rawUnit === 'kilogram') {
      recognizedUnit = 'kg';
    } else if (rawUnit === 'l' || rawUnit === 'ltr' || rawUnit === 'liter' || rawUnit === 'liters' || rawUnit === 'litre') {
      recognizedUnit = 'L';
    } else if (rawUnit === 'ml' || rawUnit === 'milliliter' || rawUnit === 'millilitre') {
      recognizedUnit = 'ml';
    } else if (rawUnit === 'pcs' || rawUnit === 'pc' || rawUnit === 'pieces' || rawUnit === 'piece') {
      recognizedUnit = 'pcs';
    } else if (rawUnit === 'bottle' || rawUnit === 'bottles') {
      recognizedUnit = 'bottle';
    } else if (rawUnit === 'dozen' || rawUnit === 'dozens') {
      recognizedUnit = 'dozen';
    } else if (rawUnit === 'pack' || rawUnit === 'packs' || rawUnit === 'packet' || rawUnit === 'packets' || rawUnit === 'box') {
      recognizedUnit = 'pack';
    }

    if (Number.isFinite(parsedNum) && parsedNum > 0) {
      return {
        quantity: parsedNum,
        unit: recognizedUnit,
        rawQuantityText: clean,
      };
    }
  }

  return { quantity: 1, unit: 'pack', rawQuantityText: clean };
}

/**
 * Cleanly extracts and normalizes product name from Open Food Facts product structure.
 */
export function extractProductName(product: Record<string, unknown>): string | null {
  if (!product || typeof product !== 'object') return null;

  const candidates = [
    product.product_name,
    product.product_name_en,
    product.product_name_hi,
    product.generic_name,
    product.generic_name_en,
    product.product_name_fr,
  ];

  for (const name of candidates) {
    if (typeof name === 'string' && name.trim().length > 0) {
      return name.trim();
    }
  }

  return null;
}

/**
 * Cleanly extracts brand name from Open Food Facts product structure.
 */
export function extractBrand(product: Record<string, unknown>): string | null {
  if (!product || typeof product !== 'object') return null;

  if (typeof product.brands === 'string' && product.brands.trim().length > 0) {
    // Some responses contain comma-separated brands like "Nestlé, Maggi"
    return product.brands.trim();
  }

  if (typeof product.brand_owner === 'string' && product.brand_owner.trim().length > 0) {
    return product.brand_owner.trim();
  }

  return null;
}

/**
 * Queries Open Food Facts public API v2 to look up a product by barcode.
 * - 100% Free / Open / Zero Cost
 * - No API key or secret required
 * - Strict timeout (default 6s)
 * - Safe response normalization
 * - Returns null on miss/error (never throws)
 */
export async function lookupOnlineProductByBarcode(
  barcode: string | null | undefined,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<OnlineBarcodeProduct | null> {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) {
    return null;
  }

  // If browser is explicitly offline, fail fast without waiting for network timeout
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? 6000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalized)}.json`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SoochiGroceryApp/1.0 (https://github.com/Akash-Kamal/suchi-grocery-list-manager)',
      },
      signal: options?.signal || controller.signal,
    });

    if (!response.ok) {
      // 404, 429, 500, etc.
      return null;
    }

    const data = await response.json();
    if (!data || data.status !== 1 || !data.product) {
      return null;
    }

    const product = data.product as Record<string, unknown>;
    const productName = extractProductName(product);
    if (!productName) {
      return null;
    }

    const brand = extractBrand(product);
    const categoryId = mapOnlineCategoryToSoochiCategoryId(
      Array.isArray(product.categories_tags) ? (product.categories_tags as string[]) : null,
      typeof product.categories === 'string' ? product.categories : null,
      productName
    );
    const categoryName = getCategoryNameById(categoryId);

    const rawQuantity =
      typeof product.quantity === 'string'
        ? product.quantity
        : typeof product.product_quantity_unit === 'string'
        ? `${product.product_quantity ?? ''} ${product.product_quantity_unit}`
        : null;

    const { quantity, unit, rawQuantityText } = parseQuantityAndUnit(rawQuantity);

    // Image URL with https safety check
    let imageUrl: string | null = null;
    if (typeof product.image_url === 'string' && product.image_url.startsWith('http')) {
      imageUrl = product.image_url;
    } else if (typeof product.image_front_url === 'string' && product.image_front_url.startsWith('http')) {
      imageUrl = product.image_front_url;
    } else if (typeof product.image_small_url === 'string' && product.image_small_url.startsWith('http')) {
      imageUrl = product.image_small_url;
    }

    // Default quantity fallback if quantity was 1
    const finalQuantity = quantity > 0 ? quantity : getDefaultQuantity(unit);

    return {
      barcode: normalized,
      productName,
      brand,
      categoryId,
      categoryName,
      imageUrl,
      quantity: finalQuantity,
      unit: normalizeUnit(unit) || 'pack',
      rawQuantityText,
      source: 'Open Food Facts',
    };
  } catch {
    // Network failure, abort, timeout, JSON parse error — return null safely
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
