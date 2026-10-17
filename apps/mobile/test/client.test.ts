/**
 * API client mapping tests. `fetch` is a jest mock injected via `fetchImpl`, and the audio
 * part factory is a fake (no file system) — these are TEST DOUBLES, not app behaviour.
 */
import { getHealth, identify, mapRecognitionResponse, type IdentifyOptions } from '../src/api/client';
import { normalizeBaseUrl } from '../src/api/config';
import { parseRecognitionResponse } from '../src/api/parse';
import { errorCopy } from '../src/presentation/copy';
import { errorBody, matchedBody, noMatchBody, QUERY_BLOCK } from './fixtures';

const BASE = 'http://192.168.1.50:8000';
const FILE_URI = 'file:///cache/ExpoAudio/recording-1.m4a';

type FakeResponse = { status: number; ok: boolean; json: () => Promise<unknown> };

function respond(status: number, body: unknown): FakeResponse {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) };
}
function respondNonJson(status: number): FakeResponse {
  return {
    status,
    ok: false,
    json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
  };
}

const fakePart = { fake: 'audio-part' } as unknown as Blob;
const partFactory = jest.fn((_uri: string) => fakePart);

function setup(impl: (url: string, init: RequestInit) => Promise<FakeResponse>) {
  const fetchMock = jest.fn(impl);
  const opts: IdentifyOptions = {
    baseUrl: BASE,
    fetchImpl: fetchMock as unknown as typeof fetch,
    createFilePart: partFactory,
  };
  return { fetchMock, opts };
}

/** Reads back FormData parts across FormData implementations (RN getParts / WHATWG entries). */
function formParts(body: unknown): Record<string, unknown> {
  const fd = body as {
    getParts?: () => { fieldName: string; string?: string }[];
    _parts?: [string, unknown][];
    entries?: () => Iterable<[string, unknown]>;
  };
  const out: Record<string, unknown> = {};
  if (Array.isArray(fd._parts)) {
    for (const [k, v] of fd._parts) out[k] = v;
  } else if (typeof fd.entries === 'function') {
    for (const [k, v] of fd.entries()) out[k] = v;
  }
  return out;
}

beforeEach(() => partFactory.mockClear());

