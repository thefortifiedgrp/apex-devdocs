---
title: Surveys
description: Mint returning-member tokens for survey v2 and look up legacy survey assignments, using your API key.
sidebar:
  order: 5
---

Patients qualify for a drug by completing an Apex medical survey. The current survey system, **survey v2**, composes a questionnaire on the fly from the drugs a patient is interested in. It has two integration surfaces:

- [Survey v2: server-side API](/api/survey-v2-server/) for calls from your backend with your API key.
- [Survey v2: embed API](/api/survey-v2-embed/) for calls from a page on your site with a publishable key. The [survey helper](/survey-helper/) wraps this for you.

This page covers the survey endpoints on the Partner API itself: minting tokens that let a known member take a survey v2 questionnaire without re-entering their details, and two lookups for accounts that still use legacy surveys.

All endpoints here require the `x-api-key` header. See [Authentication](/getting-started/authentication/).

## Tokens for returning members

A survey token lets a member you already have on file, for example a patient due for a refill, take a survey that is pre-scoped to them. Your backend mints the token, then either drives the survey itself with the [server-side API](/api/survey-v2-server/), hands the token to a page that uses the [embed API](/api/survey-v2-embed/) or the survey helper, or sends the patient the Apex-hosted link.

**What a token encodes.** A token is an opaque 32-character URL-safe string. It carries no data itself; Apex stores against it your partner ID, the member ID, the drug IDs, the optional partner survey template, the mode (`initial` or `refill`), and the expiry time. Anything a caller sends alongside a token for those values is ignored.

**Lifetime.** Tokens expire 24 hours after minting by default; you can set anything from 1 hour to 30 days. Expired tokens return `410`. There is no endpoint to revoke a token early.

**Single use.** A token is consumed by one successful submission. Composing the survey with it or running check-qualification does not consume it, so a patient can reload the page. A second submission, including a retry after a timeout, returns `410 Token already used`. The check is atomic, so two simultaneous submissions produce exactly one stored response.

**Partner binding.** A token can only be used with your own API key or publishable key. Using it under another partner returns `403`.

**Where a token is used.**

| Call | Purpose |
|---|---|
| `GET /v2/.../surveys/by-token?token=` | Composes the survey for the token's drugs and mode and returns the member's stored details for pre-filling. |
| `POST /v2/.../surveys/check-qualification` with `"token"` in the body | Evaluates partial answers for the token's drugs. |
| `POST /v2/.../surveys/responses` with `"token"` in the body | Submits the survey, links the response to the member, updates the member's contact details from the submitted patient info, and consumes the token. |

The `...` is `public` for the server-side API and `embed` for the embed API.

### `POST /v1/surveys/v2/tokens`

Mint a token for one of your members.

**Request body** (JSON)

| Field | Type | Required | Description |
|---|---|---|---|
| `memberId` | string | Yes | ID of a member that belongs to your account. See [Members](/api/members/). |
| `drugIds` | string[] | Yes | One or more drug IDs the survey should cover. |
| `templateId` | string \| null | No | One of your partner survey templates. Omit to use your default template. |
| `mode` | `initial` \| `refill` | No | Defaults to `initial`. Use `refill` for a renewal check-in; the survey then skips the demographics and template framing sections. |
| `expiresInHours` | integer | No | 1 to 720. Defaults to 24. |

**Response** `201`

```json
{
  "token": "qT3k9vXb2LmN8pQrS4tUvW6xYz0aBcDe",
  "url": "https://apextelemed.com/survey-v2?token=qT3k9vXb2LmN8pQrS4tUvW6xYz0aBcDe",
  "expiresAt": "2026-09-02T14:02:11.318Z",
  "mode": "refill"
}
```

