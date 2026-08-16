import { db as defaultDb, SuchiDatabase } from '../db';
import { SEED_USER_PREFERENCE } from '../db/seedData';
import type { UserPreference } from '../types/database';

export class PreferenceRepository {
  private db: SuchiDatabase;

  constructor(db: SuchiDatabase = defaultDb) {
    this.db = db;
  }

  async getPreferences(): Promise<UserPreference> {
    const prefs = await this.db.userPreferences.get(1);
    if (!prefs) {
      await this.db.userPreferences.put(SEED_USER_PREFERENCE);
      return SEED_USER_PREFERENCE;
    }
    return prefs;
  }

  async updatePreferences(updates: Partial<UserPreference>): Promise<UserPreference> {
    const current = await this.getPreferences();
    const updated: UserPreference = {
      ...current,
      ...updates,
      id: 1, // enforce singleton ID
    };
    await this.db.userPreferences.put(updated);
    return updated;
  }
}

export const preferenceRepository = new PreferenceRepository();
