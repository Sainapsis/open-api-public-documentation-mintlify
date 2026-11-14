# Maintaining Bridge documentation exports

These generated files give HTTP-capable assistants direct access to all three documentation languages. They require neither MCP configuration nor tenant credentials. They do not authorize business API requests.

| Public file | Contents at the current reviewed source |
| --- | --- |
| `/llms.txt` | 150 page links: 50 English, 50 Spanish, 50 Brazilian Portuguese; six separate OpenAPI links; agent guidance and locale exports |
| `/llms-full.txt` | Combined content of those 150 sources |
| `/llms-en.json`, `/llms-es.json`, `/llms-pt-br.json` | Structured index with 50 page records and two OpenAPI links per language |
| `/llms-full-en.json`, `/llms-full-es.json`, `/llms-full-pt-br.json` | 50 collected records per language; read each `pages[].contentMarkdown` string |
| `/llms-manifest.json` | Source/output SHA-256 fingerprints and the generated page/operation inventory |
| `/sitemap.xml` | 150 canonical URLs with reciprocal English, Spanish, Brazilian Portuguese and English fallback alternates |

`skill.md` is linked separately as agent guidance and does not change the 150-page inventory. Collections contain editorial content and operation descriptions, **not every API schema**. Read the exact linked OpenAPI specification before generating a request. A larger corpus can exceed an assistant's context limit; the small index and individual `.md` pages are usually the better starting point.

The two root TXT resources remain plain Markdown. Locale resources use JSON, which Mintlify supports on every plan; additional static TXT files require Enterprise. Each JSON has `formatVersion`, `format`, `language`, localized instructions, `schemaScope`, `pages` and `specs`. Index records contain `title`, `source`, `markdownUrl`, `description` and `kind`; collection records add `contentMarkdown`. Parse JSON before using that Markdown: escaped newlines and quotes decode back to their exact original characters. The full content is stored once per page, without a second duplicate corpus string.

## Install and generate

Use Node 20 or later. The lockfile pins the native Mintlify route library and YAML parser. Puppeteer's browser is unnecessary: installation runs without package scripts.

```bash
npm ci --prefix scripts/llm-tools --ignore-scripts --no-audit --no-fund
node scripts/generate-llm-files.mjs
node --test tests/documentation/test-llm-files.mjs
node scripts/generate-llm-files.mjs --check
```

Run generation whenever navigation, page content, page metadata, API annotations, API operations, shared agent instructions or `skill.md` changes. Commit the two root TXT files, six locale JSON files, `sitemap.xml` and `llms-manifest.json` with that source change. CI must run the tests and `--check`; the latter exits with status 1 if any generated output is stale and does not rewrite it. The check prevents a source change from silently publishing old collected content. A separate authorized automation may regenerate and commit outputs, but this script never pushes or creates commits.

Generation also removes only the six former locale TXT files (`llms-en.txt`, `llms-es.txt`, `llms-pt-br.txt` and their `llms-full-` equivalents). In `--check` mode it reports their presence without deleting them. The two root TXT files and unrelated assets are preserved.

The generator reads `docs.json`, the navigated MDX sources and the six OpenAPI specifications. Route slugs come from Mintlify's `processOpenApiPath`, not a custom translation or slug algorithm. New or removed native operations enter or leave the inventory when generation runs. Page/spec counts are derived from source rather than fixed at 150.

The generator writes only its named root TXT files, locale JSON files, XML sitemap and JSON manifest. It never rewrites MDX, configuration, schemas, code examples or contracts. Every fenced code block and inline code example is protected during component formatting, and tests compare the decoded JSON content with source code fences byte for byte. Notes, warnings, steps, tabs, cards and response-field text remain in the collection. Unknown components and visibility-conditioned content stop generation for review rather than silently dropping content. Restricted pages and authenticated configurations also require an explicit public-export review.

