import type { CatalogItem } from '../types/database';

/**
 * Calculates the Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits (insertions, deletions, substitutions).
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const lenA = a.length;
  const lenB = b.length;

  // Single-row DP optimization
  let prevRow = new Array<number>(lenA + 1);
  let currRow = new Array<number>(lenA + 1);

  for (let j = 0; j <= lenA; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= lenB; i++) {
    currRow[0] = i;
    const charB = b.charCodeAt(i - 1);

    for (let j = 1; j <= lenA; j++) {
      const cost = a.charCodeAt(j - 1) === charB ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,      // insertion
        prevRow[j] + 1,          // deletion
        prevRow[j - 1] + cost    // substitution
      );
    }

    // Swap row references
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[lenA];
}

/**
 * Splits text into normalized alphanumeric/Devanagari tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,()/\\.\-_+&|;:]+/)
    .filter((token) => token.length > 0);
}

/**
 * Simplifies common Romanized Hindi/Hinglish vowel and consonant variations
 * (e.g. "oo" -> "u", "ee" -> "i", "aa" -> "a", "v" -> "w", duplicate adjacent letters like "ii" -> "i").
 */
export function simplifyTransliteration(text: string): string {
  return text
    .toLowerCase()
    .replace(/oo/g, 'u')
    .replace(/ee/g, 'i')
    .replace(/aa/g, 'a')
    .replace(/v/g, 'w')
    .replace(/([a-z])\1+/g, '$1');
}

/**
 * Checks if a candidate word fuzzy-matches a query word within allowable typo distance.
 *
 * False Positive Controls:
 * - Query word length < 3: No fuzzy matching allowed (exact only).
 * - Query word length 3..4: max distance = 1.
 * - Query word length >= 5: max distance = 2.
 * - Absolute length difference cannot exceed max distance.
 * - Minimum similarity ratio >= 0.65.
 */
export function isFuzzyWordMatch(candidate: string, queryWord: string): { isMatch: boolean; distance: number } {
  const cLen = candidate.length;
  const qLen = queryWord.length;

  if (cLen === 0 || qLen === 0) return { isMatch: false, distance: 99 };
  if (candidate === queryWord) return { isMatch: true, distance: 0 };

  // Short queries (length < 3) must be exact matches only
  if (qLen < 3) {
    return { isMatch: false, distance: 99 };
  }

  // Check simplified transliteration equivalence (e.g. "dudh" === "doodh", "alu" === "aloo", "chaval" === "chawal", "haldii" === "haldi")
  const simpCand = simplifyTransliteration(candidate);
  const simpQuery = simplifyTransliteration(queryWord);
  if (simpCand === simpQuery) {
    return { isMatch: true, distance: 1 };
  }

  const maxDist = qLen <= 4 ? 1 : 2;

  // Direct Levenshtein check
  if (Math.abs(cLen - qLen) <= maxDist) {
    const dist = levenshteinDistance(candidate, queryWord);
    if (dist <= maxDist) {
      const maxLen = Math.max(cLen, qLen);
      const similarity = (maxLen - dist) / maxLen;
      if (similarity >= 0.65) {
        return { isMatch: true, distance: dist };
      }
    }
  }

  // Simplified transliteration Levenshtein check
  if (Math.abs(simpCand.length - simpQuery.length) <= 1) {
    const simpDist = levenshteinDistance(simpCand, simpQuery);
    if (simpDist <= 1) {
      return { isMatch: true, distance: simpDist + 1 };
    }
  }

  return { isMatch: false, distance: 99 };
}

export interface MatchDetails {
  score: number;
  isNameMatch: boolean;
}

/**
 * Computes a relevance score and match classification for a catalog item against a query.
 *
 * Scoring Hierarchy:
 * - 100: Exact full name match
 * - 90: Name starts with query
 * - 88: Multi-token query exact match in name (e.g. "toor dal" -> "Toor / Arhar Dal")
 * - 85: Exact alias match
 * - 80: Word in name starts with query
 * - 78: Multi-token query exact match across name & alias
 * - 75: Alias starts with query / word in alias starts with query
 * - 70: Substring in name
 * - 65: Substring in alias
 * - 48: Multi-token query fuzzy match
 * - 35..40: Fuzzy match on name tokens
 * - 25..30: Fuzzy match on alias tokens
 * - 0: No match (exclude)
 */
