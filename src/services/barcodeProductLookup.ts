import { normalizeBarcode } from '../utils/barcodeLookup';
import { mapOnlineCategoryToSoochiCategoryId, getCategoryNameById } from '../utils/catalogCategoryMapping';
import { getDefaultQuantity, normalizeUnit } from '../utils/catalogQuantity';

export interface ProductNutritionInfo {
  energyKcal?: string | number | null;
  fat?: string | number | null;
  carbs?: string | number | null;
  proteins?: string | number | null;
  sugar?: string | number | null;
  salt?: string | number | null;
  fiber?: string | number | null;
}

export interface OnlineBarcodeProduct {
  barcode: string;
  productName: string;
  brand: string | null;
  manufacturer?: string | null;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  quantity: number;
  unit: string;
  rawQuantityText: string | null;
  genericName?: string | null;
  description?: string | null;
  ingredients?: string | null;
  allergens?: string | null;
  countries?: string | null;
  nutrition?: ProductNutritionInfo | null;
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
    return product.brands.trim();
  }

  if (typeof product.brand_owner === 'string' && product.brand_owner.trim().length > 0) {
    return product.brand_owner.trim();
  }

  return null;
}

/**
 * Cleanly extracts manufacturer/company name from Open Food Facts product structure.
 */
export function extractManufacturer(product: Record<string, unknown>): string | null {
  if (!product || typeof product !== 'object') return null;

  if (typeof product.brand_owner === 'string' && product.brand_owner.trim().length > 0) {
    return product.brand_owner.trim();
  }

  if (typeof product.manufacturing_places === 'string' && product.manufacturing_places.trim().length > 0) {
    return product.manufacturing_places.trim();
  }

  return null;
}

/**
 * Cleanly extracts ingredients list from Open Food Facts product structure.
 */
export function extractIngredients(product: Record<string, unknown>): string | null {
  if (!product || typeof product !== 'object') return null;

  const candidates = [
    product.ingredients_text,
    product.ingredients_text_en,
    product.ingredients_text_hi,
    product.ingredients_text_with_allergens,
  ];

  for (const ing of candidates) {
    if (typeof ing === 'string' && ing.trim().length > 0) {
      return ing.trim();
    }
  }

  return null;
}

/**
 * Cleanly extracts allergens information from Open Food Facts product structure.
 */
export function extractAllergens(product: Record<string, unknown>): string | null {
  if (!product || typeof product !== 'object') return null;

  if (typeof product.allergens === 'string' && product.allergens.trim().length > 0) {
    return product.allergens.trim();
  }

  if (typeof product.allergens_from_ingredients === 'string' && product.allergens_from_ingredients.trim().length > 0) {
    return product.allergens_from_ingredients.trim();
  }

  if (Array.isArray(product.allergens_tags) && product.allergens_tags.length > 0) {
    return product.allergens_tags
      .map((tag: string) => String(tag).replace(/^en:/, '').replace(/-/g, ' ').trim())
      .filter(Boolean)
      .join(', ');
  }

  return null;
}

/**
 * Cleanly extracts countries/origins from Open Food Facts product structure.
 */
export function extractCountries(product: Record<string, unknown>): string | null {
  if (!product || typeof product !== 'object') return null;

  if (typeof product.countries === 'string' && product.countries.trim().length > 0) {
    return product.countries.trim();
  }

  if (typeof product.origins === 'string' && product.origins.trim().length > 0) {
    return product.origins.trim();
  }

  return null;
}

/**
 * Cleanly extracts nutrition information per 100g/serving from Open Food Facts.
 */
export function extractNutrition(product: Record<string, unknown>): ProductNutritionInfo | null {
  if (!product || typeof product !== 'object') return null;

  const nutriments = product.nutriments as Record<string, unknown> | undefined;
  if (!nutriments || typeof nutriments !== 'object') return null;

  const getNutriVal = (key: string): string | number | null => {
    const val = nutriments[`${key}_100g`] ?? nutriments[key] ?? nutriments[`${key}_serving`];
    if (typeof val === 'number') return Math.round(val * 10) / 10;
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    return null;
  };

  const energyKcal = getNutriVal('energy-kcal') ?? getNutriVal('energy');
  const fat = getNutriVal('fat');
  const carbs = getNutriVal('carbohydrates');
  const proteins = getNutriVal('proteins');
  const sugar = getNutriVal('sugars');
  const salt = getNutriVal('salt');
  const fiber = getNutriVal('fiber');

  if (
    energyKcal !== null ||
    fat !== null ||
    carbs !== null ||
    proteins !== null ||
    sugar !== null ||
    salt !== null ||
    fiber !== null
  ) {
    return {
      energyKcal,
      fat,
      carbs,
      proteins,
      sugar,
      salt,
      fiber,
    };
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
    const manufacturer = extractManufacturer(product);
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

    const genericName = typeof product.generic_name === 'string' && product.generic_name.trim().length > 0 ? product.generic_name.trim() : null;
    const description = typeof product.description === 'string' && product.description.trim().length > 0 ? product.description.trim() : genericName;
    const ingredients = extractIngredients(product);
    const allergens = extractAllergens(product);
    const countries = extractCountries(product);
    const nutrition = extractNutrition(product);

    // Default quantity fallback if quantity was 1
    const finalQuantity = quantity > 0 ? quantity : getDefaultQuantity(unit);

    return {
      barcode: normalized,
      productName,
      brand,
      manufacturer,
      categoryId,
      categoryName,
      imageUrl,
      quantity: finalQuantity,
      unit: normalizeUnit(unit) || 'pack',
      rawQuantityText,
      genericName,
      description,
      ingredients,
      allergens,
      countries,
      nutrition,
      source: 'Open Food Facts',
    };
  } catch {
    // Network failure, abort, timeout, JSON parse error — return null safely
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
