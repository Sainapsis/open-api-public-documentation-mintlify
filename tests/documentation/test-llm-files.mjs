import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { applyArtifacts, buildArtifacts, fences, loadToolchain, toMarkdown } from '../../scripts/generate-llm-files.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const toolchain = await loadToolchain(process.env.BRIDGE_LLM_MODULE_ROOT);
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const context = { locale: 'en', base: 'https://docs.bridge.new', route: '/guides/example', aliases: new Map([['/credentials', '/credentials'], ['/guides/example', '/guides/example']]) };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-llm-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => { const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
  const operation = { summary: 'Check health', operationId: 'check_health', description: 'Returns health.\n\nUse `x-api-key`.', responses: { 200: { description: 'Success' } } };
  const spec = { openapi: '3.1.0', info: { title: 'Fixture contract', version: '1' }, paths: { '/health': { get: operation } }, components: { schemas: { Payload: { type: 'object', properties: { description: { type: 'string' }, examples: { type: 'array', items: { type: 'integer' } } } } } } };
  const config = { name: 'Bridge fixture', description: 'Public fixture.', markdown: { instructions: ['Preserve the exact contract.'] }, navigation: { languages: [{ language: 'en', default: true, tabs: [{ pages: ['index', 'credentials'] }, { openapi: 'api-reference/openapi.yaml' }] }] } };
  write('docs.json', JSON.stringify(config));
  write('index.mdx', '---\ntitle: Start\ndescription: First task.\n---\n\n<Note>Keep this note.</Note>\n\n[Credentials](/credentials)\n');
  write('credentials.mdx', '---\ntitle: Credentials\ndescription: Read credentials.\n---\n\nUse `x-api-key`.\n');
  write('api-reference/openapi.yaml', toolchain.yaml.dump(spec));
  write('skill.md', '# Bridge integration guidance\n\nRead exact contracts. Use /llms-es.txt and /llms-pt-br.txt.\n');
  return { root, write, spec, config, build: () => buildArtifacts({ sourceRoot: root, toolchain }) };
}

test('component formatting retains Note, Warning, Step, Tab, Card and ResponseField content', () => {
  const source = '<Steps><Step title="Get credentials"><Note>Use this scope.</Note><Warning>Keep the key secret.</Warning></Step></Steps>\n<Tabs><Tab title="Python">Body</Tab></Tabs>\n<Card title="Credentials" href="/credentials">Read before sending.</Card>\n<ResponseField name="description" type="string">Wire field.</ResponseField>\n';
  const actual = toMarkdown(source, context);
  for (const phrase of ['### Get credentials', '**Note**', 'Use this scope.', '**Warning**', 'Keep the key secret.', '### Python', 'Body', '[Credentials](https://docs.bridge.new/credentials.md)', 'Read before sending.', '`description` (`string`)', 'Wire field.']) assert.ok(actual.includes(phrase), phrase);
  assert.ok(!/<\/?(?:Step|Note|Warning|Tab|Card|ResponseField)\b/.test(actual));
});

test('fence bytes, blank lines and inline examples survive formatting exactly', () => {
  const code = '```js\nconst payload = {description: "<Note>", examples: [1]};\n\nfetch("https://api-connect-us.bridge.new/bridge/api/health");\n```\n';
  const source = '<Note>Read `captureKey`, `BRIDGE.CAMPAIGN_LEADS.ERROR` and `<Card title="literal">`.</Note>\n\n' + code;
  const actual = toMarkdown(source, context);
  assert.deepEqual(fences(actual), [code]);
  for (const literal of ['`captureKey`', '`BRIDGE.CAMPAIGN_LEADS.ERROR`', '`<Card title="literal">`']) assert.ok(actual.includes(literal));
});

test('unknown components, visibility blocks and malformed fences fail instead of silently losing content', () => {
  assert.throws(() => toMarkdown('<NewComponent title="Important">Content</NewComponent>', context), /Unknown MDX component/);
  assert.throws(() => toMarkdown('<Note for="humans">Private-only presentation.</Note>', context), /Visibility-conditioned/);
  assert.throws(() => toMarkdown('```js\nconst value = 1;\n', context), /Unclosed code fence/);
});

