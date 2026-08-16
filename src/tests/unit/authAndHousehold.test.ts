import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useAuthStore } from '../../stores/useAuthStore';

describe('Auth & Household Store Unit Tests', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      session: null,
      household: null,
      membership: null,
      isLoading: false,
      isInitialized: false,
      error: null,
    });
  });

  it('initializes with default unauthenticated state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.household).toBeNull();
    expect(state.membership).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('updates household and membership state properly', () => {
    const mockHousehold = {
      id: 'hh-123',
      name: 'The Verma Family',
      created_by: 'user-1',
      created_at: new Date().toISOString(),
    };

    const mockMembership = {
      id: 'member-1',
      household_id: 'hh-123',
      user_id: 'user-1',
      role: 'owner' as const,
      joined_at: new Date().toISOString(),
      email: 'user@example.com',
    };

    useAuthStore.getState().setHousehold(mockHousehold, mockMembership);

    const updated = useAuthStore.getState();
    expect(updated.household?.name).toBe('The Verma Family');
    expect(updated.membership?.role).toBe('owner');
  });

  it('signOut clears user and household state', async () => {
    useAuthStore.setState({
      user: { id: 'user-1', email: 'test@example.com' } as any,
      household: { id: 'hh-1', name: 'Home' } as any,
      membership: { id: 'm-1', role: 'member' } as any,
    });

    await useAuthStore.getState().signOut();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.household).toBeNull();
    expect(state.membership).toBeNull();
  });

  it('clears error state on clearError action', () => {
    useAuthStore.setState({ error: 'Invalid credentials' });
    expect(useAuthStore.getState().error).toBe('Invalid credentials');

    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });
});
