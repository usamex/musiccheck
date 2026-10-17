/**
 * Live contract check: runs the app's real API client (src/api/client.ts, compiled by tsc)
 * in plain Node against a running backend. Node's fetch/FormData/Blob stand in for expo/fetch,
 * so this verifies request shape + response mapping, not the native upload (MOBILE_TEST_PLAN).
 *
 *   npm run contract:check -- http://127.0.0.1:8000
 */
const Module = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');

// expo-file-system needs native modules; the client only uses it for the default file part,
// which this script replaces with an in-memory Blob.
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'expo-file-system') return path.join(__dirname, 'expo-file-system-node-stub.cjs');
  return origResolve.call(this, request, ...rest);
};

const outDir = process.env.CONTRACT_OUT_DIR || '/tmp/musiccheck-contract';
const { identify, getHealth } = require(path.join(outDir, 'api', 'client.js'));
const baseUrl = process.argv[2] || 'http://127.0.0.1:8000';

/** 16-bit mono PCM WAV: two-tone chord + deterministic noise (a test signal, not music). */
function wav(seconds, amplitude) {
  const rate = 44100;
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const t = i / rate;
    const s = amplitude * (0.5 * Math.sin(2 * Math.PI * 220 * t) + 0.3 * Math.sin(2 * Math.PI * 330 * t) + (seed / 0x7fffffff - 0.5) * 0.1);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

(async () => {
  const opts = (blob) => ({ baseUrl, fetchImpl: fetch, createFilePart: () => blob });
  await check('GET /health', async () => {
    const out = await getHealth({ baseUrl, fetchImpl: fetch });
    assert.equal(out.ok, true, JSON.stringify(out));
  });
  await check('valid recording -> model_unavailable (no model configured)', async () => {
    const out = await identify('file:///q.wav', opts(wav(6, 0.8)));
    assert.equal(out.type, 'error', JSON.stringify(out));
    assert.equal(out.error.kind, 'model_unavailable');
    assert.equal(out.error.code, 'provider_not_configured');
    assert.equal(out.error.query.channels, 1);
    assert.equal(out.error.query.sample_rate, 44100);
    console.log(`     request_id=${out.error.requestId} query=${JSON.stringify(out.error.query)}`);
  });
  await check('silent recording -> invalid_recording/audio_silent', async () => {
    const out = await identify('file:///s.wav', opts(wav(5, 0)));
    assert.equal(out.error.kind, 'invalid_recording', JSON.stringify(out));
    assert.equal(out.error.code, 'audio_silent');
  });
  await check('too short -> invalid_recording/audio_too_short', async () => {
    const out = await identify('file:///t.wav', opts(wav(1, 0.8)));
    assert.equal(out.error.kind, 'invalid_recording', JSON.stringify(out));
    assert.equal(out.error.code, 'audio_too_short');
  });
  await check('not audio -> unsupported_audio_format', async () => {
    const out = await identify('file:///x.m4a', opts(new Blob(['hello world'.repeat(50)])));
    assert.equal(out.error.kind, 'unsupported_audio_format', JSON.stringify(out));
  });
  await check('unreachable server -> network_unavailable', async () => {
    const out = await identify('file:///q.wav', { ...opts(wav(3, 0.8)), baseUrl: 'http://127.0.0.1:9' });
    assert.equal(out.error.kind, 'network_unavailable', JSON.stringify(out));
  });
  await check('user cancel -> cancelled', async () => {
    const controller = new AbortController();
    const p = identify('file:///q.wav', { ...opts(wav(6, 0.8)), signal: controller.signal });
    controller.abort();
    assert.equal((await p).type, 'cancelled');
  });
})();
