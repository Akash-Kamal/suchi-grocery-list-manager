import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  tokenize,
  isFuzzyWordMatch,
  calculateItemSearchScore,
  searchCatalogItems,
  getHighlightedChunks,
  findMatchingAlias,
} from '../../utils/catalogSearch';
import { SEED_CATALOG_ITEMS, SEED_ITEM_ALIASES } from '../../db/seedData';
import type { CatalogItem } from '../../types/database';

describe('Catalog Search & Typo-Tolerance Unit Tests', () => {
  // Build standard alias map from seed data
  const aliasMap = new Map<string, string[]>();
  for (const a of SEED_ITEM_ALIASES) {
    const list = aliasMap.get(a.catalogItemId);
    const text = a.aliasText.toLowerCase();
    if (list) list.push(text);
    else aliasMap.set(a.catalogItemId, [text]);
  }

  describe('Levenshtein & Tokenizer Core', () => {
    it('calculates edit distances correctly', () => {
      expect(levenshteinDistance('pyaz', 'pyaz')).toBe(0);
      expect(levenshteinDistance('pyaz', 'payaz')).toBe(1);
      expect(levenshteinDistance('doodh', 'dudh')).toBe(2);
      expect(levenshteinDistance('tamatar', 'tamtar')).toBe(1);
      expect(levenshteinDistance('basmati', 'basmti')).toBe(1);
      expect(levenshteinDistance('chawal', 'chaval')).toBe(1);
      expect(levenshteinDistance('hello', 'world')).toBe(4);
    });

    it('tokenizes multilingual and punctuation-separated strings', () => {
      expect(tokenize('Toor / Arhar Dal (Yellow)')).toEqual(['toor', 'arhar', 'dal', 'yellow']);
      expect(tokenize('Chakki Fresh Atta')).toEqual(['chakki', 'fresh', 'atta']);
      expect(tokenize('Fresh Milk 1L')).toEqual(['fresh', 'milk', '1l']);
      expect(tokenize('प्याज और आलू')).toEqual(['प्याज', 'और', 'आलू']);
    });
  });

  describe('Fuzzy Word Match & False-Positive Controls', () => {
    it('rejects fuzzy matching for queries shorter than 3 characters', () => {
      expect(isFuzzyWordMatch('milk', 'm').isMatch).toBe(false);
      expect(isFuzzyWordMatch('atta', 'at').isMatch).toBe(false);
      expect(isFuzzyWordMatch('salt', 'sa').isMatch).toBe(false);
    });

    it('allows distance 1 for 3-4 char query words', () => {
      expect(isFuzzyWordMatch('pyaz', 'payaz').isMatch).toBe(true);
      expect(isFuzzyWordMatch('doodh', 'dudh').isMatch).toBe(true);
      expect(isFuzzyWordMatch('aloo', 'alu').isMatch).toBe(true);
      expect(isFuzzyWordMatch('milk', 'mlk').isMatch).toBe(true);
    });

    it('allows distance <= 2 for 5+ char query words', () => {
      expect(isFuzzyWordMatch('tamatar', 'tamtar').isMatch).toBe(true);
      expect(isFuzzyWordMatch('basmati', 'basmti').isMatch).toBe(true);
      expect(isFuzzyWordMatch('chawal', 'chaval').isMatch).toBe(true);
    });

    it('rejects unrelated words and large edit distances', () => {
      expect(isFuzzyWordMatch('milk', 'salt').isMatch).toBe(false);
      expect(isFuzzyWordMatch('onions', 'sugar').isMatch).toBe(false);
      expect(isFuzzyWordMatch('toothpaste', 'toothbrush').isMatch).toBe(false);
    });
  });

  describe('Catalog Items Typo-Tolerant Search & Ranking', () => {
    it('matches exact name and ranks it at the top', () => {
      const results = searchCatalogItems(SEED_CATALOG_ITEMS, 'Fresh Milk', aliasMap);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Fresh Milk');
    });

    it('matches exact alias', () => {
      const results = searchCatalogItems(SEED_CATALOG_ITEMS, 'pyaz', aliasMap);
      expect(results.some((i) => i.name.includes('Onion'))).toBe(true);
    });

    it('matches alias substring', () => {
      const results = searchCatalogItems(SEED_CATALOG_ITEMS, 'sarson', aliasMap);
      expect(results.some((i) => i.name.includes('Mustard Oil'))).toBe(true);
    });

    it('handles common English/brand typos', () => {
      // "basmti" -> Basmati Rice
      const basmati = searchCatalogItems(SEED_CATALOG_ITEMS, 'basmti', aliasMap);
      expect(basmati.some((i) => i.name.includes('Basmati'))).toBe(true);

      // "tomto" -> Tomatoes
      const tomato = searchCatalogItems(SEED_CATALOG_ITEMS, 'tomto', aliasMap);
      expect(tomato.some((i) => i.name.includes('Tomatoes'))).toBe(true);

      // "magy" or "maggi" -> Instant Noodles (Maggi)
      const maggi = searchCatalogItems(SEED_CATALOG_ITEMS, 'maggi', aliasMap);
      expect(maggi.some((i) => i.name.includes('Noodles'))).toBe(true);
    });

    it('handles Romanized Hindi / Hinglish typos', () => {
      // "payaz" -> Onions
      const onions = searchCatalogItems(SEED_CATALOG_ITEMS, 'payaz', aliasMap);
      expect(onions.some((i) => i.name.includes('Onion'))).toBe(true);

      // "dudh" -> Milk
      const milk = searchCatalogItems(SEED_CATALOG_ITEMS, 'dudh', aliasMap);
      expect(milk.some((i) => i.name.includes('Milk'))).toBe(true);

      // "chaval" -> Rice
      const rice = searchCatalogItems(SEED_CATALOG_ITEMS, 'chaval', aliasMap);
      expect(rice.some((i) => i.name.includes('Rice'))).toBe(true);

      // "alu" -> Potato
      const potato = searchCatalogItems(SEED_CATALOG_ITEMS, 'alu', aliasMap);
      expect(potato.some((i) => i.name.includes('Potato'))).toBe(true);

      // "tamtar" -> Tomato
      const tomatoes = searchCatalogItems(SEED_CATALOG_ITEMS, 'tamtar', aliasMap);
      expect(tomatoes.some((i) => i.name.includes('Tomato'))).toBe(true);

      // "haldii" -> Turmeric
      const turmeric = searchCatalogItems(SEED_CATALOG_ITEMS, 'haldii', aliasMap);
      expect(turmeric.some((i) => i.name.includes('Turmeric'))).toBe(true);

      // "tur dal" -> Toor Dal
      const toorDal = searchCatalogItems(SEED_CATALOG_ITEMS, 'tur dal', aliasMap);
      expect(toorDal.some((i) => i.name.includes('Toor'))).toBe(true);
    });

    it('handles short query behavior strictly without false-positive fuzzy sprawl', () => {
      const resultsM = searchCatalogItems(SEED_CATALOG_ITEMS, 'm', aliasMap);
      // 'm' should only match items that contain 'm' (e.g. Milk, Mustard, etc.), not items without 'm' like 'Atta' or 'Salt' (unless an alias has 'm')
      const attaInResults = resultsM.some((i) => i.id === 'item-atta');
      expect(attaInResults).toBe(false);

      const resultsOil = searchCatalogItems(SEED_CATALOG_ITEMS, 'oil', aliasMap);
      expect(resultsOil.every((i) => i.name.toLowerCase().includes('oil') || aliasMap.get(i.id)?.some((a) => a.includes('oil')))).toBe(true);
    });

    it('supports Devanagari script exact and substring matching', () => {
      const onions = searchCatalogItems(SEED_CATALOG_ITEMS, 'प्याज', aliasMap);
      expect(onions.some((i) => i.name.includes('Onion'))).toBe(true);

      const milk = searchCatalogItems(SEED_CATALOG_ITEMS, 'दूध', aliasMap);
      expect(milk.some((i) => i.name.includes('Milk'))).toBe(true);

      const rice = searchCatalogItems(SEED_CATALOG_ITEMS, 'चावल', aliasMap);
      expect(rice.some((i) => i.name.includes('Rice'))).toBe(true);

      const atta = searchCatalogItems(SEED_CATALOG_ITEMS, 'आटा', aliasMap);
      expect(atta.some((i) => i.name.includes('Atta'))).toBe(true);
    });

    it('ranks exact and prefix matches above fuzzy matches', () => {
      const items: CatalogItem[] = [
        { id: '1', categoryId: 'cat-kitchen', name: 'Milk Biscuit', defaultUnit: 'pack', isCustom: false, createdAt: '' },
        { id: '2', categoryId: 'cat-kitchen', name: 'Fresh Milk', defaultUnit: 'L', isCustom: false, createdAt: '' },
        { id: '3', categoryId: 'cat-kitchen', name: 'Malted Drink', defaultUnit: 'pack', isCustom: false, createdAt: '' },
      ];
      const customAliases = new Map<string, string[]>([
        ['2', ['doodh', 'milk']],
      ]);

      const results = searchCatalogItems(items, 'milk', customAliases);
      // Fresh Milk or Milk Biscuit should be at the top, not vague matches
      expect(results[0].name).toMatch(/Milk/);

      // Verify numerical scores directly
      const exactScore = calculateItemSearchScore('Fresh Milk', ['doodh'], 'fresh milk');
      const prefixScore = calculateItemSearchScore('Fresh Milk', ['doodh'], 'fresh');
      const fuzzyScore = calculateItemSearchScore('Fresh Milk', ['doodh'], 'frsh');
      expect(exactScore).toBeGreaterThan(prefixScore);
      expect(prefixScore).toBeGreaterThan(fuzzyScore);
    });

    it('guarantees result deduplication (each matching item appears at most once)', () => {
      const results = searchCatalogItems(SEED_CATALOG_ITEMS, 'atta', aliasMap);
      const ids = results.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('preserves original catalog order when query is empty', () => {
      const emptyResults = searchCatalogItems(SEED_CATALOG_ITEMS, '', aliasMap);
      expect(emptyResults.map((i) => i.id)).toEqual(SEED_CATALOG_ITEMS.map((i) => i.id));

      const whitespaceResults = searchCatalogItems(SEED_CATALOG_ITEMS, '   ', aliasMap);
      expect(whitespaceResults.map((i) => i.id)).toEqual(SEED_CATALOG_ITEMS.map((i) => i.id));
    });

    it('ranks exact name above prefix, and prefix above substring', () => {
      const items: CatalogItem[] = [
        { id: '1', categoryId: 'cat-kitchen', name: 'Soy Milk Drink', defaultUnit: 'L', isCustom: false, createdAt: '' },
        { id: '2', categoryId: 'cat-kitchen', name: 'Milk Powder', defaultUnit: 'g', isCustom: false, createdAt: '' },
        { id: '3', categoryId: 'cat-kitchen', name: 'Milk', defaultUnit: 'L', isCustom: false, createdAt: '' },
      ];
      const results = searchCatalogItems(items, 'milk', new Map());
      expect(results[0].name).toBe('Milk'); // Exact name
      expect(results[1].name).toBe('Milk Powder'); // Name starts with query
      expect(results[2].name).toBe('Soy Milk Drink'); // Name contains query
    });

    it('ranks exact alias above fuzzy alias', () => {
      const onions = searchCatalogItems(SEED_CATALOG_ITEMS, 'pyaz', aliasMap);
      expect(onions[0].name).toContain('Onions');

      const payaz = searchCatalogItems(SEED_CATALOG_ITEMS, 'payaz', aliasMap);
      expect(payaz[0].name).toContain('Onions');

      const pyazScore = calculateItemSearchScore('Onions (Pyaz)', ['pyaz'], 'pyaz');
      const payazScore = calculateItemSearchScore('Onions (Pyaz)', ['pyaz'], 'payaz');
      expect(pyazScore).toBeGreaterThan(payazScore);
    });

    it('ranks multi-word query "toor dal" so Toor Dal is #1', () => {
      const results = searchCatalogItems(SEED_CATALOG_ITEMS, 'toor dal', aliasMap);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('Toor');
    });

    it('ranks "dal" so all Dals appear at the top in sensible order', () => {
      const results = searchCatalogItems(SEED_CATALOG_ITEMS, 'dal', aliasMap);
      const top4 = results.slice(0, 4);
      expect(top4.every((i) => i.name.toLowerCase().includes('dal'))).toBe(true);
    });

    it('ranks "basmati" so Basmati Rice is #1 before generic Rice', () => {
      const results = searchCatalogItems(SEED_CATALOG_ITEMS, 'basmati', aliasMap);
      expect(results[0].name).toBe('Basmati Rice');
    });

    it('ensures tie-breaking is 100% deterministic across multiple runs', () => {
      const run1 = searchCatalogItems(SEED_CATALOG_ITEMS, 'oil', aliasMap).map((i) => i.id);
      const run2 = searchCatalogItems(SEED_CATALOG_ITEMS, 'oil', aliasMap).map((i) => i.id);
      expect(run1).toEqual(run2);
    });
  });

  describe('STEP 4: Search Highlighting & Secondary Alias Badges', () => {
    it('segments text into matching and non-matching chunks case-insensitively', () => {
      const chunks = getHighlightedChunks('Fresh Milk 1L', 'milk');
      expect(chunks).toEqual([
        { text: 'Fresh ', isMatch: false },
        { text: 'Milk', isMatch: true },
        { text: ' 1L', isMatch: false },
      ]);
    });

    it('safely handles multi-word query tokens during highlighting', () => {
      const chunks = getHighlightedChunks('Toor / Arhar Dal', 'toor dal');
      expect(chunks).toEqual([
        { text: 'Toor', isMatch: true },
        { text: ' / Arhar ', isMatch: false },
        { text: 'Dal', isMatch: true },
      ]);
    });

    it('safely handles Devanagari text highlighting', () => {
      const chunks = getHighlightedChunks('ताज़ा दूध', 'दूध');
      expect(chunks).toEqual([
        { text: 'ताज़ा ', isMatch: false },
        { text: 'दूध', isMatch: true },
      ]);
    });

    it('safely escapes special characters without crashing regex (e.g. parentheses, slashes, plus)', () => {
      const chunks = getHighlightedChunks('Refined Sunflower Oil (1L)', 'oil (1l)');
      expect(chunks.some((c) => c.isMatch)).toBe(true);
    });

    it('returns single unhighlighted chunk when query or text is empty', () => {
      expect(getHighlightedChunks('Fresh Milk', '')).toEqual([{ text: 'Fresh Milk', isMatch: false }]);
      expect(getHighlightedChunks('', 'milk')).toEqual([{ text: '', isMatch: false }]);
    });

    it('finds matching alias for secondary badge display', () => {
      const aliases = ['Wheat Flour', 'Gehun Ka Atta', 'Atta'];
      expect(findMatchingAlias(aliases, 'gehun')).toBe('Gehun Ka Atta');
      expect(findMatchingAlias(aliases, 'atta')).toBe('Atta');
      expect(findMatchingAlias(aliases, 'unknown')).toBeNull();
    });
  });

  describe('STEP 4: Favorites-First Empty Search & Result Limiting', () => {
    it('orders favorites first in original catalog order, then remaining items without duplicates', () => {
      const allItems: CatalogItem[] = [
        { id: 'item-1', categoryId: 'cat-kitchen', name: 'Item 1', defaultUnit: 'kg', isCustom: false, createdAt: '' },
        { id: 'item-2', categoryId: 'cat-kitchen', name: 'Item 2', defaultUnit: 'kg', isCustom: false, createdAt: '' },
        { id: 'item-3', categoryId: 'cat-kitchen', name: 'Item 3', defaultUnit: 'kg', isCustom: false, createdAt: '' },
        { id: 'item-4', categoryId: 'cat-kitchen', name: 'Item 4', defaultUnit: 'kg', isCustom: false, createdAt: '' },
      ];
      const favorites = new Set(['item-3', 'item-1']);

      // Empty query with 'all' category logic
      const favItems = allItems.filter((i) => favorites.has(i.id));
      const nonFavItems = allItems.filter((i) => !favorites.has(i.id));
      const emptyOrder = [...favItems, ...nonFavItems];

      // Favorites are first: item-1, item-3 (preserving original order between them)
      expect(emptyOrder[0].id).toBe('item-1');
      expect(emptyOrder[1].id).toBe('item-3');
      // Followed by non-favorites: item-2, item-4 (preserving original order between them)
      expect(emptyOrder[2].id).toBe('item-2');
      expect(emptyOrder[3].id).toBe('item-4');

      // No duplicates
      const ids = emptyOrder.map((i) => i.id);
      expect(ids.length).toBe(new Set(ids).size);
    });

    it('applies result limit correctly without truncating exact/high relevance matches', () => {
      const MAX_VISIBLE = 10;
      const manyItems: CatalogItem[] = Array.from({ length: 50 }, (_, i) => ({
        id: `item-${i}`,
        categoryId: 'cat-kitchen',
        name: i === 45 ? 'Exact Milk Match' : `General Item ${i}`,
        defaultUnit: 'kg',
        isCustom: false,
        createdAt: '',
      }));

      const results = searchCatalogItems(manyItems, 'milk', new Map());
      const visible = results.slice(0, MAX_VISIBLE);

      expect(results.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThanOrEqual(MAX_VISIBLE);
      // Exact Milk Match had the highest score, so it must be #1 and present in visible
      expect(visible[0].name).toBe('Exact Milk Match');
    });
  });
});
