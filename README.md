# Bridge API & Webhooks

Documentation for integrating with Bridge through REST API and webhooks.

## Two Integration Methods

### 🔗 REST API
- **Contact Management** - Create, read, update, and delete contacts
- **Multi-tenant** - Workspace-scoped operations  
- **Secure** - API key authentication with request signing

### ⚡ Webhooks  
- **Real-time Events** - Instant notifications when events occur
- **Event Types** - User activities, task updates, opportunity changes
- **Reliable** - Built-in retry logic and idempotency

## Quick Start

1. **API Integration**: See [API Reference](/api-reference/introduction)
2. **Webhook Setup**: See [Webhook Guide](/webhooks)
3. **Authentication**: Generate API keys from Bridge Dashboard

## Documentation Structure

- **Landing Page** (`/`) - Overview and quick navigation
- **Webhooks** (`/webhooks`) - Complete webhook implementation guide  
- **API Reference** (`/api-reference/introduction`) - Auto-generated from OpenAPI spec

## Development

```bash
npm i -g mintlify
mintlify dev
```

## Support

- **Email**: api-support@bridge.com
- **Dashboard**: https://dashboard.bridge.com
- **Status**: https://status.bridge.com