export function calculateItemSearchDetails(
  itemName: string,
  aliases: string[],
  query: string
): MatchDetails {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return { score: 1, isNameMatch: true };

  const cleanName = itemName.toLowerCase().trim();
  const nameTokens = tokenize(cleanName);
  const queryTokens = tokenize(cleanQuery);

  // 1. Exact full item name match
  if (cleanName === cleanQuery) {
    return { score: 100, isNameMatch: true };
  }

  // 2. Name starts with full query
  if (cleanName.startsWith(cleanQuery)) {
    return { score: 90, isNameMatch: true };
  }

  // 3. Exact alias match
  for (const alias of aliases) {
    const cleanAlias = alias.toLowerCase().trim();
    if (cleanAlias === cleanQuery) {
      return { score: 85, isNameMatch: false };
    }
  }

  // 4. Word in name starts with query
  if (nameTokens.some((tok) => tok.startsWith(cleanQuery))) {
    return { score: 80, isNameMatch: true };
  }

  // 5. Alias starts with query OR word in alias starts with query
  for (const alias of aliases) {
    const cleanAlias = alias.toLowerCase().trim();
    if (cleanAlias.startsWith(cleanQuery)) {
      return { score: 75, isNameMatch: false };
    }
    const aliasTokens = tokenize(cleanAlias);
    if (aliasTokens.some((tok) => tok.startsWith(cleanQuery))) {
      return { score: 75, isNameMatch: false };
    }
  }

  // 6. Substring in name
  if (cleanName.includes(cleanQuery)) {
    return { score: 70, isNameMatch: true };
  }

  // 7. Substring in alias
  for (const alias of aliases) {
    if (alias.toLowerCase().includes(cleanQuery)) {
      return { score: 65, isNameMatch: false };
    }
  }

  // 8. Multi-token queries (e.g. "tur dal", "toor dal", "sarson ka tel", "fresh milk")
  if (queryTokens.length > 1) {
    let allTokensMatched = true;
    let anyFuzzy = false;
    let allInName = true;

    for (const qWord of queryTokens) {
      let wordMatched = false;

      // Check name tokens first
      for (const nWord of nameTokens) {
        if (nWord.includes(qWord) || qWord.includes(nWord)) {
          wordMatched = true;
          break;
        }
        const fuzzy = isFuzzyWordMatch(nWord, qWord);
        if (fuzzy.isMatch) {
          wordMatched = true;
          anyFuzzy = true;
          break;
        }
      }

      if (!wordMatched) {
        allInName = false;
        // Check alias tokens
        for (const alias of aliases) {
          const aliasTokens = tokenize(alias);
          for (const aWord of aliasTokens) {
            if (aWord.includes(qWord) || qWord.includes(aWord)) {
              wordMatched = true;
              break;
            }
            const fuzzy = isFuzzyWordMatch(aWord, qWord);
            if (fuzzy.isMatch) {
              wordMatched = true;
              anyFuzzy = true;
              break;
            }
          }
          if (wordMatched) break;
        }
      }

      if (!wordMatched) {
        allTokensMatched = false;
        break;
      }
    }

    if (allTokensMatched) {
      if (allInName && !anyFuzzy) {
        return { score: 88, isNameMatch: true };
      } else if (!anyFuzzy) {
        return { score: 78, isNameMatch: false };
      } else {
        return { score: 48, isNameMatch: allInName };
      }
    }
  }

  // 9. Single-token / Short-phrase fuzzy match (only for query length >= 3)
  if (cleanQuery.length >= 3) {
    // 9A. Fuzzy match on item name tokens
    let bestNameFuzzyDist = 99;
    for (const nWord of nameTokens) {
      const fuzzy = isFuzzyWordMatch(nWord, cleanQuery);
      if (fuzzy.isMatch && fuzzy.distance < bestNameFuzzyDist) {
        bestNameFuzzyDist = fuzzy.distance;
      }
    }
    if (bestNameFuzzyDist <= 2) {
      return { score: 40 - (bestNameFuzzyDist - 1) * 5, isNameMatch: true };
    }

    // 9B. Fuzzy match on alias tokens
    let bestAliasFuzzyDist = 99;
    for (const alias of aliases) {
      const aliasTokens = tokenize(alias);
      for (const aWord of aliasTokens) {
        const fuzzy = isFuzzyWordMatch(aWord, cleanQuery);
        if (fuzzy.isMatch && fuzzy.distance < bestAliasFuzzyDist) {
          bestAliasFuzzyDist = fuzzy.distance;
        }
      }
    }
    if (bestAliasFuzzyDist <= 2) {
      return { score: 30 - (bestAliasFuzzyDist - 1) * 5, isNameMatch: false };
    }
  }

  return { score: 0, isNameMatch: false };
}

