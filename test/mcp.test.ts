// MCP server tests: tool list and a round trip through an in-memory transport with mocked fetch.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const cfgHome = mkdtempSync(join(tmpdir(), 'juzpost-mcp-'));
process.env.XDG_CONFIG_HOME = cfgHome;
mkdirSync(join(cfgHome, 'juzpost'), { recursive: true });
writeFileSync(join(cfgHome, 'juzpost', 'config.json'), JSON.stringify({ baseUrl: 'https://api.test', token: 't' }));

const { createServer } = await import('../src/mcp.ts');

const calls: { url: string; method: string; body: unknown }[] = [];
beforeEach(() => {
  calls.length = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

async function connect() {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer('0.0.0-test').connect(serverT);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientT);
  return client;
}

test('lists the ten tools', async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ['create_post', 'get_account', 'get_post', 'get_workspace', 'list_accounts', 'list_groups', 'list_posts', 'schedule_post', 'smart_schedule', 'upload_media'],
  );
});

test('list_posts maps arguments to query params with the bearer token', async () => {
  const client = await connect();
  const r = await client.callTool({ name: 'list_posts', arguments: { status: 'draft', limit: 5 } });
  assert.equal(calls.length, 1);
  const u = new URL(calls[0].url);
  assert.equal(u.pathname, '/api/cli/v1/posts');
  assert.equal(u.searchParams.get('status'), 'draft');
  assert.equal(u.searchParams.get('limit'), '5');
  assert.equal(JSON.parse((r.content as { text: string }[])[0].text).ok, true);
});

test('schedule_post posts accounts and time', async () => {
  const client = await connect();
  await client.callTool({ name: 'schedule_post', arguments: { postId: 'p1', accountIds: ['a1'], publishAt: '2026-12-01T09:00:00Z' } });
  assert.equal(calls[0].method, 'POST');
  assert.ok(calls[0].url.endsWith('/api/cli/v1/posts/p1/schedule'));
  assert.deepEqual(calls[0].body, { publishAt: '2026-12-01T09:00:00Z', socialAccountIds: ['a1'] });
});

test('schedule_post with no publishAt asks the server to publish now', async () => {
  const client = await connect();
  await client.callTool({ name: 'schedule_post', arguments: { postId: 'p1', accountIds: ['a1'] } });
  assert.deepEqual(calls[0].body, { publishNow: true, socialAccountIds: ['a1'] });
});

test('an API error comes back as a tool error, not a crash', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { code: 'payment_required', message: 'Plan does not include scheduling.' } }), { status: 402 })) as typeof fetch;
  const client = await connect();
  const r = await client.callTool({ name: 'get_account', arguments: {} });
  assert.equal(r.isError, true);
  assert.match((r.content as { text: string }[])[0].text, /Plan does not include scheduling/);
});
