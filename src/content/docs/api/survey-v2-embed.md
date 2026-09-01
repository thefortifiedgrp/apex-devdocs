---
title: "Survey v2: embed API"
description: Browser-direct survey v2 endpoints authenticated with a publishable key and your origin allow-list.
sidebar:
  order: 10
---

The embed API is the browser-facing surface for survey v2. A page on your site calls it directly, authenticated with a publishable key that is safe to ship in client code. This is the API the [survey helper](/survey-helper/) calls in browser-direct mode ("Mode A"); if you use the helper you do not need to call these endpoints yourself, but this page is the reference for what it sends and receives.

All endpoints live under `https://apextelemed.com/api/v2/embed/`. They share their handlers with the [server-side API](/api/survey-v2-server/), so request and response bodies are identical. This page documents the differences and links to the shared [payload shapes](/api/survey-v2-server/#payload-shapes) rather than repeating them.

If you would rather keep every Apex credential on your servers, use the [server-side API](/api/survey-v2-server/) behind your own proxy instead (the survey helper's "Mode B").

## Authentication

Every request must pass three checks, in this order:

1. **Publishable key.** Send it in the `x-apex-publishable-key` header. Keys look like `pk_` followed by 32 hexadecimal characters. Apex issues the key and can rotate it on request; a rotated key stops working immediately.
2. **Embedding enabled.** Apex enables the embed API per partner.
3. **Origin allow-list.** The browser's `Origin` header must exactly match one of the origins Apex has configured for your account, for example `https://shop.example.com`. Matching is exact: scheme, host, and port, with no path, no trailing slash, and no wildcards. Ask Apex to add every origin that will host the survey, including staging hosts.

Your partner identity is derived from the key on the server. Never send a `partnerId`; any value in a query string or body is discarded and replaced.

| Status | `error` | When |
|---|---|---|
| 401 | `Missing x-apex-publishable-key header` | Header absent. |
| 401 | `Invalid publishable key` | Key does not match any partner. |
| 403 | `Embed not enabled for this partner` | Embedding is switched off for your account. |
| 403 | `Missing Origin header` | No `Origin` header. Browsers send it automatically on cross-origin requests; when testing with a tool such as curl, set it yourself. |
| 403 | `Origin not allowed` | `Origin` is not on your allow-list. |
| 500 | `Internal Server Error` | Key lookup failed. Retry. |

:::caution
The publishable key is not an API key. It cannot list members, read responses, create requests, or call any other Partner API endpoint. It only authorises composing, evaluating, and submitting a survey from an allow-listed origin.
:::

### CORS

The API answers preflight requests from any origin; the allow-list is enforced by the authentication step, not by CORS. The preflight response permits the methods `GET`, `POST`, and `OPTIONS` and the headers `Content-Type` and `x-apex-publishable-key`. Requests are made without credentials. Do not send cookies or an `Authorization` header.

## Rate limits

Requests are counted per client IP address in one-minute windows, separately for reads and writes.

| Scope | Endpoints | Limit |
|---|---|---|
| Read | compose, compose by token, check-qualification | 120 requests per minute |
| Write | submit, select-drug, save draft | 20 requests per minute |

When a limit is exceeded the response is `429` with a `Retry-After` header (seconds) and this body:

```json
{ "error": "Too many requests", "retryAfter": 37 }
```

The survey helper calls check-qualification on every step transition, which stays well inside the read limit for one patient. The write limit is per IP, so many patients behind one corporate network address share it.

## What is not on this router

Two endpoints exist only on the [server-side API](/api/survey-v2-server/) because they return a patient's medical answers and the browser holds nothing more than a bare ID:

- Read a submitted response: [`GET /v2/public/surveys/responses/:id`](/api/survey-v2-server/#get-v2publicsurveysresponsesid)
- Read a draft: [`GET /v2/public/surveys/drafts/:id`](/api/survey-v2-server/#get-v2publicsurveysdraftsid)

Requesting those paths on the embed router returns `404`. Fetch them from your backend with your API key, after your own check that the user owns the response or draft.

## Endpoints

The bodies and query parameters below are the same as the server-side API; each section links to the full field table there.

### `GET /v2/embed/surveys`

Compose a survey for one or more drugs. Full parameter reference: [server-side compose](/api/survey-v2-server/#get-v2publicsurveys).

**Query parameters**: `drugIds` (required, comma-separated), `templateId` (optional), `mode` (optional, `initial` or `refill`, default `initial`).

**Response** `200` with a [composed survey](/api/survey-v2-server/#composed-survey).

**Errors**: authentication errors above; `400` `Validation failed` when `drugIds` is missing; `500` with a message when `drugIds` is empty or `templateId` belongs to another partner.

Unknown drug IDs are not rejected; they are omitted from `drugs` and get no result on evaluation.

```bash
curl "https://apextelemed.com/api/v2/embed/surveys?drugIds=nl-semaglutide&mode=initial" \
  -H "x-apex-publishable-key: pk_9d2c4b7e1f3a5c6d8e0b2a4c6e8f0d1b" \
  -H "Origin: https://shop.example.com"
```

### `GET /v2/embed/surveys/by-token`

Compose the survey for a returning-member token and get the member's details for pre-filling. Tokens are minted by your backend with [`POST /v1/surveys/v2/tokens`](/api/surveys/#post-v1surveysv2tokens) and handed to the page, typically in the URL. Reading a token does not consume it.

**Query parameters**: `token` (required).

**Response** `200`

```json
{
  "composed": { "version": "v2", "mode": "refill", "...": "see Composed survey" },
  "patientInfo": { "firstName": "Ana", "lastName": "Reyes", "email": "ana.reyes@example.com", "dob": "1988-04-17", "sex": "f", "state": "TX" },
  "memberId": "2f6d9c1e-8a4b-4c3d-9e7f-0a1b2c3d4e5f",
  "mode": "refill"
}
```

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `token is required` | Missing or empty. |
| 403 | `Token does not belong to this partner` | Unknown token, or minted by another partner. |
| 410 | `Token already used` | Already consumed by a submission. |
| 410 | `Token expired` | Past its expiry. |
| 404 | `Member not found` | The token's member no longer exists. |

```bash
curl "https://apextelemed.com/api/v2/embed/surveys/by-token?token=qT3k9vXb2LmN8pQrS4tUvW6xYz0aBcDe" \
  -H "x-apex-publishable-key: pk_9d2c4b7e1f3a5c6d8e0b2a4c6e8f0d1b" \
  -H "Origin: https://shop.example.com"
```

### `POST /v2/embed/surveys/check-qualification`

Evaluate the answers so far without storing anything, so the page can end the survey early once no drug can qualify. Evaluation is partial: measurements the patient has not reached yet do not disqualify. Full field reference: [server-side check-qualification](/api/survey-v2-server/#post-v2publicsurveyscheck-qualification).

**Request body**: `answers` (required, may be empty), plus either `token` or `drugIds` (with optional `templateId` and `mode`).

**Response** `200` with a [qualification result](/api/survey-v2-server/#qualification-result).

**Errors**: `400` `Validation failed`; `403` `Token does not belong to this partner`; `410` `Token already used` or `Token expired`; `500`.

The survey helper treats a result whose `drugResults` is non-empty and all `qualified: false` as a disqualification and moves the flow to its disqualified state.

```bash
curl -X POST "https://apextelemed.com/api/v2/embed/surveys/check-qualification" \
  -H "x-apex-publishable-key: pk_9d2c4b7e1f3a5c6d8e0b2a4c6e8f0d1b" \
  -H "Origin: https://shop.example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "drugIds": ["nl-semaglutide"],
    "answers": [
      { "questionId": "patient_dob", "value": "1988-04-17" },
      { "questionId": "patient_sex", "value": "f" },
      { "questionId": "patient_state", "value": "TX" }
    ]
  }'
```

### `POST /v2/embed/surveys/responses`

Submit the completed survey. Returns the `responseId` your backend later passes to the [Requests API](/api/requests/) as `v2SurveyResponseId`. Full field reference and side effects: [server-side submit](/api/survey-v2-server/#post-v2publicsurveysresponses).

**Query parameters**: `preview=true` evaluates without storing, consuming a token, or sending a webhook.

**Request body**: `answers` (required), `patientInfo`, and either `token` or `drugIds` (with optional `templateId` and `mode`); optionally `draftId`.

**Response** `201` with a [submit result](/api/survey-v2-server/#submit-result). With `preview=true` the status is `200`, `responseId` is `null`, and `reportedConditions` and `metricValues` are included.

**Errors**: `400` `Validation failed`; `403` `Token does not belong to this partner`; `410` `Token already used` or `Token expired`; `500`.

**Behaviour**

- Not idempotent. Each successful call stores a new response. A token can be submitted once.
- Sends a `survey.completed` [webhook](/api/webhooks/) to your backend with the `responseId`, `qualified`, `drugIds`, `memberId`, and the patient's name and email. That webhook, rather than the browser, is the trustworthy signal that a survey was completed.
- Treat the `responseId` returned to the browser as an opaque handle to pass to your backend. It is not a credential and cannot be used to read the response from the browser.
- `callbackUrl` and `promotion` are returned but are of little use in the browser; the survey helper ignores them.

```bash
curl -X POST "https://apextelemed.com/api/v2/embed/surveys/responses" \
  -H "x-apex-publishable-key: pk_9d2c4b7e1f3a5c6d8e0b2a4c6e8f0d1b" \
  -H "Origin: https://shop.example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "drugIds": ["nl-semaglutide"],
    "answers": [
      { "questionId": "patient_dob", "value": "1988-04-17" },
      { "questionId": "patient_sex", "value": "f" },
      { "questionId": "patient_state", "value": "TX" },
      { "questionId": "vitals_height_weight", "value": { "heightFt": 5, "heightIn": 7, "weightLb": 264 } },
      { "questionId": "merged_conditions", "value": ["hypertension"] },
      { "questionId": "merged_reproductive_conditions", "value": [] },
      { "questionId": "telehealth_consent", "value": true }
    ],
    "patientInfo": {
      "firstName": "Ana",
      "lastName": "Reyes",
      "email": "ana.reyes@example.com",
      "phone": "+15125550142",
      "state": "TX",
      "currentState": "TX",
      "street1": "1 Main St",
      "city": "Austin",
      "zipCode": "78701"
    }
  }'
```

### `POST /v2/embed/surveys/responses/:id/select-drug`

Record the drug the patient chose when more than one qualified. Full reference: [server-side select-drug](/api/survey-v2-server/#post-v2publicsurveysresponsesidselect-drug).

**Path parameters**: `id`, the `responseId`. **Request body**: `{ "drugId": "..." }`.

**Response** `204` with an empty body.

**Errors**: `404` `Response not found`; `403` `Response does not belong to this partner`; `400` `Validation failed`; `500` `Failed to select drug`.

```bash
curl -X POST "https://apextelemed.com/api/v2/embed/surveys/responses/e3b0c442-98fc-4c14-9afb-f4c8996fb924/select-drug" \
  -H "x-apex-publishable-key: pk_9d2c4b7e1f3a5c6d8e0b2a4c6e8f0d1b" \
  -H "Origin: https://shop.example.com" \
  -H "Content-Type: application/json" \
  -d '{ "drugId": "nl-semaglutide" }'
```

### `PUT /v2/embed/surveys/drafts`

Save an in-progress survey on the server so the patient can resume it elsewhere. Saving is allowed from the browser because it discloses nothing the browser did not already have; reading a draft back is server-side only. Full reference: [server-side save draft](/api/survey-v2-server/#put-v2publicsurveysdrafts).

**Request body**: `answers` (required), `stepIndex` (required, 0 to 500), and optionally `draftId`, `drugIds`, `templateId`, `mode`.

**Response** `201` `{ "draftId": "..." }` for a new draft, `200` `{ "draftId": "..." }` for an update. An unknown, expired, or foreign `draftId` silently produces a new draft.

**Errors**: `400` `Validation failed`; `500`.

:::caution
The CORS preflight for this router currently allows only `GET`, `POST`, and `OPTIONS`. A cross-origin `PUT` from a browser fails the preflight and never reaches the server. Until that changes, save drafts from your backend through the [server-side API](/api/survey-v2-server/#put-v2publicsurveysdrafts), or rely on the survey helper's built-in local draft storage. The survey helper does not call this endpoint.
:::

```bash
curl -X PUT "https://apextelemed.com/api/v2/embed/surveys/drafts" \
  -H "x-apex-publishable-key: pk_9d2c4b7e1f3a5c6d8e0b2a4c6e8f0d1b" \
  -H "Origin: https://shop.example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "drugIds": ["nl-semaglutide"],
    "stepIndex": 1,
    "answers": [
      { "questionId": "patient_dob", "value": "1988-04-17" },
      { "questionId": "patient_sex", "value": "f" },
      { "questionId": "patient_state", "value": "TX" }
    ]
  }'
```

## Security model

- The browser never learns or sends your partner ID; it is resolved from the publishable key.
- A token in a request must have been minted by the partner that owns the key, otherwise the request is rejected with `403` before anything else happens.
- A `responseId` is scoped to the partner that created it. Select-drug on another partner's response returns `403`; reading a response is impossible on this router.
- Anything you need to trust (that a survey was completed, what the result was) should come from the `survey.completed` webhook or from a server-side read with your API key, not from the browser.
