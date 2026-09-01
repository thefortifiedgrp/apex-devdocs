---
title: "Survey v2: server-side API"
description: Compose, evaluate, submit, and read back survey v2 responses from your own backend using your API key.
sidebar:
  order: 9
---

The server-side survey v2 API lets your backend run the whole survey flow on behalf of a patient: compose the questionnaire, check qualification between steps, submit the answers, and read the transcript back later. Use it when you proxy the survey through your own servers (the survey helper calls this "Mode B"), when you render the survey yourself, or when you need to read a response or draft that the browser-facing API deliberately withholds.

All endpoints live under `https://apextelemed.com/api/v2/public/`. They share their handlers with the browser-facing [embed API](/api/survey-v2-embed/); the only differences are the authentication scheme, the absence of an origin check, the absence of rate limits, and two read endpoints that exist only here.

:::note
Despite the `public` segment in the path, every endpoint on this router requires your secret API key. Do not call it from a browser.
:::

## Authentication

Send your partner API key in the `x-api-key` header on every request. See [Authentication](/getting-started/authentication/) for how keys are issued.

Your partner identity comes from the key. Any `partnerId` you put in a query string or request body is ignored and replaced with the partner that owns the key.

| Status | `error` | When |
|---|---|---|
| 401 | `API Key missing` | No `x-api-key` header. |
| 401 | `Invalid API Key` | The key does not match any partner. |
| 500 | `Internal Server Error` | Key lookup failed. Retry. |

There is no rate limit on this router.

## Flow overview

