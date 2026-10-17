import AsyncStorage from '@react-native-async-storage/async-storage';

import { createHistoryStore, type HistoryEntry } from './historyStore';

export type { HistoryEntry } from './historyStore';
export { makeHistoryEntry } from './historyStore';

/** App-wide history store persisted with AsyncStorage. */
export const historyStore = createHistoryStore(AsyncStorage);

/**
 * In-memory hand-off of results to the Result screen. A fresh match is put here before
 * navigating, so the screen can render even if persisting to history failed.
 */
const recentResults = new Map<string, HistoryEntry>();

export function rememberResult(entry: HistoryEntry): void {
  recentResults.set(entry.id, entry);
}

export async function findResult(id: string): Promise<HistoryEntry | null> {
  return recentResults.get(id) ?? (await historyStore.get(id));
}
