/**
 * History store tests against an in-memory KeyValueStorage TEST DOUBLE.
 */
import {
  createHistoryStore,
  HISTORY_MAX_ENTRIES,
  HISTORY_STORAGE_KEY,
  makeHistoryEntry,
  parseHistoryBlob,
  type HistoryEntry,
  type KeyValueStorage,
} from '../src/history/historyStore';
import { matchedBody } from './fixtures';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  failWrites = false;
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('disk full');
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
}

function entry(i: number, at = new Date(Date.UTC(2026, 9, 17, 12, 0, i))): HistoryEntry {
  const response = matchedBody({ request_id: `req_${i}` });
  response.track = { ...response.track, title: `Song ${i}` };
  return makeHistoryEntry(response, 'microphone', at);
}

describe('history store', () => {
  it('persists entries newest first and reloads them in a fresh store (app restart)', async () => {
    const storage = new MemoryStorage();
    const a = createHistoryStore(storage);
    await a.add(entry(1));
    await a.add(entry(2));
    const raw = storage.data.get(HISTORY_STORAGE_KEY);
    expect(raw && JSON.parse(raw).version).toBe(1);

    const b = createHistoryStore(storage);
    const loaded = await b.load();
    expect(loaded.map((e) => e.id)).toEqual(['req_2', 'req_1']);
    expect(loaded[0]?.response.track.title).toBe('Song 2');
    expect(await b.get('req_1')).toMatchObject({ id: 'req_1' });
    expect(await b.get('nope')).toBeNull();
  });

  it('dedupes by id (re-adding moves the entry, no duplicates)', async () => {
    const store = createHistoryStore(new MemoryStorage());
    await store.add(entry(1));
    await store.add(entry(2));
    const again = makeHistoryEntry(entry(1).response, 'microphone', new Date(Date.UTC(2026, 9, 18)));
    const list = await store.add(again);
    expect(list.map((e) => e.id)).toEqual(['req_1', 'req_2']);
  });

  it(`caps at ${HISTORY_MAX_ENTRIES} entries, dropping the oldest`, async () => {
    const storage = new MemoryStorage();
    const store = createHistoryStore(storage);
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < HISTORY_MAX_ENTRIES + 5; i++) {
      await store.add(entry(i, new Date(base + i * 1000)));
    }
    const list = await createHistoryStore(storage).load();
    expect(list).toHaveLength(HISTORY_MAX_ENTRIES);
    expect(list[0]?.id).toBe(`req_${HISTORY_MAX_ENTRIES + 4}`);
    expect(list.some((e) => e.id === 'req_0')).toBe(false);
  });

  it('serialises concurrent adds without losing entries', async () => {
    const store = createHistoryStore(new MemoryStorage());
    await Promise.all([1, 2, 3, 4, 5].map((i) => store.add(entry(i))));
    expect((await store.load()).map((e) => e.id).sort()).toEqual(['req_1', 'req_2', 'req_3', 'req_4', 'req_5']);
  });

  it('clear() removes everything and notifies subscribers', async () => {
    const storage = new MemoryStorage();
    const store = createHistoryStore(storage);
    const seen: number[] = [];
    const unsubscribe = store.subscribe((e) => seen.push(e.length));
    await store.add(entry(1));
    await store.clear();
    unsubscribe();
    await store.add(entry(2));
    expect(seen).toEqual([1, 0]);
    expect(storage.data.has(HISTORY_STORAGE_KEY)).toBe(true);
    expect(await createHistoryStore(storage).load()).toHaveLength(1);
  });

  it('refuses to store an invalid entry (e.g. non-matched response)', async () => {
    const store = createHistoryStore(new MemoryStorage());
    const bad = { ...entry(1), response: { ...entry(1).response, status: 'no_match', track: null } };
    await expect(store.add(bad as unknown as HistoryEntry)).rejects.toThrow();
    expect(await store.load()).toEqual([]);
  });

  it('surfaces write failures to the caller but keeps working', async () => {
    const storage = new MemoryStorage();
    const store = createHistoryStore(storage);
    storage.failWrites = true;
    await expect(store.add(entry(1))).rejects.toThrow('disk full');
    storage.failWrites = false;
    await store.add(entry(2));
    expect((await store.load()).map((e) => e.id)).toEqual(['req_2']);
  });

  it('treats a storage read error as empty history', async () => {
    const storage = new MemoryStorage();
    storage.getItem = async () => {
      throw new Error('boom');
    };
    expect(await createHistoryStore(storage).load()).toEqual([]);
  });
});

describe('parseHistoryBlob (corrupt / foreign data)', () => {
  it.each([
    ['null', null],
    ['empty string', ''],
    ['invalid JSON', '{not json'],
    ['a number', '42'],
    ['entries not an array', JSON.stringify({ version: 1, entries: 'x' })],
    ['a bare array', JSON.stringify([1, 2, 3])],
  ])('%s → []', (_n, raw) => {
    expect(parseHistoryBlob(raw)).toEqual([]);
  });

  it('drops invalid entries but keeps valid ones', () => {
    const good = entry(1);
    const raw = JSON.stringify({
      version: 1,
      entries: [
        good,
        { ...entry(2), recognizedAt: 'not a date' },
        { ...entry(3), source: 'telepathy' },
        { ...entry(4), response: { ...entry(4).response, track: { title: 42 } } },
        { ...entry(5), response: { ...entry(5).response, confidence: 7 } },
        null,
        'garbage',
      ],
    });
    expect(parseHistoryBlob(raw).map((e) => e.id)).toEqual(['req_1']);
  });

  it('sorts by recognizedAt and applies the cap even to stored data', () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [entry(1, new Date(1000)), entry(2, new Date(3000)), entry(3, new Date(2000))],
    });
    expect(parseHistoryBlob(raw, 2).map((e) => e.id)).toEqual(['req_2', 'req_3']);
  });
});
