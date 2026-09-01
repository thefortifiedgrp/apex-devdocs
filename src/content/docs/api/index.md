---
title: Overview
description: Base URLs, authentication, request and response conventions, and the endpoint groups that make up the Apex Telemed Partner API.
sidebar:
  order: 1
---

The Partner API is a server-to-server REST API. You use it to register patients (members), submit prescription requests for review by an Apex prescriber, follow each request through approval and pharmacy fulfilment, and read your billing summary. Apex notifies your backend of status changes through [webhooks](/api/webhooks/).

## Base URLs

| Environment | Base URL |
| --- | --- |
| Production | `https://apextelemed.com/api/v1` |
| Sandbox | `https://dev.apextelemed.com/api/v1` |

Every path in this reference is relative to the base URL. `POST /v1/requests` means `POST https://apextelemed.com/api/v1/requests` in production.

API keys are issued per environment. A sandbox key does not work in production and vice versa. See [Environments](/getting-started/environments/) for how to obtain credentials for each.

## Authentication

Send your API key in the `x-api-key` header on every request. A key is the string `apx_` followed by 32 hexadecimal characters. There is one kind of key: sandbox and production are separate deployments with separately issued keys, not test and live modes of the same key.

```bash
curl https://apextelemed.com/api/v1/drugs \
  -H "x-api-key: apx_0123456789abcdef0123456789abcdef"
```

The other examples in this reference write the key as `$APEX_API_KEY`; substitute your own.

A missing or unrecognised key is rejected with `401`:

```json
{ "error": "API Key missing" }
```

```json
{ "error": "Invalid API Key" }
```

The key identifies your partner account. Every resource you create belongs to that account, and reads never return another partner's data. See [Authentication](/getting-started/authentication/) for key rotation and storage guidance.

:::danger
Your API key is a secret. Call the Partner API from your backend only. Never ship it in a browser, a mobile app, or a public repository. For browser-based intake, use the [survey embed](/api/survey-v2-embed/), which authenticates with a separate publishable key.
:::

## Conventions

### Requests

- Send request bodies as JSON with `Content-Type: application/json`. Bodies larger than 100 KB are rejected.
- Query parameters are strings. Numeric parameters such as `page` and `limit` are coerced from strings.
- Unknown body fields are ignored.

### Responses

- All responses are JSON, except `204 No Content` responses, which have no body.
- Creating a resource returns `201 Created`. Other successful calls return `200 OK`. Deletes return `204 No Content`.
- Timestamps are ISO 8601 strings in UTC with millisecond precision, for example `2026-08-20T14:20:16.281Z`. Calendar dates such as a date of birth use `YYYY-MM-DD`.
- A field with no value is returned as `null` rather than omitted, unless the field is documented as optional.

### Identifiers

| Resource | Format | Example |
| --- | --- | --- |
| Request | UUID | `3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11` |
| Line item | UUID | `f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f` |
| Member | UUID | `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d` |
| Drug | Slug of letters, digits, `-` and `_`, up to 128 characters | `nl-semaglutide-inj` |
| SKU | Opaque string beginning with `sku_` | `sku_2_5mg_1ml` |

Treat every identifier as an opaque string. Do not parse or construct them.

### Pagination

List endpoints accept `page` (default `1`) and `limit` (default `20`, maximum `100`) and return a `pagination` object alongside the results.

```json
{
  "requests": [],
  "pagination": { "page": 1, "limit": 20, "total": 57, "totalPages": 3 }
}
```

Results are ordered newest first by creation time. Filters are applied before pagination, so `total` counts matching records only.

### Errors

Every error carries an HTTP status code and a JSON body with an `error` field.

```json
{ "error": "Request not found" }
```

When a body or query string fails validation, `error` is an array of issues instead of a string. Each issue names the offending field in `path`.

```json
{
  "error": [
    {
      "code": "invalid_string",
      "validation": "email",
      "path": ["member", "email"],
      "message": "Invalid email address"
    }
  ]
}
```

A few endpoints add a `details` field with structured context. Each endpoint page lists the errors it emits.

| Status | Meaning |
| --- | --- |
| `400` | Validation failed, or the operation is not allowed in the resource's current state. |
| `401` | API key missing or invalid. |
| `403` | Your account may not use the referenced resource, for example a drug outside your catalogue. |
| `404` | The resource does not exist or belongs to another partner. Ownership failures are reported as `404`, never `403`. |
| `500` | Unexpected server error. Retry with backoff. |

### Idempotency

`POST /v1/requests` accepts an `Idempotency-Key` header. Replaying a create with a key you have already used returns the original request instead of creating a duplicate. See [Idempotent creates](/api/requests/#idempotent-creates). Cancelling a request is safe to retry, and repeated `DELETE` calls return `404` once the record is gone.

### Rate limits

No per-key rate limit is enforced on the Partner API today. Poll list endpoints sparingly and rely on [webhooks](/api/webhooks/) for status changes. Limits may be introduced later, so build clients that back off on `429` responses.

### CORS

Partner API responses carry permissive CORS headers, but the API is designed for server-to-server use. Calling it from a browser would expose your API key to every visitor. Use the [survey embed](/api/survey-v2-embed/) for anything that runs client-side.

## Endpoint groups

| Group | What it covers |
| --- | --- |
| [Requests](/api/requests/) | Create prescription requests, list and retrieve them, cancel or delete them, and trigger pharmacy transmission. Includes the request lifecycle. |
| [Members](/api/members/) | Create, list, update, and delete the patients you submit requests for. |
| [Drugs](/api/drugs/) | The drug and SKU catalogue your account can order from. |
| [Surveys](/api/surveys/) | Find the intake survey that applies to a drug. |
| [Billing](/api/billing/) | Per-period summary of billable members and amounts. |
| [Messaging](/api/messaging/) | Conversations between your patients and Apex prescribers. |
| [Webhooks](/api/webhooks/) | Event notifications for request, delivery, and message activity, with signature verification. |
| [Survey v2 (server)](/api/survey-v2-server/) | Server-side endpoints for the composable survey, including returning-member tokens. |
| [Survey v2 (embed)](/api/survey-v2-embed/) | Browser-facing survey endpoints authenticated with your publishable key. |

## A typical integration

1. Fetch your catalogue with `GET /v1/drugs` and cache the drug and SKU identifiers.
2. Create a member with `POST /v1/members`, or supply the member inline on the request.
3. Submit `POST /v1/requests` with one drug per request.
4. Receive `item.approved`, `item.denied`, or `item.consultation_requested` on your webhook endpoint.
5. Track fulfilment through `pharmacySent` on the line item, then `item.shipped` with tracking details.
