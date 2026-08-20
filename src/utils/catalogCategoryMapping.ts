import { SEED_CATEGORIES } from '../db/seedData';

/**
 * Deterministically maps online category tags, hierarchy text, or product names
 * into one of the 8 predefined standard SOOCHI categories:
 * - cat-kitchen: 'Kitchen & Staples'
 * - cat-beverages: 'Beverages & Tea/Coffee'
 * - cat-snacks: 'Snacks & Packaged Food'
 * - cat-personal: 'Personal Care'
 * - cat-cleaning: 'Cleaning & Household'
 * - cat-baby: 'Baby Care'
 * - cat-pet: 'Pet Care'
 * - cat-misc: 'Miscellaneous'
 */
export function mapOnlineCategoryToSoochiCategoryId(
  categoriesTags?: string[] | null,
  categoriesString?: string | null,
  productName?: string | null
): string {
  const combinedText = [
    ...(categoriesTags || []),
    categoriesString || '',
    productName || '',
  ]
    .join(' ')
    .toLowerCase();

  if (!combinedText.trim()) {
    return 'cat-kitchen'; // Safe default for grocery items
  }

  // 1. Baby Care
  if (
    /(baby|diaper|napp|infant|toddler|baby food|formula|pediatric)/i.test(combinedText)
  ) {
    return 'cat-baby';
  }

  // 2. Pet Care
  if (
    /(pet|dog|cat|puppy|kitten|bird|kibble|pet food|cat food|dog food)/i.test(combinedText)
  ) {
    return 'cat-pet';
  }

  // 3. Cleaning & Household
  if (
    /(cleaner|detergent|dishwash|toilet cleaner|bleach|disinfectant|phenyl|lizol|harpic|garbage bag|napkin|tissue|foil|sponge|floor cleaner|fabric|washing powder)/i.test(combinedText)
  ) {
    return 'cat-cleaning';
  }

  // 4. Personal Care
  if (
    /(shampoo|conditioner|soap|body wash|handwash|toothpaste|toothbrush|lotion|moisturiz|face wash|sunscreen|hair oil|deodorant|perfume|cream|shaving|cosmetic|skincare|oral care|hygiene)/i.test(combinedText)
  ) {
    return 'cat-personal';
  }

  // 5. Beverages & Tea/Coffee
  if (
    /(beverage|drink|tea|chai|coffee|espresso|green tea|juice|soda|cola|energy drink|squash|syrup|mineral water|tonic|soft drink)/i.test(combinedText)
  ) {
    return 'cat-beverages';
  }

  // 6. Snacks & Packaged Food
  if (
    /(snack|biscuit|cookie|chip|crisp|wafer|noodle|maggi|ramen|pasta|namkeen|bhujia|chocolate|candy|sweet|confectionery|popcorn|cracker|cereal bar|ready to eat)/i.test(combinedText)
  ) {
    return 'cat-snacks';
  }

  // 7. Kitchen & Staples (Default food / cooking / dairy / produce)
  if (
    /(atta|flour|wheat|rice|basmati|dal|pulse|lentil|oil|mustard|ghee|butter|sugar|salt|spice|masala|turmeric|chili|cumin|coriander|onion|potato|tomato|paneer|curd|dahi|milk|dairy|grain|vegetable|fruit|produce|sauce|vinegar|pickle|grocer)/i.test(combinedText)
  ) {
    return 'cat-kitchen';
  }

  // Fallback to Kitchen & Staples for groceries, or Miscellaneous
  return 'cat-kitchen';
}

/**
 * Returns human-readable category name for a given SOOCHI category ID.
 */
export function getCategoryNameById(categoryId: string): string {
  const category = SEED_CATEGORIES.find((c) => c.id === categoryId);
  return category ? category.name : 'Kitchen & Staples';
}
