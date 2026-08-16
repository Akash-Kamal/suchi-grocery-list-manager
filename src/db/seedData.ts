import type { Category, CatalogItem, ItemAlias, UserPreference } from '../types/database';

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat-kitchen', name: 'Kitchen & Staples', sortOrder: 1, icon: 'Utensils' },
  { id: 'cat-personal', name: 'Personal Care', sortOrder: 2, icon: 'Sparkles' },
  { id: 'cat-cleaning', name: 'Cleaning & Household', sortOrder: 3, icon: 'Broom' },
  { id: 'cat-beverages', name: 'Beverages & Tea/Coffee', sortOrder: 4, icon: 'Coffee' },
  { id: 'cat-snacks', name: 'Snacks & Packaged Food', sortOrder: 5, icon: 'Cookie' },
  { id: 'cat-baby', name: 'Baby Care', sortOrder: 6, icon: 'Baby' },
  { id: 'cat-pet', name: 'Pet Care', sortOrder: 7, icon: 'Dog' },
  { id: 'cat-misc', name: 'Miscellaneous', sortOrder: 8, icon: 'Package' },
];

export const SEED_CATALOG_ITEMS: CatalogItem[] = [
  // Kitchen & Staples (Atta, Rice, Dal, Oils, Spices, Dairy, Fresh produce)
  { id: 'item-atta', categoryId: 'cat-kitchen', name: 'Chakki Fresh Atta', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-rice-basmati', categoryId: 'cat-kitchen', name: 'Basmati Rice', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-rice-boiled', categoryId: 'cat-kitchen', name: 'Sona Masoori / Boiled Rice', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-toor-dal', categoryId: 'cat-kitchen', name: 'Toor / Arhar Dal', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-moong-dal', categoryId: 'cat-kitchen', name: 'Moong Dal (Yellow)', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-chana-dal', categoryId: 'cat-kitchen', name: 'Chana Dal', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-urad-dal', categoryId: 'cat-kitchen', name: 'Urad Dal', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-mustard-oil', categoryId: 'cat-kitchen', name: 'Mustard Oil (Sarson Oil)', defaultUnit: 'L', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-sunflower-oil', categoryId: 'cat-kitchen', name: 'Refined Sunflower Oil', defaultUnit: 'L', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-ghee', categoryId: 'cat-kitchen', name: 'Pure Desi Ghee', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-sugar', categoryId: 'cat-kitchen', name: 'Sugar (Cheeni)', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-salt', categoryId: 'cat-kitchen', name: 'Iodized Salt (Namak)', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-turmeric', categoryId: 'cat-kitchen', name: 'Turmeric Powder (Haldi)', defaultUnit: 'g', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-red-chili', categoryId: 'cat-kitchen', name: 'Red Chili Powder (Lal Mirch)', defaultUnit: 'g', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-coriander-pow', categoryId: 'cat-kitchen', name: 'Coriander Powder (Dhania)', defaultUnit: 'g', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-garam-masala', categoryId: 'cat-kitchen', name: 'Garam Masala', defaultUnit: 'g', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-cumin-seeds', categoryId: 'cat-kitchen', name: 'Cumin Seeds (Jeera)', defaultUnit: 'g', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-ginger-garlic-paste', categoryId: 'cat-kitchen', name: 'Ginger Garlic Paste', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-milk', categoryId: 'cat-kitchen', name: 'Fresh Milk', defaultUnit: 'L', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-dahi', categoryId: 'cat-kitchen', name: 'Curd / Dahi', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-paneer', categoryId: 'cat-kitchen', name: 'Fresh Paneer', defaultUnit: 'g', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-onions', categoryId: 'cat-kitchen', name: 'Onions (Pyaz)', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-potatoes', categoryId: 'cat-kitchen', name: 'Potatoes (Aloo)', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-tomatoes', categoryId: 'cat-kitchen', name: 'Tomatoes (Tamatar)', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-green-chilies', categoryId: 'cat-kitchen', name: 'Green Chilies (Hari Mirch)', defaultUnit: 'g', isCustom: false, createdAt: new Date().toISOString() },

  // Personal Care
  { id: 'item-toothpaste', categoryId: 'cat-personal', name: 'Toothpaste', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-bath-soap', categoryId: 'cat-personal', name: 'Bathing Soap Bar', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-shampoo', categoryId: 'cat-personal', name: 'Hair Shampoo', defaultUnit: 'bottle', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-hair-oil', categoryId: 'cat-personal', name: 'Coconut Hair Oil', defaultUnit: 'bottle', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-handwash', categoryId: 'cat-personal', name: 'Liquid Handwash', defaultUnit: 'bottle', isCustom: false, createdAt: new Date().toISOString() },

  // Cleaning & Household
  { id: 'item-detergent-powder', categoryId: 'cat-cleaning', name: 'Washing Detergent Powder', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-dishwash-bar', categoryId: 'cat-cleaning', name: 'Dishwash Bar / Gel', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-floor-cleaner', categoryId: 'cat-cleaning', name: 'Floor Cleaner (Lizol/Phenyl)', defaultUnit: 'bottle', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-toilet-cleaner', categoryId: 'cat-cleaning', name: 'Toilet Cleaner (Harpic)', defaultUnit: 'bottle', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-garbage-bags', categoryId: 'cat-cleaning', name: 'Garbage Bags', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },

  // Beverages & Tea/Coffee
  { id: 'item-tea-leaves', categoryId: 'cat-beverages', name: 'Tea Leaves (Chai Patti)', defaultUnit: 'g', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-coffee', categoryId: 'cat-beverages', name: 'Instant Coffee Powder', defaultUnit: 'g', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-green-tea', categoryId: 'cat-beverages', name: 'Green Tea Bags', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },

  // Snacks & Packaged Food
  { id: 'item-biscuits', categoryId: 'cat-snacks', name: 'Tea Biscuits (Parle-G / Marie)', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-namkeen', categoryId: 'cat-snacks', name: 'Aloo Bhujia / Namkeen', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-poha', categoryId: 'cat-snacks', name: 'Poha (Flattened Rice)', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-noodles', categoryId: 'cat-snacks', name: 'Instant Noodles (Maggi)', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-oats', categoryId: 'cat-snacks', name: 'Rolled Oats', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },

  // Baby Care
  { id: 'item-baby-diapers', categoryId: 'cat-baby', name: 'Baby Diapers', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-baby-wipes', categoryId: 'cat-baby', name: 'Baby Wet Wipes', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },

  // Pet Care
  { id: 'item-dog-food', categoryId: 'cat-pet', name: 'Dog Food Kibble', defaultUnit: 'kg', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-cat-food', categoryId: 'cat-pet', name: 'Cat Food Wet Pouch', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },

  // Miscellaneous
  { id: 'item-matchbox', categoryId: 'cat-misc', name: 'Matchbox / Lighter', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
  { id: 'item-foil', categoryId: 'cat-misc', name: 'Aluminum Foil Roll', defaultUnit: 'pack', isCustom: false, createdAt: new Date().toISOString() },
];

export const SEED_ITEM_ALIASES: ItemAlias[] = [
  { id: 'alias-1', catalogItemId: 'item-atta', aliasText: 'Wheat Flour', locale: 'en' },
  { id: 'alias-2', catalogItemId: 'item-atta', aliasText: 'Gehun Ka Atta', locale: 'hi' },
  { id: 'alias-3', catalogItemId: 'item-toor-dal', aliasText: 'Arhar Dal', locale: 'hi' },
  { id: 'alias-4', catalogItemId: 'item-onions', aliasText: 'Pyaz', locale: 'hi' },
  { id: 'alias-5', catalogItemId: 'item-onions', aliasText: 'Kanda', locale: 'mr' },
  { id: 'alias-6', catalogItemId: 'item-potatoes', aliasText: 'Aloo', locale: 'hi' },
  { id: 'alias-7', catalogItemId: 'item-tomatoes', aliasText: 'Tamatar', locale: 'hi' },
  { id: 'alias-8', catalogItemId: 'item-mustard-oil', aliasText: 'Sarson Ka Tel', locale: 'hi' },
  { id: 'alias-9', catalogItemId: 'item-tea-leaves', aliasText: 'Chai Patti', locale: 'hi' },
  { id: 'alias-10', catalogItemId: 'item-sugar', aliasText: 'Cheeni', locale: 'hi' },
  { id: 'alias-11', catalogItemId: 'item-salt', aliasText: 'Namak', locale: 'hi' },
  { id: 'alias-12', catalogItemId: 'item-turmeric', aliasText: 'Haldi', locale: 'hi' },
  { id: 'alias-13', catalogItemId: 'item-red-chili', aliasText: 'Lal Mirch', locale: 'hi' },
  { id: 'alias-14', catalogItemId: 'item-coriander-pow', aliasText: 'Dhania Powder', locale: 'hi' },
  { id: 'alias-15', catalogItemId: 'item-noodles', aliasText: 'Maggi', locale: 'en' },
];

export const SEED_USER_PREFERENCE: UserPreference = {
  id: 1,
  language: 'en',
  theme: 'system',
  measurementSystem: 'metric',
  defaultStoreOrder: ['cat-kitchen', 'cat-beverages', 'cat-snacks', 'cat-personal', 'cat-cleaning', 'cat-baby', 'cat-pet', 'cat-misc'],
  budgetCeiling: null,
  reminderDayOfMonth: 1,
};