1. **Compose** the survey for the drugs the patient is interested in with `GET /v2/public/surveys`, or with `GET /v2/public/surveys/by-token` when you hold a returning-member token from [Surveys](/api/surveys/#tokens-for-returning-members).
2. **Render** the sections, steps, and questions, honouring each question's visibility conditions.
3. **Check qualification** after each step with `POST /v2/public/surveys/check-qualification` so you can stop early when no drug can qualify.
4. **Submit** the answers and patient details with `POST /v2/public/surveys/responses`. You get a `responseId` and per-drug results.
5. **Record the patient's choice** with `POST /v2/public/surveys/responses/:id/select-drug` if more than one drug qualified.
6. **Create the request** through the [Requests API](/api/requests/), passing the `responseId` as `v2SurveyResponseId`. Apex attaches the transcript as case notes and links the response to the member.

Optionally, save progress with `PUT /v2/public/surveys/drafts` and restore it with `GET /v2/public/surveys/drafts/:id` so a patient can resume on another device.

## Endpoints

### `GET /v2/public/surveys`

Compose a survey for one or more drugs. The result is built at request time from each drug's screening requirements, the survey sections attached to those drugs, and your partner survey template. It is not cached, so a second call can differ if Apex has changed the configuration in between.

**Query parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `drugIds` | string | Yes | Comma-separated drug IDs, for example `nl-semaglutide,nl-tirzepatide-glycine`. Repeating the parameter also works. |
| `templateId` | string | No | A partner survey template ID. Defaults to your default template when omitted or when the ID is not one of yours. |
| `mode` | `initial` \| `refill` | No | Defaults to `initial`. Refill surveys drop the demographics and template framing sections and keep only content tagged for refills. |

**Response** `200` with a [composed survey](#composed-survey).

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `Validation failed` | `drugIds` missing or `mode` not one of the allowed values. A `details` object describes the failing field. |
| 500 | `At least one drugId is required` | `drugIds` was present but resolved to an empty list. |
| 500 | `Template does not belong to the requested partner` | `templateId` belongs to another partner. |

**Behaviour**

- Unknown drug IDs are not rejected. They are echoed back in `drugIds` but do not appear in `drugs`, and evaluation produces no result for them. Validate drug IDs against the [Drugs API](/api/drugs/) first.
- No data is stored by this call.

```bash
curl "https://apextelemed.com/api/v2/public/surveys?drugIds=nl-semaglutide&mode=initial" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b"
```

### `GET /v2/public/surveys/by-token`

Compose the survey for a returning-member token minted with [`POST /v1/surveys/v2/tokens`](/api/surveys/#post-v1surveysv2tokens). The token fixes the partner, member, drugs, template, and mode. The response also carries the member's details so you can pre-fill the patient information form.

Reading a token does not consume it. It is consumed only by a successful submission.

**Query parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `token` | string | Yes | The token string returned when it was minted. |

**Response** `200`

```json
{
  "composed": { "version": "v2", "mode": "refill", "...": "see Composed survey" },
  "patientInfo": {
    "firstName": "Ana",
    "lastName": "Reyes",
    "email": "ana.reyes@example.com",
    "phone": "+15125550142",
    "dob": "1988-04-17",
    "sex": "f",
    "state": "TX",
    "street1": "1 Main St",
    "city": "Austin",
    "zipCode": "78701"
  },
  "memberId": "2f6d9c1e-8a4b-4c3d-9e7f-0a1b2c3d4e5f",
  "mode": "refill"
}
```

`patientInfo` never includes `currentState`. The patient must state where they are physically located on every survey.

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `token is required` | Query parameter missing or empty. |
| 403 | `Token does not belong to this partner` | The token is unknown or was minted by another partner. |
| 410 | `Token already used` | A submission has already consumed this token. |
| 410 | `Token expired` | Past `expiresAt`. Mint a new one. |
| 404 | `Member not found` | The member the token points at no longer exists. |

```bash
curl "https://apextelemed.com/api/v2/public/surveys/by-token?token=qT3k9vXb2LmN8pQrS4tUvW6xYz0aBcDe" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b"
```

### `POST /v2/public/surveys/check-qualification`

Evaluate partial answers without storing anything. Call it between steps to end the survey early once every drug has been disqualified. Evaluation runs in partial mode: a required measurement the patient has not reached yet does not count against them. Only rules their actual answers trigger do.

**Request body** (JSON)

| Field | Type | Required | Description |
|---|---|---|---|
| `answers` | [Answer](#answers)[] | Yes | Answers given so far. May be empty. |
| `token` | string | No | Returning-member token. When present, `drugIds`, `templateId`, and `mode` come from the token and the body values are ignored. |
| `drugIds` | string[] | Yes unless `token` | Drug IDs to evaluate against. Must be non-empty. |
| `templateId` | string \| null | No | Same meaning as on compose. |
| `mode` | `initial` \| `refill` | No | Defaults to `initial`. Ignored when `token` is present. |

Send the same `drugIds`, `templateId`, and `mode` you composed with, so the evaluation runs against the questionnaire the patient is actually seeing.

**Response** `200` with a [qualification result](#qualification-result).

```json
{
  "qualified": false,
  "drugResults": [
    {
      "drugId": "nl-semaglutide",
      "drugName": "Semaglutide",
      "qualified": false,
      "flags": [],
      "disqualificationReasons": ["You must be at least 18 years old to qualify for treatment."]
    }
  ]
}
```

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `Validation failed` | `answers` missing, or neither `token` nor a non-empty `drugIds`. |
| 403 | `Token does not belong to this partner` | Unknown token, or minted by another partner. |
| 410 | `Token already used` / `Token expired` | The token can no longer be used. |
| 500 | message | Composition or evaluation failed. |

```bash
curl -X POST "https://apextelemed.com/api/v2/public/surveys/check-qualification" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b" \
  -H "Content-Type: application/json" \
  -d '{
    "drugIds": ["nl-semaglutide"],
    "mode": "initial",
    "answers": [
      { "questionId": "patient_dob", "value": "2010-02-01" },
      { "questionId": "patient_sex", "value": "f" },
      { "questionId": "patient_state", "value": "TX" }
    ]
  }'
```

### `POST /v2/public/surveys/responses`

Submit a completed survey. Apex re-composes the questionnaire, evaluates every drug, stores the response, and returns a `responseId` you later pass to the Requests API.

**Query parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `preview` | `true` \| `1` | No | Evaluate only. Nothing is stored, no token is consumed, no webhook fires. |

**Request body** (JSON)

| Field | Type | Required | Description |
|---|---|---|---|
| `answers` | [Answer](#answers)[] | Yes | One entry for every question the patient was shown. |
| `patientInfo` | [Patient info](#patient-info) | No | Contact and demographic details. Required in practice to create a request afterwards. |
| `token` | string | No | Returning-member token. Fixes partner, member, drugs, template, and mode; the body's `drugIds`, `templateId`, `memberId`, and `mode` are ignored. |
| `drugIds` | string[] | Yes unless `token` | Drug IDs to evaluate against. Must be non-empty. |
| `templateId` | string \| null | No | Same meaning as on compose. |
| `mode` | `initial` \| `refill` | No | Defaults to `initial`. Ignored when `token` is present. |
| `memberId` | string \| null | No | Link the response to one of your existing members without a token. The member's stored details are updated from `patientInfo`. Only use this from your backend. |
| `draftId` | string | No | The draft this submission completes. It is deleted on success. |

**Response** `201` with a [submit result](#submit-result)

```json
{
  "preview": false,
  "responseId": "e3b0c442-98fc-4c14-9afb-f4c8996fb924",
  "qualified": true,
  "drugResults": [
    {
      "drugId": "nl-semaglutide",
      "drugName": "Semaglutide",
      "qualified": true,
      "flags": [
        {
          "metricType": "bmi",
          "displayName": "BMI",
          "value": 41.3,
          "threshold": 40,
          "direction": "above",
          "reason": "BMI above typical range"
        }
      ],
      "disqualificationReasons": []
    }
  ],
  "promotion": null,
  "callbackUrl": null
}
```

With `?preview=true` the status is `200` and the body is:

```json
{
  "preview": true,
  "responseId": null,
  "qualified": true,
  "drugResults": [ "..." ],
  "reportedConditions": [{ "conditionKey": "hypertension", "name": "High blood pressure" }],
  "metricValues": [
    { "metricType": "height", "valueNumeric": 170.2 },
    { "metricType": "weight", "valueNumeric": 119.7 },
    { "metricType": "bmi", "valueNumeric": 41.3 }
  ]
}
```

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `Validation failed` | `answers` missing, neither `token` nor a non-empty `drugIds`, or a malformed `patientInfo` field (for example an invalid `email`, or `currentState` not exactly two characters). |
| 403 | `Token does not belong to this partner` | Unknown token, or minted by another partner. |
| 410 | `Token already used` | The token was consumed earlier, or by a concurrent submission that won the race. |
| 410 | `Token expired` | Past `expiresAt`. |
| 500 | message | Composition, evaluation, or storage failed. |

**Behaviour**

- **Not idempotent.** Every successful call stores a new response with a new `responseId`. Retrying a timed-out call creates a duplicate; with a token, the retry gets `410`.
- **Demographics backfill.** If `patientInfo` lacks `dob`, `sex`, or `currentState`, they are copied from the answers to `patient_dob`, `patient_sex`, and `patient_state`.
- **Token consumption.** With a token, the token is marked used before the response is stored.
- **Member sync.** With a token or `memberId`, non-empty `patientInfo` fields overwrite the member's name, email, phone, date of birth, sex, residence state, and address. `currentState` is never written to the member.
- **Clinical record.** With a token or `memberId`, reported conditions and measurements are promoted into the member's clinical record immediately and `promotion` reports the counts. Without a member, `promotion` is `null` and promotion happens when you create a request that references the response.
- **Draft cleanup.** If `draftId` is present, that draft is deleted. A failure to delete does not fail the submission.
- **Webhook.** A `survey.completed` event is sent to your webhook endpoint. See [Webhooks](/api/webhooks/).
- `callbackUrl` echoes the survey callback URL configured for your account in the Partner Portal, or `null`. It is informational for server-side callers.

```bash
curl -X POST "https://apextelemed.com/api/v2/public/surveys/responses" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b" \
  -H "Content-Type: application/json" \
  -d '{
    "drugIds": ["nl-semaglutide"],
    "mode": "initial",
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

### `POST /v2/public/surveys/responses/:id/select-drug`

Record which qualified drug the patient chose. Use it when a multi-drug survey qualified the patient for more than one drug.

**Path parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | The `responseId` from a submission. |

**Request body** (JSON)

| Field | Type | Required | Description |
|---|---|---|---|
| `drugId` | string | Yes | The chosen drug ID. Not validated against the response's results. |

**Response** `204` with an empty body.

**Errors**

| Status | `error` | When |
|---|---|---|
| 404 | `Response not found` | No response with that ID. |
| 403 | `Response does not belong to this partner` | The response was submitted under another partner. |
| 400 | `Validation failed` | `drugId` missing or empty. |
| 500 | `Failed to select drug` | Storage failed. |

Calling it again overwrites the previous selection.

```bash
curl -X POST "https://apextelemed.com/api/v2/public/surveys/responses/e3b0c442-98fc-4c14-9afb-f4c8996fb924/select-drug" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b" \
  -H "Content-Type: application/json" \
  -d '{ "drugId": "nl-semaglutide" }'
```

### `GET /v2/public/surveys/responses/:id`

Read a submitted response back as a question-and-answer transcript, for example to show a patient what they answered. This endpoint exists only on the server-side router. The transcript contains the patient's medical answers, so apply your own check that the requesting user owns the response before showing it.

**Path parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | The `responseId`. |

**Response** `200` with a [response transcript](#response-transcript)

```json
{
  "id": "e3b0c442-98fc-4c14-9afb-f4c8996fb924",
  "mode": "initial",
  "createdAt": "2026-09-01T14:02:11.318Z",
  "completedAt": "2026-09-01T14:02:11.318Z",
  "drugIds": ["nl-semaglutide"],
  "selectedDrugId": "nl-semaglutide",
  "patientName": "Ana Reyes",
  "sections": [
    {
      "sectionId": "about-you",
      "title": "About you",
      "items": [
        { "questionId": "patient_dob", "question": "Date of birth", "answer": "1988-04-17" },
        { "questionId": "patient_sex", "question": "Sex assigned at birth", "answer": "Female" },
        { "questionId": "patient_state", "question": "What state are you currently located in?", "answer": "TX" }
      ]
    },
    {
      "sectionId": "health-profile",
      "title": "Health profile",
      "items": [
        { "questionId": "vitals_height_weight", "question": "Your height and weight", "answer": "5'7\", 264 lbs (BMI: 41.3)" },
        { "questionId": "merged_conditions", "question": "Do you currently have any of the following conditions?", "answer": "High blood pressure" }
      ]
    },
    {
      "sectionId": "telehealth-consent",
      "title": "Consent",
      "items": [
        { "questionId": "telehealth_consent", "question": "Telehealth consent", "answer": "Agreed: \"I consent to have my personal and medical data transferred to a telehealth provider.\"" }
      ]
    }
  ]
}
```

The body is a fixed allow-list. It never includes qualification results, disqualification reasons, flags, reported conditions, or measurements.

**Errors**

| Status | `error` | When |
|---|---|---|
| 404 | `Response not found` | Unknown ID, or a response owned by another partner. Ownership is not confirmed either way. |
| 500 | `Failed to load survey response` | Storage failed. |

```bash
curl "https://apextelemed.com/api/v2/public/surveys/responses/e3b0c442-98fc-4c14-9afb-f4c8996fb924" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b"
```

### `PUT /v2/public/surveys/drafts`

Save an in-progress survey so the patient can resume it later, on any device. A draft holds answers and the step the patient stopped on. It never holds patient information, and it never holds evaluation output. On resume, compose the survey again from the draft's `drugIds`, `templateId`, and `mode`.

The first save omits `draftId` and receives one. Every later save sends it back.

**Request body** (JSON)

| Field | Type | Required | Description |
|---|---|---|---|
| `answers` | [Answer](#answers)[] | Yes | Answers so far. May be empty. |
| `stepIndex` | integer | Yes | Zero-based step the patient is on. Between 0 and 500. |
| `draftId` | string | No | Omit on the first save. |
| `drugIds` | string[] | No | Drugs the survey was composed for. Defaults to `[]`, but you need it to re-compose on resume. |
| `templateId` | string \| null | No | Template the survey was composed with. |
| `mode` | `initial` \| `refill` | No | Defaults to `initial`. |

**Response**

- `201` `{ "draftId": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" }` when a new draft was created.
- `200` `{ "draftId": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" }` when an existing draft was updated.

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `Validation failed` | `answers` or `stepIndex` missing, or `stepIndex` out of range. |
| 500 | message | Storage failed. |

**Behaviour**

- A `draftId` that is unknown, expired, or owned by another partner is treated as absent: a fresh draft is created and returned with `201`. Always store the `draftId` from the latest response.
- Drafts expire 30 days after creation. Updates do not extend the expiry.
- Submitting with `draftId` deletes the draft.

```bash
curl -X PUT "https://apextelemed.com/api/v2/public/surveys/drafts" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b" \
  -H "Content-Type: application/json" \
  -d '{
    "drugIds": ["nl-semaglutide"],
    "mode": "initial",
    "stepIndex": 1,
    "answers": [
      { "questionId": "patient_dob", "value": "1988-04-17" },
      { "questionId": "patient_sex", "value": "f" },
      { "questionId": "patient_state", "value": "TX" }
    ]
  }'
```

### `GET /v2/public/surveys/drafts/:id`

Read a draft back. This endpoint exists only on the server-side router because a draft is unsubmitted medical data and the browser holds only the bare ID. Gate it behind your own authorisation, for example a signed resume link you emailed to the patient.

**Path parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | The `draftId`. |

**Response** `200` with a [draft](#draft)

```json
{
  "draftId": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  "drugIds": ["nl-semaglutide"],
  "templateId": null,
  "mode": "initial",
  "answers": [
    { "questionId": "patient_dob", "value": "1988-04-17" },
    { "questionId": "patient_sex", "value": "f" },
    { "questionId": "patient_state", "value": "TX" }
  ],
  "stepIndex": 1,
  "updatedAt": "2026-09-01T13:48:02.117Z"
}
```

**Errors**

| Status | `error` | When |
|---|---|---|
| 404 | `Draft not found` | Unknown ID, expired draft, or a draft owned by another partner. |
| 500 | `Failed to load survey draft` | Storage failed. |

```bash
curl "https://apextelemed.com/api/v2/public/surveys/drafts/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" \
  -H "x-api-key: apx_4f1c2e9a7b3d5f6e8a0c1b2d3e4f5a6b"
```

## Payload shapes

These shapes are shared by the server-side API and the [embed API](/api/survey-v2-embed/). Field names match the TypeScript types exported by the survey helper's core package (`V2ComposedSurvey`, `V2Section`, `V2Step`, `V2Question`, `V2Answer`, `PatientInfo`, `V2DrugResult`, `V2QualificationResult`, `V2SubmitResult`).

### Composed survey

| Field | Type | Description |
|---|---|---|
| `version` | `"v2"` | Always `v2`. |
| `partnerId` | string | Your partner ID. |
| `drugIds` | string[] | The drug IDs the survey was composed for, as requested. |
| `templateId` | string \| null | The partner survey template that was applied, or `null`. |
| `mode` | `initial` \| `refill` | The mode the survey was composed in. |
| `drugs` | `{ drugId, name }[]` | The drugs that were found. Unknown IDs are omitted. |
| `sections` | [Section](#section)[] | Ordered sections. Render them in `order`. |
| `branding` | object | Optional. `logoUrl`, `primaryColor`, and `companyDisplayName` as configured for your account. |
| `surveyPreferences` | object | Optional. Your account's survey display preferences, for example `allowPatientDrugSelection`, `qualifiedMessage`, `disqualifiedMessage`, `multipleQualifiedMessage`. Treat unknown keys as informational. |

Sections appear in this order. Which ones exist depends on your configuration and the mode:

| `sectionId` | Title | Present when |
|---|---|---|
| `about-you` | About you | `mode` is `initial`. Asks `patient_dob`, `patient_sex`, `patient_state`. |
| `template-pre` | Getting started | `mode` is `initial` and your template has pre-questions. |
| `health-profile` | Health profile | Always. Contains `vitals_height_weight`, then `merged_conditions` and `merged_reproductive_conditions` when any drug screens for conditions, then one `metric_<metricType>` question per additional measurement. |
| `template-section-<id>` | section name | For each section attached to your template. |
| `section-<id>` | section name | For each screening section attached to a selected drug. |
| `template-post` | Almost done | `mode` is `initial` and your template has post-questions. |
| `telehealth-consent` | Consent | Always. A single required `consent` question with ID `telehealth_consent`. |

Every section contains one step. Rendering one step per screen is the intended experience.

```json
{
  "version": "v2",
  "partnerId": "7c1e2b4a-3d5f-4e6a-9b8c-1f2e3d4c5b6a",
  "drugIds": ["nl-semaglutide"],
  "templateId": null,
  "mode": "initial",
  "drugs": [{ "drugId": "nl-semaglutide", "name": "Semaglutide" }],
  "sections": [
    {
      "sectionId": "about-you",
      "order": 0,
      "title": "About you",
      "steps": [
        {
          "stepId": "about-you-step",
          "order": 0,
          "questions": [
            { "questionId": "patient_dob", "order": 0, "text": "Date of birth", "type": "date", "required": true },
            {
              "questionId": "patient_sex",
              "order": 1,
              "text": "Sex assigned at birth",
              "type": "multiple_choice",
              "required": true,
              "options": [{ "value": "m", "text": "Male" }, { "value": "f", "text": "Female" }]
            },
            { "questionId": "patient_state", "order": 2, "text": "What state are you currently located in?", "type": "state", "required": true }
          ]
        }
      ]
    },
    {
      "sectionId": "health-profile",
      "order": 1,
      "title": "Health profile",
      "steps": [
        {
          "stepId": "health-profile-step",
          "order": 0,
          "questions": [
            {
              "questionId": "vitals_height_weight",
              "order": 0,
              "text": "Your height and weight",
              "type": "height_weight",
              "required": true,
              "metricType": "height_weight"
            },
            {
              "questionId": "merged_conditions",
              "order": 1,
              "text": "Do you currently have any of the following conditions?",
              "type": "multi_select",
              "required": false,
              "helpText": "Select all that apply.",
              "options": [
                { "value": "hypertension", "text": "High blood pressure", "group": "cardiovascular" },
                { "value": "pancreatitis", "text": "Pancreatitis", "group": "gastrointestinal" }
              ]
            },
            {
              "questionId": "merged_reproductive_conditions",
              "order": 2,
              "text": "Do any of the following currently apply to you?",
              "type": "multi_select",
              "required": false,
              "helpText": "Select all that apply.",
              "options": [{ "value": "pregnant", "text": "Pregnant or planning pregnancy", "group": "reproductive" }],
              "visibilityConditions": [{ "questionId": "patient_sex", "operator": "equals", "value": "f" }]
            }
          ]
        }
      ]
    },
    {
      "sectionId": "section-c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f",
      "order": 2,
      "title": "GLP-1 screening",
      "steps": [
        {
          "stepId": "section-c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f-step",
          "order": 0,
          "questions": [
            {
              "questionId": "glp1_family_history",
              "order": 0,
              "text": "Has anyone in your family had medullary thyroid cancer?",
              "type": "boolean",
              "required": true
            }
          ]
        }
      ]
    },
    {
      "sectionId": "telehealth-consent",
      "order": 3,
      "title": "Consent",
      "steps": [
        {
          "stepId": "telehealth-consent-step",
          "order": 0,
          "questions": [
            {
              "questionId": "telehealth_consent",
              "order": 0,
              "type": "consent",
              "text": "Telehealth consent",
              "required": true,
              "options": [
                {
                  "value": "agreed",
                  "text": "I consent to have my personal and medical data transferred to a telehealth provider.",
                  "linkUrl": "https://apextelemed.com/telehealth-consent/embed",
                  "linkText": "View full telehealth consent"
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "branding": { "logoUrl": "https://cdn.example.com/logo.png", "primaryColor": "#0f766e", "companyDisplayName": "Example Health" }
}
```

### Section

| Field | Type | Description |
|---|---|---|
| `sectionId` | string | Stable within a composition. See the table above for the naming scheme. |
| `order` | number | Zero-based position. |
| `title` | string | Display title. |
| `description` | string | Optional. |
| `steps` | [Step](#step)[] | Currently always exactly one step. |

### Step

| Field | Type | Description |
|---|---|---|
| `stepId` | string | Stable within a composition. |
| `order` | number | Zero-based position within the section. |
| `title` | string | Optional. |
| `description` | string | Optional. |
| `questions` | [Question](#question)[] | Ordered questions. |

### Question

| Field | Type | Description |
|---|---|---|
| `questionId` | string | Key to submit the answer under. Unique within a composition. |
| `order` | number | Zero-based position within the step. |
| `text` | string | The question as shown to the patient. |
| `type` | string | One of the [question types](#question-types). |
| `required` | boolean | Optional. Enforce it client-side; the server does not reject a missing required answer, but a missing required measurement disqualifies the drugs that need it. |
| `options` | object[] | For choice and consent types. Each option has `value` (submit this) and a label in `text` (some admin-authored options use `label` instead). Options may also carry `optionId`, `group` (a category for clustering, used by the merged condition questions), and for consent `linkUrl` and `linkText`. |
| `helpText` | string | Optional hint. |
| `visibilityConditions` | [Visibility condition](#visibility-conditions)[] | Optional. Show the question only when all conditions match. |
| `unit` | string | Optional. Unit for measurement questions. |
| `metricType` | string | Optional. Present on measurement questions. |

Apex-authored questions can carry additional keys. Ignore keys you do not recognise.

### Question types

| `type` | Answer `value` to submit |
|---|---|
| `multiple_choice` | The chosen option's `value` as a string. |
| `select` | The chosen option's `value` as a string. |
| `multi_select` | An array of chosen option `value`s. Send `[]` when the question was shown and nothing applies; an absent answer means the question was never shown. |
| `boolean` | `true` or `false`. The strings `"true"` and `"false"` are treated the same in rules. |
| `consent` | `true` when the patient agreed. |
| `text`, `email`, `phone` | A string. |
| `number` | A number. |
| `date` | A string in `YYYY-MM-DD` format. |
| `state` | A two-letter US state code. |
| `height_weight` | An object `{ "heightFt": 5, "heightIn": 7, "weightLb": 264 }`. The keys `heightFeet`, `heightInches`, and `weight` are accepted as aliases. `bmi` is optional; Apex computes it and converts height to centimetres and weight to kilograms. |
| `address` | An object with `street1`, `street2`, `city`, `state`, and `zipCode`. |

Do not submit answers for questions whose visibility conditions were not met. The female-only reproductive question, for example, must not receive an answer for a patient who answered `m` to `patient_sex`; the server ignores it in that case anyway.

### Visibility conditions

A question with `visibilityConditions` is shown only when every condition matches the current answers (AND). A condition whose referenced question has no answer yet does not match.

| Field | Type | Description |
|---|---|---|
| `questionId` | string | The question whose answer is tested. |
| `operator` | string | One of `equals`, `not_equals`, `contains`, `contains_any`, `contains_all`, `greater_than`, `less_than`, `age_less_than`. |
| `value` | string | The comparison value. For `contains_any` and `contains_all` it is a comma-separated list. |

Compare case-insensitively. Apex's own questions use `equals`, `not_equals`, and `contains`; the survey helper evaluates those three and treats anything else as `equals`. Admin-authored sections can use the full list, so if you render the survey yourself implement all eight.

### Answers

```json
{ "questionId": "merged_conditions", "value": ["hypertension"] }
```

| Field | Type | Description |
|---|---|---|
| `questionId` | string | From the composed survey. |
| `value` | any | Per the [question type](#question-types). |

Send one answer per question that was shown. Unknown `questionId`s are stored but ignored by evaluation.

### Patient info

All fields are optional strings unless noted. Unknown extra keys are stored with the response.

| Field | Description |
|---|---|
| `firstName`, `lastName` | Legal name. |
| `email` | Must be a valid email address if present. |
| `phone` | Free-form. |
| `dob` | `YYYY-MM-DD`. Backfilled from `patient_dob` when omitted. |
| `sex` | `m` or `f`. Backfilled from `patient_sex` when omitted. |
| `state` | Two-letter residence state. Synced to the member. |
| `currentState` | Exactly two characters. The state the patient is physically in while answering. Required for telehealth licensing; collect it every time. Backfilled from `patient_state` when omitted. Never synced to the member. |
| `street1`, `street2`, `city`, `zipCode` | Residence address. |

### Qualification result

Returned by check-qualification, and embedded in the submit result.

| Field | Type | Description |
|---|---|---|
| `qualified` | boolean | `true` when at least one drug qualified. |
| `drugResults` | Drug result[] | One entry per drug in `drugs`. Drugs with no triggered rules are `qualified: true`. |

**Drug result**

| Field | Type | Description |
|---|---|---|
| `drugId` | string | |
| `drugName` | string | Optional. |
| `qualified` | boolean | `false` when any disqualifying rule fired. |
| `flags` | Flag[] | Items a provider will review. They do not block qualification. |
| `disqualificationReasons` | string[] | Patient-safe messages explaining why the drug was disqualified. Empty when qualified. |

**Flag**

| Field | Type | Description |
|---|---|---|
| `reason` | string | Patient-safe text. Always present. |
| `displayName` | string | Optional label of the condition, measurement, or section behind the flag. |
| `conditionKey` | string | Present for condition flags. |
| `metricType` | string | Present for measurement flags. |
| `value`, `unit`, `threshold`, `direction` | number, string, number, `below` \| `above` | Present for measurement flags. `value` is in canonical units (centimetres, kilograms, BMI). |
| `sectionId` | string | Present for section-rule flags. |

Disqualification sources, in evaluation order: age under 18 (from `patient_dob`), a `patient_state` your account excludes, a reported condition a drug disqualifies on, a required measurement missing or outside a drug's limits, and a screening section's rules.

### Submit result

| Field | Type | Description |
|---|---|---|
| `preview` | boolean | `true` only with `?preview=true`. |
| `responseId` | string \| null | UUID of the stored response. `null` in preview. |
| `qualified` | boolean | As in the qualification result. |
| `drugResults` | Drug result[] | As in the qualification result. |
| `promotion` | object \| null | Stored submissions only. `{ conditionsCreated, conditionsSkipped, metricsCreated, metricsSkipped }` when the response was linked to a member, otherwise `null`. |
| `callbackUrl` | string \| null | Stored submissions only. Your configured survey callback URL. |
| `reportedConditions` | `{ conditionKey, name }[]` | Preview only. Conditions the patient selected. |
| `metricValues` | `{ metricType, valueNumeric?, valueText? }[]` | Preview only. Measurements in canonical units. |

### Draft

| Field | Type | Description |
|---|---|---|
| `draftId` | string | UUID. |
| `drugIds` | string[] | |
| `templateId` | string \| null | |
| `mode` | `initial` \| `refill` | |
| `answers` | Answer[] | |
| `stepIndex` | number | |
| `updatedAt` | string | ISO 8601 timestamp. |

### Response transcript

| Field | Type | Description |
|---|---|---|
| `id` | string | The `responseId`. |
| `mode` | `initial` \| `refill` | |
| `createdAt`, `completedAt` | string \| null | ISO 8601 timestamps. |
| `drugIds` | string[] | Drugs the survey was composed for. |
| `selectedDrugId` | string \| null | From select-drug. |
| `patientName` | string \| null | From the submitted patient info. |
| `sections` | `{ sectionId, title, items }[]` | Only sections with at least one answered question. |
| `sections[].items` | `{ questionId, question, answer }[]` | `answer` is a display string: option labels for choices, `Yes`/`No` for booleans, `Agreed: "…"` for consents, and `5'7", 264 lbs (BMI: 41.3)` for height and weight. |
