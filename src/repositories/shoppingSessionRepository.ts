import { db as defaultDb, SuchiDatabase } from '../db';
import type { ShoppingSession, ShoppingSessionEvent, ShoppingEventType } from '../types/database';

export class ShoppingSessionRepository {
  private db: SuchiDatabase;

  constructor(db: SuchiDatabase = defaultDb) {
    this.db = db;
  }

  /**
   * Returns the currently open (non-completed) session for the given listId,
   * or creates a new one if none exists. Never creates a duplicate open session.
   */
  async openSession(listId: string): Promise<ShoppingSession> {
    // Check for an existing open session for this list
    const existing = await this.db.shoppingSessions
      .where('listId')
      .equals(listId)
      .filter((s) => s.completedAt === null)
      .first();

    if (existing) return existing;

    const session: ShoppingSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      listId,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    await this.db.shoppingSessions.add(session);
    return session;
  }

  /**
   * Marks the session as completed with the current timestamp.
   */
  async completeSession(sessionId: string): Promise<void> {
    await this.db.shoppingSessions.update(sessionId, {
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Records a single shopping event (mark_bought, unmarked, quantity_changed).
   */
  async recordEvent(
    sessionId: string,
    listItemId: string,
    eventType: ShoppingEventType
  ): Promise<ShoppingSessionEvent> {
    const event: ShoppingSessionEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      listItemId,
      eventType,
      timestamp: new Date().toISOString(),
    };

    await this.db.shoppingSessionEvents.add(event);
    return event;
  }

  /**
   * Returns the open (non-completed) session for a list, or null if none.
   */
  async getOpenSession(listId: string): Promise<ShoppingSession | null> {
    const session = await this.db.shoppingSessions
      .where('listId')
      .equals(listId)
      .filter((s) => s.completedAt === null)
      .first();

    return session ?? null;
  }

  /**
   * Returns all completed sessions for a list.
   */
  async getCompletedSessions(listId: string): Promise<ShoppingSession[]> {
    return this.db.shoppingSessions
      .where('listId')
      .equals(listId)
      .filter((s) => s.completedAt !== null)
      .toArray();
  }

  /**
   * Returns all events belonging to a given session.
   */
  async getSessionEvents(sessionId: string): Promise<ShoppingSessionEvent[]> {
    return this.db.shoppingSessionEvents
      .where('sessionId')
      .equals(sessionId)
      .toArray();
  }

  /**
   * Returns the set of listIds that have at least one completed session.
   * Used by historyRepository to exclude abandoned sessions from recurring stats.
   */
  async getListIdsWithCompletedSessions(): Promise<Set<string>> {
    const completedSessions = await this.db.shoppingSessions
      .filter((s) => s.completedAt !== null)
      .toArray();

    return new Set(completedSessions.map((s) => s.listId));
  }
}

export const shoppingSessionRepository = new ShoppingSessionRepository();
