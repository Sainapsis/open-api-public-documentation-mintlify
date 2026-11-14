#!/usr/bin/env node
/** Deterministic public documentation exports. Never writes source pages or contracts. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const slash = (value) => value.split(path.sep).join('/');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const text = (value) => String(value ?? '');
const LABELS = {
  en: { name: 'English', introduction: 'Read Bridge documentation with any web or HTTP reader. MCP setup and workspace credentials are not needed to read these public sources.', scope: 'This corpus contains guides and operation descriptions. It does not embed every request and response schema. Read the linked OpenAPI contract before generating a request.', preserve: 'Preserve the published hosts, methods, paths, authentication, field names, types, required and nullable fields, enums, defaults, limits, and response codes. Translations describe the same API.', note: 'Note', warning: 'Warning', reference: 'Operation reference', contract: 'Exact OpenAPI contract', guides: 'Guides and reference pages', api: 'API endpoint pages', specs: 'OpenAPI specifications', indexes: 'Language indexes and collected documentation', full: 'Collected documentation', instruction: 'Choose the reader’s language, read the relevant workflow and endpoint, then consult its exact OpenAPI contract. Cite the sources you used. These exports do not grant permission to make live business requests.', index: 'Documentation index' },
  es: { name: 'Español', introduction: 'Lee la documentación Bridge con cualquier herramienta web o HTTP. No necesitas configurar MCP ni credenciales de un workspace para leer estas fuentes públicas.', scope: 'Este corpus contiene guías y descripciones de operaciones. No incluye todos los esquemas de solicitud y respuesta. Lee el contrato OpenAPI enlazado antes de generar una solicitud.', preserve: 'Conserva los hosts, métodos, rutas, autenticación, nombres de campos, tipos, campos obligatorios y anulables, enums, valores predeterminados, límites y códigos de respuesta publicados. Las traducciones describen la misma API.', note: 'Nota', warning: 'Advertencia', reference: 'Referencia de la operación', contract: 'Contrato OpenAPI exacto', guides: 'Guías y páginas de referencia', api: 'Páginas de endpoints de la API', specs: 'Especificaciones OpenAPI', indexes: 'Índices por idioma y documentación recopilada', full: 'Documentación recopilada', instruction: 'Elige el idioma del lector, lee el flujo y el endpoint pertinentes y consulta su contrato OpenAPI exacto. Cita las fuentes utilizadas. Estos exports no autorizan solicitudes de negocio reales.', index: 'Índice de documentación' },
  'pt-br': { name: 'Português do Brasil', introduction: 'Leia a documentação Bridge com qualquer ferramenta web ou HTTP. Você não precisa configurar MCP nem fornecer credenciais de um workspace para ler estas fontes públicas.', scope: 'Este corpus contém guias e descrições de operações. Ele não inclui todos os schemas de requisição e resposta. Leia o contrato OpenAPI vinculado antes de gerar uma requisição.', preserve: 'Preserve os hosts, métodos, rotas, autenticação, nomes de campos, tipos, campos obrigatórios e anuláveis, enums, valores padrão, limites e códigos de resposta publicados. As traduções descrevem a mesma API.', note: 'Nota', warning: 'Aviso', reference: 'Referência da operação', contract: 'Contrato OpenAPI exato', guides: 'Guias e páginas de referência', api: 'Páginas de endpoints da API', specs: 'Especificações OpenAPI', indexes: 'Índices por idioma e documentação reunida', full: 'Documentação reunida', instruction: 'Escolha o idioma do leitor, leia o fluxo e o endpoint relevantes e consulte o contrato OpenAPI exato. Cite as fontes utilizadas. Estes arquivos não autorizam requisições de negócio reais.', index: 'Índice da documentação' },
};

export async function loadToolchain(moduleRoot = path.join(HERE, 'llm-tools')) {
  const require = createRequire(path.join(path.resolve(moduleRoot), 'package.json'));
  const yaml = require('js-yaml');
  const scrapingRoot = path.dirname(require.resolve('@mintlify/scraping/package.json'));
  const common = await import(pathToFileURL(path.join(scrapingRoot, 'bin/openapi/common.js')));
  const api = await import(pathToFileURL(path.join(scrapingRoot, 'bin/apiPages/common.js')));
  return { yaml, processOpenApiPath: common.processOpenApiPath, findNavGroup: api.findNavGroup };
}

/** Keep fence bytes, indentation and language annotations untouched. */
export function segments(source) {
  const result = []; let current = '', fence = null;
  for (const line of source.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    if (!fence) {
      const match = line.match(/^[ \t]*(`{3,}|~{3,})[^\n]*\n?$/);
      if (match) { if (current) result.push({ code: false, value: current }); current = line; fence = match[1]; }
      else current += line;
    } else {
      current += line;
      const match = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*\r?\n?$/);
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length) {
        result.push({ code: true, value: current }); current = ''; fence = null;
      }
    }
  }
  ensure(!fence, 'Unclosed code fence in source');
  if (current) result.push({ code: false, value: current });
  return result;
}
export const fences = (source) => segments(source).filter((x) => x.code).map((x) => x.value);

function attributes(source) {
  const result = {};
  for (const match of source.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]+)\})/g)) result[match[1]] = match[2] ?? match[3] ?? match[4];
  return result;
}
function markdownLink(label, url) { return `[${text(label).replaceAll('[', '\\[').replaceAll(']', '\\]')}](${url})`; }
function description(value) { return text(value).split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim().slice(0, 300); }
function absoluteLink(href, context) {
  if (!href || /^(?:https?:|mailto:|tel:|data:)/i.test(href)) return href;
  const url = new URL(href, context.base + context.route);
  const decoded = decodeURI(url.pathname).replace(/\/$/, '') || '/';
  const sourceRoute = context.aliases.get(decoded);
  if (sourceRoute) url.pathname = sourceRoute + '.md';
  return url.toString();
}

/** Format known Mintlify components, retaining all visible content and protected code. */
export function toMarkdown(source, context) {
  const labels = LABELS[context.locale];
  const protectedCode = [];
  const protect = (value) => { const key = `\u0000BRIDGE_CODE_${protectedCode.length}\u0000`; protectedCode.push(value); return key; };
  let output = segments(source).map((part) => part.code ? protect(part.value) : part.value).join('');
  // Inline examples/identifiers must not be treated as HTML or links.
  output = output.replace(/(`+)([^`\n]*?)\1/g, (all) => protect(all));
  ensure(!/\bfor\s*=\s*["'](?:humans|agents)["']|<Conditional\b|<User\b/.test(output), 'Visibility-conditioned MDX needs an explicit public-export review');
  output = output.replace(/<!--[^]*?-->/g, '');
  output = output.replace(/<a\s+([^>]*\bhref\s*=[^>]*)>([^]*?)<\/a>/g, (_all, attrs, body) => markdownLink(body.replace(/<\/?span\b[^>]*>/g, ''), absoluteLink(attributes(attrs).href, context)));
  output = output.replace(/<a\s+(?:id|name)=[^>]*>\s*<\/a>/g, '');
  output = output.replace(/<kbd>([^]*?)<\/kbd>/g, (_all, body) => protect('`' + body + '`'));
  output = output.replace(/<(Note|Warning|Step|Tab|Card|ResponseField)\b([^>]*)>/g, (_all, tag, attrs) => {
    const a = attributes(attrs);
    if (tag === 'Note') return `\n\n**${labels.note}**\n\n`;
    if (tag === 'Warning') return `\n\n**${labels.warning}**\n\n`;
    if (tag === 'ResponseField') return `\n\n### ${protect('`' + text(a.name) + '`')}${a.type ? ' (' + protect('`' + a.type + '`') + ')' : ''}\n\n`;
    const title = a.title ?? '';
    return `\n\n### ${a.href ? markdownLink(title, absoluteLink(a.href, context)) : title}\n\n`;
  });
  output = output.replace(/<\/(?:Note|Warning|Step|Tab|Card|ResponseField)>/g, '\n\n');
  output = output.replace(/<\/?(?:Steps|Tabs|CardGroup|CodeGroup|div|p|span)\b[^>]*>/g, '\n');
  ensure(!/<\/?[A-Z][A-Za-z0-9.]*\b/.test(output), 'Unknown MDX component: add a lossless export rule before publishing');
  output = output.replace(/(!?\[[^\]\n]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_all, label, href) => `${label}(${absoluteLink(href, context)})`);
  output = output.replace(/\n{3,}/g, '\n\n');
  output = output.replace(/\u0000BRIDGE_CODE_(\d+)\u0000/g, (_all, index) => protectedCode[Number(index)]);
  ensure(JSON.stringify(fences(source)) === JSON.stringify(fences(output)), 'Code fence bytes changed during Markdown conversion');
  return output.trim() + '\n';
}

function frontmatter(raw, yaml, filename) {
  const match = raw.match(/^---\r?\n([^]*?)\r?\n---(?:\r?\n|$)/);
  ensure(match, 'Missing frontmatter: ' + filename);
  const metadata = yaml.load(match[1]) ?? {};
  ensure(typeof metadata === 'object' && !Array.isArray(metadata), 'Invalid frontmatter: ' + filename);
  ensure(!metadata.groups && !metadata.auth && !metadata.authentication, 'Restricted page cannot be exported without explicit public review: ' + filename);
  return { metadata, body: raw.slice(match[0].length) };
}
function publicPage(metadata) { return !metadata.hidden && !metadata.noindex && metadata.searchable !== false; }
function navigationItems(node, result = { pages: [], specs: [] }) {
  if (!node || typeof node !== 'object' || node.hidden || node.searchable === false) return result;
  if (Array.isArray(node)) { for (const item of node) navigationItems(item, result); return result; }
  if (node.openapi) {
    const source = typeof node.openapi === 'string' ? node.openapi : node.openapi.source;
    ensure(typeof source === 'string' && !source.match(/^https?:/), 'Only repository OpenAPI sources are supported');
    result.specs.push({ source, directory: typeof node.openapi === 'object' ? node.openapi.directory : undefined });
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'pages' && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          if (!/^(?:GET|PUT|POST|DELETE|OPTIONS|HEAD|PATCH|TRACE)\s|^https?:/i.test(item)) result.pages.push(item.replace(/^\//, ''));
        } else navigationItems(item, result);
      }
    } else if (['tabs', 'groups', 'anchors', 'dropdowns', 'versions'].includes(key)) navigationItems(value, result);
  }
  return result;
}

export async function buildArtifacts({ sourceRoot, baseUrl = 'https://docs.bridge.new', toolchain }) {
  sourceRoot = path.resolve(sourceRoot); const base = baseUrl.replace(/\/$/, '');
  ensure(new URL(base).protocol === 'https:', 'Published base URL must use HTTPS');
  const { yaml, processOpenApiPath, findNavGroup } = toolchain;
  const inputHashes = {};
  const read = (relative) => {
    ensure(!path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'Source path escapes repository: ' + relative);
    const value = fs.readFileSync(path.join(sourceRoot, relative), 'utf8'); inputHashes[slash(relative)] = sha(value); return value;
  };
  const config = JSON.parse(read('docs.json'));
  const agentResources = [];
  if (fs.existsSync(path.join(sourceRoot, 'skill.md'))) {
    const rawSkill = read('skill.md');
    agentResources.push({ source: 'skill.md', url: base + '/skill.md', title: 'Bridge integration guidance for AI agents', sha256: sha(rawSkill) });
  }
  ensure(!config.auth && !config.authentication, 'Authenticated site needs explicit public-export handling');
  const languages = config.navigation?.languages;
  ensure(Array.isArray(languages), 'Expected multilingual navigation.languages');
  const locales = [], entries = [], specs = [];
  for (const language of languages) {
    const locale = language.language.toLowerCase();
    ensure(LABELS[locale], 'Unsupported export locale: ' + locale);
    locales.push(locale);
    const nav = navigationItems(language);
    for (const page of [...new Set(nav.pages)]) {
      const relative = page + '.mdx'; const raw = read(relative); const parsed = frontmatter(raw, yaml, relative);
      if (!publicPage(parsed.metadata)) continue;
      entries.push({ locale, kind: 'page', route: '/' + page, source: relative, title: text(parsed.metadata.title || parsed.metadata.sidebarTitle || page), description: text(parsed.metadata.description), body: parsed.body });
    }
    for (const item of nav.specs) {
      if (specs.some((existing) => existing.source === item.source)) continue;
      const raw = read(item.source); const spec = yaml.load(raw);
      ensure(spec?.openapi && spec.paths, 'Invalid OpenAPI source: ' + item.source);
      const outDir = item.directory ?? path.posix.dirname(item.source);
      const pages = {}, generatedNav = [], decorated = [], promises = [];
      const clonedSpec = structuredClone(spec);
      for (const [apiPath, pathItem] of Object.entries(clonedSpec.paths)) processOpenApiPath(apiPath, pathItem, clonedSpec, generatedNav, decorated, promises, pages, { openApiFilePath: item.source, writeFiles: false, outDir }, findNavGroup);
      ensure(promises.length === 0, 'Native route generator attempted source writes');
      const prefix = '/' + item.source + ' ';
      const exported = new Set();
      for (const [route, page] of Object.entries(pages)) {
        ensure(page.openapi.startsWith(prefix), 'Unexpected native OpenAPI reference: ' + page.openapi);
        const methodPath = page.openapi.slice(prefix.length); const split = methodPath.indexOf(' '); const method = methodPath.slice(0, split); const apiPath = methodPath.slice(split + 1);
        const operation = spec.paths[apiPath]?.[method]; ensure(operation && METHODS.has(method), 'Missing operation: ' + methodPath);
        if (operation['x-hidden'] || operation['x-excluded'] || !publicPage(page)) continue;
        ensure(!page.groups && !operation['x-mint']?.groups, 'Restricted operation needs explicit public review: ' + methodPath);
        exported.add(methodPath);
        entries.push({ locale, kind: 'operation', route: '/' + slash(route), source: item.source, title: text(page.title || operation.summary || methodPath), description: text(operation.description), body: text(operation.description), methodPath, operationId: operation.operationId, specUrl: base + '/' + item.source });
      }
      const publicOperations = Object.entries(spec.paths).flatMap(([apiPath, item]) => Object.entries(item).filter(([method, op]) => METHODS.has(method) && !op['x-hidden'] && !op['x-excluded']).map(([method]) => method + ' ' + apiPath));
      ensure(publicOperations.every((key) => exported.has(key)), 'Native routing omitted a public operation from ' + item.source);
      specs.push({ locale, source: item.source, url: base + '/' + item.source, title: text(spec.info?.title || item.source), sha256: sha(raw), operationCount: exported.size });
    }
  }
  ensure(new Set(locales).size === locales.length, 'Duplicate locale');
  ensure(new Set(entries.map((entry) => entry.route)).size === entries.length, 'Duplicate public route');
  const aliases = new Map(entries.map((entry) => [entry.route, entry.route]));
  for (const entry of entries) if (entry.route.endsWith('/index')) aliases.set(entry.route.slice(0, -6) || '/', entry.route);
  const artifacts = {};
  const url = (entry) => base + encodeURI(entry.route) + '.md';
  const indexLine = (entry) => `- ${markdownLink(entry.title, url(entry))}${description(entry.description) ? ': ' + description(entry.description) : ''}`;
  const specsText = (list, label) => `## ${label}\n\n` + list.map((spec) => `- ${markdownLink(spec.title, spec.url)}`).join('\n') + '\n';
  const header = (locale, full) => {
    const labels = LABELS[locale];
    return `# Bridge ${full ? labels.full : labels.index} — ${labels.name}\n\n> ${labels.introduction}\n\n${labels.instruction}\n\n${labels.preserve}\n\n${full ? labels.scope + '\n\n' : ''}`;
  };
  const generatedEntries = entries.map((entry) => {
    const labels = LABELS[entry.locale];
    const context = { base, route: entry.route, locale: entry.locale, aliases };
    let body = toMarkdown(entry.body, context);
    if (entry.kind === 'operation') body = `**${labels.reference}:** \`${entry.methodPath}\`\n\n${entry.operationId ? '**operationId:** `' + entry.operationId + '`\n\n' : ''}${body}\n${markdownLink(labels.contract, entry.specUrl)}\n\n${labels.scope}\n`;
    return { ...entry, markdown: `# ${entry.title}\n\nSource: ${base + encodeURI(entry.route)}\n\n${entry.kind === 'page' && entry.description ? entry.description + '\n\n' : ''}${body}` };
  });
  for (const locale of locales) {
    const labels = LABELS[locale], own = generatedEntries.filter((entry) => entry.locale === locale), ownSpecs = specs.filter((spec) => spec.locale === locale);
    artifacts[`llms-${locale}.txt`] = header(locale, false) + `## ${labels.guides}\n\n` + own.filter((entry) => entry.kind === 'page').map(indexLine).join('\n') + `\n\n## ${labels.api}\n\n` + own.filter((entry) => entry.kind === 'operation').map(indexLine).join('\n') + '\n\n' + specsText(ownSpecs, labels.specs);
    artifacts[`llms-full-${locale}.txt`] = header(locale, true) + specsText(ownSpecs, labels.specs) + '\n---\n\n' + own.map((entry) => entry.markdown).join('\n---\n\n');
  }
  const instructions = config.markdown?.instructions ?? [];
  const globalHeader = `# ${text(config.name || 'Bridge documentation')}\n\n> ${text(config.description)}\n\nRead these public sources directly by HTTP; no MCP configuration or Bridge credentials are required for documentation access. Choose English, Español or Português do Brasil. API hosts and contracts are shared across translations.\n\n## Agent Instructions\n\n${instructions.map((line) => '- ' + line).join('\n')}\n\n`;
  const inventory = locales.map((locale) => `## ${LABELS[locale].name} (${entries.filter((entry) => entry.locale === locale).length} pages)\n\n${generatedEntries.filter((entry) => entry.locale === locale).map(indexLine).join('\n')}\n`).join('\n');
  const exports = locales.flatMap((locale) => [`- ${markdownLink(LABELS[locale].name + ' — index', base + '/llms-' + locale + '.txt')}`, `- ${markdownLink(LABELS[locale].name + ' — collected documentation', base + '/llms-full-' + locale + '.txt')}`]);
  const agentLinks = agentResources.length ? '\n## Agent guidance\n\n' + agentResources.map((resource) => '- ' + markdownLink(resource.title, resource.url)).join('\n') + '\n' : '';
  artifacts['llms.txt'] = globalHeader + agentLinks + '\n' + inventory + '\n' + specsText(specs, 'OpenAPI specifications') + '\n## Language exports\n\n' + exports.join('\n') + '\n';
  artifacts['llms-full.txt'] = globalHeader + 'This combined corpus contains all three languages. It includes guides and operation descriptions, but does not embed every request and response schema. Read the exact OpenAPI contract linked for each surface before generating requests.\n\n' + agentLinks + '\n' + specsText(specs, 'OpenAPI specifications') + '\n' + generatedEntries.map((entry) => entry.markdown).join('\n---\n\n');
  const manifest = { formatVersion: 1, generator: 'scripts/generate-llm-files.mjs', routeGenerator: '@mintlify/scraping processOpenApiPath', baseUrl: base, totals: { locales: locales.length, pages: entries.length, editorialPages: entries.filter((entry) => entry.kind === 'page').length, operationPages: entries.filter((entry) => entry.kind === 'operation').length, specs: specs.length }, byLocale: Object.fromEntries(locales.map((locale) => [locale, { pages: entries.filter((entry) => entry.locale === locale).length, editorialPages: entries.filter((entry) => entry.locale === locale && entry.kind === 'page').length, operationPages: entries.filter((entry) => entry.locale === locale && entry.kind === 'operation').length }])), inputs: Object.fromEntries(Object.entries(inputHashes).sort(([a], [b]) => a.localeCompare(b))), pages: entries.map(({ locale, kind, route, source, title, methodPath, operationId }) => ({ locale, kind, route, source, title, ...(methodPath ? { methodPath, operationId } : {}) })), specs, agentResources, outputs: Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, { bytes: Buffer.byteLength(value), sha256: sha(value) }])) };
  artifacts['llms-manifest.json'] = JSON.stringify(manifest, null, 2) + '\n';
  return { artifacts, manifest };
}

