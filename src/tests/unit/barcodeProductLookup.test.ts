import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  lookupOnlineProductByBarcode,
  parseQuantityAndUnit,
  extractProductName,
  extractBrand,
  extractManufacturer,
  extractIngredients,
  extractAllergens,
  extractCountries,
  extractNutrition,
} from '../../services/barcodeProductLookup';
import {
  mapOnlineCategoryToSoochiCategoryId,
  getCategoryNameById,
} from '../../utils/catalogCategoryMapping';
import { catalogRepository } from '../../repositories/catalogRepository';
import { db } from '../../db';

describe('Online Barcode Product Lookup Service & Catalog Enrichment (STEP 14 & 15)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Quantity & Unit Extraction (parseQuantityAndUnit)', () => {
    it('parses standard grams with numbers and units', () => {
      const res = parseQuantityAndUnit('500 g');
      expect(res.quantity).toBe(500);
      expect(res.unit).toBe('g');
      expect(res.rawQuantityText).toBe('500 g');
    });

    it('parses kilograms without space e.g. 1kg', () => {
      const res = parseQuantityAndUnit('1kg');
      expect(res.quantity).toBe(1);
      expect(res.unit).toBe('kg');
    });

    it('parses liters with decimals e.g. 1.5 L', () => {
      const res = parseQuantityAndUnit('1.5 L');
      expect(res.quantity).toBe(1.5);
      expect(res.unit).toBe('L');
    });

    it('parses milliliters e.g. 750 ml', () => {
      const res = parseQuantityAndUnit('750 ml');
      expect(res.quantity).toBe(750);
      expect(res.unit).toBe('ml');
    });

    it('parses count units e.g. 10 pcs', () => {
      const res = parseQuantityAndUnit('10 pcs');
      expect(res.quantity).toBe(10);
      expect(res.unit).toBe('pcs');
    });

    it('handles null, empty, or unparseable strings gracefully with default 1 pack', () => {
      expect(parseQuantityAndUnit(null)).toEqual({ quantity: 1, unit: 'pack', rawQuantityText: null });
      expect(parseQuantityAndUnit('')).toEqual({ quantity: 1, unit: 'pack', rawQuantityText: null });
      expect(parseQuantityAndUnit('family size value pack')).toEqual({
        quantity: 1,
        unit: 'pack',
        rawQuantityText: 'family size value pack',
      });
    });
  });

  describe('Product Name & Brand Extraction', () => {
    it('extracts product name with proper fallback priority', () => {
      expect(extractProductName({ product_name: 'Maggi Noodles' })).toBe('Maggi Noodles');
      expect(extractProductName({ product_name_en: 'Tata Tea Gold' })).toBe('Tata Tea Gold');
      expect(extractProductName({ generic_name: 'Desi Ghee' })).toBe('Desi Ghee');
      expect(extractProductName({})).toBeNull();
      expect(extractProductName({ product_name: '   ' })).toBeNull();
    });

    it('extracts brand cleanly from brands or brand_owner', () => {
      expect(extractBrand({ brands: 'Nestlé' })).toBe('Nestlé');
      expect(extractBrand({ brand_owner: 'Amul India' })).toBe('Amul India');
      expect(extractBrand({})).toBeNull();
    });
  });

  describe('Rich Information Extraction (STEP 15)', () => {
    it('extracts manufacturer from brand_owner or manufacturing_places', () => {
      expect(extractManufacturer({ brand_owner: 'Nestlé India Ltd.' })).toBe('Nestlé India Ltd.');
      expect(extractManufacturer({ manufacturing_places: 'Pantnagar, Uttarakhand' })).toBe('Pantnagar, Uttarakhand');
      expect(extractManufacturer({})).toBeNull();
    });

    it('extracts ingredients text cleanly', () => {
      expect(extractIngredients({ ingredients_text: 'Wheat flour, Palm oil, Salt, Spices' })).toBe(
        'Wheat flour, Palm oil, Salt, Spices'
      );
      expect(extractIngredients({ ingredients_text_en: 'Milk, Sugar, Cocoa powder' })).toBe(
        'Milk, Sugar, Cocoa powder'
      );
      expect(extractIngredients({})).toBeNull();
    });

    it('extracts allergens safely', () => {
      expect(extractAllergens({ allergens: 'Milk, Gluten' })).toBe('Milk, Gluten');
      expect(extractAllergens({ allergens_tags: ['en:milk', 'en:soybeans'] })).toBe('milk, soybeans');
      expect(extractAllergens({})).toBeNull();
    });

    it('extracts country/origin cleanly', () => {
      expect(extractCountries({ countries: 'India' })).toBe('India');
      expect(extractCountries({ origins: 'Assam, India' })).toBe('Assam, India');
      expect(extractCountries({})).toBeNull();
    });

    it('extracts nutrition facts from nutriments', () => {
      const nutriments = {
        'energy-kcal_100g': 420.5,
        'fat_100g': 15.2,
        'carbohydrates_100g': 63.1,
        'proteins_100g': 8.5,
        'sugars_100g': 2.1,
        'salt_100g': 1.2,
      };

      const result = extractNutrition({ nutriments });
      expect(result).not.toBeNull();
      expect(result?.energyKcal).toBe(420.5);
      expect(result?.fat).toBe(15.2);
      expect(result?.carbs).toBe(63.1);
      expect(result?.proteins).toBe(8.5);
      expect(result?.sugar).toBe(2.1);
      expect(result?.salt).toBe(1.2);
    });

    it('returns null for nutrition when nutriments object is empty or missing', () => {
      expect(extractNutrition({})).toBeNull();
      expect(extractNutrition({ nutriments: {} })).toBeNull();
    });
  });

  describe('Category Mapping (mapOnlineCategoryToSoochiCategoryId)', () => {
    it('maps snacks, biscuits, noodles into cat-snacks', () => {
      expect(mapOnlineCategoryToSoochiCategoryId(['en:snacks', 'en:biscuits'], 'Cookies', 'Parle-G')).toBe('cat-snacks');
      expect(mapOnlineCategoryToSoochiCategoryId([], '', 'Maggi 2-Minute Masala Noodles')).toBe('cat-snacks');
    });

    it('maps staples, rice, flour, dal into cat-kitchen', () => {
      expect(mapOnlineCategoryToSoochiCategoryId(['en:groceries', 'en:rice'], '', 'Basmati Rice')).toBe('cat-kitchen');
      expect(mapOnlineCategoryToSoochiCategoryId([], 'Atta / Wheat', 'Chakki Atta')).toBe('cat-kitchen');
    });

    it('maps drinks, tea, coffee into cat-beverages', () => {
      expect(mapOnlineCategoryToSoochiCategoryId(['en:beverages'], 'Tea Bags', 'Tata Tea')).toBe('cat-beverages');
      expect(mapOnlineCategoryToSoochiCategoryId([], '', 'Nescafe Classic Instant Coffee')).toBe('cat-beverages');
    });

    it('maps personal care, shampoo, soap into cat-personal', () => {
      expect(mapOnlineCategoryToSoochiCategoryId(['en:hygiene'], 'Shampoo', 'Head & Shoulders')).toBe('cat-personal');
      expect(mapOnlineCategoryToSoochiCategoryId([], '', 'Colgate MaxFresh Toothpaste')).toBe('cat-personal');
    });

    it('maps cleaning, detergent, cleaner into cat-cleaning', () => {
      expect(mapOnlineCategoryToSoochiCategoryId(['en:cleaning'], 'Detergent', 'Surf Excel Easy Wash')).toBe('cat-cleaning');
    });

    it('maps baby care into cat-baby', () => {
      expect(mapOnlineCategoryToSoochiCategoryId(['en:baby-care'], 'Diapers', 'Pampers Baby Dry')).toBe('cat-baby');
    });

    it('maps pet care into cat-pet', () => {
      expect(mapOnlineCategoryToSoochiCategoryId(['en:pets'], 'Dog Food', 'Pedigree Adult')).toBe('cat-pet');
    });

    it('provides human-readable category name from ID', () => {
      expect(getCategoryNameById('cat-kitchen')).toBe('Kitchen & Staples');
      expect(getCategoryNameById('cat-snacks')).toBe('Snacks & Packaged Food');
    });
  });

  describe('Online Product Lookup Service (lookupOnlineProductByBarcode)', () => {
    it('successfully resolves an online product with rich details from Open Food Facts API', async () => {
      const mockResponse = {
        status: 1,
        product: {
          product_name: 'Maggi 2-Minute Masala Noodles',
          brands: 'Nestlé',
          brand_owner: 'Nestlé India Ltd.',
          categories_tags: ['en:snacks', 'en:noodles'],
          categories: 'Snacks, Instant noodles',
          quantity: '70 g',
          image_url: 'https://images.openfoodfacts.org/images/products/890/120/701/9234/front_en.jpg',
          generic_name: 'Instant Noodles',
          ingredients_text: 'Wheat Flour, Palm Oil, Iodised Salt, Spices',
          allergens: 'Gluten, Wheat',
          countries: 'India',
          nutriments: {
            'energy-kcal_100g': 420,
            'proteins_100g': 8,
            'carbohydrates_100g': 63,
            'fat_100g': 15,
          },
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await lookupOnlineProductByBarcode('8901207019234');
      expect(result).not.toBeNull();
      expect(result?.productName).toBe('Maggi 2-Minute Masala Noodles');
      expect(result?.brand).toBe('Nestlé');
      expect(result?.manufacturer).toBe('Nestlé India Ltd.');
      expect(result?.categoryId).toBe('cat-snacks');
      expect(result?.quantity).toBe(70);
      expect(result?.unit).toBe('g');
      expect(result?.imageUrl).toBe('https://images.openfoodfacts.org/images/products/890/120/701/9234/front_en.jpg');
      expect(result?.ingredients).toBe('Wheat Flour, Palm Oil, Iodised Salt, Spices');
      expect(result?.allergens).toBe('Gluten, Wheat');
      expect(result?.countries).toBe('India');
      expect(result?.nutrition?.energyKcal).toBe(420);
      expect(result?.source).toBe('Open Food Facts');
    });

    it('preserves leading zeros in the request URL and result', async () => {
      let requestedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        requestedUrl = String(url);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 1,
            product: { product_name: 'Imported Dark Chocolate', quantity: '100 g' },
          }),
        });
      });

      const result = await lookupOnlineProductByBarcode('0891234567890');
      expect(requestedUrl).toContain('0891234567890');
      expect(result?.barcode).toBe('0891234567890');
    });

    it('returns null when product is not found (status 0)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 0, status_verbose: 'product not found' }),
      } as Response);

      const result = await lookupOnlineProductByBarcode('9999999999999');
      expect(result).toBeNull();
    });

    it('returns null when HTTP error occurs (e.g. 404 or 500)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const result = await lookupOnlineProductByBarcode('8900000000000');
      expect(result).toBeNull();
    });

    it('handles HTTP 429 rate limit gracefully without throwing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      } as Response);

      const result = await lookupOnlineProductByBarcode('8900000000001');
      expect(result).toBeNull();
    });

    it('handles network throw or abort without crashing application', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));

      const result = await lookupOnlineProductByBarcode('8900000000002');
      expect(result).toBeNull();
    });

    it('returns null if product name is empty or missing from API response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 1,
          product: { brands: 'Some Brand', quantity: '500g' }, // No name
        }),
      } as Response);

      const result = await lookupOnlineProductByBarcode('8900000000003');
      expect(result).toBeNull();
    });
  });

  describe('Catalog Enrichment & Duplicate Barcode Protection (STEP 15A)', () => {
    it('adds online product to local catalog idempotently with all rich metadata persisted', async () => {
      const onlineProduct = {
        barcode: '8901207019234',
        productName: 'Maggi 2-Minute Masala Noodles',
        brand: 'Nestlé',
        manufacturer: 'Nestlé India Ltd.',
        categoryId: 'cat-snacks',
        categoryName: 'Snacks & Packaged Food',
        quantity: 70,
        unit: 'g',
        rawQuantityText: '70 g',
        imageUrl: 'https://images.openfoodfacts.org/front.jpg',
        genericName: 'Instant Noodles',
        description: '2-Minute Masala Instant Noodles',
        ingredients: 'Wheat flour, palm oil, salt, spices',
        allergens: 'Gluten, Wheat',
        countries: 'India',
        nutrition: {
          energyKcal: 420,
          proteins: 8.5,
          carbs: 63,
          fat: 15.2,
          sugar: 2.1,
          salt: 1.2,
        },
        source: 'Open Food Facts',
      };

      // 1. Add to catalog
      const saved1 = await catalogRepository.addOnlineCatalogItem(onlineProduct);
      expect(saved1).toBeDefined();
      expect(saved1.name).toBe('Maggi 2-Minute Masala Noodles');
      expect(saved1.barcode).toBe('8901207019234');
      expect(saved1.brand).toBe('Nestlé');
      expect(saved1.imageUrl).toBe('https://images.openfoodfacts.org/front.jpg');
      expect(saved1.metadata?.manufacturer).toBe('Nestlé India Ltd.');
      expect(saved1.metadata?.ingredients).toBe('Wheat flour, palm oil, salt, spices');
      expect(saved1.metadata?.allergens).toBe('Gluten, Wheat');
      expect(saved1.metadata?.countries).toBe('India');
      expect(saved1.metadata?.nutrition?.energyKcal).toBe(420);
      expect(saved1.metadata?.nutrition?.proteins).toBe(8.5);
      expect(saved1.isCustom).toBe(true);

      // 2. Fetch directly from Dexie table to verify raw database persistence
      const rawFromDb = await db.catalogItems.get(saved1.id);
      expect(rawFromDb).toBeDefined();
      expect(rawFromDb?.metadata?.manufacturer).toBe('Nestlé India Ltd.');
      expect(rawFromDb?.metadata?.allergens).toBe('Gluten, Wheat');
      expect(rawFromDb?.metadata?.nutrition?.fat).toBe(15.2);
      expect(rawFromDb?.imageUrl).toBe('https://images.openfoodfacts.org/front.jpg');

      // 3. Second add with same barcode should return existing item and NOT add duplicate row
      const saved2 = await catalogRepository.addOnlineCatalogItem(onlineProduct);
      expect(saved2.id).toBe(saved1.id);

      // 4. Barcode lookup resolves the persisted item with metadata
      const itemsList = await catalogRepository.getCatalogItems();
      const resolvedLocal = itemsList.find((i) => i.barcode === '8901207019234');
      expect(resolvedLocal).toBeDefined();
      expect(resolvedLocal?.metadata?.manufacturer).toBe('Nestlé India Ltd.');

      // Cleanup
      await db.catalogItems.delete(saved1.id);
    });

    it('enriches existing barcode item with missing metadata without duplicating', async () => {
      // Create bare item with just barcode and name
      const bareItem = await catalogRepository.addOnlineCatalogItem({
        barcode: '8909999999999',
        productName: 'Bare Test Product',
        unit: 'pack',
      });
      expect(bareItem.brand).toBeNull();
      expect(bareItem.imageUrl).toBeNull();

      // Later enrich with brand, image, and metadata
      const enriched = await catalogRepository.addOnlineCatalogItem({
        barcode: '8909999999999',
        productName: 'Bare Test Product',
        brand: 'Enriched Brand',
        imageUrl: 'https://example.com/img.jpg',
        ingredients: 'Water, Sugar',
        allergens: 'None',
      });

      expect(enriched.id).toBe(bareItem.id);
      expect(enriched.brand).toBe('Enriched Brand');
      expect(enriched.imageUrl).toBe('https://example.com/img.jpg');
      expect(enriched.metadata?.ingredients).toBe('Water, Sugar');

      // Cleanup
      await db.catalogItems.delete(bareItem.id);
    });

    it('preserves existing standard catalog items without metadata backward-compatibly', async () => {
      const standardItem = {
        id: 'item-standard-test-123',
        categoryId: 'cat-kitchen',
        name: 'Standard Basmati Rice',
        defaultUnit: 'kg',
        isCustom: false,
        createdAt: new Date().toISOString(),
      };

      await db.catalogItems.add(standardItem);
      const retrieved = await db.catalogItems.get('item-standard-test-123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Standard Basmati Rice');
      expect(retrieved?.metadata).toBeUndefined();

      // Cleanup
      await db.catalogItems.delete('item-standard-test-123');
    });
  });
});
