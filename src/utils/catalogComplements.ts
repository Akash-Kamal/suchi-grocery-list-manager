/**
 * Explicit, deterministic complementary item relationships for Indian grocery catalog items.
 * Maps catalogItemId -> complementary catalogItemIds.
 */

export const CATALOG_COMPLEMENTS: Record<string, string[]> = {
  // Grains & Flours
  'item-atta': ['item-mustard-oil', 'item-sunflower-oil', 'item-salt', 'item-ghee'],
  'item-rice-basmati': ['item-toor-dal', 'item-moong-dal', 'item-chana-dal', 'item-urad-dal', 'item-mustard-oil', 'item-sunflower-oil', 'item-ghee'],
  'item-rice-boiled': ['item-toor-dal', 'item-moong-dal', 'item-chana-dal', 'item-urad-dal', 'item-mustard-oil', 'item-sunflower-oil', 'item-ghee'],

  // Lentils & Pulses (Dals)
  'item-toor-dal': ['item-rice-basmati', 'item-rice-boiled', 'item-mustard-oil', 'item-sunflower-oil', 'item-turmeric', 'item-cumin-seeds', 'item-salt'],
  'item-moong-dal': ['item-rice-basmati', 'item-rice-boiled', 'item-mustard-oil', 'item-sunflower-oil', 'item-turmeric', 'item-cumin-seeds', 'item-salt'],
  'item-chana-dal': ['item-rice-basmati', 'item-rice-boiled', 'item-mustard-oil', 'item-sunflower-oil', 'item-turmeric', 'item-cumin-seeds', 'item-salt'],
  'item-urad-dal': ['item-rice-basmati', 'item-rice-boiled', 'item-mustard-oil', 'item-sunflower-oil', 'item-turmeric', 'item-cumin-seeds', 'item-salt'],

  // Cooking Oils & Ghee
  'item-mustard-oil': ['item-turmeric', 'item-red-chili', 'item-coriander-pow', 'item-garam-masala', 'item-salt', 'item-onions', 'item-potatoes'],
  'item-sunflower-oil': ['item-turmeric', 'item-red-chili', 'item-coriander-pow', 'item-garam-masala', 'item-salt', 'item-onions', 'item-potatoes'],
  'item-ghee': ['item-atta', 'item-rice-basmati', 'item-toor-dal', 'item-sugar'],

  // Vegetables & Fresh Produce
  'item-onions': ['item-potatoes', 'item-tomatoes', 'item-green-chilies', 'item-ginger-garlic-paste', 'item-mustard-oil', 'item-sunflower-oil', 'item-salt'],
  'item-potatoes': ['item-onions', 'item-tomatoes', 'item-green-chilies', 'item-ginger-garlic-paste', 'item-mustard-oil', 'item-sunflower-oil', 'item-salt'],
  'item-tomatoes': ['item-onions', 'item-potatoes', 'item-green-chilies', 'item-ginger-garlic-paste', 'item-mustard-oil', 'item-sunflower-oil', 'item-salt'],
  'item-green-chilies': ['item-onions', 'item-potatoes', 'item-tomatoes', 'item-ginger-garlic-paste'],
  'item-ginger-garlic-paste': ['item-onions', 'item-tomatoes', 'item-turmeric', 'item-red-chili', 'item-garam-masala'],

  // Spices & Seasonings
  'item-salt': ['item-turmeric', 'item-red-chili', 'item-coriander-pow', 'item-mustard-oil', 'item-sunflower-oil'],
  'item-turmeric': ['item-red-chili', 'item-coriander-pow', 'item-garam-masala', 'item-cumin-seeds', 'item-salt'],
  'item-red-chili': ['item-turmeric', 'item-coriander-pow', 'item-garam-masala', 'item-salt'],
  'item-coriander-pow': ['item-turmeric', 'item-red-chili', 'item-garam-masala', 'item-salt'],
  'item-garam-masala': ['item-turmeric', 'item-red-chili', 'item-coriander-pow', 'item-salt'],
  'item-cumin-seeds': ['item-turmeric', 'item-mustard-oil', 'item-toor-dal', 'item-moong-dal'],

  // Tea, Coffee & Breakfast
  'item-tea-leaves': ['item-milk', 'item-sugar', 'item-biscuits'],
  'item-coffee': ['item-milk', 'item-sugar', 'item-biscuits'],
  'item-green-tea': ['item-sugar', 'item-biscuits', 'item-oats'],
  'item-milk': ['item-tea-leaves', 'item-coffee', 'item-sugar', 'item-dahi', 'item-paneer', 'item-oats'],
  'item-sugar': ['item-tea-leaves', 'item-coffee', 'item-milk'],
  'item-poha': ['item-mustard-oil', 'item-turmeric', 'item-green-chilies', 'item-onions', 'item-peanuts'],
  'item-oats': ['item-milk', 'item-sugar', 'item-green-tea'],
  'item-biscuits': ['item-tea-leaves', 'item-coffee'],
  'item-namkeen': ['item-tea-leaves', 'item-coffee', 'item-biscuits'],
  'item-noodles': ['item-sauce', 'item-biscuits'],

  // Dairy
  'item-dahi': ['item-milk', 'item-sugar', 'item-salt'],
  'item-paneer': ['item-onions', 'item-tomatoes', 'item-ginger-garlic-paste', 'item-garam-masala', 'item-mustard-oil', 'item-sunflower-oil'],

  // Personal Care
  'item-toothpaste': ['item-bath-soap', 'item-shampoo', 'item-handwash'],
  'item-bath-soap': ['item-toothpaste', 'item-shampoo', 'item-handwash', 'item-hair-oil'],
  'item-shampoo': ['item-hair-oil', 'item-bath-soap', 'item-handwash'],
  'item-hair-oil': ['item-shampoo', 'item-bath-soap'],
  'item-handwash': ['item-bath-soap', 'item-toothpaste'],

  // Cleaning & Household
  'item-detergent-powder': ['item-dishwash-bar', 'item-floor-cleaner', 'item-toilet-cleaner', 'item-garbage-bags'],
  'item-dishwash-bar': ['item-detergent-powder', 'item-floor-cleaner', 'item-garbage-bags'],
  'item-floor-cleaner': ['item-toilet-cleaner', 'item-dishwash-bar', 'item-garbage-bags'],
  'item-toilet-cleaner': ['item-floor-cleaner', 'item-detergent-powder', 'item-garbage-bags'],
  'item-garbage-bags': ['item-dishwash-bar', 'item-floor-cleaner', 'item-toilet-cleaner'],

  // Baby Care
  'item-baby-diapers': ['item-baby-wipes'],
  'item-baby-wipes': ['item-baby-diapers'],

  // Pet Care
  'item-dog-food': ['item-cat-food'],
  'item-cat-food': ['item-dog-food'],

  // Miscellaneous
  'item-matchbox': ['item-foil'],
  'item-foil': ['item-garbage-bags', 'item-matchbox'],
};

/**
 * Returns all complementary catalog item IDs for a given catalog item ID.
 */
export function getComplementsForItem(catalogItemId: string): string[] {
  return CATALOG_COMPLEMENTS[catalogItemId] || [];
}