test('Markdown links become direct HTTP sources while API URLs and code remain exact', () => {
  const source = '[Auth](/credentials#overview) and [same page](#details).\n\n`[literal](/credentials)`\n\n```bash\ncurl https://api-connect-us.bridge.new/bridge/api/health\n```\n';
  const actual = toMarkdown(source, context);
  assert.ok(actual.includes('https://docs.bridge.new/credentials.md#overview'));
  assert.ok(actual.includes('https://docs.bridge.new/guides/example.md#details'));
  assert.ok(actual.includes('`[literal](/credentials)`'));
  assert.deepEqual(fences(actual), fences(source));
});

test('generator uses native operation routes and includes exact schema links without inventing schemas', async (t) => {
  const f = fixture(t), result = await f.build();
  assert.equal(result.manifest.totals.pages, 3);
  assert.equal(result.manifest.totals.specs, 1);
  assert.ok(result.artifacts['llms-en.txt'].includes('/api-reference/check-health.md'));
  assert.ok(result.artifacts['llms-full-en.txt'].includes('`get /health`'));
  assert.ok(result.artifacts['llms-full-en.txt'].includes('**operationId:** `check_health`'));
  assert.ok(result.artifacts['llms-full-en.txt'].includes('https://docs.bridge.new/api-reference/openapi.yaml'));
  assert.ok(result.artifacts['llms-full-en.txt'].includes('does not embed every request and response schema'));
  assert.ok(result.artifacts['llms.txt'].includes('https://docs.bridge.new/skill.md'));
  assert.equal((result.artifacts['llms-full.txt'].match(/^Source:/gm) ?? []).length, 3);
  assert.equal(result.manifest.agentResources.length, 1);
});

test('outputs are deterministic and --check detects stale content without mutating source', async (t) => {
  const f = fixture(t), before = fs.readFileSync(path.join(f.root, 'credentials.mdx'), 'utf8');
  const one = await f.build(), two = await f.build(); assert.deepEqual(one, two);
  const output = path.join(f.root, 'generated'); applyArtifacts(one.artifacts, output);
  assert.deepEqual(applyArtifacts(two.artifacts, output, true), []);
  f.write('credentials.mdx', before + '\nNew verified credential guidance.\n');
  const changed = await f.build();
  assert.ok(changed.artifacts['llms-full.txt'].includes('New verified credential guidance.'));
  assert.ok(applyArtifacts(changed.artifacts, output, true).includes('llms-full.txt'));
  assert.equal(fs.readFileSync(path.join(output, 'llms-full.txt'), 'utf8'), one.artifacts['llms-full.txt']);
  assert.equal(fs.readFileSync(path.join(f.root, 'credentials.mdx'), 'utf8'), before + '\nNew verified credential guidance.\n');
});

test('CLI --check exits nonzero for a stale collection and leaves the artifact unchanged', (t) => {
  const f = fixture(t), output = path.join(f.root, 'generated');
  const args = [path.resolve(HERE, '../../scripts/generate-llm-files.mjs'), '--source-root', f.root, '--output-root', output];
  if (process.env.BRIDGE_LLM_MODULE_ROOT) args.push('--module-root', process.env.BRIDGE_LLM_MODULE_ROOT);
  const run = (extra = []) => spawnSync(process.execPath, [...args, ...extra], { encoding: 'utf8' });
  const initial = run(); assert.equal(initial.status, 0, initial.stderr);
  const target = path.join(output, 'llms-full.txt'), before = fs.readFileSync(target, 'utf8');
  assert.equal(run(['--check']).status, 0);
  f.write('index.mdx', fs.readFileSync(path.join(f.root, 'index.mdx'), 'utf8') + '\nOffline negative control: newly reviewed source.\n');
  const stale = run(['--check']); assert.equal(stale.status, 1, stale.stderr);
  assert.ok(JSON.parse(stale.stdout).changed.includes('llms-full.txt'));
  assert.equal(fs.readFileSync(target, 'utf8'), before);
  assert.equal(run().status, 0); assert.equal(run(['--check']).status, 0);
});

