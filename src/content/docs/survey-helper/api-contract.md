---
title: API contract
description: The endpoints the survey engine calls and when, the headers it sends in each mode, how the exported TypeScript types map to the wire payloads, and what a proxy backend must satisfy.
sidebar:
  order: 7
---

The adapters and the core talk to five embed endpoints under `apiBaseUrl`. The SDK handles all of this for you. You need this page if you are [proxying through your own backend](/survey-helper/auth-and-modes/#mode-b-proxy-through-your-backend), calling the client yourself, or debugging with the network tab.

Full request and response tables live in the API reference:

- [Survey v2 embed API](/api/survey-v2-embed/): the browser-direct endpoints, authenticated with a publishable key.
- [Survey v2 server API](/api/survey-v2-server/): the same handlers for server-to-server calls, authenticated with an API key. This is what a proxy forwards to.

## Base URL

All paths below are relative to `apiBaseUrl`, which already includes `/api`. In browser-direct mode `apiBaseUrl` is `https://apextelemed.com/api` for production or `https://dev.apextelemed.com/api` for the sandbox, so the production compose call goes to `https://apextelemed.com/api/v2/embed/surveys`. In proxy mode `apiBaseUrl` is your proxy's prefix, and the same relative paths must exist under it. The client trims trailing slashes from `apiBaseUrl`.

## Endpoints the engine calls

| When | Request | Success |
| --- | --- | --- |
| Engine creation, `drugIds` path | `GET /v2/embed/surveys?drugIds=drug-A,drug-B&templateId=tpl-1&mode=initial` | `200` with a `V2ComposedSurvey` |
| Engine creation, `token` path | `GET /v2/embed/surveys/by-token?token=…` | `200` with `{ composed, patientInfo, memberId, mode }` |
| Every `next()` | `POST /v2/embed/surveys/check-qualification` | `200` with a `V2QualificationResult` |
| `submit()` | `POST /v2/embed/surveys/responses` | `201` with a `V2SubmitResult` |
| `client.selectDrug()` (never called by the engine) | `POST /v2/embed/surveys/responses/:id/select-drug` | `204`, no body |

`drugIds` is comma-joined in the query string. `templateId` and `mode` are only included when set. The client parses every response as JSON and tolerates an empty body, which is how the `204` from select-drug is handled.

The engine does not call Apex's server-side draft endpoints. Drafts are kept in the browser, or in whatever `DraftStore` you supply. See [Draft persistence](/survey-helper/headless/#draft-persistence).

## Headers by mode

| Header | Browser-direct | Proxy |
| --- | --- | --- |
| `x-apex-publishable-key` | Your `pk_*` key, on every request | Not sent (`publishableKey` omitted) |
| `X-Tenant-Key` | Not sent | Your `tenantKey`, on every request, if set |
| `Origin` | Added by the browser. Must be on your allow-list. | Added by the browser. Your proxy decides what to do with it. |
| `Content-Type: application/json` | On `POST` requests | On `POST` requests |

HTTP header names are case-insensitive. The client writes `X-Tenant-Key`, and browsers send it as `x-tenant-key`, which is how the [Partner SDK](/partner-sdk/) documents the same header. Match it case-insensitively in your proxy.

The client does not set the fetch `credentials` option, so a cross-origin call to Apex carries no cookies, while a same-origin call to your own proxy carries your site's cookies as usual.

## Errors

Errors return a non-2xx status with a JSON body of `{ "error": "message" }`. The client throws an `EmbedApiError` with:

- `status`: the HTTP status.
- `message`: the server's `error` string, or `HTTP <status>` when the body had none.
- `body`: the parsed JSON body, or `null`.

The engine catches these and moves to the `error` phase with `state.error` set to the message (the adapters report it as `outcome.kind === 'load_failed'` with `outcome.error`). Statuses you will meet in browser-direct mode:

| Status | Meaning |
| --- | --- |
| `401` | Publishable key missing or unknown. |
| `403` | Embedding not enabled for your partner account, `Origin` missing, `Origin` not on your allow-list, or a token that belongs to a different partner. |
| `404` / `410` | Token not found, already used, or expired (`by-token` only). |
| `429` | Per-IP rate limit exceeded. Comes with a `Retry-After` header and `retryAfter` seconds in the body. |
| `400` | Request validation failed, for example an email address the server rejects, or a bad payload when you call the client yourself. |

See the [embed API reference](/api/survey-v2-embed/) for the exact bodies.

## Payloads the engine sends

### Qualification check

Posted on every `next()` after the step's required visible questions are answered. `answers` contains every answer recorded so far.

```json
{
  "drugIds": ["drug-A"],
  "templateId": "tpl-1",
  "mode": "initial",
  "answers": [{ "questionId": "q1", "value": "yes" }]
}
```

On the token path the body carries `token` instead of `drugIds`, `templateId`, and `mode`. Unset fields are omitted. The server evaluates with partial answers, so questions the patient has not reached yet do not disqualify them mid-flow. If `drugResults` is non-empty and every entry has `qualified: false`, the engine ends the flow in `disqualified`.

### Submit

Posted by `submit()` after patient info validates.

```json
{
  "drugIds": ["drug-A"],
  "answers": [
    { "questionId": "q1", "value": "yes" },
    { "questionId": "conditions", "value": [] }
  ],
  "patientInfo": {
    "firstName": "Ada", "lastName": "Lovelace", "email": "ada@example.com",
    "dob": "1990-01-01", "state": "CA"
  }
}
```

`answers` is the recorded answer map plus `[]` for every `multi_select` question that was visible but never touched. Questions hidden by the final answers are never included. `patientInfo` is whatever the engine holds: the required five fields, anything you seeded through `knownPatientInfo` or the token's member record, and any extra string fields you set. `PatientInfo` has a string index signature, so you can pass fields the server accepts beyond the typed ones; the [server API reference](/api/survey-v2-server/) lists them.

## Types and the wire

Every type below is exported from `@apextelemed/survey-core` and re-exported (types only) by the React and Solid adapters. They are the wire shapes, with index signatures where the server may add fields.

```ts
interface V2ComposedSurvey {
  version?: string;
  partnerId?: string;
  drugIds?: string[];
  templateId?: string | null;
  mode?: 'initial' | 'refill';
  sections?: V2Section[];            // sections → steps → questions
  drugs?: { drugId: string; name?: string; description?: string }[];
  branding?: { logoUrl?: string; primaryColor?: string; companyDisplayName?: string };
  [k: string]: unknown;              // e.g. partner survey preferences
}

interface V2Section { sectionId: string; order?: number; title: string; description?: string; steps: V2Step[] }
interface V2Step    { stepId: string; order?: number; title?: string; description?: string; questions: V2Question[] }

interface V2Question {
  questionId: string;
  order?: number;
  text: string;
  type: string;                      // authored by Apex; render by type
  required?: boolean;
  options?: V2QuestionOption[];
  helpText?: string;
  visibilityConditions?: V2VisibilityCondition[];
  [k: string]: unknown;
}

// The option label lives in `text`; the submitted value in `value`.
interface V2QuestionOption { optionId?: string; text?: string; value: string; group?: string }

interface V2VisibilityCondition { questionId: string; operator: string; value: string }

interface V2Answer { questionId: string; value: unknown }

interface PatientInfo {
  firstName?: string; lastName?: string; email?: string; phone?: string;
  dob?: string;                      // YYYY-MM-DD
  state?: string;                    // two-letter code
  street1?: string; street2?: string; city?: string; zipCode?: string;
  [k: string]: string | undefined;
}

interface V2DrugResult {
  drugId: string;
  drugName?: string;
  qualified: boolean;
  disqualificationReason?: string;   // legacy singular field
  disqualificationReasons?: string[];// what the server sends today; may contain empty strings
  flags?: unknown[];                 // non-blocking clinical flags for the prescriber
  isRecommended?: boolean;
  recommendationReasons?: string[];
}
interface V2QualificationResult { qualified: boolean; drugResults: V2DrugResult[] }
interface V2SubmitResult extends V2QualificationResult {
  responseId: string;
  promotion?: unknown;
  callbackUrl?: string | null;       // where Apex expects you to send the patient next, if configured
}

interface FlatStep {                 // produced by the SDK, not on the wire
  sectionId: string; sectionTitle: string; sectionDescription?: string;
  stepId: string; stepTitle?: string; stepDescription?: string;
  questions: V2Question[];
}
```

:::tip
Read disqualification reasons through `disqualificationReasonText(drugResult)` from the core rather than the fields directly. It handles both the array and the legacy singular field and never returns an empty string.
:::

The `by-token` response wraps the survey: `{ composed: V2ComposedSurvey, patientInfo: PatientInfo, memberId: string, mode: 'initial' | 'refill' }`. The engine stores `composed`, merges `patientInfo` over any `knownPatientInfo`, and keeps `memberId` on the state.

### Question visibility

A question is shown only when **all** of its `visibilityConditions` match the current answers. Supported operators are `equals`, `not_equals`, and `contains` (with the aliases listed under [`isQuestionVisible`](/survey-helper/headless/#isquestionvisiblequestion-answers)), and boolean-ish values are normalized so `yes`, `true`, and `1` are equivalent, as are `no`, `false`, and `0`. The SDK evaluates this for you through `visibleQuestions` in the adapters and `isQuestionVisible` in the core, and the engine uses the same rule to skip steps and to shape the submit payload.

## Proxy contract

In proxy mode your backend sits between the SDK and Apex. It must:

1. **Expose the five routes** above, with the same methods, under the prefix you pass as `apiBaseUrl`. For example `https://app.yourco.com/apex/api/v2/embed/surveys`. Include the select-drug route only if you call `client.selectDrug()`.
2. **Identify the tenant** from the `X-Tenant-Key` header the SDK sends (or from your own session, hostname, or path if you omit `tenantKey`), and look up that tenant's Apex API key server-side.
3. **Forward each request unchanged** to the server-side survey endpoints at `https://apextelemed.com/api/v2/public/` with the same relative path, method, query string, and JSON body, adding `x-api-key: <the tenant's API key>`. Do not add a partner identifier: Apex derives the partner from the API key and ignores any it receives. The server-side endpoints have no origin check and no embed rate limit. See the [server API reference](/api/survey-v2-server/).
4. **Relay the response as-is**: the same status code and the same JSON body, including error bodies. The SDK reads the `error` field on failures and expects `201` from submit and `204` from select-drug.
5. **Serve CORS** if the page and the proxy are on different origins. The SDK sends `Content-Type: application/json` on `POST`s and the `X-Tenant-Key` header, both of which trigger a preflight, so allow them in `Access-Control-Allow-Headers`.
6. **Keep reads server-side.** Apex's server-side mount also offers endpoints that read a submitted response or a stored draft back. They return the patient's answers, so never expose them to the browser through your proxy without your own user-ownership check.

Your proxy may translate drug IDs (for example from your catalog's product IDs to Apex drug IDs) in the `drugIds` query parameter, the `drugIds` body array, and the `drugId` body field, as long as it does so consistently across all requests. The verdicts Apex returns use the Apex drug IDs.
