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
- `STICKER` and `WEBSITE` remain in `FileType`, without a published upload policy covering their extensions, MIME types and size limits. Do not invent that policy or remove enum values.
- Historical deployment dates and the retirement date of deprecated list filters are not verified. Do not infer them from a documentation commit date.

Webhooks sign Python's sorted JSON representation; the timestamp header is not part of the HMAC. Keep the reproducible vector and receiver guidance consistent. `forceSend` permits reuse, is not idempotency and differs between LeadScout and Agents routes. A successful creation or acceptance response is not a delivery receipt.

The feature label is **Custom Connections**. Existing `/lead-capture` documentation paths, API routes, `captureKey`, schema names and error identifiers remain unchanged. Keep REST, webhook and browser credentials clearly separated.

## Acceptance and publication

The fixed 30-task set under `tests/documentation/` is a proposed evaluation, not a claim that model or human tests passed. Record source version, retrieval mode, model/version, answers, citations and independent review before assigning scores. Human usability tests require actual readers.

Publish through the repository's normal pull-request and Code Owner review process. After publication, compare HTML, Markdown, OpenAPI, `llms.txt`, `llms-full.txt`, MCP results and task search against the approved revision. Saving a branch or viewing a local preview is not production publication.
