---
title: Authentication
description: The credentials Apex issues, which header each one goes in, where it is safe to use, and how to rotate it.
sidebar:
  order: 4
---

Apex issues a small set of credentials per partner, per [environment](/getting-started/environments/). Each one is scoped to a single job.

| Credential | Format | Sent as | Used by | Where you get it |
| --- | --- | --- | --- | --- |
| API key | `apx_` + 32 hex characters | `x-api-key` header | [Partner API](/api/), [messaging](/api/messaging/), [server-side survey v2](/api/survey-v2-server/) | Partner portal, Settings |
| Publishable key | `pk_` + 32 hex characters | `x-apex-publishable-key` header | [Embed survey v2](/api/survey-v2-embed/) from the browser | Issued by Apex |
| Survey token | Opaque string | Query or body of the survey `by-token` endpoints | Returning-member and refill survey flows | Minted by your server with [`POST /v1/surveys/v2/tokens`](/api/surveys/) |
| Webhook secret | Opaque string | Never sent by you; Apex signs each delivery with it | Verifying [webhooks](/api/webhooks/) you receive | Partner portal, Settings |
| Tenant key | Opaque string | `x-tenant-key` header | [Partner SDK](/partner-sdk/) sites talking to their tenant backend | Issued with your tenant |

## API key

The API key identifies your partner account on every server-to-server call. Send it in the `x-api-key` header:

```bash
curl https://apextelemed.com/api/v1/requests \
  -H "x-api-key: apx_0123456789abcdef0123456789abcdef"
```

A missing key returns `401 { "error": "API Key missing" }`. An unrecognised key returns `401 { "error": "Invalid API Key" }`.

Keep the API key on your server. It grants read and write access to every member and request under your account, so it must never be embedded in a web page, a mobile app, or client-side JavaScript. If you need to call Apex from a browser, use the publishable key with the embed API, or proxy the call through your backend.

### Rotating the API key

Rotate the key from the partner portal under Settings. The new key takes effect immediately and the previous key stops working. Update your server configuration before rotating, or plan for a short outage.

## Publishable key

The publishable key is safe to ship to the browser. It only unlocks the [embed survey v2 API](/api/survey-v2-embed/), and only from origins that Apex has allow-listed for your partner account. Send it in the `x-apex-publishable-key` header; the browser adds the `Origin` header on its own.

A request from an origin that is not on the allow-list is rejected, so local development needs `http://localhost:<port>` added to your sandbox partner. Contact Apex to add or remove origins, and to rotate the key if it is compromised.

The [survey helper](/survey-helper/auth-and-modes/) handles this header for you.

## Survey tokens

When a returning member starts a refill or a follow-up survey, your server mints a short-lived token with [`POST /v1/surveys/v2/tokens`](/api/surveys/) and hands it to the browser. The embed and server-side survey APIs accept it on their `by-token` endpoints to compose a survey that is already tied to that member. Tokens carry no long-term access, so they are safe to pass to the client.

## Webhook secret

Apex signs every webhook delivery with your webhook secret. Read the secret from the partner portal under Settings, store it on the server that receives webhooks, and verify the signature before trusting a payload. The [webhooks page](/api/webhooks/) shows the header, the algorithm, and a verification example.

## Tenant key

Sites built on the [partner SDK](/partner-sdk/) talk to a per-partner tenant on the Apex partner backend. The tenant key selects that tenant on each request. It is passed to `configure()` at boot and sent as the `x-tenant-key` header. Treat it like a publishable key: it is expected in the browser, but only for the origins you deploy to.

## Good practice

- One credential per environment. Sandbox keys never touch production, and the reverse.
- Store keys in your secret manager or environment variables, never in source control.
- Give each server that needs the API key the key and nothing else. If you have several systems, ask Apex whether separate partner accounts make sense.
- Rotate immediately if a key appears in a log, a ticket, or a public repository.