test('YAML annotation changes update excerpts, fingerprints and stale checks', async (t) => {
  const f = fixture(t), before = await f.build();
  f.spec.paths['/health'].get.description = 'Revised published annotation: preserve `description` and `examples` property identifiers.';
  f.write('api-reference/openapi.yaml', toolchain.yaml.dump(f.spec));
  const after = await f.build();
  assert.notEqual(after.manifest.specs[0].sha256, before.manifest.specs[0].sha256);
  assert.notEqual(after.manifest.inputs['api-reference/openapi.yaml'], before.manifest.inputs['api-reference/openapi.yaml']);
  assert.ok(after.artifacts['llms-full.txt'].includes('Revised published annotation: preserve `description` and `examples` property identifiers.'));
});

test('schema properties literally named description/examples remain fingerprints of complete raw spec bytes', async (t) => {
  const f = fixture(t), before = await f.build();
  f.spec.components.schemas.Payload.properties.description.type = 'integer';
  f.spec.components.schemas.Payload.properties.examples.items.type = 'string';
  f.write('api-reference/openapi.yaml', toolchain.yaml.dump(f.spec));
  const raw = fs.readFileSync(path.join(f.root, 'api-reference/openapi.yaml'));
  const after = await f.build();
  assert.equal(after.manifest.specs[0].sha256, digest(raw));
  assert.notEqual(after.manifest.specs[0].sha256, before.manifest.specs[0].sha256);
  assert.ok(after.artifacts['llms-full.txt'].includes('exact OpenAPI contract'));
});

test('new and removed operations regenerate natively rather than leaving a snapshot inventory', async (t) => {
  const f = fixture(t); f.spec.paths['/items'] = { post: { summary: 'Create item', operationId: 'create_item', description: 'Creates an item.', responses: { 201: { description: 'Created' } } } };
  f.write('api-reference/openapi.yaml', toolchain.yaml.dump(f.spec));
  const added = await f.build(); assert.equal(added.manifest.totals.operationPages, 2); assert.ok(added.artifacts['llms.txt'].includes('/api-reference/create-item.md'));
  delete f.spec.paths['/health']; f.write('api-reference/openapi.yaml', toolchain.yaml.dump(f.spec));
  const removed = await f.build(); assert.equal(removed.manifest.totals.operationPages, 1); assert.ok(!removed.artifacts['llms.txt'].includes('/api-reference/check-health.md'));
});

test('hidden/noindex pages are excluded and restricted page content fails closed', async (t) => {
  const f = fixture(t);
  f.write('credentials.mdx', '---\ntitle: Credentials\nnoindex: true\n---\n\nMust not appear.\n');
  const hidden = await f.build(); assert.ok(!hidden.artifacts['llms.txt'].includes('/credentials.md')); assert.ok(!hidden.artifacts['llms-full.txt'].includes('Must not appear.'));
  f.write('credentials.mdx', '---\ntitle: Credentials\ngroups: [internal]\n---\n\nRestricted.\n');
  await assert.rejects(f.build, /Restricted page/);
});

test('only allowlisted generated filenames can be written', () => {
  assert.throws(() => applyArtifacts({ '../docs.json': '{}' }, os.tmpdir()), /Unexpected output filename/);
});

