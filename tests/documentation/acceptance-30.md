# Fixed 30-task acceptance set

Use both retrieval modes in `acceptance-30.json`. Save model/version, source version, answer, citations, and independent review. This set has not been executed against fresh LLM sessions. No human usability result is claimed.

| ID | Type | Task | Critical |
| --- | --- | --- | --- |
| T01 | standard | REST host and authentication | Yes |
| T02 | standard | Public Custom Connections contract | Yes |
| T03 | standard | Workspace and identity scope | Yes |
| T04 | standard | Contact lookup | No |
| T05 | standard | Human user lookup | Yes |
| T06 | standard | Agent discovery and availability | No |
| T07 | standard | Provider channel versus line ID | Yes |
| T08 | standard | Template selectors | No |
| T09 | standard | Variable defaults and drift | No |
| T10 | standard | Custom attribute shape | No |
| T11 | standard | Message request and delivery | Yes |
| T12 | standard | Upload and send PDF | Yes |
| T13 | standard | Opaque cursors | No |
| T14 | standard | Shared rate budget | Yes |
| T15 | standard | 422 parser by operation | Yes |
| T16 | standard | Empty release response | No |
| T17 | standard | Asynchronous handoff | Yes |
| T18 | standard | Custom Connections acceptance | Yes |
| T19 | standard | CORS tenant lookup | Yes |
| T20 | standard | Consent evidence | Yes |
| T21 | contrast_or_adversarial | Reject stale forceSend premises | Yes |
| T22 | contrast_or_adversarial | Exact canonical HMAC and unsigned timestamp | Yes |
| T23 | contrast_or_adversarial | Per-operation attempts and non-global event identity | Yes |
| T24 | contrast_or_adversarial | Undocumented sticker rules | No |
| T25 | contrast_or_adversarial | Retry with reused CAPTCHA | Yes |
| T26 | contrast_or_adversarial | Email and phone normalization | No |
| T27 | contrast_or_adversarial | Inventing a channel ID | Yes |
| T28 | contrast_or_adversarial | MCP scope and feedback | No |
| T29 | contrast_or_adversarial | llms-full is not whole contract | Yes |
| T30 | contrast_or_adversarial | Renamed feature unchanged wire contract | Yes |
