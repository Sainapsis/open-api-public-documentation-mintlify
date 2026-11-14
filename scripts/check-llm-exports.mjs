#!/usr/bin/env node
/** Read-only HTTP verification for the generated documentation resources. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), options = {}; let allPages = false;
while (args.length) {
  const key = args.shift(); if (key === '--all-pages') { allPages = true; continue; }
  if (!['--base-url', '--manifest', '--report'].includes(key) || !args.length) throw new Error('Unexpected or incomplete option: ' + key);
  options[key] = args.shift();
}
const base = (options['--base-url'] || 'https://docs.bridge.new').replace(/\/$/, '');
const baseUrl = new URL(base);
if (!(baseUrl.protocol === 'https:' || baseUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(baseUrl.hostname))) throw new Error('Use HTTPS or an explicit localhost preview');
const manifest = JSON.parse(fs.readFileSync(options['--manifest'] || path.join(HERE, '..', 'llms-manifest.json'), 'utf8'));
const requests = [
  ...Object.entries(manifest.outputs).map(([name, metadata]) => ({ path: '/' + name, kind: 'generated', expectedSha256: metadata.sha256 })),
  ...manifest.specs.map((spec) => ({ path: '/' + spec.source, kind: 'spec', expectedSha256: spec.sha256 })),
  { path: '/.well-known/llms.txt', kind: 'alias', expectedSha256: manifest.outputs['llms.txt'].sha256 },
  { path: '/.well-known/llms-full.txt', kind: 'alias', expectedSha256: manifest.outputs['llms-full.txt'].sha256 },
  ...(manifest.agentResources ?? []).map((resource) => ({ path: '/' + resource.source, kind: 'agent-guidance' })),
  ...(allPages ? manifest.pages.map((page) => ({ path: page.route + '.md', kind: 'page', locale: page.locale })) : []),
];
let cursor = 0; const results = [];
async function worker() {
  while (cursor < requests.length) {
    const request = requests[cursor++];
    try {
      const response = await fetch(base + encodeURI(request.path), { headers: { Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.5', 'User-Agent': 'Bridge-docs-public-export-verifier/1.0' }, signal: AbortSignal.timeout(40000) });
      const bytes = Buffer.from(await response.arrayBuffer()), value = bytes.toString('utf8'), actualSha256 = sha(bytes);
      const result = { ...request, status: response.status, bytes: bytes.length, contentType: response.headers.get('content-type'), sha256: actualSha256, passed: response.status === 200 && (!request.expectedSha256 || request.expectedSha256 === actualSha256) };
      if (request.kind === 'generated') {
        if (request.path === '/sitemap.xml') {
          result.canonicalUrls = (value.match(/<loc>/g) ?? []).length;
          result.languageAlternates = (value.match(/<xhtml:link\b/g) ?? []).length;
          result.passed &&= value.startsWith('<?xml ') && value.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"') && result.canonicalUrls === manifest.sitemap.canonicalCount && result.languageAlternates === manifest.sitemap.canonicalCount * manifest.sitemap.languages.length;
        } else if (request.path.startsWith('/llms-full')) {
          result.sources = (value.match(/^Source:/gm) ?? []).length;
          const locale = request.path.match(/^\/llms-full-(.+)\.txt$/)?.[1];
          result.expectedSources = locale ? manifest.byLocale[locale].pages : manifest.totals.pages;
          result.passed &&= result.sources === result.expectedSources;
        } else if (/^\/llms(?:-[a-z-]+)?\.txt$/.test(request.path)) {
          const links = [...value.matchAll(/^- \[[^\n]*\]\(([^\n]*\.md)\)/gm)].map((match) => match[1]);
          result.editorialAndOperationLinks = links.filter((url) => !url.endsWith('/skill.md')).length;
          const locale = request.path.match(/^\/llms-(.+)\.txt$/)?.[1];
          result.expectedPageLinks = locale ? manifest.byLocale[locale].pages : manifest.totals.pages;
          result.passed &&= result.editorialAndOperationLinks === result.expectedPageLinks;
        }
        if (request.path !== '/sitemap.xml') result.passed &&= /^# /.test(value);
      }
      if (request.kind === 'page') result.passed &&= value.length > 50 && !/^\s*<!doctype html/i.test(value);
      if (request.kind === 'agent-guidance') result.passed &&= value.includes('Bridge integration guidance') && value.includes('/llms-es.txt') && value.includes('/llms-pt-br.txt');
      results.push(result);
    } catch (error) { results.push({ ...request, passed: false, error: error.message }); }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
results.sort((a, b) => a.path.localeCompare(b.path));
const report = { checkedAt: new Date().toISOString(), baseUrl: base, scope: 'GET requests to public documentation resources only. No MCP feedback or business API calls.', allPages, summary: { requests: results.length, passed: results.filter((x) => x.passed).length, failed: results.filter((x) => !x.passed).length }, results };
if (options['--report']) fs.writeFileSync(options['--report'], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary, null, 2));
for (const item of results.filter((x) => !x.passed)) console.error(JSON.stringify(item));
if (report.summary.failed) process.exitCode = 1;