describe('identify() request', () => {
  it('POSTs multipart form-data with `audio` and `source` to /v1/recognition/identify', async () => {
    const { fetchMock, opts } = setup(async () => respond(200, matchedBody()));
    await identify(FILE_URI, { ...opts, source: 'microphone' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/v1/recognition/identify`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    // fetch must set the multipart boundary itself
    expect(Object.keys((init.headers ?? {}) as Record<string, string>)).not.toContain('Content-Type');
    expect(init.signal).toBeDefined();
    expect(partFactory).toHaveBeenCalledWith(FILE_URI);
    const parts = formParts(init.body);
    expect(Object.keys(parts).sort()).toEqual(['audio', 'source']);
    expect(parts.source).toBe('microphone');
  });

  it('sends source=file for the developer file picker', async () => {
    const { fetchMock, opts } = setup(async () => respond(200, noMatchBody()));
    await identify(FILE_URI, { ...opts, source: 'file' });
    expect(formParts(fetchMock.mock.calls[0]![1].body).source).toBe('file');
  });

  it('fails fast without a configured base URL (no request is made)', async () => {
    const { fetchMock, opts } = setup(async () => respond(200, matchedBody()));
    const out = await identify(FILE_URI, { ...opts, baseUrl: '' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ type: 'error', error: { kind: 'backend_unavailable', code: 'api_base_url_missing' } });
  });

  it('maps an unreadable/missing audio file to invalid_recording', async () => {
    const { fetchMock, opts } = setup(async () => respond(200, matchedBody()));
    const out = await identify(FILE_URI, {
      ...opts,
      createFilePart: () => {
        throw new Error('Audio file does not exist');
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ type: 'error', error: { kind: 'invalid_recording', code: 'file_unreadable' } });
  });
});

describe('identify() response mapping (docs/API.md outcome table)', () => {
  it('200 matched → matched with the track', async () => {
    const { opts } = setup(async () => respond(200, matchedBody()));
    const out = await identify(FILE_URI, opts);
    expect(out.type).toBe('matched');
    if (out.type !== 'matched') throw new Error('unreachable');
    expect(out.response.track.title).toBe('Example Song');
    expect(out.response.confidence).toBeNull();
    expect(out.response.query).toEqual(QUERY_BLOCK);
  });

  it('200 no_match → no_match (not an error)', async () => {
    const { opts } = setup(async () => respond(200, noMatchBody()));
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({ type: 'no_match', response: { status: 'no_match', track: null } });
  });

  it.each(['provider_not_configured', 'provider_not_ready', 'catalog_empty'])(
    '503 provider_unavailable (%s) → model_unavailable, keeping code + query',
    async (code) => {
      const body = errorBody('provider_unavailable', code, 'No recognition provider', { query: QUERY_BLOCK });
      const { opts } = setup(async () => respond(503, body));
      const out = await identify(FILE_URI, opts);
      expect(out).toEqual({
        type: 'error',
        error: {
          kind: 'model_unavailable',
          code,
          message: 'No recognition provider',
          requestId: `req_${code}`,
          httpStatus: 503,
          query: QUERY_BLOCK,
        },
      });
    },
  );

  it('415 invalid_input → unsupported_audio_format', async () => {
    const { opts } = setup(async () => respond(415, errorBody('invalid_input', 'unsupported_audio_format')));
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({ type: 'error', error: { kind: 'unsupported_audio_format', httpStatus: 415 } });
  });

  it('422 audio_silent → invalid_recording with code kept for copy', async () => {
    const { opts } = setup(async () =>
      respond(422, errorBody('invalid_input', 'audio_silent', 'Recording is silent (-70 dBFS RMS)', { query: QUERY_BLOCK })),
    );
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({ type: 'error', error: { kind: 'invalid_recording', code: 'audio_silent' } });
    if (out.type !== 'error') throw new Error('unreachable');
    expect(errorCopy(out.error).title).toBe("We couldn't hear anything");
  });

  it.each([
    [422, 'audio_too_short'],
    [422, 'invalid_audio'],
    [413, 'payload_too_large'],
    [400, 'empty_audio'],
    [400, 'missing_audio'],
  ])('%i %s → invalid_recording', async (http, code) => {
    const { opts } = setup(async () => respond(http, errorBody('invalid_input', code)));
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({ type: 'error', error: { kind: 'invalid_recording', code, httpStatus: http } });
  });

  it('500 error/internal_error → backend_unavailable', async () => {
    const { opts } = setup(async () => respond(500, errorBody('error', 'internal_error')));
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({ type: 'error', error: { kind: 'backend_unavailable', code: 'internal_error' } });
  });

  it('504 error/processing_timeout → backend_unavailable (server-side timeout)', async () => {
    const { opts } = setup(async () => respond(504, errorBody('error', 'processing_timeout')));
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({ type: 'error', error: { kind: 'backend_unavailable', code: 'processing_timeout' } });
  });

  it('5xx without a contract body (proxy HTML page) → backend_unavailable', async () => {
    const { opts } = setup(async () => respondNonJson(502));
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({
      type: 'error',
      error: { kind: 'backend_unavailable', code: 'invalid_response', httpStatus: 502 },
    });
  });

  it('a body that violates the contract (matched without track) → backend_unavailable', async () => {
    const { opts } = setup(async () => respond(200, { ...matchedBody(), track: null }));
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({ type: 'error', error: { kind: 'backend_unavailable', code: 'invalid_response' } });
  });

  it('branches on `status`, not HTTP alone: 200 with provider_unavailable is still model_unavailable', () => {
    const out = mapRecognitionResponse(200, errorBody('provider_unavailable', 'provider_not_ready'));
    expect(out).toMatchObject({ type: 'error', error: { kind: 'model_unavailable' } });
  });
});

describe('identify() transport failures, timeout and cancellation', () => {
  it('fetch TypeError (RN polyfill "Network request failed") → network_unavailable', async () => {
    const { opts } = setup(async () => {
      throw new TypeError('Network request failed');
    });
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({ type: 'error', error: { kind: 'network_unavailable' } });
  });

  it('expo/fetch FetchError (plain Error subclass) → network_unavailable', async () => {
    class FetchError extends Error {}
    const { opts } = setup(async () => {
      throw new FetchError('fetch failed: The Internet connection appears to be offline.');
    });
    const out = await identify(FILE_URI, opts);
    expect(out).toMatchObject({ type: 'error', error: { kind: 'network_unavailable' } });
  });

  it('no response within the timeout → request_timeout (and the request signal is aborted)', async () => {
    let seenSignal: AbortSignal | undefined;
    const { opts } = setup(
      (_url, init) =>
        new Promise<FakeResponse>(() => {
          seenSignal = init.signal ?? undefined;
        }),
    );
    const out = await identify(FILE_URI, { ...opts, timeoutMs: 30 });
    expect(out).toMatchObject({ type: 'error', error: { kind: 'request_timeout', code: 'client_timeout' } });
    expect(seenSignal?.aborted).toBe(true);
  });

  it('user abort → cancelled (distinct from timeout)', async () => {
    const user = new AbortController();
    const { opts } = setup(() => new Promise<FakeResponse>(() => undefined));
    const pending = identify(FILE_URI, { ...opts, signal: user.signal, timeoutMs: 5_000 });
    setTimeout(() => user.abort(), 10);
    await expect(pending).resolves.toEqual({ type: 'cancelled' });
  });

  it('user abort while the body is being read → cancelled', async () => {
    const user = new AbortController();
    const { opts } = setup(async () => ({
      status: 200,
      ok: true,
      json: () => new Promise<unknown>(() => undefined),
    }));
    const pending = identify(FILE_URI, { ...opts, signal: user.signal, timeoutMs: 5_000 });
    setTimeout(() => user.abort(), 10);
    await expect(pending).resolves.toEqual({ type: 'cancelled' });
  });

  it('already-aborted signal → cancelled without a request', async () => {
    const user = new AbortController();
    user.abort();
    const { fetchMock, opts } = setup(async () => respond(200, matchedBody()));
    await expect(identify(FILE_URI, { ...opts, signal: user.signal })).resolves.toEqual({ type: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('parseRecognitionResponse()', () => {
  it('accepts the docs/API.md example', () => {
    expect(parseRecognitionResponse(matchedBody())).toEqual(matchedBody());
  });

  it('treats missing optional fields as null', () => {
    const parsed = parseRecognitionResponse({ request_id: 'r', status: 'no_match', processing_ms: 5 });
    expect(parsed).toMatchObject({ provider: null, track: null, score: null, confidence: null, query: null, error: null });
  });

  it.each([
    ['not an object', 'nope'],
    ['unknown status', { ...noMatchBody(), status: 'maybe' }],
    ['confidence > 1', { ...matchedBody(), confidence: 1.4 }],
    ['wrong provider_kind', { ...matchedBody(), provider_kind: 'magic' }],
    ['score as string', { ...matchedBody(), score: '0.9' }],
    ['track without title', { ...matchedBody(), track: { id: 'x', artist: 'y' } }],
    ['missing request_id', { ...noMatchBody(), request_id: undefined }],
  ])('rejects %s', (_n, body) => {
    expect(parseRecognitionResponse(body)).toBeNull();
  });
});

describe('getHealth()', () => {
  it('returns ok for GET /health', async () => {
    const fetchMock = jest.fn(async () => respond(200, { status: 'ok', service: 'musiccheck-api', version: '0.1.0' }));
    const out = await getHealth({ baseUrl: `${BASE}/`, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/health`, expect.objectContaining({ method: 'GET' }));
    expect(out).toEqual({
      ok: true,
      baseUrl: BASE,
      health: { status: 'ok', service: 'musiccheck-api', version: '0.1.0' },
    });
  });

  it('reports network failures', async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const out = await getHealth({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(out).toMatchObject({ ok: false, error: { kind: 'network_unavailable' } });
  });
});

describe('normalizeBaseUrl()', () => {
  it.each([
    ['http://192.168.1.5:8000/', 'http://192.168.1.5:8000'],
    ['  https://api.example.com//  ', 'https://api.example.com'],
    ['', null],
    ['192.168.1.5:8000', null],
    [undefined, null],
  ])('%p → %p', (input, expected) => {
    expect(normalizeBaseUrl(input as string | undefined)).toBe(expected);
  });
});
