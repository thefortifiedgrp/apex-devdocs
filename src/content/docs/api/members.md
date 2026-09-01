---
title: Members
description: Create, list, update, and delete the patients (members) that your prescription requests are submitted for.
sidebar:
  order: 3
---

A member is a patient on your platform. Every prescription request belongs to exactly one member, and the member's ID is what ties together requests, conversations, appointments, and webhook events for that patient.

Members are scoped to your partner account. You can only see and modify members you created, and a member ID that belongs to another partner behaves as if it does not exist.

All endpoints on this page use the Partner API base URL `https://apextelemed.com/api/v1` and require your API key in the `x-api-key` header. See [Authentication](/getting-started/authentication/).

:::tip[Two ways to create a member]
You can create a member ahead of time with `POST /v1/members`, or inline by passing a `member` object when you [create a request](/api/requests/). The two paths differ in one important way: inline creation looks up an existing member by email first and reuses it, while `POST /v1/members` always creates a new record. If you use both, create the member first and then pass its `memberId` to the request.
:::

## The member object

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | UUID assigned by Apex. Use it as `memberId` everywhere else in the API. |
| `firstName` | string | Legal first name. |
| `lastName` | string | Legal last name. |
| `email` | string | Email address. Not required to be unique. |
| `phone` | string \| null | Free-form phone number. |
| `dateOfBirth` | string | `YYYY-MM-DD`. Returned in full on the API. |
| `state` | string | Two-letter US state code where the patient is located. |
| `status` | string | `active`, `paused`, or `cancelled`. See [Member status](#member-status). |
| `address` | object | Home address. See [The address object](#the-address-object). |
| `shippingAddress` | object \| null | Where prescriptions ship. When null, the home address is used. |
| `createdAt` | string | ISO 8601 timestamp. |
| `updatedAt` | string | ISO 8601 timestamp of the last change. |
| `requests` | array | Present on `GET /v1/members` and `GET /v1/members/:id` only. See [Request summaries](#request-summaries). |

The `POST /v1/members` response additionally echoes `partnerId` and, if you sent it, `gender`. Neither field is returned by the other endpoints.

### The address object

Used for both `address` and `shippingAddress`.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `street1` | string | Yes | Street address, non-empty. |
| `street2` | string | No | Apartment, suite, or unit. |
| `city` | string | Yes | Non-empty. |
| `state` | string | Yes | Exactly two characters. |
| `zipCode` | string | Yes | `12345` or `12345-6789`. |

When you update an address you must send the whole object. Partial address updates are not merged.

### Request summaries

Member reads include a `requests` array listing every request you have submitted for that member, newest first. Each entry is a compact summary; fetch the request itself for line items, prescriptions, and shipping details.

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Request UUID. |
| `drugId` | string \| null | Drug on the request. Null for multi-item requests, which carry their drugs on line items instead. |
| `prescriptionName` | string \| null | Display name of `drugId`, when present. |
| `dosage` | string \| null | Requested dosage. Null for multi-item requests. |
| `status` | string | The request's overall status. See [Request lifecycle](/api/requests/#request-lifecycle). |
| `caseNotes` | string \| null | Notes you submitted with the request. |
| `createdAt` | string | ISO 8601 timestamp. |
| `updatedAt` | string | ISO 8601 timestamp. |

## Member status

| Status | Meaning |
| --- | --- |
| `active` | The member can be treated and is billable. New members start here. |
| `paused` | The member has paused their membership. Billing stops. |
| `cancelled` | The member has cancelled. Billing stops. |

Only you change a member's status, through `PUT /v1/members/:id`. Apex providers never change it, and no status is changed automatically when requests are approved, denied, or cancelled.

What a status change does:

- Sets the member's billable flag: `active` turns billing on, `paused` and `cancelled` turn it off.
- Records an audit event with the previous and new status, so billing disputes can be reconciled against the exact date of the change.
- Nothing else. Existing requests are not cancelled, conversations stay open, and no webhook is sent. If you want to withdraw pending prescriptions when a member cancels, call the request cancel endpoint separately. See [Requests](/api/requests/).

Any transition is allowed, including `cancelled` back to `active`. Sending the member's current status is a no-op.

Per-member billing does not start when the member is created. It starts the first time an Apex provider approves a prescription for that member. After that, the member is billed for each period in which they are `active`. See [Billing](/api/billing/).

## Endpoints

### `POST /v1/members`

Creates a member with status `active`.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `firstName` | string | Yes | Non-empty. |
| `lastName` | string | Yes | Non-empty. |
| `email` | string | Yes | Must be a valid email address. Send it lowercased so that inline request creation can match it later. |
| `phone` | string | No | Any format. |
| `gender` | string | No | `m`, `f`, `a`, or `u`. Stored, but not returned by later reads. |
| `dateOfBirth` | string | Yes | `YYYY-MM-DD`. Only the format is validated. |
| `state` | string | Yes | Exactly two characters. |
| `address` | object | Yes | See [The address object](#the-address-object). |
| `shippingAddress` | object | No | See [The address object](#the-address-object). |

No duplicate check is performed. Two calls with the same email create two members.

```bash
curl -X POST https://apextelemed.com/api/v1/members \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jordan",
    "lastName": "Rivera",
    "email": "jordan.rivera@example.com",
    "phone": "+1 555 010 2233",
    "dateOfBirth": "1988-04-12",
    "state": "TX",
    "address": {
      "street1": "1401 Elm St",
      "street2": "Apt 5B",
      "city": "Dallas",
      "state": "TX",
      "zipCode": "75202"
    }
  }'
```

**Response `201 Created`**

```json
{
  "success": true,
  "member": {
    "id": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
    "firstName": "Jordan",
    "lastName": "Rivera",
    "email": "jordan.rivera@example.com",
    "phone": "+1 555 010 2233",
    "dateOfBirth": "1988-04-12",
    "state": "TX",
    "address": {
      "street1": "1401 Elm St",
      "street2": "Apt 5B",
      "city": "Dallas",
      "state": "TX",
      "zipCode": "75202"
    },
    "partnerId": "0b7c4d21-9e3f-4a6b-8d15-2c4e6f8a0b13",
    "status": "active",
    "createdAt": "2026-09-01T14:22:07.311Z",
    "updatedAt": "2026-09-01T14:22:07.311Z"
  }
}
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": [ ...issues ] }` | Validation failed. See [Validation errors](#validation-errors). |
| 401 | `{ "error": "API Key missing" }` | No `x-api-key` header. |
| 401 | `{ "error": "Invalid API Key" }` | Unknown key. |
| 500 | `{ "error": "Internal Server Error" }` | Unexpected failure. Safe to retry. |

### `GET /v1/members`

Lists your members, newest first, with their request summaries.

**Query parameters**

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `search` | string | | Case-insensitive substring match against `firstName`, `lastName`, or `email`. |
| `status` | string | | `active`, `paused`, or `cancelled`. |
| `page` | integer | `1` | 1-based page number. |
| `limit` | integer | `20` | Page size, 1 to 100. |

Filters are applied before pagination, so `pagination.total` is the number of members that match. A `page` past the last page returns an empty `members` array.

```bash
curl "https://apextelemed.com/api/v1/members?status=active&search=rivera&page=1&limit=20" \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{
  "members": [
    {
      "id": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
      "firstName": "Jordan",
      "lastName": "Rivera",
      "email": "jordan.rivera@example.com",
      "phone": "+1 555 010 2233",
      "dateOfBirth": "1988-04-12",
      "state": "TX",
      "status": "active",
      "address": {
        "street1": "1401 Elm St",
        "street2": "Apt 5B",
        "city": "Dallas",
        "state": "TX",
        "zipCode": "75202"
      },
      "shippingAddress": null,
      "createdAt": "2026-09-01T14:22:07.311Z",
      "updatedAt": "2026-09-01T14:22:07.311Z",
      "requests": [
        {
          "id": "c2f1e7a9-5d3b-4f80-a6e1-9b8c7d6e5f40",
          "drugId": null,
          "prescriptionName": null,
          "dosage": null,
          "status": "approved",
          "caseNotes": "Patient reports no prior GLP-1 use.",
          "createdAt": "2026-09-01T15:02:41.902Z",
          "updatedAt": "2026-09-02T09:18:12.550Z"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": [ ...issues ] }` | Invalid query parameter, for example `limit=500` or an unknown `status`. |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 500 | `{ "error": "Internal Server Error" }` | Unexpected failure. |

### `GET /v1/members/:id`

Returns one member with all of their request summaries.

```bash
curl https://apextelemed.com/api/v1/members/6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90 \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

The member object is returned at the top level, without a `success` wrapper.

```json
{
  "id": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
  "firstName": "Jordan",
  "lastName": "Rivera",
  "email": "jordan.rivera@example.com",
  "phone": "+1 555 010 2233",
  "dateOfBirth": "1988-04-12",
  "state": "TX",
  "status": "active",
  "address": {
    "street1": "1401 Elm St",
    "street2": "Apt 5B",
    "city": "Dallas",
    "state": "TX",
    "zipCode": "75202"
  },
  "shippingAddress": null,
  "createdAt": "2026-09-01T14:22:07.311Z",
  "updatedAt": "2026-09-01T14:22:07.311Z",
  "requests": []
}
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 404 | `{ "error": "Member not found" }` | Unknown ID, or the member belongs to another partner. |
| 500 | `{ "error": "Internal Server Error" }` | Unexpected failure. |

### `PUT /v1/members/:id`

Updates a member. Despite the verb, this is a partial update: only the fields you include are changed, and everything else is left as is.

**Request body**

All fields are optional.

| Field | Type | Description |
| --- | --- | --- |
| `firstName` | string | Non-empty. |
| `lastName` | string | Non-empty. |
| `email` | string | Must be a valid email address. |
| `phone` | string \| null | Send `null` to clear. |
| `dateOfBirth` | string | `YYYY-MM-DD`. |
| `state` | string | Exactly two characters. |
| `address` | object | Replaces the whole home address. See [The address object](#the-address-object). |
| `shippingAddress` | object \| null | Replaces the whole shipping address. Send `null` to clear it and ship to the home address. |
| `status` | string | `active`, `paused`, or `cancelled`. See [Member status](#member-status). |

:::note
The endpoint also accepts `gender`, `preferredPronouns`, `bloodType`, and `deceasedAt` without a validation error, but it does not currently apply them. Do not rely on updating those fields through this API.
:::

```bash
curl -X PUT https://apextelemed.com/api/v1/members/6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90 \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "paused",
    "shippingAddress": {
      "street1": "88 Harbor Way",
      "city": "Galveston",
      "state": "TX",
      "zipCode": "77550"
    }
  }'
```

**Response `200 OK`**

The full member as stored after the update. It does not include `requests`.

```json
{
  "success": true,
  "member": {
    "id": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
    "firstName": "Jordan",
    "lastName": "Rivera",
    "email": "jordan.rivera@example.com",
    "phone": "+1 555 010 2233",
    "dateOfBirth": "1988-04-12",
    "state": "TX",
    "status": "paused",
    "address": {
      "street1": "1401 Elm St",
      "street2": "Apt 5B",
      "city": "Dallas",
      "state": "TX",
      "zipCode": "75202"
    },
    "shippingAddress": {
      "street1": "88 Harbor Way",
      "city": "Galveston",
      "state": "TX",
      "zipCode": "77550"
    },
    "createdAt": "2026-09-01T14:22:07.311Z",
    "updatedAt": "2026-09-03T11:05:33.128Z"
  }
}
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": [ ...issues ] }` | Validation failed. See [Validation errors](#validation-errors). |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 404 | `{ "error": "Member not found" }` | Unknown ID, or the member belongs to another partner. |
| 500 | `{ "error": "Internal Server Error" }` | Unexpected failure. |

**Behaviour notes**

- Changing `status` records an audit event and updates the billable flag. Sending the current status does neither.
- Updating `email` does not affect existing conversations, which cache the member's name and email at the time they were created.
- No webhook is sent for member updates.

### `DELETE /v1/members/:id`

Permanently deletes a member. Only members with no requests can be deleted. If the member has ever had a request, even a cancelled or denied one, set their status to `cancelled` instead.

```bash
curl -X DELETE https://apextelemed.com/api/v1/members/6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90 \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `204 No Content`**

Empty body.

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": "Cannot delete member with existing requests. Consider updating the member instead." }` | The member has one or more requests. |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 404 | `{ "error": "Member not found" }` | Unknown ID, or the member belongs to another partner. |
| 500 | `{ "error": "Internal Server Error" }` | Unexpected failure. |

## Validation errors

When a request body or query string fails validation, the member endpoints respond with `400` and an `error` field that is an **array** of issues rather than a string. Each issue has at least `code`, `path`, and `message`; some checks add fields such as `validation`, `expected`, `received`, or `minimum`.

```json
{
  "error": [
    {
      "code": "invalid_string",
      "validation": "email",
      "message": "Invalid email address",
      "path": ["email"]
    },
    {
      "code": "invalid_string",
      "validation": "regex",
      "message": "Format must be YYYY-MM-DD",
      "path": ["dateOfBirth"]
    },
    {
      "code": "invalid_type",
      "expected": "object",
      "received": "undefined",
      "path": ["address"],
      "message": "Required"
    }
  ]
}
```

`path` is the location of the problem inside the body, so a bad ZIP inside the shipping address comes back as `["shippingAddress", "zipCode"]`. Fix every issue in the array before retrying; the API reports all of them in one response.

:::caution
Other Partner API endpoints return `error` as a plain string. If you have shared error-handling code, check the type of `error` before displaying it.
:::
