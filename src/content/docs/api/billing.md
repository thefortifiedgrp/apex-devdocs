---
title: Billing
description: Read the billable-member summary for the current or a past billing period.
sidebar:
  order: 6
---

Apex bills partners per active member. Each member is charged once per month, on the monthly anniversary of the day they first became billable. This endpoint returns the members counted in a given billing period and the resulting total, so you can reconcile invoices against your own records.

Billing must be enabled on your account before this endpoint returns data. A member's billable state follows the member's `status`: `active` members are billed, `paused` and `cancelled` members are not. See [Members](/api/members/) for how to change a member's status.

### `GET /v1/billing`

Returns the billing summary for the period that contains a target date.

**Auth:** `x-api-key`

**Query parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `period` | string | No | A date inside the period you want. Accepts `YYYY-MM-DD`, `YYYY-MM` (resolved to the 15th of that month), or `YYYY-Www` (an ISO week). Defaults to today. Any other value is treated as today. |

```bash
curl "https://apextelemed.com/api/v1/billing?period=2026-08" \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{
  "period": {
    "startDate": "2026-08-01T00:00:00.000Z",
    "endDate": "2026-08-31T23:59:59.999Z",
    "label": "August 2026"
  },
  "ratePerMember": 45,
  "billableMembers": [
    {
      "memberId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "memberName": "Jane Doe",
      "memberEmail": "jane.doe@example.com",
      "billingStartDate": "2026-03-14T00:00:00.000Z",
      "billingAnniversaryDay": 14
    },
    {
      "memberId": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      "memberName": "John Smith",
      "memberEmail": "john.smith@example.com",
      "billingStartDate": "2026-07-29T00:00:00.000Z",
      "billingAnniversaryDay": 29
    }
  ],
  "uniqueMemberCount": 2,
  "totalAmount": 90
}
```

#### Response fields

| Field | Type | Description |
| --- | --- | --- |
| `period.startDate` | string | First instant of the billing period. |
| `period.endDate` | string | Last instant of the billing period. |
| `period.label` | string | Human-readable period name, for example `August 2026`. |
| `ratePerMember` | number | Your contracted charge per billable member per month. |
| `billableMembers` | object[] | Members counted in this period, sorted by `billingStartDate` ascending. |
| `billableMembers[].memberId` | string | Member identifier. |
| `billableMembers[].memberName` | string | First and last name. `Unknown` if both are blank. |
| `billableMembers[].memberEmail` | string | Email address, or an empty string if none is stored. |
| `billableMembers[].billingStartDate` | string | When the member first became billable. |
| `billableMembers[].billingAnniversaryDay` | number | Day of the month (1 to 31) on which the member's monthly charge falls. |
| `uniqueMemberCount` | number | Number of entries in `billableMembers`. |
| `totalAmount` | number | `uniqueMemberCount` multiplied by `ratePerMember`. |

**Errors**

| Status | `error` | When |
| --- | --- | --- |
| `401` | `API Key missing` / `Invalid API Key` | Authentication failed. |
| `404` | `Billing not enabled for this partner` | Your account has no active billing configuration. |
| `500` | The underlying error message | Unexpected failure. Retry with backoff. |

**Behaviour**

- **Billing cycle.** Your account is configured for either monthly or weekly periods. Monthly periods are calendar months. Weekly periods are seven days starting on your configured billing weekday. The response `period` tells you which bounds applied.
- **Who is counted.** A member is included if they were billing-active at any point during the period, or if they are billing-active now. On a weekly cycle, currently active members are included only when their `billingAnniversaryDay` falls inside the seven-day window. Members whose `billingStartDate` is after the period end are excluded. Anniversary days beyond the end of a short month roll into that month's last day, so a member whose anniversary is the 31st is billed on 28 February.
- **Deactivation.** Pausing or cancelling a member stops future charges. The member still appears in any period during which they were active.
- **Amounts.** `ratePerMember` and `totalAmount` are plain numbers in the unit of your contracted rate.
- **History.** Request past periods by passing an earlier `period`. There is no bulk history endpoint; iterate over the periods you need.

:::note
This endpoint reports the members Apex will bill for. Invoices, payment methods, and payment history are managed in the partner portal and are not exposed through the Partner API.
:::
