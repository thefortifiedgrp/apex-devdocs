---
title: Requests
description: Create, list, retrieve, cancel, and delete prescription requests, trigger pharmacy transmission, and follow the request lifecycle.
sidebar:
  order: 2
---

A request asks an Apex prescriber to review one of your members for a medication. You create it, a prescriber approves or denies it (or asks for a consultation first), and on approval the prescription is transmitted to a pharmacy that ships to the patient. This page covers the request endpoints and the lifecycle a request moves through.

## How requests work

- **One prescription per request.** A request carries exactly one line item, which names one drug. To request several medications for the same patient, create one request per drug. Bodies with more than one item are rejected.
- **Line items carry the status.** Every request exposes a `lineItems` array. The item's `status` is the source of truth for where the request stands; the request-level `status` is derived from it for convenience.
- **Members.** Each request belongs to one member. Reference an existing member by `memberId`, or supply the member inline and Apex creates it (or reuses an existing member with the same email).
- **Case notes.** The prescriber needs clinical context. Supply `caseNotes` yourself, or pass the `v2SurveyResponseId` of a completed intake survey and Apex generates the notes from the answers. You can send both.
- **Consultation requests.** A request with no items asks a prescriber to consult with the patient without committing to a drug. The prescriber chooses the medication, if any, at the end of the consultation.
- **Fulfilment.** Approval and pharmacy transmission are separate steps. Depending on your account and the request, transmission happens immediately, at a scheduled time, or when you trigger it.

## Request lifecycle

### Line item statuses

| Status | Meaning | Terminal |
| --- | --- | --- |
| `pending` | Waiting for a prescriber decision. | No |
| `call_requested` | A prescriber has asked for a consultation with the patient before deciding. The item is still `pending` underneath; this value is derived while a consultation is outstanding. | No |
| `approved` | A prescriber approved the item and signed a prescription. The clinical decision is final; fulfilment continues after this point. | For review |
| `denied` | A prescriber declined to prescribe. | Yes |
| `cancelled` | Withdrawn before the prescription reached a pharmacy, by you or by Apex. Not a clinical decision; the record and its history are preserved. | Yes |
| `completed` | Reserved. Nothing in the standard flow sets it; Apex operators may apply it manually. Treat it as terminal and equivalent to `approved` for fulfilment purposes. | Yes |

### Transitions

| From | To | Trigger | Webhook events |
| --- | --- | --- | --- |
| (none) | `pending` | You call `POST /v1/requests`. | None |
| `pending` | `call_requested` | A prescriber requests a consultation. | `item.consultation_requested`, then `appointment.*` events as the patient books |
| `call_requested` | `pending` | The consultation is recorded as held, missed, or cancelled. This only clears the flag; the prescriber still decides separately. Consultations held outside the platform are never recorded, so the item stays `call_requested` until decided. | `appointment.*` events |
| `pending` or `call_requested` | `approved` | A prescriber approves and signs a prescription. | `item.approved`, then `request.all_approved` |
| `pending` or `call_requested` | `denied` | A prescriber denies. | `item.denied`, then `request.all_denied` |
| `pending` or `approved` (not yet transmitted) | `cancelled` | You call `POST /v1/requests/:id/cancel`, or Apex withdraws the item, for example when the member is cancelled. | `item.canceled`, then `request.all_canceled` |
| `pending` | (deleted) | You call `DELETE /v1/requests/:id`. The record is removed entirely. | None |

Aggregate `request.*` events fire once every live item on the request is decided. With one item per request they follow the item event immediately. Requests reviewed through Apex's single-prescription flow emit the legacy names `request.approved`, `request.denied`, and `request.consultation_requested` instead of the item-level names, so handle both families. Payloads and signing are documented under [Webhooks](/api/webhooks/).

### Approval and pharmacy transmission

Approving an item creates a prescription record and then transmits it to the pharmacy in one of three ways.