export function calculateItemSearchScore(
  itemName: string,
  aliases: string[],
  query: string
): number {
  return calculateItemSearchDetails(itemName, aliases, query).score;
}

/**
 * Searches and ranks catalog items by deterministic relevance score and tie-breakers.
 *
 * Tie-Breaker Ordering:
 * 1. Higher relevance score
 * 2. Exact/substring name match before alias-only match
 * 3. Shorter normalized item name length
 * 4. Stable original catalog ordering
 */
export function searchCatalogItems(
  items: CatalogItem[],
  query: string,
  aliasMap: Map<string, string[]>
): CatalogItem[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return items;
  }

  interface ScoredEntry {
    item: CatalogItem;
    score: number;
    isNameMatch: boolean;
    nameLength: number;
    originalIndex: number;
  }

  const scored: ScoredEntry[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemAliases = aliasMap.get(item.id) || [];
    const details = calculateItemSearchDetails(item.name, itemAliases, trimmed);

    if (details.score > 0) {
      scored.push({
        item,
        score: details.score,
        isNameMatch: details.isNameMatch,
        nameLength: item.name.length,
        originalIndex: i,
      });
    }
  }

  // Deterministic sorting with 4 tie-breakers
  scored.sort((a, b) => {
    // 1. Higher relevance score
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // 2. Direct name match before alias-only match
    if (a.isNameMatch !== b.isNameMatch) {
      return a.isNameMatch ? -1 : 1;
    }
    // 3. Shorter item name length
    if (a.nameLength !== b.nameLength) {
      return a.nameLength - b.nameLength;
    }
    // 4. Stable original catalog ordering
    return a.originalIndex - b.originalIndex;
  });

  return scored.map((s) => s.item);
}

/**
 * Safely segments text into matching and non-matching chunks for UI highlighting
 * without dangerouslySetInnerHTML.
 */
export function getHighlightedChunks(
  text: string,
  query: string
): { text: string; isMatch: boolean }[] {
  const trimmed = query.trim();
  if (!trimmed || !text) {
    return [{ text, isMatch: false }];
  }

  // Tokenize query words
  const rawTokens = trimmed
    .split(/[\s,()/\\.\-_+&|;:]+/)
    .filter((t) => t.length > 0);

  if (rawTokens.length === 0) {
    return [{ text, isMatch: false }];
  }

  // Sort tokens by length descending so longer phrases match first
  const tokens = [...rawTokens].sort((a, b) => b.length - a.length);
  const tokenSet = new Set(tokens.map((t) => t.toLowerCase()));

  // Escape regex special chars
  const escapedTokens = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = `(${escapedTokens.join('|')})`;
  const regex = new RegExp(pattern, 'gi');
  const parts = text.split(regex);

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      isMatch: tokenSet.has(part.toLowerCase()),
    }));
}

/**
 * Finds the best matching alias for secondary badge display.
 * Prioritizes exact match, then prefix/substring, then fuzzy match.
 */
export function findMatchingAlias(aliases: string[], query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q || !aliases || aliases.length === 0) return null;

  // 1. Exact alias match first
  for (const alias of aliases) {
    if (alias.toLowerCase() === q) {
      return alias;
    }
  }

  // 2. Prefix or substring match
  for (const alias of aliases) {
    const lower = alias.toLowerCase();
    if (lower.startsWith(q) || lower.includes(q)) {
      return alias;
    }
  }

  // 3. Fuzzy token match
  for (const alias of aliases) {
    const lower = alias.toLowerCase();
    if (isFuzzyWordMatch(lower, q).isMatch) {
      return alias;
    }
  }

  return null;
}
