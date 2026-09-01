---
title: Environments
description: Base URLs for the sandbox and production environments, and what differs between them.
sidebar:
  order: 3
---

Apex runs two environments. They are fully separate deployments: separate data, separate partner accounts, and separate credentials. A key issued for one environment does not work in the other.

| Environment | API base URL | Use it for |
| --- | --- | --- |
| Sandbox | `https://apextelemed-dev.web.app/api` | Building and testing your integration. No real providers, pharmacies, or charges. |
| Production | `https://apextelemed.com/api` | Live patients. Real provider review, pharmacy fulfilment, and billing. |

Every path in this documentation is relative to the API base URL. For example, `GET /v1/drugs` is `https://apextelemed.com/api/v1/drugs` in production.

## Path prefixes

| Prefix | Surface | Auth |
| --- | --- | --- |
| `/v1/…` | [Partner API](/api/): requests, members, drugs, survey lookups, billing | API key |
| `/v1/messages/…` | [Messaging](/api/messaging/) | API key |
| `/v2/public/…` | [Survey v2, server-side](/api/survey-v2-server/) | API key |
| `/v2/embed/…` | [Survey v2, embed](/api/survey-v2-embed/) | Publishable key plus allow-listed origin |

## What is different in the sandbox

- Requests are not reviewed by real providers. Ask Apex how decisions are simulated in your sandbox so you can exercise every [request status](/api/requests/#request-lifecycle) and [webhook event](/api/webhooks/).
- No pharmacy receives sandbox prescriptions and no invoice is issued.
- Sandbox publishable keys have their own origin allow-list. Add your local development origins (for example `http://localhost:5173`) to the sandbox partner, not to production.

## Moving to production

1. Ask Apex for production credentials. You receive a new API key, publishable key, and (for partner SDK sites) tenant key.
2. Have Apex allow-list your production origins for the embed API.
3. Point your configuration at `https://apextelemed.com/api` and set your production [webhook URL](/api/webhooks/) in the partner portal.
4. Verify with a read-only call such as `GET /v1/drugs` before submitting any request.

:::caution
Never reuse sandbox credentials in production or commit either set to source control. Keep API keys and tenant keys on the server; only the publishable key may ship to the browser. See [Authentication](/getting-started/authentication/).
:::
