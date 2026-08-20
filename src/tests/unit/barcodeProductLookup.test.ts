import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  lookupOnlineProductByBarcode,
  parseQuantityAndUnit,
  extractProductName,
  extractBrand,
} from '../../services/barcodeProductLookup';
import {
  mapOnlineCategoryToSoochiCategoryId,
  getCategoryNameById,
} from '../../utils/catalogCategoryMapping';
import { catalogRepository } from '../../repositories/catalogRepository';
import { db } from '../../db';

describe('Online Barcode Product Lookup Service & Catalog Enrichment (STEP 14)', () => {
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
    it('successfully resolves an online product from Open Food Facts API structure', async () => {
      const mockResponse = {
        status: 1,
        product: {
          product_name: 'Maggi 2-Minute Masala Noodles',
          brands: 'Nestlé',
          categories_tags: ['en:snacks', 'en:noodles'],
          categories: 'Snacks, Instant noodles',
          quantity: '70 g',
          image_url: 'https://images.openfoodfacts.org/images/products/890/120/701/9234/front_en.jpg',
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
      expect(result?.categoryId).toBe('cat-snacks');
      expect(result?.quantity).toBe(70);
      expect(result?.unit).toBe('g');
      expect(result?.imageUrl).toBe('https://images.openfoodfacts.org/images/products/890/120/701/9234/front_en.jpg');
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

  describe('Catalog Enrichment & Duplicate Barcode Protection', () => {
    it('adds online product to local catalog idempotently without creating duplicate barcodes', async () => {
      const onlineProduct = {
        barcode: '8901207019234',
        productName: 'Maggi 2-Minute Masala Noodles',
        brand: 'Nestlé',
        categoryId: 'cat-snacks',
        unit: 'g',
        imageUrl: 'https://images.openfoodfacts.org/front.jpg',
      };

      // First add
      const saved1 = await catalogRepository.addOnlineCatalogItem(onlineProduct);
      expect(saved1).toBeDefined();
      expect(saved1.name).toBe('Maggi 2-Minute Masala Noodles');
      expect(saved1.barcode).toBe('8901207019234');
      expect(saved1.isCustom).toBe(true);

      // Second add with same barcode should return existing item and NOT add duplicate row
      const saved2 = await catalogRepository.addOnlineCatalogItem(onlineProduct);
      expect(saved2.id).toBe(saved1.id);

      // Cleanup
      await db.catalogItems.delete(saved1.id);
    });
  });
});
