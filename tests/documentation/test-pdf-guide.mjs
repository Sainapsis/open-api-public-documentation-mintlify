import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

// Execute the published guide's actual example using synthetic bytes and fetch only.
const guide = await readFile(new URL('../../guides/send-attachments.mdx', import.meta.url), 'utf8');
const fence = guide.match(/^```javascript\n([\s\S]*?)^```\s*$/m);
assert.ok(fence, 'The PDF guide must contain its JavaScript example');
assert.equal((fence[1].match(/^import /gm) || []).length, 3);
const body = fence[1]
  .replace(/^import \{ readFile \} from "node:fs\/promises";\n/m, '')
  .replace(/^import \{ basename \} from "node:path";\n/m, '')
  .replace(/^import \{ createHash \} from "node:crypto";\n/m, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const example = new AsyncFunction('process', 'readFile', 'basename', 'createHash', 'fetch', 'Headers', 'console', body);
const bytes = Buffer.from('%PDF-1.4\nBridge documentation offline fixture\n%%EOF\n');
const digest = createHash('sha256').update(bytes).digest('base64');
const storageUrl = 'https://storage.example.test/fixture.pdf?signature=synthetic&part=1';
const apiKey = 'offline-fixture-key';
const env = {
  BRIDGE_API_KEY: apiKey,
  BRIDGE_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111',
  BRIDGE_CONVERSATION_ID: '22222222-2222-4222-8222-222222222222',
  ATTACHMENT_PATH: '/offline/fixture.pdf',
  ENABLE_EXTERNAL_BROADCAST: 'false',
};

test('Spanish and Portuguese publish the same executable PDF example', async () => {
  for (const locale of ['es', 'pt-br']) {
    const translated = await readFile(new URL(`../../${locale}/guides/send-attachments.mdx`, import.meta.url), 'utf8');
    const translatedFence = translated.match(/^```javascript\n([\s\S]*?)^```\s*$/m);
    assert.ok(translatedFence, `${locale} must include the PDF example`);
    assert.equal(translatedFence[1], fence[1], `${locale} must preserve the tested code`);
  }
});

async function exercise(options = {}) {
  const calls = [];
  const logs = [];
  const fetch = async (url, request) => {
    calls.push({ url, request });
    if (url.endsWith('/files')) {
      const payload = JSON.parse(request.body);
      assert.equal(payload[0].checksumBase64, digest);
      assert.equal(payload[0].name, 'fixture.pdf');
      assert.equal(payload[0].fileType, 'DOCUMENT');
      assert.equal(payload[0].contentType, 'application/pdf');
      if (options.presignFailure) {
        return { status: 400, ok: false, json: async () => ({ title: 'Offline fixture rejection' }) };
      }
      const headers = { 'Content-Type': 'application/pdf' };
      if (!options.omitChecksum) {
        headers['x-amz-checksum-sha256'] = options.badChecksum ? 'different-fixture-checksum' : digest;
      }
      return {
        status: 201,
        ok: true,
        json: async () => [{ mediaId: 'media_fixture', presignUrl: { url: storageUrl, method: 'PUT', headers } }],
      };
    }
    if (url === storageUrl) {
      const headers = new Headers(request.headers);
      assert.equal(request.method, 'PUT');
      assert.equal(headers.get('Content-Type'), 'application/pdf');
      assert.equal(headers.get('x-amz-checksum-sha256'), digest);
      assert.equal(headers.has('x-api-key'), false);
      assert.equal(headers.has('authorization'), false);
      assert.equal([...headers.values()].some((value) => value.includes(apiKey)), false);
      assert.ok(Buffer.isBuffer(request.body));
      assert.deepEqual(request.body, bytes);
      return { status: options.putFailure ? 403 : 200, ok: !options.putFailure };
    }
    if (url.endsWith('/messages')) {
      const payload = JSON.parse(request.body);
      assert.deepEqual(payload.mediaIds, ['media_fixture']);
      assert.equal(payload.conversationId, env.BRIDGE_CONVERSATION_ID);
      assert.equal(payload.enableExternalBroadcast, false);
      assert.equal(new Headers(request.headers).get('x-api-key'), apiKey);
      return { status: 201, ok: true, json: async () => ({ messageId: 'message_fixture' }) };
    }
    throw new Error(`Unexpected mocked request: ${url}`);
  };
  let error;
  try {
    await example(
      { env: { ...env } },
      async (filename) => { assert.equal(filename, env.ATTACHMENT_PATH); return bytes; },
      basename,
      createHash,
      fetch,
      Headers,
      { log: (value) => logs.push(value) },
    );
  } catch (caught) {
    error = caught;
  }
  return { calls, logs, error };
}

test('PDF flow preserves the checksum, signed storage URL and bytes without leaking the REST key', async () => {
  const { calls, logs, error } = await exercise();
  assert.equal(error, undefined);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url, storageUrl);
  // A creation201 produces correlation IDs; the example does not label the message delivered or invent a status call.
  assert.deepEqual(logs, [{ mediaId: 'media_fixture', messageId: 'message_fixture' }]);
  assert.equal(JSON.stringify(logs).toLowerCase().includes('delivered'), false);
});

test('PDF flow supplies the exact checksum when the returned upload headers omit it', async () => {
  const { calls, error } = await exercise({ omitChecksum: true });
  assert.equal(error, undefined);
  assert.equal(calls.length, 3);
});

test('A returned checksum mismatch prevents both storage PUT and Message creation', async () => {
  const { calls, error } = await exercise({ badChecksum: true });
  assert.match(error.message, /checksum/);
  assert.equal(calls.length, 1);
});

test('A failed storage PUT prevents Message creation', async () => {
  const { calls, error } = await exercise({ putFailure: true });
  assert.match(error.message, /no Message was created/);
  assert.equal(calls.length, 2);
  assert.equal(calls.some(({ url }) => url.endsWith('/messages')), false);
});

test('A rejected Bridge presign request prevents storage PUT and Message creation', async () => {
  const { calls, error } = await exercise({ presignFailure: true });
  assert.match(error.message, /HTTP 400/);
  assert.equal(calls.length, 1);
});
