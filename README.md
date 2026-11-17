# Bridge developer documentation

Mintlify source for [docs.bridge.new](https://docs.bridge.new). The site covers the REST Integrations API, webhooks and Custom Connections. `docs.json` owns navigation; both API reference tabs are generated directly from the separate files in `api-reference/`.

## Preview and review

Use the installed Mintlify CLI from this directory:

```bash
mint dev --no-open
mint broken-links
```

The static link checker may flag generated OpenAPI pages and production-only `llms.txt` resources. Verify those destinations in the preview or published site rather than treating an HTTP `200` alone as a valid page; also check the page title and content.

Check desktop and mobile navigation, readable code and tables, light and dark mode, and keyboard focus. New recipes belong in the task navigation and must link to the exact endpoint reference. Keep existing documentation URLs and operation summaries stable so generated reference routes continue to resolve.

## Preserve the API contract

Documentation improvements must preserve hosts, methods, paths, operation IDs, authentication, headers, parameters, property names, types, formats, required/nullable fields, enums, defaults, limits and response definitions. A clearer description is not permission to change service behavior or an API signature.

Run the public-contract guard and its negative controls:

```bash
python3 scripts/check-doc-contracts.py
python3 -m unittest discover -s tests/documentation -p 'test_*.py'
```

These checks require Python 3 and Ruby's standard-library YAML parser. Public contract fingerprints allow prose `description` and `summary` edits while protecting schema structure and example data. The tests also protect real schema/property names such as `description` and `examples`. They do not establish that a new description is true or that source matches the deployed service. Never refresh the baseline automatically to make a failure pass; any intentional contract change needs separate review.

## Review operational claims

Every operational correction should have a source, commit and verification scope in the change review. Do not copy private implementation files or credentials into this public repository. Distinguish source review, offline example tests, deployed API verification and publication.

Known items requiring confirmation in this revision:

- The deployed API and dependency versions must be matched to the reviewed source before claiming production behavior was tested.
- The shared error handler uses `Problem.errors[]` and `application/problem+json`, while some published responses declare `HTTPValidationError.detail[]` and `application/json`. The contract is preserved; clients are advised to handle both until deployed behavior is confirmed.
- `STICKER` and `WEBSITE` remain in `FileType`, without a published upload policy covering their extensions, MIME types and size limits. Do not invent that policy or remove enum values. A presign response does not validate actual file bytes or prove size/provider acceptance; integrators must validate their files against the published rules.
- Reviewed legacy handlers can append a symbolic suffix to an error code. Preserve the full value and use only recognized catalog forms; see the error guide. Source-confirmed legacy examples are distinct from a verified deployed response.
- Historical deployment dates and the retirement date of deprecated list filters are not verified. Do not infer them from a documentation commit date.

Webhooks sign Python's sorted JSON representation; the timestamp header is not part of the HMAC. Keep the reproducible vector and receiver guidance consistent. `forceSend` permits reuse, is not idempotency and differs between LeadScout and Agents routes. A successful creation or acceptance response is not a delivery receipt.

The Python documentation tests execute the published verifier, durable receiver and WSGI configuration directly from the English, Spanish and Portuguese MDX examples. They use synthetic fixtures, temporary SQLite databases and no network or private backend source. Coverage includes altered signatures, replay after a process restart, concurrent duplicates, different payloads with the same event ID, acknowledgement after commit and storage failure. Run them through the existing `test_*.py` command; copying an example into a separate test fixture would no longer verify what readers actually copy.

Run `node --test tests/documentation/test-*.mjs` for the export checks and the actual PDF recipe with a simulated transport. The recipe tests verify the checksum, signed upload URL and bytes, credential separation, and that rejected presign requests, checksum mismatches and failed uploads stop before Message creation. They also require the translated recipes to retain the same executable code. These checks prove local example behavior, not deployed upload policy or provider delivery.

The feature label is **Custom Connections**. Existing `/lead-capture` documentation paths, API routes, `captureKey`, schema names and error identifiers remain unchanged. Keep REST, webhook and browser credentials clearly separated.

## Acceptance and publication

The fixed 30-task set under `tests/documentation/` is a proposed evaluation, not a claim that model or human tests passed. Record source version, retrieval mode, model/version, answers, citations and independent review before assigning scores. Human usability tests require actual readers.

Publish through the repository's normal pull-request and Code Owner review process. After publication, compare HTML, Markdown, OpenAPI, `llms.txt`, `llms-full.txt`, MCP results and task search against the approved revision. Saving a branch or viewing a local preview is not production publication.


## Languages and coding-assistant setup

English keeps the existing root URLs. Spanish is under `es/`; Brazilian Portuguese is under `pt-br/` with Mintlify language code `pt-BR`. Each language has the same 26 source pages and 34 API operations. Localized OpenAPI files translate only genuine descriptions and summaries; API identifiers, schemas, types, examples and all wire behavior remain unchanged.

The homepage, first sidebar group and localized navbar link to the four-provider coding-assistant guide. Preserve its distinction between documentation MCP access and customer-workspace API access. Provider interfaces can change: verify commands, configuration formats and links against official documentation when updating the guide.

The contract guard follows OpenAPI object context, including real property names such as `content`, `headers`, `default` and `examples`. Projection version 2 was explicitly migrated from unchanged published English contracts; it does not authorize a contract change. Run it for every language from the repository root:

```bash
python3 scripts/check-doc-contracts.py --source .
python3 scripts/check-doc-contracts.py --source es
python3 scripts/check-doc-contracts.py --source pt-br
python3 -m unittest discover -s tests/documentation -p 'test_*.py'
```

Keep translated code examples byte-identical to the English version. Human-readable Mermaid diagram labels may be localized while retaining their graph identifiers, edges, HTTP methods and status identifiers. Preserve English fragment aliases where translated headings change their slug, and route guide links to the matching localized API reference.

Use a current Mintlify CLI for preview. Older versions can discard language-level navbar/footer overrides or generate selected OpenAPI endpoints without their locale prefix. Each translated OpenAPI binding therefore specifies its source and directory; the single-operation Custom Connections reference is generated in bulk. The existing English binding and URLs remain unchanged.


## Public discovery without MCP

`llms.txt` is a custom trilingual directory: 180 documentation pages and six exact OpenAPI files. `llms-full.txt` collects all three languages; the smaller `llms-{en,es,pt-br}.json` indexes and `llms-full-{en,es,pt-br}.json` collections let HTTP readers choose one language. Public page reads use `.md` (or `Accept: text/markdown`); MCP filesystem page reads use `.mdx`. Collections contain guides and operation descriptions and link to the complete contracts instead of duplicating every schema.

`skill.md` is the maintained capability and source-selection guide. It overrides Mintlify's generated file, which previously contained inaccurate endpoint and payload examples. Keep its existing `name: sainapsisinc` stable for discovery URLs, and preserve the documentation site's technical name and MCP tool identity. The `download-spec` contextual option enables Mintlify's API catalog and direct specification downloads. The generated `sitemap.xml` covers all 150 canonical pages with reciprocal language alternates, including API references with different translated slugs. Families use the exact operation method/path or matching editorial source paths. Canonical HTML metadata and crawler rules remain managed by Mintlify.

Regenerate the public exports after changing navigation, source prose, specifications, or agent instructions:

```bash
npm ci --prefix scripts/llm-tools --ignore-scripts
node scripts/generate-llm-files.mjs
node scripts/generate-llm-files.mjs --check
node --test tests/documentation/test-llm-files.mjs
```

Use Node.js 20 or newer. The pinned toolchain and lock file use Mintlify's actual OpenAPI route generator. Do not guess endpoint slugs or manually edit generated exports. Commit the regenerated files with the source change. CI checks freshness and code preservation, and runs the contract guards for every language; it never refreshes contract fingerprints automatically.

After publishing, compare the two TXT exports and six JSON exports with the approved candidate, follow their Markdown and OpenAPI URLs, and check `/.well-known/llms.txt`, `/.well-known/llms-full.txt`, agent-skill discovery and the API catalog. Verify HTML metadata, content negotiation and the actual visible search separately from MCP results. Search boosts are modest page-specific settings; confirm PDF retrieval and authentication/HMAC control queries after indexing. These checks establish public availability and fidelity, not guaranteed inclusion or ranking in an external search engine or AI provider.

Language exports use JSON because Mintlify supports JSON file downloads on every plan; extra TXT downloads require Enterprise. The two standard root TXT overrides retain their native support. Per-language collection text is in `pages[].contentMarkdown`; source code remains exact after JSON decoding.
