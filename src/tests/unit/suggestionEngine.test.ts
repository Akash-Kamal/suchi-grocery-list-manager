import { describe, it, expect } from 'vitest';
import {
  calculateFrequencyScore,
  calculateMedianQuantity,
  detectGaps,
  flagUnusualQuantity,
  type RecurringCandidate,
} from '../../services/suggestionEngine';

describe('Suggestion Engine Module Unit Tests', () => {
  describe('calculateFrequencyScore', () => {
    it('calculates score correctly for typical list counts', () => {
      expect(calculateFrequencyScore(3, 5)).toBe(0.6);
      expect(calculateFrequencyScore(1, 4)).toBe(0.25);
      expect(calculateFrequencyScore(5, 5)).toBe(1.0);
    });

    it('handles zero occurrences or zero total lists gracefully', () => {
      expect(calculateFrequencyScore(0, 5)).toBe(0);
      expect(calculateFrequencyScore(3, 0)).toBe(0);
      expect(calculateFrequencyScore(-1, 5)).toBe(0);
    });
  });

  describe('calculateMedianQuantity', () => {
    it('calculates median for odd-length arrays', () => {
      expect(calculateMedianQuantity([1, 5, 2])).toBe(2);
      expect(calculateMedianQuantity([10, 20, 5, 1, 15])).toBe(10);
    });

    it('calculates median for even-length arrays', () => {
      expect(calculateMedianQuantity([2, 5, 8, 10])).toBe(6.5);
      expect(calculateMedianQuantity([1, 2])).toBe(1.5);
    });

    it('returns default 1 for empty or invalid input', () => {
      expect(calculateMedianQuantity([])).toBe(1);
      expect(calculateMedianQuantity([0, -5])).toBe(1);
    });
  });

  describe('detectGaps', () => {
    const mockCandidates: RecurringCandidate[] = [
      {
        catalogItemId: 'item-atta',
        name: 'Chakki Fresh Atta',
        defaultUnit: 'kg',
        categoryId: 'cat-kitchen',
        frequencyScore: 0.9,
        medianQuantity: 10,
        medianUnit: 'kg',
        lastPurchasedAt: '2026-07-15',
      },
      {
        catalogItemId: 'item-milk',
        name: 'Fresh Milk',
        defaultUnit: 'L',
        categoryId: 'cat-kitchen',
        frequencyScore: 0.8,
        medianQuantity: 2,
        medianUnit: 'L',
        lastPurchasedAt: '2026-07-28',
      },
      {
        catalogItemId: 'item-foil',
        name: 'Aluminum Foil Roll',
        defaultUnit: 'pack',
        categoryId: 'cat-misc',
        frequencyScore: 0.2, // Low recurring
        medianQuantity: 1,
        medianUnit: 'pack',
        lastPurchasedAt: '2026-05-10',
      },
    ];

    it('flags high recurring items that are missing from draft', () => {
      const currentDraftIds = new Set(['item-milk']); // Atta is missing!
      const gaps = detectGaps(currentDraftIds, mockCandidates);

      expect(gaps.length).toBe(1);
      expect(gaps[0].catalogItemId).toBe('item-atta');
      expect(gaps[0].suggestedQuantity).toBe(10);
    });

    it('returns empty gaps when all recurring items are already in draft', () => {
      const currentDraftIds = new Set(['item-atta', 'item-milk']);
      const gaps = detectGaps(currentDraftIds, mockCandidates);

      expect(gaps.length).toBe(0);
    });
  });

  describe('flagUnusualQuantity', () => {
    it('flags unusually high quantities (>= 2x median)', () => {
      const res = flagUnusualQuantity(10, 2);
      expect(res.isUnusual).toBe(true);
      expect(res.ratio).toBe(5);
      expect(res.message).toContain('5.0x your usual quantity');
    });

    it('does not flag normal quantities', () => {
      const res = flagUnusualQuantity(5, 5);
      expect(res.isUnusual).toBe(false);
      expect(res.message).toBeNull();
    });

    it('flags unusually low quantities (<= 0.33x median)', () => {
      const res = flagUnusualQuantity(1, 5);
      expect(res.isUnusual).toBe(true);
      expect(res.message).toContain('significantly lower');
    });
  });
});