test('HTTP verifier counts collections separately from indexes and detects a corrupted published export', async (t) => {
  const f = fixture(t), built = await f.build(), output = path.join(f.root, 'generated');
  applyArtifacts(built.artifacts, output); let corrupt = false;
  const server = createServer((request, response) => {
    const route = decodeURI(new URL(request.url, 'http://localhost').pathname).replace('/.well-known/', '/');
    const key = route.slice(1);
    let body = built.artifacts[key];
    if (body === undefined && ['skill.md', 'api-reference/openapi.yaml'].includes(key)) body = fs.readFileSync(path.join(f.root, key), 'utf8');
    if (body === undefined) { response.writeHead(404); response.end('Not found'); return; }
    if (corrupt && route === '/llms-full-en.txt') body = body.replace('Source:', 'Removed-source-marker:');
    response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const report = path.join(f.root, 'http-report.json'), args = [path.resolve(HERE, '../../scripts/check-llm-exports.mjs'), '--base-url', 'http://127.0.0.1:' + server.address().port, '--manifest', path.join(output, 'llms-manifest.json'), '--report', report];
  const run = () => new Promise((resolve) => { const child = spawn(process.execPath, args, { stdio: 'ignore' }); child.on('close', resolve); });
  assert.equal(await run(), 0);
  const passing = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(passing.results.find((item) => item.path === '/llms-en.txt').editorialAndOperationLinks, 3);
  assert.equal(passing.results.find((item) => item.path === '/llms-full-en.txt').sources, 3);
  corrupt = true; assert.equal(await run(), 1);
  const failing = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(failing.summary.failed, 1);
  assert.equal(failing.results.find((item) => item.path === '/llms-full-en.txt').sources, 2);
});

const repositoryRoot = path.resolve(HERE, '../..');
const sourceRoot = process.env.BRIDGE_LLM_SOURCE_ROOT || (fs.existsSync(path.join(repositoryRoot, 'docs.json')) ? repositoryRoot : undefined);
test('real multilingual corpus preserves every source fence and native verified route', { skip: !sourceRoot }, async () => {
  const { artifacts, manifest } = await buildArtifacts({ sourceRoot, toolchain });
  const languageCount = Object.keys(manifest.byLocale).length, defaultPageCount = manifest.byLocale.en.pages;
  assert.equal(manifest.totals.pages, languageCount * defaultPageCount);
  assert.equal(manifest.totals.specs, languageCount * manifest.specs.filter((entry) => entry.locale === 'en').length);
  const markdownLinks = [...artifacts['llms.txt'].matchAll(/^- \[[^\n]*\]\(([^\n]*\.md)\)/gm)].map((match) => match[1]);
  assert.equal(markdownLinks.filter((url) => !url.endsWith('/skill.md')).length, manifest.totals.pages);
  assert.equal(markdownLinks.filter((url) => url.endsWith('/skill.md')).length, 1);
  assert.equal((artifacts['llms-full.txt'].match(/^Source:/gm) ?? []).length, manifest.totals.pages);
  for (const locale of ['en', 'es', 'pt-br']) {
    assert.equal(manifest.byLocale[locale].pages, defaultPageCount);
    const expectedFences = [];
    for (const page of manifest.pages.filter((entry) => entry.locale === locale)) {
      const raw = fs.readFileSync(path.join(sourceRoot, page.source), 'utf8');
      assert.equal(manifest.inputs[page.source], digest(raw));
      if (page.kind === 'page') expectedFences.push(...fences(raw.replace(/^---\r?\n[^]*?\r?\n---(?:\r?\n|$)/, '')));
      else {
        const spec = toolchain.yaml.load(raw), split = page.methodPath.indexOf(' '), method = page.methodPath.slice(0, split), apiPath = page.methodPath.slice(split + 1);
        expectedFences.push(...fences(spec.paths[apiPath][method].description ?? ''));
      }
    }
    assert.deepEqual(fences(artifacts[`llms-full-${locale}.txt`]), expectedFences);
  }
  const knownMap = process.env.BRIDGE_LLM_VERIFIED_ROUTES;
  if (knownMap) for (const route of JSON.parse(fs.readFileSync(knownMap, 'utf8')).routes) for (const locale of ['en', 'es', 'pt-br']) {
    assert.ok(manifest.pages.some((entry) => entry.locale === locale && entry.kind === 'operation' && entry.methodPath === route.methodPath && entry.route === route[locale]), 'Native route changed: ' + locale + ' ' + route.methodPath);
  }
});