| Field | Type | Description |
|---|---|---|
| `token` | string | The token. Store it or pass it straight to the survey. |
| `url` | string | Link to the [Apex-hosted survey page](#apex-hosted-survey-page) for this token. It is either an absolute URL or a path beginning with `/survey-v2`; if it has no scheme, prefix it with `https://apextelemed.com`. |
| `expiresAt` | string | ISO 8601 expiry time. |
| `mode` | `initial` \| `refill` | The mode stored on the token. |

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `Validation failed` | Missing `memberId`, empty `drugIds`, invalid `mode`, or `expiresInHours` out of range. A `details` object names the field. |
| 404 | `Member not found` | No member with that ID. |
| 403 | `Member does not belong to this partner` | The member exists under another partner. |
| 400 | `Template not found for this partner` | `templateId` is unknown or belongs to another partner. |
| 500 | message | Storage failed. |

Drug IDs are not validated when minting. An unknown drug ID produces a survey with no result for that drug.

```bash
curl -X POST "https://apextelemed.com/api/v1/surveys/v2/tokens" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b" \
  -H "Content-Type: application/json" \
  -d '{
    "memberId": "2f6d9c1e-8a4b-4c3d-9e7f-0a1b2c3d4e5f",
    "drugIds": ["nl-semaglutide"],
    "mode": "refill",
    "expiresInHours": 72
  }'
```

## Apex-hosted survey page

If you do not want to render the survey at all, send the patient to the page Apex hosts at `https://apextelemed.com/survey-v2`. It renders the survey v2 questionnaire with your branding, runs the qualification checks, and shows the results.

The page accepts either of these query strings:

- `?token=<token>` for a returning member. The patient's details are pre-filled from the member record.
- `?partnerId=<your partner ID>&drugIds=<comma-separated drug IDs>` for an anonymous first visit, optionally with `&templateId=` and `&mode=refill`.

When the patient qualifies and confirms their treatment choice, the page records the choice and, if you have configured a **survey callback URL** in the Partner Portal, submits an HTML form by `POST` to that URL with a single field named `data` containing JSON:

```json
{
  "responseId": "e3b0c442-98fc-4c14-9afb-f4c8996fb924",
  "qualified": true,
  "selectedDrugId": "nl-semaglutide",
  "selectedDrugName": "Semaglutide"
}
```

Your callback endpoint should then create the request with the [Requests API](/api/requests/), passing `responseId` as `v2SurveyResponseId`. Without a callback URL the patient simply stays on the results page. No callback is sent when the patient does not qualify; the `survey.completed` [webhook](/api/webhooks/) fires in every case.

:::note
The hosted page talks to Apex over an unauthenticated internal channel. That channel is not a partner integration surface and its behaviour is not covered by this documentation; use the server-side or embed API for your own integration.
:::

## Legacy survey lookups

Before survey v2, each partner activated one or more fixed surveys, each covering a list of drugs. These two endpoints tell you which of the surveys **activated for your account in the Partner Portal** covers a drug. They are only useful if Apex has configured legacy surveys for you. Survey v2 does not use survey IDs: you compose a survey from drug IDs directly.

The returned `surveyId` identifies a survey the Apex-hosted legacy page renders at `https://apextelemed.com/survey/<surveyId>?partnerId=<your partner ID>`.

**Matching rule.** Among your active surveys whose drug list contains the drug, the one with the fewest drugs wins. Ties go to the most recently created survey.

### `GET /v1/surveys/by-drug/:drugId`

**Path parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `drugId` | string | Yes | The drug to look up. |

**Response** `200`

```json
{
  "surveyId": "5b1f8c2e-6d4a-4f3b-9e8c-7a6b5c4d3e2f",
  "name": "Weight management intake",
  "description": "Intake survey for GLP-1 medications",
  "drugIds": ["nl-semaglutide", "nl-tirzepatide-glycine"]
}
```

`description` is `null` when the survey has none.

**Errors**

| Status | `error` | When |
|---|---|---|
| 404 | `No active surveys configured` | Your account has no active legacy surveys. |
| 404 | `No survey found for this drug` | None of your active surveys covers the drug. |
| 500 | `Internal Server Error` | Lookup failed. |

```bash
curl "https://apextelemed.com/api/v1/surveys/by-drug/nl-semaglutide" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b"
```

### `GET /v1/surveys/by-drugs`

Batched version of the lookup above.

**Query parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `drugIds` | string | Yes | Comma-separated drug IDs, at most 50. |

**Response** `200`. Every requested drug ID is a key; the value is `null` when no active survey covers it. When your account has no active surveys at all, every value is `null` and the status is still `200`.

```json
{
  "results": {
    "nl-semaglutide": {
      "surveyId": "5b1f8c2e-6d4a-4f3b-9e8c-7a6b5c4d3e2f",
      "name": "Weight management intake",
      "drugIds": ["nl-semaglutide", "nl-tirzepatide-glycine"]
    },
    "nl-sildenafil": null
  }
}
```

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `drugIds query parameter is required (comma-separated)` | Parameter missing. |
| 400 | `At least one drugId is required` | Parameter present but empty. |
| 400 | `Maximum 50 drugIds allowed` | More than 50 IDs. |
| 500 | `Internal Server Error` | Lookup failed. |

```bash
curl "https://apextelemed.com/api/v1/surveys/by-drugs?drugIds=nl-semaglutide,nl-sildenafil" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b"
```