The sitemap groups editorial translations by source path without the language prefix, and API translations by their source specification plus exact method/path. Translated titles are never used to guess equivalent pages. Every canonical URL lists itself and the other translations with `en`, `es`, `pt-BR` and English `x-default` alternates. Directory `index` aliases resolve to their parent canonical URL; no modification dates are invented. Missing translations or duplicate canonicals stop generation. Tests parse the XML independently with Python 3's standard library, including all 26 API translation families.

Source and output hashes are deterministic and contain no generated timestamps. Raw specification hashes cover every byte, including properties literally named `description`, `examples` or `default`. Those hashes detect drift; the separate contract guard decides whether a source change preserves API signatures.

## Preview and verify publication

Copy the generated files into the documentation root. Check both root TXT routes and the six JSON routes in a real Mintlify preview and again in production. The official custom-root TXT override does not extend static TXT support to every plan. This project uses supported JSON assets with short, predictable filenames for locale exports.

```bash
node scripts/check-llm-exports.mjs --base-url http://localhost:3000 --all-pages --report /tmp/bridge-llm-preview.json
```

After deployment succeeds, run the same read-only check against production:

```bash
node scripts/check-llm-exports.mjs --base-url https://docs.bridge.new --all-pages --report /tmp/bridge-llm-publication.json
```

It reads the eight exports, XML sitemap, six specifications, root `.well-known` aliases, agent guidance and optionally every Markdown page. Export/spec/sitemap SHA-256 values must match the reviewed manifest; all pages must return Markdown. It sends no feedback, tenant request or write. The manifest itself is kept locally for comparison; its public URL is useful provenance, not a prerequisite for reading documentation.

The checker parses each locale JSON and validates format, language, page/spec counts, unique Markdown URLs and nonempty collection content. H1 checks apply only to the two root Markdown TXT resources. XML is checked separately. The source tests include a malformed-JSON negative control, a corrupted HTTP collection and the six-file migration boundary.

For staging outside the repository, pass `--source-root PATH --output-root PATH`. `--module-root PATH` can point to an existing package directory containing `node_modules/@mintlify/scraping` and `node_modules/js-yaml`; the default is `scripts/llm-tools`. Tests use `BRIDGE_LLM_SOURCE_ROOT` and `BRIDGE_LLM_MODULE_ROOT` for the same staging use case. `BRIDGE_LLM_VERIFIED_ROUTES` optionally compares native routes with a previously verified route map.

## Platform scope and primary references

Mintlify explicitly supports custom root `llms.txt` and `llms-full.txt` overrides; removing either restores its generated counterpart. Its automatic exports cover the default language/version. [Official llms.txt documentation](https://www.mintlify.com/docs/ai/llmstxt).

Mintlify provides `.md` page exports and Markdown content negotiation. Code-block content stays unchanged in its native Markdown export. [Official Markdown export documentation](https://www.mintlify.com/docs/ai/markdown-export).

Mintlify serves `.json` and `.yaml` static assets on all plans, while additional `.txt` assets require Enterprise. Repository paths map directly to public paths; moving a TXT file to an `assets` folder does not change its supported type. [Official file-serving types](https://www.mintlify.com/docs/create/files#supported-file-types).

Navigation, hidden-page settings and indexing controls affect discovery; an accessible URL alone does not prove search indexing. [Official SEO documentation](https://www.mintlify.com/docs/optimize/seo).

Mintlify supports a custom root `sitemap.xml`. Google documents XML sitemap language alternates as an equivalent way to declare localized page families, provided every URL includes all reciprocal variants and itself. This supplies explicit language equivalence for generated API routes whose translated slugs differ. It does not establish crawling or indexing. [Mintlify custom sitemaps](https://www.mintlify.com/docs/optimize/seo#custom-sitemaps-and-robotstxt-files), [Google localized-page sitemap guidance](https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap).

These custom resources improve direct HTTP discovery. They do not change MCP identity, its `language` filter, API behavior or native UI, and do not prove Google/other crawler indexing or any change to search ranking. Retrieval checks are separate from the prepared formal model-answer benchmark.
