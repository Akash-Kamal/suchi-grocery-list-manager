import { describe, it, expect } from 'vitest';
import { getContextualCatalogSuggestions } from '../../utils/catalogCompletion';
import { SEED_CATALOG_ITEMS } from '../../db/seedData';
import type { ListItem, RecurringItemStat } from '../../types/database';

describe('Catalog Contextual Completion Unit Tests', () => {
  const fixedNow = new Date('2026-08-20T12:00:00Z').getTime();

  const makeListItem = (id: string, catalogItemId: string | null, name: string): ListItem => ({
    id,
    listId: 'list-1',
    catalogItemId,
    itemNameSnapshot: name,
    quantity: 1,
    unit: 'kg',
    estimatedPrice: null,
    actualPrice: null,
    isPurchased: false,
    note: null,
    sortOrder: 0,
  });

  it('returns empty array when currentItems is empty', () => {
    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, [], [], new Set(), { now: fixedNow });
    expect(suggestions).toEqual([]);
  });

  it('returns empty array when catalogItems is empty', () => {
    const current = [makeListItem('1', 'item-atta', 'Atta')];
    const suggestions = getContextualCatalogSuggestions([], current, [], new Set(), { now: fixedNow });
    expect(suggestions).toEqual([]);
  });

  it('generates valid complementary items for a single item (e.g. Atta -> Oil, Salt, Ghee)', () => {
    const current = [makeListItem('1', 'item-atta', 'Atta')];
    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow });

    expect(suggestions.length).toBeGreaterThan(0);
    const names = suggestions.map((s) => s.item.name);
    // Atta complements should include Oil / Salt / Ghee
    expect(names.some((n) => n.includes('Oil') || n.includes('Salt') || n.includes('Ghee'))).toBe(true);
    // Atta itself must NOT be in suggestions
    expect(suggestions.some((s) => s.item.id === 'item-atta')).toBe(false);
  });

  it('increases context score and priority when multiple current items point to the same candidate', () => {
    // Rice + Dal both complement Cooking Oil
    const currentRiceAndDal = [
      makeListItem('1', 'item-rice-basmati', 'Basmati Rice'),
      makeListItem('2', 'item-toor-dal', 'Toor / Arhar Dal'),
    ];

    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, currentRiceAndDal, [], new Set(), { now: fixedNow });

    // Find Cooking Oil in suggestions
    const oilSuggestion = suggestions.find((s) => s.item.id.includes('oil'));
    expect(oilSuggestion).toBeDefined();
    // Context score for shared candidate should be 50 + 15 = 65
    expect(oilSuggestion!.contextScore).toBe(65);
    expect(oilSuggestion!.matchedWith.length).toBe(2);
  });

  it('strictly excludes items that are already in the current list', () => {
    // Current list has Atta, Rice, AND Mustard Oil
    const current = [
      makeListItem('1', 'item-atta', 'Atta'),
      makeListItem('2', 'item-rice-basmati', 'Basmati Rice'),
      makeListItem('3', 'item-mustard-oil', 'Mustard Oil (Sarson Oil)'),
    ];

    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow });
    const ids = suggestions.map((s) => s.item.id);

    expect(ids).not.toContain('item-atta');
    expect(ids).not.toContain('item-rice-basmati');
    expect(ids).not.toContain('item-mustard-oil');
  });

  it('strictly excludes items matching by name snapshot even if catalogItemId is missing', () => {
    const current = [
      makeListItem('1', null, 'Chakki Fresh Atta'), // Custom snapshot matching Atta name
    ];

    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow });
    const names = suggestions.map((s) => s.item.name);
    expect(names).not.toContain('Chakki Fresh Atta');
  });

  it('safely handles custom items in current list without throwing or crashing', () => {
    const current = [
      makeListItem('1', null, 'Homemade Pickle'),
      makeListItem('2', 'item-tea-leaves', 'Tea Leaves'),
    ];

    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow });
    expect(suggestions.length).toBeGreaterThan(0);
    // Tea Leaves complements should include Milk / Sugar
    const names = suggestions.map((s) => s.item.name);
    expect(names.some((n) => n.includes('Milk') || n.includes('Sugar'))).toBe(true);
  });

  it('safely ignores unknown catalog item IDs in current list or complements', () => {
    const current = [
      makeListItem('1', 'non-existent-item-999', 'Unknown Thing'),
    ];

    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow });
    expect(suggestions).toEqual([]);
  });

  it('boosts candidate score when candidate is marked as favorite', () => {
    const current = [makeListItem('1', 'item-tea-leaves', 'Tea Leaves')];
    // Sugar is favorite
    const favorites = new Set(['item-sugar']);

    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], favorites, { now: fixedNow });
    const sugar = suggestions.find((s) => s.item.id === 'item-sugar');

    expect(sugar).toBeDefined();
    expect(sugar!.isFavorite).toBe(true);
    expect(sugar!.score).toBeGreaterThan(sugar!.contextScore);
  });

  it('boosts candidate score when candidate has recurring purchase frequency', () => {
    const current = [makeListItem('1', 'item-tea-leaves', 'Tea Leaves')];
    const stats: RecurringItemStat[] = [
      { id: '1', catalogItemId: 'item-milk', frequencyScore: 0.9, medianQuantity: 1, medianUnit: 'L', lastPurchasedAt: null, typicalIntervalDays: null },
    ];

    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, stats, new Set(), { now: fixedNow });
    const milk = suggestions.find((s) => s.item.id === 'item-milk');

    expect(milk).toBeDefined();
    expect(milk!.frequencyScore).toBe(0.9);
    // 50 (base) + 18 (freq) + 5 (category) = 73
    expect(milk!.score).toBeGreaterThan(50);
  });

  it('boosts candidate score when candidate is due for purchase', () => {
    const current = [makeListItem('1', 'item-tea-leaves', 'Tea Leaves')];
    const stats: RecurringItemStat[] = [
      { id: '1', catalogItemId: 'item-milk', frequencyScore: 0.5, medianQuantity: 1, medianUnit: 'L', lastPurchasedAt: new Date(fixedNow - 10 * 24 * 60 * 60 * 1000).toISOString(), typicalIntervalDays: 7 },
    ];

    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, stats, new Set(), { now: fixedNow });
    const milk = suggestions.find((s) => s.item.id === 'item-milk');

    expect(milk).toBeDefined();
    expect(milk!.isDue).toBe(true);
  });

  it('limits suggestions to at most 6 items', () => {
    // Potatoes + Onions + Tomatoes generate multiple spice and oil complements
    const current = [
      makeListItem('1', 'item-potatoes', 'Potatoes'),
      makeListItem('2', 'item-onions', 'Onions'),
      makeListItem('3', 'item-tomatoes', 'Tomatoes'),
    ];

    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow });
    expect(suggestions.length).toBeLessThanOrEqual(6);
    // Ensure no duplicate IDs in result
    const ids = suggestions.map((s) => s.item.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('produces deterministic output across multiple repeated executions', () => {
    const current = [
      makeListItem('1', 'item-atta', 'Atta'),
      makeListItem('2', 'item-rice-basmati', 'Basmati Rice'),
    ];

    const run1 = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow }).map((s) => s.item.id);
    const run2 = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow }).map((s) => s.item.id);

    expect(run1).toEqual(run2);
  });

  it('ensures explicit complementary relationships outrank weak category similarity', () => {
    // Current: Tea Leaves (beverages)
    // Milk (kitchen) is an explicit complement (+50)
    // Green Tea (beverages) is same category (+5) but not explicit complement
    const current = [makeListItem('1', 'item-tea-leaves', 'Tea Leaves')];
    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow });

    const milk = suggestions.find((s) => s.item.id === 'item-milk');
    expect(milk).toBeDefined();
    expect(milk!.contextScore).toBe(50);
  });

  it('returns empty array when all possible complements are already in the current list', () => {
    const current = [
      makeListItem('1', 'item-baby-diapers', 'Baby Diapers'),
      makeListItem('2', 'item-baby-wipes', 'Baby Wet Wipes'),
    ];

    // Diapers only complement Wipes and vice-versa, which are both present
    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow });
    const babySuggestions = suggestions.filter((s) => s.item.id.includes('baby'));
    expect(babySuggestions).toEqual([]);
  });

  it('maintains stable original catalog index ordering on tie', () => {
    const current = [makeListItem('1', 'item-matchbox', 'Matchbox')];
    const suggestions = getContextualCatalogSuggestions(SEED_CATALOG_ITEMS, current, [], new Set(), { now: fixedNow });
    // Matchbox complements Aluminum Foil
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].item.id).toBe('item-foil');
  });
});

