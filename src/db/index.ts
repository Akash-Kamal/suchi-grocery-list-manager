import { db } from './schema';

// Trigger initial seed check on database access
db.open().then(() => {
  db.seedIfEmpty().catch((err) => {
    console.error('Error seeding initial database data:', err);
  });
}).catch((err) => {
  console.error('Failed to open Dexie database:', err);
});

export { db, SuchiDatabase } from './schema';