export function applyArtifacts(artifacts, outputRoot, check = false) {
  const changed = [];
  for (const [name, value] of Object.entries(artifacts)) {
    ensure(/^(?:llms(?:-full)?(?:-[a-z-]+)?\.txt|llms-manifest\.json)$/.test(name), 'Unexpected output filename: ' + name);
    const target = path.join(outputRoot, name); const old = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (old === value) continue;
    changed.push(name);
    if (!check) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); }
  }
  return changed;
}
async function main() {
  const args = process.argv.slice(2); const values = {}; let check = false;
  while (args.length) { const arg = args.shift(); if (arg === '--check') check = true; else { ensure(['--source-root', '--output-root', '--module-root', '--base-url', '--report'].includes(arg), 'Unknown option: ' + arg); ensure(args.length, 'Missing value for ' + arg); values[arg] = args.shift(); } }
  const sourceRoot = path.resolve(values['--source-root'] || path.join(HERE, '..')); const outputRoot = path.resolve(values['--output-root'] || sourceRoot);
  const result = await buildArtifacts({ sourceRoot, baseUrl: values['--base-url'], toolchain: await loadToolchain(values['--module-root']) });
  const changed = applyArtifacts(result.artifacts, outputRoot, check);
  const report = { mode: check ? 'check' : 'write', ...result.manifest.totals, changed, upToDate: changed.length === 0, codeFencePreservation: 'exact', rootIndexBytes: Buffer.byteLength(result.artifacts['llms.txt']), combinedCorpusBytes: Buffer.byteLength(result.artifacts['llms-full.txt']) };
  if (values['--report']) fs.writeFileSync(values['--report'], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (check && changed.length) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
