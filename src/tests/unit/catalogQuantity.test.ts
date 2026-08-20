import { describe, it, expect } from 'vitest';
import {
  getDefaultQuantity,
  getQuantityStep,
  incrementQuantity,
  decrementQuantity,
  normalizeUnit,
} from '../../utils/catalogQuantity';

describe('Catalog Quantity & Smart Unit Handling Unit Tests', () => {
  describe('Unit Normalization', () => {
    it('normalizes units to trimmed lowercase strings', () => {
      expect(normalizeUnit(' KG ')).toBe('kg');
      expect(normalizeUnit('Ml')).toBe('ml');
      expect(normalizeUnit(undefined)).toBe('');
    });
  });

  describe('Default Quantities', () => {
    it('returns default quantity = 1 for kg', () => {
      expect(getDefaultQuantity('kg')).toBe(1);
    });

    it('returns default quantity = 500 for g', () => {
      expect(getDefaultQuantity('g')).toBe(500);
    });

    it('returns default quantity = 1 for L', () => {
      expect(getDefaultQuantity('L')).toBe(1);
      expect(getDefaultQuantity('l')).toBe(1);
    });

    it('returns default quantity = 500 for ml', () => {
      expect(getDefaultQuantity('ml')).toBe(500);
      expect(getDefaultQuantity('ML')).toBe(500);
    });

    it('returns default quantity = 1 for pack', () => {
      expect(getDefaultQuantity('pack')).toBe(1);
    });

    it('returns default quantity = 1 for pcs', () => {
      expect(getDefaultQuantity('pcs')).toBe(1);
    });

    it('returns default quantity = 1 for bottle', () => {
      expect(getDefaultQuantity('bottle')).toBe(1);
    });

    it('returns default quantity = 1 for dozen', () => {
      expect(getDefaultQuantity('dozen')).toBe(1);
    });

    it('returns default quantity = 1 for unknown or missing units as safe fallback', () => {
      expect(getDefaultQuantity('box')).toBe(1);
      expect(getDefaultQuantity('')).toBe(1);
      expect(getDefaultQuantity(undefined)).toBe(1);
    });
  });

  describe('Quantity Increment Steps', () => {
    it('increments kg by 1', () => {
      expect(getQuantityStep('kg')).toBe(1);
      expect(incrementQuantity(2, 'kg')).toBe(3);
    });

    it('increments g by 100', () => {
      expect(getQuantityStep('g')).toBe(100);
      expect(incrementQuantity(500, 'g')).toBe(600);
    });

    it('increments L by 1', () => {
      expect(getQuantityStep('L')).toBe(1);
      expect(incrementQuantity(1, 'L')).toBe(2);
    });

    it('increments ml by 100', () => {
      expect(getQuantityStep('ml')).toBe(100);
      expect(incrementQuantity(500, 'ml')).toBe(600);
    });

    it('increments pcs by 1', () => {
      expect(getQuantityStep('pcs')).toBe(1);
      expect(incrementQuantity(12, 'pcs')).toBe(13);
    });

    it('increments bottle and dozen by 1', () => {
      expect(incrementQuantity(1, 'bottle')).toBe(2);
      expect(incrementQuantity(1, 'dozen')).toBe(2);
    });

    it('increments unknown units safely by 1', () => {
      expect(getQuantityStep('custom_unit')).toBe(1);
      expect(incrementQuantity(5, 'custom_unit')).toBe(6);
    });
  });

  describe('Quantity Decrement Steps & Boundaries', () => {
    it('decrements kg by 1', () => {
      expect(decrementQuantity(3, 'kg')).toBe(2);
      expect(decrementQuantity(1, 'kg')).toBe(0);
    });

    it('decrements g by 100', () => {
      expect(decrementQuantity(500, 'g')).toBe(400);
      expect(decrementQuantity(100, 'g')).toBe(0);
    });

    it('decrements ml by 100', () => {
      expect(decrementQuantity(600, 'ml')).toBe(500);
      expect(decrementQuantity(50, 'ml')).toBe(0);
    });

    it('ensures quantity never becomes negative', () => {
      expect(decrementQuantity(0, 'kg')).toBe(0);
      expect(decrementQuantity(50, 'g')).toBe(0);
      expect(decrementQuantity(-10, 'ml')).toBe(0);
    });

    it('handles case-insensitive unit matching for increments and decrements', () => {
      expect(incrementQuantity(500, 'G')).toBe(600);
      expect(incrementQuantity(500, 'ML')).toBe(600);
      expect(incrementQuantity(2, 'KG')).toBe(3);
      expect(decrementQuantity(500, 'G')).toBe(400);
      expect(decrementQuantity(500, 'ML')).toBe(400);
    });

    it('decrements unknown units safely by 1 without negative values', () => {
      expect(decrementQuantity(5, 'carton')).toBe(4);
      expect(decrementQuantity(1, 'carton')).toBe(0);
      expect(decrementQuantity(0, 'carton')).toBe(0);
    });
  });
});
