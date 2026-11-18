---
name: sainapsisinc
description: Integrate with Bridge using its published REST API, webhooks and Custom Connections. Read exact contracts and task guides before generating integration code or diagnosing API behavior.
metadata:
  mintlify-proj: sainapsisinc
  version: "2.0"
  reviewed: "2026-11-14"
---

# Bridge integration guidance

Use this guide for Bridge integration code and documentation lookup. Bridge provides a REST Integrations API, outbound event webhooks and a separate public Custom Connections endpoint for landing-page leads. Read the sources for the requested surface; their credentials and hosts differ.

## Start with the requested language and task

MCP is optional. Any HTTP-capable assistant can read the public documentation without a Bridge API Key:

| Language | Page index | Collected documentation | REST contract | Custom Connections contract |
| --- | --- | --- | --- | --- |
| English | [Index](https://docs.bridge.new/llms-en.json) | [Collection](https://docs.bridge.new/llms-full-en.json) | [OpenAPI](https://docs.bridge.new/api-reference/openapi.yaml) | [OpenAPI](https://docs.bridge.new/api-reference/campaign-leads.openapi.yaml) |
| Español | [Índice](https://docs.bridge.new/llms-es.json) | [Documentación](https://docs.bridge.new/llms-full-es.json) | [OpenAPI](https://docs.bridge.new/es/api-reference/openapi.yaml) | [OpenAPI](https://docs.bridge.new/es/api-reference/campaign-leads.openapi.yaml) |
| Português do Brasil | [Índice](https://docs.bridge.new/llms-pt-br.json) | [Documentação](https://docs.bridge.new/llms-full-pt-br.json) | [OpenAPI](https://docs.bridge.new/pt-br/api-reference/openapi.yaml) | [OpenAPI](https://docs.bridge.new/pt-br/api-reference/campaign-leads.openapi.yaml) |

The [trilingual index](https://docs.bridge.new/llms.txt) enumerates all pages. The [combined collection](https://docs.bridge.new/llms-full.txt) gathers all three languages. Collections contain guides and operation descriptions; use the linked OpenAPI specifications for complete schemas. All languages describe the same API, with identical technical identifiers and behavior.

Follow `.md` links from the index for individual HTTP reads, or request `Accept: text/markdown` at a canonical page URL. Cite the sources you actually read. With Search MCP, set `language` to `en`, `es` or `pt-BR`; the default is `en`. The MCP virtual documentation filesystem uses `.mdx` for page reads. Its commands inspect documentation only and do not run on a user's computer.

Read the task guide and the relevant operation/schema before generating a request:

| Task | English guide; use the matching `/es/` or `/pt-br/` page from the index for translations |
| --- | --- |
| Credentials and authenticated health check | [Authentication](https://docs.bridge.new/credentials.md) |
| Contact → Conversation → Message | [First conversation](https://docs.bridge.new/guides/first-conversation.md) |
| Send a PDF or other attachment | [Attachments](https://docs.bridge.new/guides/send-attachments.md) |
| Discover and supply template variables | [Templates](https://docs.bridge.new/guides/send-template.md) |
| Agent outbound, conversation reuse and handoff | [Agent outbound](https://docs.bridge.new/guides/agent-outbound.md) |
| Create, move, close and reopen pipeline records | [Pipeline records](https://docs.bridge.new/guides/pipeline-records.md) |
| Find IDs, paginate results and interpret acceptance | [Identifiers](https://docs.bridge.new/guides/identifiers.md), [pagination](https://docs.bridge.new/guides/pagination.md), [responses](https://docs.bridge.new/guides/responses.md) |
| Verify and receive webhook events | [Signatures](https://docs.bridge.new/webhooks/verifying-signatures.md), [durable receiver](https://docs.bridge.new/webhooks/receive-events.md) |
| Pipeline record and stage action webhook events | [Pipeline record events](https://docs.bridge.new/webhooks/pipeline-records.md) |
| Landing-page lead capture | [Custom Connections](https://docs.bridge.new/lead-capture/integration.md) |
| Error diagnosis | [REST errors](https://docs.bridge.new/error-codes.md), [Custom Connections errors](https://docs.bridge.new/lead-capture/errors.md) |

## Keep the three integration surfaces separate

- **REST Integrations API:** the server origin is `https://api-connect-us.bridge.new`. Use the exact path from OpenAPI and the `x-api-key` header, including for health checks. Keep the key on your server. The health path is `/bridge/api/health`; do not construct it under a workspace or invent a `/v1` prefix for it.
- **Webhooks:** Bridge posts events to the receiver you configure. Authenticate the webhook API key and validate the HMAC and timestamp using the signature guide. The webhook client secret and API key are separate from REST credentials.
- **Custom Connections:** use its separate OpenAPI server, public `captureKey`, workspace configuration, consent and reCAPTCHA flow. It is designed for the visitor's browser and does not use `x-api-key` or a REST authentication header. **Custom Connections** is the current product name. Existing `/lead-capture` documentation URLs, `captureKey`, campaign-leads paths and `BRIDGE.CAMPAIGN_LEADS` error identifiers remain unchanged.

## Preserve the published contract

Copy the exact host, method, path, operationId, headers, parameter/property names, types, formats, required/nullable fields, enums, defaults, limits and response codes from the relevant specification. Do not reconstruct endpoint paths from this capability summary or invent fields, IDs, providers, payload shapes or polling endpoints. Read a referenced schema rather than inferring its fields from a guide's short example.

Documentation access does not authorize live business requests or feedback submissions. For execution, follow the actual user's task and authorization, use their intended workspace and target, and resolve required identifiers. Keep secrets out of browser code, public files, prompts and logs. Reading public documentation requires no tenant credentials.

## Operational details that affect correct code

- **Attachments:** calculate Base64 SHA-256 from all exact file bytes. Request the documented presigned upload, upload those bytes using the returned URL/method/headers, then reference the returned `mediaId` in a Message's `mediaIds`. The upload URL is not a Bridge REST API URL; do not send a REST API Key to it. Read the current guide for published file types and any unconfirmed size/MIME policy.
- **Messages and asynchronous acceptance:** a `201` Message creation response does not prove provider delivery. A `202` handoff or Custom Connections response acknowledges acceptance, not completed assignment or WhatsApp delivery. Do not invent a status endpoint from a `messageId`, `trackingId` or `requestId`.
- **Outbound conversations:** `forceSend=true` permits reuse of an active conversation; it does not mean create a fresh conversation or make the call idempotent. Released recoverable conversations may also be recovered with `false`. LeadScout and Agents routes differ in line selection and controller checks. Read their exact guide and contract.
- **Templates:** discover the template variable inventory and follow `callerMustSupply`, `isCustom` and omission/blank rules from the template guide. Do not assume an omitted key and a blank string have the same behavior.
- **Webhook HMAC:** sign the Python `json.dumps(event, sort_keys=True).encode("utf-8")` representation with the documented defaults. The raw wire body can have a different key order. `X-Bridge-Timestamp` is not included in the HMAC; freshness alone does not prevent replay with a replaced timestamp. Use the published test vector, durable acceptance and duplicate-handling guidance. Event IDs are entity-derived in reviewed producers; do not assume a globally unique delivery ID or exactly-once delivery.
- **Rate limits and retries:** use the [rate-limit guide](https://docs.bridge.new/rate-limits.md). Respect `Retry-After` and the shared workspace budget. A timeout can occur after a write succeeds; do not automatically repeat arbitrary writes or assume the API supplies an idempotency mechanism.
- **Error codes:** preserve the complete received `code`. Reviewed legacy handlers may return a known catalog code followed by ` | SYMBOLIC_NAME`; use only explicitly recognized forms for catalog lookup, as described in the error guide. Do not rewrite response bodies or compare human-readable messages.
- **Validation errors:** some published responses declare `HTTPValidationError.detail[]`, while reviewed shared error handling uses `Problem.errors[]` and `application/problem+json`. Preserve both documented possibilities in client parsing until current deployed behavior is confirmed. Keep source review distinct from production verification.

If the sources disagree or leave a behavior unspecified, identify the exact passages, state what is known and seek confirmation before relying on the uncertain behavior. A documentation publication does not establish which backend revision is deployed.
