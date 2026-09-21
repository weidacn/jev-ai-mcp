import { test } from 'node:test';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from '../src/index.js';

async function connect(t, options) {
  const server = createServer(options);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}

test('stdio installation entrypoint initializes and advertises six tools without credentials', async t => {
  const client = new Client({ name: 'stdio-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['src/index.js'], env: {} });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 6);
  const error = await client.callTool({ name: 'jev_check', arguments: { state: 'Hello', instructions: 'Greeting?' } });
  assert.equal(error.isError, true);
  assert.match(error.content[0].text, /Set JEV_AI_API_KEY/);
});

test('all tools send the expected authenticated API payload and preserve results', async t => {
  const requests = [];
  const client = await connect(t, { apiKey: 'test-secret', fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, init, body });
    return Response.json({ model: 'jev-latest', answers: Object.fromEntries(Object.keys(body.questions || { saved: 1 }).map(k => [k, { noul: 0.8 }])), usage: { input_tokens: 12 } });
  } });
  const cases = [
    ['jev_classify', { state: 'a', instructions: 'route', options: { a: 'A', b: 'B' } }, 'choice'],
    ['jev_score', { state: 'a', instructions: 'rate', levels: ['Low', 'High'] }, 'score'],
    ['jev_check', { state: 'a', instructions: 'true?' }, 'noul'],
    ['jev_gate', { action: 'ls', context: 'List files' }],
    ['jev_decide', { state: { message: 'hello' }, questions: { custom: { type: 'noul', instructions: 'greeting?' } } }],
    ['jev_saved_judge', { state: 'hello', judgeId: 'judge-1', revision: 2 }],
  ];
  for (const [name, args, type] of cases) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(result.structuredContent.usage.input_tokens, 12);
    const request = requests.at(-1);
    assert.equal(request.url, 'https://jev-ai.pro/api/v1/systemone');
    assert.equal(request.init.headers.Authorization, 'Bearer test-secret');
    assert.equal(request.init.redirect, 'error');
    if (type) assert.equal(request.body.questions.result.type, type);
  }
  assert.equal(requests.at(-1).body.revision, 2);
  assert.equal(requests.at(-1).body.questions, undefined);
});

test('invalid parameters and oversized payloads never reach the API', async t => {
  let calls = 0;
  const client = await connect(t, { apiKey: 'test', fetchImpl: async () => { calls++; throw new Error('unexpected'); } });
  for (const args of [
    { state: 'a', questions: {} },
    { state: 'a', questions: { x: { type: 'score', instructions: 'rate', criteria: ['only one'] } } },
    { state: 'a', questions: { x: { type: 'choice', instructions: 'pick', criteria: { a: 'A' } } } },
    { state: 'a', questions: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [i, { type: 'noul', instructions: 'yes?' }])) },
    { state: '字'.repeat(90000), questions: { x: { type: 'noul', instructions: 'yes?' } } },
  ]) {
    assert.equal((await client.callTool({ name: 'jev_decide', arguments: args })).isError, true);
  }
  assert.equal(calls, 0);
});

for (const status of [401, 402, 409, 422, 429, 500]) {
  test(`HTTP ${status} is an error, redacts upstream body, and never retries`, async t => {
    let calls = 0;
    const client = await connect(t, { apiKey: 'secret-key', fetchImpl: async () => { calls++; return new Response('secret-key private upstream body', { status }); } });
    const result = await client.callTool({ name: 'jev_check', arguments: { state: 'a', instructions: 'yes?' } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, new RegExp(String(status)));
    assert.doesNotMatch(result.content[0].text, /secret-key|private upstream/);
    assert.equal(calls, 1);
  });
}

test('transport failures and malformed responses produce safe tool errors', async t => {
  for (const fetchImpl of [async () => { throw new Error('secret-key'); }, async () => new Response('not json'), async () => Response.json({ answers: {} })]) {
    const client = await connect(t, { apiKey: 'secret-key', fetchImpl });
    const result = await client.callTool({ name: 'jev_check', arguments: { state: 'a', instructions: 'yes?' } });
    assert.equal(result.isError, true);
    assert.doesNotMatch(result.content[0].text, /secret-key/);
  }
});

 test('npm-style symlink entrypoint starts the MCP server', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'jev-mcp-bin-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bin = join(dir, 'jev-ai-mcp');
  await symlink(resolve('src/index.js'), bin);
  const client = new Client({ name: 'symlink-test', version: '1' });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin], env: {} }));
  assert.equal((await client.listTools()).tools.length, 6);
});
