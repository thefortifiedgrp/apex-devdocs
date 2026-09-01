---
title: Drugs
description: List the drugs and SKUs your account can submit prescription requests for.
sidebar:
  order: 4
---

The drug catalogue tells you which medications your account can request and which SKUs (package and strength options) each one offers. Use the `id` values from this endpoint as `drugId` and `requestedSkuId` when you [create a request](/api/requests/#post-v1requests).

### `GET /v1/drugs`

Returns every drug your account is allowed to order.

**Auth:** `x-api-key`

**Parameters:** none. The endpoint has no filters and no pagination. The full catalogue is returned in a single response, in no guaranteed order.

```bash
curl https://apextelemed.com/api/v1/drugs \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{
  "drugs": [
    {
      "id": "nl-semaglutide-inj",
      "name": "Semaglutide",
      "description": "Compounded semaglutide injection for weight management.",
      "defaultAdCopy": "Once-weekly GLP-1 therapy, reviewed by a licensed prescriber.",
      "dosages": ["2.5mg/ml (1ml vial)", "5mg/ml (1ml vial)"],
      "skus": [
        {
          "id": "sku_2_5mg_1ml",
          "label": "2.5mg/ml (1ml vial)",
          "packageSize": 1,
          "concentration": { "value": 2.5, "activeUnit": "mg", "baseUnit": "mL" },
          "active": true
        },
        {
          "id": "sku_5mg_1ml",
          "label": "5mg/ml (1ml vial)",
          "packageSize": 1,
          "concentration": { "value": 5, "activeUnit": "mg", "baseUnit": "mL" },
          "active": true
        }
      ],
      "classification": "non-controlled"
    },
    {
      "id": "cc-finasteride-minoxidil-liquid-sol",
      "name": "Finasteride / Minoxidil topical solution",
      "description": null,
      "defaultAdCopy": null,
      "dosages": ["60ml"],
      "skus": [
        { "id": "sku_60ml", "label": "60ml", "active": true }
      ],
      "classification": "non-controlled"
    }
  ]
}
```

#### Drug fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Stable drug identifier. Send it as `drugId` on a request. |
| `name` | string | Display name of the medication. |
| `description` | string or null | Clinical or marketing description, when one is configured. |
| `defaultAdCopy` | string or null | Suggested patient-facing copy for the drug, when one is configured. |
| `dosages` | string[] | Legacy SKU labels, one per SKU. Still accepted as `dosage` on a request. Prefer `skus[].id`. |
| `skus` | object[] | The SKU catalogue for the drug. Empty for drugs that have not been migrated to SKU identifiers yet. |
| `classification` | string | `non-controlled` or `controlled`. |

#### SKU fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Stable, opaque SKU identifier. Send it as `requestedSkuId` on a request. It never changes, even if the label is renamed. |
| `label` | string | Human-readable label. Cosmetic only; it may be edited by Apex at any time, so never key on it. |
| `packageSize` | number | Base units dispensed per package, for example millilitres per vial. Omitted for SKUs without a dose model, such as tablet strengths. |
| `concentration` | object | Active amount per base unit: `{ value, activeUnit, baseUnit }`, for example 2.5 mg per 1 mL. Omitted when not configured. |
| `active` | boolean | `false` marks a SKU that is not currently orderable. Exclude it from patient-facing choices. |

**Errors**

| Status | `error` | When |
| --- | --- | --- |
| `401` | `API Key missing` / `Invalid API Key` | Authentication failed. |
| `500` | `Internal Server Error` | Unexpected failure. Retry with backoff. |

**Behaviour**

- The catalogue is scoped to your account. If Apex has restricted your account to specific drugs, only those are returned. Otherwise the full platform catalogue is returned.
- Pharmacy-internal identifiers are never included. `skus[].id` is the only SKU key you need.
- The catalogue changes rarely. Cache it for hours rather than fetching it per request, and refresh on a schedule or when a request creation fails with an unknown drug or SKU.

:::tip
Prefer `requestedSkuId` over `dosage` when you create a request. Labels are free text and may be renamed; SKU identifiers are permanent. If you do not know which SKU the patient should receive, send `drugId` alone and the prescriber selects the SKU at signing.
:::