| Mode | When it applies | What happens at approval |
| --- | --- | --- |
| Automatic | Default. | The prescription is transmitted immediately. `pharmacySent` becomes `true` and `pharmacySentAt` is stamped on the line item. |
| Scheduled | The request was created with `pharmacySendAt` in the future. | Nothing is transmitted at approval. Apex transmits the approved item once `pharmacySendAt` has passed, on a periodic check. |
| Deferred | Your account is configured for deferred fulfilment. | Nothing is transmitted automatically, ever. You trigger it with [`send-to-pharmacy`](#post-v1requestsrequestiditemsitemidsend-to-pharmacy) when you are ready, for example after collecting payment. `pharmacySendAt` is ignored on deferred accounts. |

If an automatic transmission fails, the item stays `approved` with `pharmacySent: false` and Apex resends it operationally. Nothing changes the item's status after approval except cancellation, and cancellation is refused once the item has been transmitted.

### Shipping updates

After transmission the pharmacy reports progress back to Apex. Those updates appear on the line item as `deliveryStatus`, `trackingNumber`, and `shipCarrier`, and reach your webhook as `item.shipped` the first time an order is marked shipped and `delivery.update` for other status changes. `deliveryStatus` is the pharmacy's own status string and varies by pharmacy; treat it as informational. The item status remains `approved` throughout.

### Request-level status

`status` on a request is computed from its line items each time you read it.

| Items | Request `status` |
| --- | --- |
| Any item `call_requested` | `call_requested` |
| Any item `pending` | `pending` |
| Every item `denied` | `denied` |
| Every item `completed` | `completed` |
| Every item `approved` or `completed` | `completed` if any is `completed`, otherwise `approved` |
| Anything else | `partial` |

`statusSummary` is a human-readable count in the form `1 drug - 1 approved`.

:::caution
Cancelled items are not counted by this derivation, so a request whose only item is `cancelled` currently reports `status: "partial"` at the request level. The `aggregateStatus` returned by the cancel endpoint reports `cancelled` for the same request. Read the line item's `status` rather than the request-level value when you need to know whether a request was cancelled.
:::

### Consultation requests

A request created without items has `lineItems: []`, `itemCount: 0`, and `status: "pending"` until the prescriber acts. When the prescriber approves after the consultation, they choose the medication and Apex creates a single line item in `approved` status; from then on the request behaves like any other. When the prescriber denies, the request's stored status becomes `denied` and the `item.denied` or `request.denied` webhook fires, but no line item is created.

:::caution
Because `GET /v1/requests/:id` derives status from line items, a denied consultation request still reads `status: "pending"` with `statusSummary: "No items"` from that endpoint. `GET /v1/requests` reports the stored `denied` status for the same request. Rely on the webhook or the list endpoint for consultation outcomes.
:::

### History

The request and each line item carry a `history` array. Each entry has `action`, `timestamp`, and `by`, plus `reason` for some actions. `by` is `api` for entries you created, `partner:<your partner id>` for your cancellations, and an opaque user identifier for prescriber actions. Common actions are `created`, `approved`, `denied`, `call_requested`, `cancelled`, `dosage_updated`, `note_added`, `patient_notified`, `consult_no_show`, and `completed_without_rx`. Treat actions you do not recognise as informational.

## Endpoints

### `POST /v1/requests`

Creates a prescription request (or a consultation request) for a member and queues it for prescriber review.

**Auth:** `x-api-key`

**Headers**

| Header | Required | Description |
| --- | --- | --- |
| `Content-Type` | Yes | `application/json` |
| `Idempotency-Key` | No | Makes the create safe to retry. See [Idempotent creates](#idempotent-creates). |

**Body**

The endpoint accepts three body shapes. Apex picks the shape from the fields present: a non-empty `items` array is a prescription request, no `items` and no `drugId` is a consultation request, and a top-level `drugId` is the legacy single-drug format. Fields shared by all shapes:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `memberId` | string | One of `memberId` or `member` | Identifier of an existing member that belongs to your account. |
| `member` | object | One of `memberId` or `member` | Inline member. See [Member object](#member-object). Do not send both `memberId` and `member`. |
| `items` | object[] | Prescription requests only | Exactly one [item](#item-object). Omit it, or send `[]`, for a consultation request. More than one item is rejected. |
| `caseNotes` | string | One of `caseNotes` or `v2SurveyResponseId` | Non-empty clinical notes and patient history for the prescriber. |
| `v2SurveyResponseId` | string | One of `caseNotes` or `v2SurveyResponseId` | Identifier of a completed [survey v2](/api/survey-v2-server/) response submitted under your account. Apex generates a case-notes summary from the answers. Must exist and belong to you. |
| `pharmacySendAt` | string | No | ISO 8601 datetime with a timezone offset, for example `2026-10-01T09:00:00Z`. Must be in the future. Delays pharmacy transmission of the approved prescription until this time. Ignored on deferred-fulfilment accounts. |
| `idempotencyKey` | string | No | Body alternative to the `Idempotency-Key` header. The header wins if both are present. |

In the legacy single-drug format, the item fields below (`drugId`, `requestedSkuId`, `dosage`, `requestedSku`, `requestedClinicalDose`) appear at the top level of the body instead of inside `items`. It is supported for existing integrations; use `items` for new ones.

#### Item object

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `drugId` | string | Yes | A drug `id` from [`GET /v1/drugs`](/api/drugs/). Must be in your catalogue. |
| `requestedSkuId` | string | No | Preferred. A `skus[].id` for the drug identifying the package and strength the patient selected. Validated against the catalogue. |
| `dosage` | string | No | Legacy alternative to `requestedSkuId`: a label from the drug's `dosages` array. Validated against the catalogue. |
| `requestedSku` | string | No | Free-text description of the package the patient purchased. Shown to the prescriber as guidance; not validated. |
| `requestedClinicalDose` | object | No | `{ "value": number, "unit": string }`, for example `{ "value": 0.25, "unit": "mg" }`. The clinical dose you expect the patient to receive. Advisory: the prescriber chooses the final dose. |

`drugId` alone is valid. When no SKU or dose is supplied the prescriber selects both at signing.

#### Member object

Supply this instead of `memberId` to create the member as part of the request. The same shape is accepted by [`POST /v1/members`](/api/members/).

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `firstName` | string | Yes | |
| `lastName` | string | Yes | |
| `email` | string | Yes | Valid email address. If a member of yours already has this email, that member is reused and updated with the fields you send instead of a duplicate being created. |
| `phone` | string | No | |
| `gender` | string | No | Clinical sex, `m` or `f`. `a` and `u` are accepted for compatibility. Some pharmacies require it, so supply it when known. |
| `dateOfBirth` | string | Yes | `YYYY-MM-DD` |
| `state` | string | Yes | Two-letter US state code, for example `TX`. |
| `address` | object | Yes | `street1` (required), `street2`, `city` (required), `state` (two letters, required), `zipCode` (`12345` or `12345-6789`, required). |
| `shippingAddress` | object | No | Same shape as `address`. Used by the pharmacy when present. |

#### Idempotent creates

Send an `Idempotency-Key` header with a value that is unique per logical request on your side, such as your order identifier. If Apex has already created a request for your account with that key, it returns the existing request with HTTP `200` and `idempotentReplay: true` instead of creating another one. No member changes are applied on a replay. Keys are scoped to your account and never expire. A key is only recorded when the create succeeds, so a rejected body can be retried with the same key.

**Examples**

Prescription request for an existing member, selecting a SKU:

```bash
curl -X POST https://apextelemed.com/api/v1/requests \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-58213" \
  -d '{
    "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "items": [
      { "drugId": "nl-semaglutide-inj", "requestedSkuId": "sku_2_5mg_1ml" }
    ],
    "caseNotes": "38-year-old female, BMI 31.2. No history of pancreatitis or medullary thyroid carcinoma. Requesting GLP-1 therapy for weight management."
  }'
```

Inline member, case notes generated from a survey response:

```bash
curl -X POST https://apextelemed.com/api/v1/requests \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "member": {
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane.doe@example.com",
      "phone": "512-555-0142",
      "gender": "f",
      "dateOfBirth": "1988-04-02",
      "state": "TX",
      "address": {
        "street1": "123 Main St",
        "street2": "Apt 4B",
        "city": "Austin",
        "state": "TX",
        "zipCode": "78701"
      }
    },
    "items": [
      { "drugId": "nl-semaglutide-inj", "requestedClinicalDose": { "value": 0.25, "unit": "mg" } }
    ],
    "v2SurveyResponseId": "c9d8e7f6-a5b4-4c3d-9e2f-1a0b9c8d7e6f"
  }'
```

Scheduled pharmacy transmission:

```bash
curl -X POST https://apextelemed.com/api/v1/requests \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "items": [ { "drugId": "nl-semaglutide-inj", "requestedSkuId": "sku_5mg_1ml" } ],
    "caseNotes": "Month 3 refill. Tolerating 1 mg weekly, no adverse effects reported.",
    "pharmacySendAt": "2026-10-01T09:00:00Z"
  }'
```

Consultation request (no drug):

```bash
curl -X POST https://apextelemed.com/api/v1/requests \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "caseNotes": "Patient would like to discuss treatment options for hair loss before choosing a medication."
  }'
```

Legacy single-drug format:

```bash
curl -X POST https://apextelemed.com/api/v1/requests \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "drugId": "nl-semaglutide-inj",
    "dosage": "2.5mg/ml (1ml vial)",
    "caseNotes": "Established patient, continuing therapy."
  }'
```

**Response `201 Created`**

```json
{
  "success": true,
  "requestId": "3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11",
  "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "itemCount": 1,
  "message": "Request queued successfully with 1 item(s)"
}
```

For a consultation request `itemCount` is `0` and `message` is `Consultation request created successfully`. The response does not include the line item; fetch the request to read its `itemId`.

**Response `200 OK` (idempotent replay)**

```json
{
  "success": true,
  "requestId": "3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11",
  "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "itemCount": 1,
  "message": "Request already exists (idempotent replay)",
  "idempotentReplay": true
}
```

**Errors**

| Status | `error` | When |
| --- | --- | --- |
| `400` | Array of validation issues | The body fails validation: missing `memberId` and `member`, missing `caseNotes` and `v2SurveyResponseId`, more than one item, an invalid member field, or a `pharmacySendAt` that is malformed or in the past. |
| `400` | `Member not found` | `memberId` does not exist or belongs to another partner. |
| `400` | `Invalid drugId - drug not found: <drugId>` | The drug does not exist. |
| `400` | `Invalid dosage for <drugId>. Available dosages: <labels>` | `dosage` is not one of the drug's labels. |
| `400` | `Invalid requestedSkuId for <drugId>: <requestedSkuId>` | `requestedSkuId` is not one of the drug's SKUs. |
| `400` | `v2SurveyResponseId not found` | No survey response with that identifier. |
| `400` | `v2SurveyResponseId does not belong to this partner` | The survey response was submitted under a different partner account. |
| `403` | `Partner does not have access to drug: <drugId>` | The drug is outside your account's allowed list. |
| `500` | `Internal Server Error` | Unexpected failure. Safe to retry with the same `Idempotency-Key`. |

**Behaviour**

- The new line item starts in `pending` with the pharmacy set to the drug's default pharmacy. The request is placed in the prescriber queue and reviewed in order.
- When both `caseNotes` and `v2SurveyResponseId` are sent, the stored case notes are your text, a separator line, then the generated survey summary.
- A `v2SurveyResponseId` is linked to the member and request, and the survey's clinical answers are recorded on the member's chart. Failures in that linking do not fail the create.
- Inline member creation is not rolled back if a later validation step fails. Validate `drugId` and SKU against your cached catalogue before submitting to avoid orphaned members.
- No webhook fires on creation.

### `GET /v1/requests`

Lists your requests, newest first, with optional filters.

**Auth:** `x-api-key`

**Query parameters**

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `startDate` | string | none | Include requests created at or after this date. Use `YYYY-MM-DD` or a full ISO 8601 timestamp. |
| `endDate` | string | none | Include requests created up to the end of this day. |
| `status` | string | none | One of `pending`, `approved`, `denied`, `call_requested`, `completed`, `cancelled`. Matches a request when any of its line items has that status. |
| `page` | integer | `1` | Page number, starting at 1. |
| `limit` | integer | `20` | Results per page, 1 to 100. |

```bash
curl "https://apextelemed.com/api/v1/requests?status=approved&startDate=2026-08-01&limit=50" \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{
  "requests": [
    {
      "id": "3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11",
      "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "memberName": "Jane Doe",
      "memberEmail": "jane.doe@example.com",
      "memberState": "TX",
      "lineItems": [
        {
          "itemId": "f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
          "drugId": "nl-semaglutide-inj",
          "drugName": "Semaglutide",
          "dosage": null,
          "status": "approved",
          "prescriberId": "7d0e4a2b-1c3f-4e5a-9b8c-2d1e0f9a8b7c",
          "trackingNumber": "1Z999AA10123456784",
          "shipCarrier": "UPS",
          "deliveryStatus": "Rx Shipping Pickup"
        }
      ],
      "itemCount": 1,
      "statusSummary": "1 drug - 1 approved",
      "status": "approved",
      "createdAt": "2026-08-20T14:02:11.482Z",
      "updatedAt": "2026-08-21T09:15:40.007Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 }
}
```

#### List item fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Request identifier. |
| `memberId` | string or null | Member identifier. |
| `memberName` | string or null | Member's first and last name. |
| `memberEmail` | string or null | Member's email. |
| `memberState` | string or null | Member's two-letter state. |
| `lineItems[].itemId` | string | Line item identifier. Use it with `cancel` and `send-to-pharmacy`. |
| `lineItems[].drugId` | string or null | Drug identifier. |
| `lineItems[].drugName` | string or null | Drug display name. |
| `lineItems[].dosage` | string or null | The legacy dosage label you sent, if any. |
| `lineItems[].status` | string | Line item status. See [Line item statuses](#line-item-statuses). |
| `lineItems[].prescriberId` | string or null | Opaque identifier of the prescriber who acted on the item. |
| `lineItems[].trackingNumber` | string or null | Shipment tracking number once the pharmacy reports it. |
| `lineItems[].shipCarrier` | string or null | Carrier name once known. |
| `lineItems[].deliveryStatus` | string or null | Pharmacy-reported delivery status. |
| `itemCount` | number | Number of line items. |
| `statusSummary` | string | Human-readable status count. |
| `status` | string | Derived request-level status. See [Request-level status](#request-level-status). |
| `createdAt` | string | Creation timestamp. |
| `updatedAt` | string | Last update timestamp. |

Requests that have no line items, which are consultation requests that have not been approved yet and requests created before line items existed, are returned in a compatibility shape. They carry the stored `status`, top-level `drugId`, `prescriptionName`, and `dosage` fields, `itemCount: 1`, a `statusSummary` such as `1 drug - pending`, and a single synthesised `lineItems` entry whose `itemId` equals the request `id`.

**Errors**

| Status | `error` | When |
| --- | --- | --- |
| `400` | Array of validation issues | `status` is not one of the allowed values, or `page` or `limit` is out of range. |
| `500` | `Internal Server Error` | Unexpected failure. |

**Behaviour**

- Filters are applied after your entire request history is loaded, so `total` reflects matching requests only.
- `endDate` is inclusive to the end of that calendar day.
- Results are ordered by `createdAt` descending. There is no cursor; use `page` and `limit`.
- The list omits case notes, prescription details, and the full member record. Fetch a single request for those.

### `GET /v1/requests/:id`

Returns one request with its member, line items, prescriptions, fulfilment state, and history.

**Auth:** `x-api-key`

**Path parameters**

| Parameter | Description |
| --- | --- |
| `id` | Request identifier. |

```bash
curl https://apextelemed.com/api/v1/requests/3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11 \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{
  "id": "3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11",
  "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "memberName": "Jane Doe",
  "memberEmail": "jane.doe@example.com",
  "memberDob": "1988-04-02",
  "memberState": "TX",
  "member": {
    "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane.doe@example.com",
    "phone": "512-555-0142",
    "gender": "f",
    "dateOfBirth": "1988-04-02",
    "state": "TX",
    "address": {
      "street1": "123 Main St",
      "street2": "Apt 4B",
      "city": "Austin",
      "state": "TX",
      "zipCode": "78701"
    },
    "shippingAddress": null,
    "status": "active",
    "createdAt": "2026-03-14T18:22:05.110Z",
    "updatedAt": "2026-08-20T14:02:11.482Z"
  },
  "lineItems": [
    {
      "itemId": "f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
      "drugId": "nl-semaglutide-inj",
      "drugName": "Semaglutide",
      "drug": {
        "id": "nl-semaglutide-inj",
        "name": "Semaglutide",
        "classification": "non-controlled",
        "dosages": ["2.5mg/ml (1ml vial)", "5mg/ml (1ml vial)"]
      },
      "dosage": null,
      "status": "approved",
      "prescriberId": "7d0e4a2b-1c3f-4e5a-9b8c-2d1e0f9a8b7c",
      "pharmacyId": "e7198a38-234f-41b4-8c77-f36cbb565673",
      "prescription": {
        "dosage": "2.5mg/ml (1ml vial)",
        "quantity": 1,
        "daysSupply": 28,
        "directions": "Inject 0.25 mg subcutaneously once weekly for 4 weeks.",
        "refills": 0,
        "dispenseAsWritten": false,
        "unit": "vial",
        "form": "injection",
        "route": "subcutaneous",
        "classification": "non-controlled",
        "deaSchedule": null,
        "expirationDate": "2027-08-21T09:15:40.007Z",
        "prescriptionId": "9c8b7a6d-5e4f-4321-8765-4321fedcba98"
      },
      "prescriptionRecord": {
        "id": "9c8b7a6d-5e4f-4321-8765-4321fedcba98",
        "requestId": "3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11",
        "lineItemId": "f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
        "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "prescriberId": "7d0e4a2b-1c3f-4e5a-9b8c-2d1e0f9a8b7c",
        "pharmacyId": "e7198a38-234f-41b4-8c77-f36cbb565673",
        "drugId": "nl-semaglutide-inj",
        "partnerId": "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e",
        "supersedesId": null,
        "renewalOfId": null,
        "drugName": "Semaglutide",
        "selectedSku": "2.5mg/ml (1ml vial)",
        "selectedSkuId": "sku_2_5mg_1ml",
        "concentration": { "value": 2.5, "activeUnit": "mg", "baseUnit": "mL" },
        "packageSize": 1,
        "clinicalDose": { "value": 0.25, "unit": "mg" },
        "volumeMl": 0.1,
        "deviceUnits": 10,
        "dosingIntervalDays": 7,
        "quantity": 1,
        "quantityUnits": "vial",
        "daysSupply": 28,
        "sigText": "Inject 0.25 mg subcutaneously once weekly for 4 weeks.",
        "refills": 0,
        "dispenseAsWritten": false,
        "classification": "non-controlled",
        "deaSchedule": null,
        "status": "sent_to_pharmacy",
        "voidReason": null,
        "lifefileOrderId": "RCI47910",
        "lifefileProductId": null,
        "issuedAt": "2026-08-21T09:15:40.007Z",
        "expirationDate": "2027-08-21T09:15:40.007Z",
        "sentToPharmacyAt": "2026-08-21T09:15:41.316Z",
        "filledAt": null,
        "cancelledAt": null,
        "voidedAt": null,
        "createdAt": "2026-08-21T09:15:40.007Z",
        "updatedAt": "2026-08-21T09:15:41.316Z"
      },
      "history": [
        { "action": "created", "timestamp": "2026-08-20T14:02:11.482Z", "by": "api" },
        { "action": "approved", "timestamp": "2026-08-21T09:15:40.007Z", "by": "7d0e4a2b-1c3f-4e5a-9b8c-2d1e0f9a8b7c" }
      ],
      "pharmacySent": true,
      "pharmacySentAt": "2026-08-21T09:15:41.316Z",
      "trackingNumber": "1Z999AA10123456784",
      "shipCarrier": "UPS",
      "deliveryStatus": "Rx Shipping Pickup"
    }
  ],
  "itemCount": 1,
  "statusSummary": "1 drug - 1 approved",
  "status": "approved",
  "prescriptionRecords": [
    { "id": "9c8b7a6d-5e4f-4321-8765-4321fedcba98", "lineItemId": "f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f", "status": "sent_to_pharmacy" }
  ],
  "prescriptionRecord": null,
  "drugId": "nl-semaglutide-inj",
  "prescriptionName": "Semaglutide",
  "drug": {
    "id": "nl-semaglutide-inj",
    "name": "Semaglutide",
    "classification": "non-controlled",
    "dosages": ["2.5mg/ml (1ml vial)", "5mg/ml (1ml vial)"]
  },
  "dosage": null,
  "pharmacyId": "e7198a38-234f-41b4-8c77-f36cbb565673",
  "caseNotes": "38-year-old female, BMI 31.2. No history of pancreatitis or medullary thyroid carcinoma. Requesting GLP-1 therapy for weight management.",
  "providerId": "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d",
  "createdAt": "2026-08-20T14:02:11.482Z",
  "updatedAt": "2026-08-21T09:15:41.316Z",
  "history": [
    { "action": "created", "timestamp": "2026-08-20T14:02:11.482Z", "by": "api" },
    { "action": "approved", "timestamp": "2026-08-21T09:15:40.007Z", "by": "7d0e4a2b-1c3f-4e5a-9b8c-2d1e0f9a8b7c" }
  ]
}
```

The `drug` objects and the `prescriptionRecords` entry above are abbreviated. In a live response `drug` is the full catalogue record and `prescriptionRecords[0]` is identical to `lineItems[0].prescriptionRecord`.

#### Request fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Request identifier. |
| `memberId`, `memberName`, `memberEmail`, `memberDob`, `memberState` | string or null | Member summary. `memberDob` is `YYYY-MM-DD`. |
| `member` | object or null | The full member record. Core fields are documented under [Members](/api/members/); additional fields may appear. |
| `lineItems` | object[] | The request's line items. See [Line item fields](#line-item-fields). Empty for a consultation request that has not been approved. |
| `itemCount` | number | Number of line items. |
| `statusSummary` | string | Human-readable status count, or `No items` for a consultation request. |
| `status` | string | Derived request-level status. |
| `prescriptionRecords` | object[] | Every prescription record minted for the request, in the shape described under [Prescription record fields](#prescription-record-fields). The same records appear on their line items as `prescriptionRecord`. Empty until an item is approved. |
| `prescriptionRecord` | object or null | The prescription record for a legacy request without line items. `null` otherwise. |
| `drugId`, `prescriptionName`, `drug`, `dosage`, `pharmacyId` | mixed | The first line item's drug, name, catalogue record, dosage label, and pharmacy, mirrored at the top level for compatibility. |
| `caseNotes` | string or null | The stored case notes, including any generated survey summary. |
| `providerId` | string or null | Opaque identifier of the provider organisation reviewing the request. |
| `createdAt`, `updatedAt` | string | Timestamps. |
| `history` | object[] | Request-level audit trail. See [History](#history). |

#### Line item fields

| Field | Type | Description |
| --- | --- | --- |
| `itemId` | string | Line item identifier. |
| `drugId`, `drugName` | string or null | Drug identifier and display name. |
| `drug` | object or null | The drug's catalogue record. Prefer the fields documented under [Drugs](/api/drugs/); other fields are internal configuration and may change without notice. |
| `dosage` | string or null | The legacy dosage label you sent, if any. |
| `status` | string | Line item status. |
| `prescriberId` | string or null | Opaque identifier of the prescriber who acted on the item. |
| `pharmacyId` | string or null | Identifier of the pharmacy that will fill the prescription. |
| `prescription` | object or null | The prescription as signed: `dosage` (SKU label), `quantity`, `daysSupply`, `directions`, `refills`, `dispenseAsWritten`, `unit`, `form`, `route`, `classification`, `deaSchedule`, `expirationDate`, and `prescriptionId`. `null` until approved. |
| `prescriptionRecord` | object or null | The immutable prescription record. See [Prescription record fields](#prescription-record-fields). `null` until approved. |
| `history` | object[] | Item-level audit trail. |
| `pharmacySent` | boolean | `true` once the prescription has been transmitted to the pharmacy. |
| `pharmacySentAt` | string or null | When it was transmitted. |
| `trackingNumber`, `shipCarrier`, `deliveryStatus` | string or null | Shipping details reported by the pharmacy. |

#### Prescription record fields

The prescription record is a frozen snapshot taken at signing. Clinical fields never change; corrections produce a new record that points back through `supersedesId`.

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Prescription record identifier. |
| `requestId`, `lineItemId`, `memberId`, `prescriberId`, `pharmacyId`, `drugId`, `partnerId` | string or null | Links to related resources. |
| `supersedesId` | string or null | The record this one replaces, when reissued. |
| `renewalOfId` | string or null | The earlier prescription this one renews. |
| `drugName` | string | Drug name at signing. |
| `selectedSku`, `selectedSkuId` | string or null | The SKU label and identifier the prescriber chose. |
| `concentration` | object or null | `{ value, activeUnit, baseUnit }` of the chosen SKU. |
| `packageSize` | number or null | Base units per package. |
| `clinicalDose` | object or null | `{ value, unit }` the patient takes per administration. |
| `volumeMl`, `deviceUnits` | number or null | Derived injection volume and device units, when applicable. |
| `dosingIntervalDays` | number or null | Days between doses, for example `7` for weekly. |
| `quantity`, `quantityUnits` | number, string or null | Amount dispensed. |
| `daysSupply` | number | Days the dispensed quantity covers. Use it to schedule the next fill. |
| `sigText` | string | Directions as printed on the prescription. |
| `refills` | number | Refills authorised. |
| `dispenseAsWritten` | boolean | Whether substitution is prohibited. |
| `classification`, `deaSchedule` | string or null | Controlled-substance classification. |
| `status` | string | One of `issued`, `sent_to_pharmacy`, `filled`, `refilled`, `cancelled`, `voided`, `expired`. |
| `voidReason` | string or null | Why the record was voided. |
| `lifefileOrderId` | string or null | The pharmacy's order reference, once assigned. |
| `lifefileProductId` | number or null | The pharmacy's product reference, when applicable. |
| `issuedAt`, `expirationDate`, `sentToPharmacyAt`, `filledAt`, `cancelledAt`, `voidedAt` | string or null | Lifecycle timestamps. |
| `createdAt`, `updatedAt` | string | Record timestamps. |

**Errors**

| Status | `error` | When |
| --- | --- | --- |
| `404` | `Request not found` | No such request, or it belongs to another partner. |
| `500` | `Internal Server Error` | Unexpected failure. |

### `DELETE /v1/requests/:id`

Permanently deletes a request that no prescriber has acted on yet. Use it to roll back a request submitted in error. To withdraw a request the prescriber may already have approved, use [`cancel`](#post-v1requestsidcancel) instead.

**Auth:** `x-api-key`

**Path parameters**

| Parameter | Description |
| --- | --- |
| `id` | Request identifier. |

```bash
curl -X DELETE https://apextelemed.com/api/v1/requests/3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11 \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `204 No Content`**

No body.

**Errors**

| Status | `error` | When |
| --- | --- | --- |
| `400` | `Only pending requests can be deleted. This request has already been processed.` | The request's stored status is no longer `pending`. |
| `404` | `Request not found` | No such request, or it belongs to another partner, or it was already deleted. |
| `500` | `Internal Server Error` | Unexpected failure. |

**Behaviour**

- Only the request's stored status is checked. A request whose item is `call_requested` is still `pending` underneath and can be deleted.
- Deletion is a hard delete. The request disappears from lists and cannot be recovered. The member is not affected.
- No webhook fires.

### `POST /v1/requests/:id/cancel`

Withdraws the request's line items that have not yet reached a pharmacy. Approved items whose prescription is still with Apex are cancelled and their prescription voided; items already transmitted are left alone. Use this when a patient cancels after submitting, or when their membership ends.

**Auth:** `x-api-key`

**Path parameters**

| Parameter | Description |
| --- | --- |
| `id` | Request identifier. |

**Body** (optional)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `reason` | string | No | Recorded in the item's history. Defaults to `cancelled by partner`. |
| `itemIds` | string[] | No | Restrict cancellation to these line items. Defaults to all items on the request. |

```bash
curl -X POST https://apextelemed.com/api/v1/requests/3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11/cancel \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Patient cancelled subscription" }'
```

**Response `200 OK`**

```json
{
  "success": true,
  "requestId": "3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11",
  "cancelled": [
    {
      "itemId": "f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
      "previousStatus": "approved",
      "prescriptionId": "9c8b7a6d-5e4f-4321-8765-4321fedcba98"
    }
  ],
  "skipped": [],
  "aggregateStatus": "cancelled"
}
```

| Field | Type | Description |
| --- | --- | --- |
| `cancelled[]` | object[] | Items withdrawn by this call, with the status they had and the identifier of the prescription record that was voided (`null` if none had been issued). |
| `skipped[]` | object[] | Items left untouched, each with its current `status` and a `reason`: `already cancelled`, `item is denied`, `item is completed`, or `already transmitted to the pharmacy (order <reference>)`. |
| `aggregateStatus` | string | The request's stored status after the call: `pending`, `approved`, `denied`, `partial`, `completed`, or `cancelled`. |

**Errors**

| Status | `error` | When |
| --- | --- | --- |
| `400` | `Request has no line items (legacy single-drug request not supported here)` | The request has no line items. This includes consultation requests that have not been approved; use `DELETE` for those while they are pending. |
| `404` | `Request not found` | No such request, or it belongs to another partner. |
| `500` | `Internal Server Error` | Unexpected failure. |

**Behaviour**

- **Idempotent.** Repeating the call returns the already-cancelled items under `skipped` with HTTP `200`, so retrying after a timeout is safe.
- **Transmission is the cut-off.** An item is considered transmitted when `pharmacySent` is `true` or the pharmacy has issued an order reference. Such items cannot be withdrawn through the API; contact Apex support to attempt a pharmacy-side cancellation.
- **Prescriptions are voided.** Each cancelled item's prescription record moves to `voided` so it cannot be transmitted later.
- **Webhooks.** `item.canceled` fires for each cancelled item, followed by `request.all_canceled` when no live items remain. Nothing fires when `cancelled` is empty.
- The record and its history are preserved; the request remains visible in lists with the item in `cancelled`.

### `POST /v1/requests/:requestId/items/:itemId/send-to-pharmacy`

Transmits an approved, not-yet-transmitted line item to its pharmacy. This is how deferred-fulfilment accounts release a prescription, for example after collecting payment. It is not restricted to deferred accounts: any approved item with `pharmacySent: false` can be sent.

**Auth:** `x-api-key`

**Path parameters**

| Parameter | Description |
| --- | --- |
| `requestId` | Request identifier. |
| `itemId` | Line item identifier, from `lineItems[].itemId` on the request. |

```bash
curl -X POST https://apextelemed.com/api/v1/requests/3f2c9c1e-8d7a-4b2f-9e64-1c5a7d0b2f11/items/f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f/send-to-pharmacy \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{
  "success": true,
  "method": "new_life",
  "warnings": []
}
```

| Field | Type | Description |
| --- | --- | --- |
| `success` | boolean | `true` if the pharmacy accepted the prescription. |
| `method` | string | Transmission channel used: `life_file` or `new_life` for a pharmacy API integration, `email` for pharmacies that receive prescriptions by secure email, or `none` when no pharmacy is assigned. |
| `warnings` | string[] | Non-fatal notes, or the reason for a failure when `success` is `false`. |
| `error` | string | Present when `success` is `false` and the pharmacy or transport returned an error. |

A failed transmission still returns HTTP `200` with `success: false`. Check `success`, not the status code.

```json
{
  "success": false,
  "method": "new_life",
  "warnings": [],
  "error": "Fulfillment held: member_cancelled: Member is cancelled — they have ended their membership."
}
```

**Errors**

| Status | `error` | When |
| --- | --- | --- |
| `400` | `Cannot send to pharmacy: item status is '<status>', expected 'approved'` | The item is not approved. |
| `400` | `This item has already been sent to pharmacy` | `pharmacySent` is already `true`. |
| `404` | `Request not found` | No such request, or it belongs to another partner. |
| `404` | `Line item not found` | No line item with that `itemId`, and the request has no legacy single-drug record to fall back to. |
| `500` | `Internal Server Error` | Unexpected failure. |

**Behaviour**

- On success `pharmacySent` becomes `true`, `pharmacySentAt` is stamped, and the prescription record moves to `sent_to_pharmacy`. Shipping updates then arrive as described under [Shipping updates](#shipping-updates).
- Transmission is refused with `success: false` when the member is paused or cancelled, when the patient has sent a message since approval that no prescriber has read yet, when the pharmacy integration is not configured for your account, or when the pharmacy rejects the order. The `error` string names the hold. Fix the cause and call again; nothing is marked sent on failure.
- Always take `itemId` from the request. If the identifier does not match a line item but the request has a legacy single-drug record, the whole request is treated as the item instead of returning `404`.
- Calling this on an item whose `pharmacySendAt` has not yet elapsed sends it now. The scheduler skips items that are already marked sent.
