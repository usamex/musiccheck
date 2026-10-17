/**
 * Local recognition history (matched results only).
 *
 * Pure factory over a minimal key/value storage interface so it can be unit-tested with an
 * in-memory fake; the app wires it to AsyncStorage in ./index.ts.
 *
 * Persistence format (versioned): `{ "version": 1, "entries": HistoryEntry[] }`, newest
 * first, capped at `maxEntries`. Stored data is validated defensively on load; corrupt or
 * foreign data never crashes the app — invalid entries are dropped.
 */
import { isMatched, parseRecognitionResponse } from '../api/parse';
import type { IdentifySource, MatchedRecognitionResponse } from '../api/types';

export const HISTORY_STORAGE_KEY = 'musiccheck.history.v1';
export const HISTORY_MAX_ENTRIES = 200;
const FORMAT_VERSION = 1;

export interface HistoryEntry {
  /** The server `request_id` of the recognition. */
  id: string;
  /** ISO-8601 timestamp (device clock) of when the match was received. */
  recognizedAt: string;
  source: IdentifySource;
  response: MatchedRecognitionResponse;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface HistoryStore {
  load(): Promise<HistoryEntry[]>;
  add(entry: HistoryEntry): Promise<HistoryEntry[]>;
  get(id: string): Promise<HistoryEntry | null>;
  clear(): Promise<void>;
  subscribe(listener: (entries: HistoryEntry[]) => void): () => void;
}

export function makeHistoryEntry(
  response: MatchedRecognitionResponse,
  source: IdentifySource,
  now: Date = new Date(),
): HistoryEntry {
  return { id: response.request_id, recognizedAt: now.toISOString(), source, response };
}

export function parseHistoryEntry(v: unknown): HistoryEntry | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0) return null;
  if (typeof o.recognizedAt !== 'string' || Number.isNaN(Date.parse(o.recognizedAt))) return null;
  if (o.source !== 'microphone' && o.source !== 'file') return null;
  const response = parseRecognitionResponse(o.response);
  if (!response || !isMatched(response)) return null;
  return { id: o.id, recognizedAt: o.recognizedAt, source: o.source, response };
}

/** Parse the persisted blob. Never throws; returns [] for missing/corrupt data. */
export function parseHistoryBlob(raw: string | null, maxEntries = HISTORY_MAX_ENTRIES): HistoryEntry[] {
  if (raw === null || raw === '') return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof data !== 'object' || data === null) return [];
  const entriesRaw = (data as { entries?: unknown }).entries;
  if (!Array.isArray(entriesRaw)) return [];
  return normalize(entriesRaw.map(parseHistoryEntry).filter((e): e is HistoryEntry => e !== null), maxEntries);
}

/** Dedupe by id (first occurrence wins), sort newest first, cap. */
function normalize(entries: HistoryEntry[], maxEntries: number): HistoryEntry[] {
  const seen = new Set<string>();
  const unique: HistoryEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    unique.push(e);
  }
  unique.sort((a, b) => Date.parse(b.recognizedAt) - Date.parse(a.recognizedAt));
  return unique.slice(0, Math.max(0, maxEntries));
}

export function createHistoryStore(
  storage: KeyValueStorage,
  options: { key?: string; maxEntries?: number } = {},
): HistoryStore {
  const key = options.key ?? HISTORY_STORAGE_KEY;
  const maxEntries = options.maxEntries ?? HISTORY_MAX_ENTRIES;
  const listeners = new Set<(entries: HistoryEntry[]) => void>();
  let cache: HistoryEntry[] | null = null;
  // Serialises read-modify-write cycles so concurrent adds cannot lose entries.
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const emit = (entries: HistoryEntry[]) => {
    for (const l of listeners) {
      try {
        l(entries);
      } catch {
        // a broken listener must not break persistence
      }
    }
  };

  const readFromStorage = async (): Promise<HistoryEntry[]> => {
    if (cache) return cache;
    let raw: string | null = null;
    try {
      raw = await storage.getItem(key);
    } catch {
      raw = null;
    }
    cache = parseHistoryBlob(raw, maxEntries);
    return cache;
  };

  const write = async (entries: HistoryEntry[]) => {
    await storage.setItem(key, JSON.stringify({ version: FORMAT_VERSION, entries }));
    cache = entries;
    emit(entries);
  };

  return {
    load: () => enqueue(readFromStorage),
    get: (id) => enqueue(async () => (await readFromStorage()).find((e) => e.id === id) ?? null),
    add: (entry) =>
      enqueue(async () => {
        const valid = parseHistoryEntry(entry);
        if (!valid) throw new Error('Refusing to store an invalid history entry');
        const current = await readFromStorage();
        const next = normalize([valid, ...current.filter((e) => e.id !== valid.id)], maxEntries);
        await write(next);
        return next;
      }),
    clear: () =>
      enqueue(async () => {
        await storage.removeItem(key);
        cache = [];
        emit([]);
      }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
