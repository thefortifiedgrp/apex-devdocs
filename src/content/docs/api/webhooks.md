---
title: Webhooks
description: Receive signed HTTP notifications from Apex when requests are reviewed, prescriptions ship, prescribers message patients, appointments change, and surveys are completed.
sidebar:
  order: 8
---

Apex sends an HTTP `POST` to a URL you configure whenever something happens that your platform needs to react to. Every event type goes to the same URL, and every delivery is signed so you can verify it came from Apex.

Webhooks are the only server-side signal for several things, including prescriber messages, appointment bookings, and anonymous survey completions. For request status you can always fall back to [`GET /v1/requests/:id`](/api/requests/), which is the source of truth.

## Setup

### Configure your URL

1. Sign in to the Apex partner portal and open **Settings**.
2. Under **Webhook Configuration**, enter your endpoint in **Webhook URL** and click **Save Webhook URL**.

The URL must be absolute and well-formed. Use HTTPS. Clearing the field turns webhooks off; events that occur while no URL is set are dropped, not queued.

### Get your signing secret

The first time a webhook URL is saved on your account, Apex generates a signing secret: 64 hexadecimal characters. It appears on the same Settings panel under **Webhook Secret**, masked by default. Click the eye icon to reveal it and the copy icon to copy it.

The secret is created once and does not change when you change the URL. If you need it rotated or need to supply your own secret, contact Apex support.

:::danger[Keep the secret server-side]
Anyone with the secret can forge events that pass verification. Store it in your secrets manager, never in client code or version control.
:::

## Delivery format

Each delivery is a `POST` with a JSON body.

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Webhook-Timestamp` | Unix time in seconds when the event was signed, as a decimal string. |
| `X-Webhook-Signature` | `sha256=` followed by the hex HMAC. See [Verifying signatures](#verifying-signatures). |
| `User-Agent` | `ApexTelemed-Webhook/1.0` |

The body always contains an `event` string identifying the event type and a `timestamp` in ISO 8601. The remaining fields depend on the event. See [Event reference](#event-reference).

There is no per-delivery ID header and no event ID in the body.

## Verifying signatures

The signature is an HMAC-SHA256 over the string `<timestamp>.<body>`, where `<timestamp>` is the exact value of `X-Webhook-Timestamp` and `<body>` is the exact raw request body. The key is your webhook secret, used as a UTF-8 string. The digest is hex-encoded and prefixed with `sha256=`.

To verify:

1. Read the raw request body as bytes. Do not parse and re-serialise it; any change in whitespace or key order breaks the signature.
2. Compute `HMAC_SHA256(secret, timestamp + "." + rawBody)` and hex-encode it.
3. Compare `"sha256=" + yourDigest` with the `X-Webhook-Signature` header using a constant-time comparison.
4. Reject deliveries whose timestamp is too far from your clock. Five minutes is a reasonable tolerance; retries reuse the original timestamp but arrive within seconds of it.
5. Only then parse the JSON.

### Node.js example

```js
import crypto from 'node:crypto';
import express from 'express';

const app = express();
const SECRET = process.env.APEX_WEBHOOK_SECRET;
const MAX_AGE_SECONDS = 300;

app.post(
  '/webhooks/apex',
  // Capture the raw body; express.json() would re-serialise it.
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req, res) => {
    const timestamp = req.get('X-Webhook-Timestamp') ?? '';
    const signature = req.get('X-Webhook-Signature') ?? '';
    const rawBody = req.body.toString('utf8');

    const expected =
      'sha256=' +
      crypto.createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest('hex');

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).send('invalid signature');
    }

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) {
      return res.status(401).send('stale timestamp');
    }

    const event = JSON.parse(rawBody);

    // Acknowledge first, then do the work.
    res.status(200).end();
    handleApexEvent(event).catch((err) => console.error('apex webhook failed', err));
  },
);

async function handleApexEvent(event) {
  switch (event.event) {
    case 'item.approved':
      // ...
      break;
    case 'message.new':
      // ...
      break;
    default:
      // Unknown events are safe to ignore. New types may be added at any time.
      break;
  }
}
```

If you run behind a framework that parses JSON before your handler runs, configure it to keep the raw body for this route. Most frameworks expose a raw-body option for exactly this purpose.

## Delivery semantics

**Respond with any 2xx status.** The response body is ignored. Return the 2xx as soon as you have durably accepted the event, and process it afterwards; a slow handler risks being retried and delivered twice.

**Failures are retried three times, then dropped.** A non-2xx response or a connection error counts as a failure. Apex makes up to 3 attempts per event, waiting 2 seconds after the first failure and 4 seconds after the second. If the third attempt fails, the event is discarded. There is no dead-letter queue, no automatic replay later, and no partner-facing log of failed deliveries. If your endpoint has been down for longer than the retry window, reconcile by reading requests back through the API.

**No explicit timeout.** Apex does not enforce a short application-level timeout on the request, but you should still respond within a few seconds so retries do not pile up behind slow handlers.

**Ordering is not guaranteed.** Events are dispatched as they happen, each on its own connection, and are not serialised per request or per member. Closely related events such as `item.approved` and `request.all_approved`, or `item.consultation_requested` and `appointment.consultation_requested`, can arrive in either order. Design handlers to be order-independent: treat each event as a hint to re-read the current state of the request rather than as an incremental state transition.

**Duplicates are possible.** A retry after a timeout on your side delivers the same body again with the same timestamp and signature. Some aggregate events can also be sent more than once for the same request (see [`request.all_approved`](#aggregate-request-events)). Because there is no delivery ID, dedupe on a hash of the raw body, or on `event` plus the relevant IDs plus `timestamp`.

**One URL per account.** All event types are sent to the same URL. There is no per-event subscription; ignore what you do not need.

**Test events.** Apex does not currently offer a "send test event" button. To exercise your endpoint, configure a webhook URL on your [sandbox](/getting-started/environments/) account and drive a request through review there, or replay a captured payload against your handler locally. Sandbox and production have separate webhook URLs and secrets.

## Event reference

| Event | Family | Sent when |
| --- | --- | --- |
| `item.approved` | [Request and item](#request-and-item-events) | A prescriber approves a line item. |
| `item.denied` | [Request and item](#request-and-item-events) | A prescriber denies a line item. |
| `item.consultation_requested` | [Request and item](#request-and-item-events) | A prescriber asks the patient to book a consultation before deciding. |
| `item.canceled` | [Request and item](#request-and-item-events) | A line item is withdrawn before reaching the pharmacy, by you or by Apex. |
| `request.all_approved` | [Aggregate](#aggregate-request-events) | Every remaining item on a request is approved. |
| `request.all_denied` | [Aggregate](#aggregate-request-events) | Every remaining item on a request is denied. |
| `request.all_resolved` | [Aggregate](#aggregate-request-events) | Every remaining item is decided, with a mix of approved and denied. |
| `request.all_canceled` | [Aggregate](#aggregate-request-events) | Every item on a request has been cancelled. |
| `request.approved` | [Legacy request-level](#legacy-request-level-events) | Single-prescription review flow: approved. |
| `request.denied` | [Legacy request-level](#legacy-request-level-events) | Single-prescription review flow: denied, or a consultation visit ended with no prescription. |
| `request.consultation_requested` | [Legacy request-level](#legacy-request-level-events) | Single-prescription review flow: consultation requested. |
| `item.shipped` | [Delivery](#delivery-events) | The pharmacy reports the package has left. |
| `delivery.update` | [Delivery](#delivery-events) | Any other pharmacy status update. |
| `message.new` | [Message](#message-events) | A prescriber sends the patient a message. |
| `message.system` | [Message](#message-events) | Apex posts a system message into an existing conversation. |
| `message.handoff` | [Message](#message-events) | A prescriber hands a patient's non-clinical message off to your support team. |
| `appointment.consultation_requested` | [Appointment](#appointment-events) | A booking link has been issued for the patient. |
| `appointment.booked` | [Appointment](#appointment-events) | The patient booked a slot. |
| `appointment.rescheduled` | [Appointment](#appointment-events) | The appointment was moved. |
| `appointment.cancelled` | [Appointment](#appointment-events) | The appointment was cancelled by either side. |
| `appointment.reminder` | [Appointment](#appointment-events) | A scheduled reminder is due. |
| `survey.completed` | [Survey](#survey-events) | A survey was submitted through the embed, hosted page, or a returning-member token. |

Status strings in these payloads are the same vocabulary used by the Requests API. See [Request lifecycle](/api/requests/#request-lifecycle) for what each status means.

### Request and item events

Sent when a prescriber acts on one line item of a request. `itemId` matches `lineItems[].itemId` on the request.

| Field | Type | Description |
| --- | --- | --- |
| `event` | string | `item.approved`, `item.denied`, `item.consultation_requested`, or `item.canceled`. |
| `requestId` | string | Request UUID. |
| `itemId` | string | Line item UUID. |
| `status` | string | New item status: `approved`, `denied`, `call_requested`, or `cancelled`. |
| `patientName` | string | Member's full name. May be an empty string on `item.canceled`. |
| `prescriptionName` | string | Drug display name for approvals, denials, and consultations. On `item.canceled` this is the drug ID, not the display name. `Medication` if no drug could be resolved. |
| `timestamp` | string | ISO 8601. |

```json
{
  "event": "item.approved",
  "requestId": "c2f1e7a9-5d3b-4f80-a6e1-9b8c7d6e5f40",
  "itemId": "5a8b3c1d-2e4f-4a6b-8c9d-0e1f2a3b4c5d",
  "status": "approved",
  "patientName": "Jordan Rivera",
  "prescriptionName": "Semaglutide",
  "timestamp": "2026-09-02T09:31:02.118Z"
}
```

Notes:

- Note the spelling: the event is `item.canceled` with one `l`, while the `status` value is `cancelled` with two.
- `item.approved` fires when the prescriber approves, regardless of whether the prescription has been sent to the pharmacy yet. For the "sent to pharmacy" moment, read `pharmacySent` and `pharmacySentAt` on the request.
- `item.consultation_requested` is always accompanied by an `appointment.consultation_requested` event carrying the booking link. Use the appointment event to email the patient.
- `item.canceled` fires for cancellations you make through [`POST /v1/requests/:id/cancel`](/api/requests/) as well as cancellations made by Apex.

### Aggregate request events

After every item-level event, Apex checks whether the whole request is now decided and, if so, sends one aggregate event. Cancelled items are ignored in this check: a request with one cancelled and one approved item reports `request.all_approved`.

| Field | Type | Description |
| --- | --- | --- |
| `event` | string | `request.all_approved`, `request.all_denied`, `request.all_resolved`, or `request.all_canceled`. |
| `requestId` | string | Request UUID. |
| `status` | string | `all_approved`, `all_denied`, `partial`, or `all_canceled` respectively. |
| `patientName` | string | Member's full name. |
| `prescriptionName` | string | Comma-separated drug IDs of the non-cancelled items. Empty for `request.all_canceled`. |
| `timestamp` | string | ISO 8601. |

There is no `itemId`.

```json
{
  "event": "request.all_resolved",
  "requestId": "c2f1e7a9-5d3b-4f80-a6e1-9b8c7d6e5f40",
  "status": "partial",
  "patientName": "Jordan Rivera",
  "prescriptionName": "semaglutide-inj, tirzepatide-inj",
  "timestamp": "2026-09-02T09:31:02.402Z"
}
```

Because the check runs after every item event, an aggregate event can be sent more than once for the same request. For example, if both items on a request are approved and one is later cancelled, `request.all_approved` is sent again for the remaining item. Treat aggregates as idempotent.

Requests with no line items (very old single-prescription requests) never produce aggregate events.

### Legacy request-level events

An older review flow decides a whole single-prescription request in one step. It emits request-level events with the same shape as item events but without `itemId`.

| Event | `status` | Sent when |
| --- | --- | --- |
| `request.approved` | `approved` | The request was approved through the single-prescription flow. |
| `request.denied` | `denied` | The request was denied through the single-prescription flow, **or** a consultation visit ended with no prescription issued. |
| `request.consultation_requested` | `call_requested` | A consultation was requested through the single-prescription flow. |

```json
{
  "event": "request.denied",
  "requestId": "c2f1e7a9-5d3b-4f80-a6e1-9b8c7d6e5f40",
  "status": "denied",
  "patientName": "Jordan Rivera",
  "prescriptionName": "Semaglutide",
  "timestamp": "2026-09-02T09:31:02.118Z"
}
```

You cannot control which flow a prescriber uses, so handle both families. A robust approach is to treat any request or item event as a trigger to re-read the request and act on its current line-item statuses. The `request.denied` sent after a no-prescription visit is worth handling explicitly: it is the only webhook that tells you a consultation concluded without a prescription.

### Delivery events

Sent when the pharmacy reports a fulfilment status for a prescription.

| Field | Type | Description |
| --- | --- | --- |
| `event` | string | `item.shipped` or `delivery.update`. |
| `requestId` | string | Request UUID. |
| `memberId` | string | Member UUID. Omitted if the request has no member. |
| `itemId` | string | Line item UUID. Omitted for requests without line items. |
| `status` | string | The pharmacy's own status label, passed through as received. |
| `trackingNumber` | string | Carrier tracking number, when the pharmacy has provided one. Omitted otherwise. |
| `shipCarrier` | string | Carrier name, when provided. Omitted otherwise. |
| `daysSupply` | integer | Days' supply of the shipped fill, from the prescription. Omitted when the item has no prescription record. Use it to schedule the next refill check-in. |
| `timestamp` | string | ISO 8601. |

```json
{
  "event": "item.shipped",
  "requestId": "c2f1e7a9-5d3b-4f80-a6e1-9b8c7d6e5f40",
  "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
  "itemId": "5a8b3c1d-2e4f-4a6b-8c9d-0e1f2a3b4c5d",
  "status": "Rx Shipping Pickup",
  "trackingNumber": "9400111899223197428490",
  "shipCarrier": "USPS",
  "daysSupply": 30,
  "timestamp": "2026-09-04T16:12:48.930Z"
}
```

`item.shipped` is sent once, when a fill first reaches a shipped state at the pharmacy. Every other pharmacy update, before or after shipping, arrives as `delivery.update`. Because `status` is pharmacy-specific free text (examples seen in practice include `received`, `processing`, `label created`, `in transit`, `delivered`, `returned`, and `Rx Shipping Pickup`), branch on the event name and use `status` for display only.

Delivery events are best-effort. The request's `lineItems[].deliveryStatus`, `trackingNumber`, and `shipCarrier` fields carry the same information and are the reliable place to read it back.

### Message events

`message.new` and `message.system` are sent so that you can notify the patient in your own branding. Apex does not email patients directly. `message.handoff` is different: it passes a patient's message to your support team and has [its own payload](#messagehandoff). See [Messaging](/api/messaging/) for the conversation model.

| Field | Type | Description |
| --- | --- | --- |
| `event` | string | `message.new` or `message.system`. |
| `memberId` | string | Member UUID. |
| `prescriberName` | string | Prescriber's display name. Present on `message.new` only. |
| `messagePreview` | string | The full plain-text message. Despite the name it is not truncated. |
| `messageHtml` | string | Rich HTML version of the message, suitable for an email body. Present only on templated prescriber messages such as consultation invites and custom patient notifications. |
| `subject` | string | Suggested email subject. Present alongside `messageHtml`. |
| `conversationId` | string | Conversation UUID. Link the patient to this thread. |
| `timestamp` | string | ISO 8601. |

#### `message.new`

A prescriber sent the patient a text message from the provider portal, or Apex sent a templated message on the prescriber's behalf (booking invitations, resent booking emails, custom notifications). Prescriber attachments do not trigger this event.

```json
{
  "event": "message.new",
  "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
  "prescriberName": "Dr. Priya Natarajan",
  "messagePreview": "Start with one injection per week. Let me know if you have nausea.",
  "conversationId": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
  "timestamp": "2026-09-02T09:45:30.404Z"
}
```

When `messageHtml` is present, send it as the email body and use `subject` as the subject. Otherwise compose your own email around `messagePreview`.

#### `message.system`

Apex posted an automated status message into an existing conversation: the prescription was approved, was not approved, a consultation was requested, or a visit completed without a prescription. This event is only sent when a conversation between the member and the acting prescriber already exists; if the patient never opened a thread, no system message is created and no webhook is sent.

```json
{
  "event": "message.system",
  "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
  "messagePreview": "Your prescription for Semaglutide 0.25 mg has been approved.",
  "conversationId": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
  "timestamp": "2026-09-02T09:31:02.118Z"
}
```

The system message Apex posts when a prescriber hands a message off to your support team does not send this event. You receive `message.handoff` instead.

#### `message.handoff`

A prescriber decided that a patient's message is not a clinical question (a billing or order query, for example) and handed it off to your support team from the provider portal. This is a routing instruction, not a notification to forward to the patient: put the message in your support queue and reply to the patient through your own support channel.

When a message is handed off, Apex also:

- Sets `handoffCategory` on the original message, readable from [`GET /v1/messages/conversations/:id/messages`](/api/messaging/#get-v1messagesconversationsidmessages).
- Posts a system message into the conversation that tells the patient `Forwarded to <your account name> support — they'll reply in your Support conversation.` It increments `unreadByMember` like any system message.

| Field | Type | Description |
| --- | --- | --- |
| `event` | string | `message.handoff`. |
| `memberId` | string | Member UUID. |
| `conversationId` | string | Conversation the message was handed off from. |
| `messageId` | string | The original patient message. Matches its `id` in the conversation's messages. |
| `text` | string | The original message text, verbatim. For an attachment, the file name; read the message back through the API for `attachmentUrl`. |
| `category` | string | `billing`, `orders`, `account`, `technical`, or `other`, chosen by the prescriber. |
| `prescriberName` | string | Display name of the prescriber who handed the message off. Omitted if unknown. |
| `note` | string | Note from the prescriber to your support team, up to 500 characters. Omitted when the prescriber left none. |
| `timestamp` | string | ISO 8601. |

There is no `messagePreview`, `messageHtml`, or `subject` on this event.

```json
{
  "event": "message.handoff",
  "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
  "conversationId": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
  "messageId": "3c2b1a0f-9e8d-4c7b-a6f5-4e3d2c1b0a95",
  "text": "I was charged twice for my last order. Can someone look into it?",
  "category": "billing",
  "prescriberName": "Dr. Priya Natarajan",
  "note": "Duplicate charge on the September refill.",
  "timestamp": "2026-09-03T15:12:09.481Z"
}
```

Apex does not prevent the same message from being handed off more than once. Treat `messageId` as the key when you create a support ticket so a repeat does not open a second one.

### Appointment events

Sent for consultation scheduling, again so you can email the patient. Appointments are hosted by Apex; the patient books and joins through Apex-hosted pages.

| Field | Type | Description |
| --- | --- | --- |
| `event` | string | One of the five appointment events below. |
| `requestId` | string | Request UUID. |
| `memberId` | string | Member UUID. Omitted if the request has no member. |
| `appointmentId` | string | Appointment UUID. Absent on `appointment.consultation_requested`, which precedes booking. |
| `patientName` | string | Patient's full name. |
| `patientEmail` | string | Patient's email. |
| `prescriberName` | string | Prescriber's display name. |
| `startTime` | string | ISO 8601 start. On booked, rescheduled, and reminder. |
| `endTime` | string | ISO 8601 end. On booked, rescheduled, and reminder. |
| `timezone` | string | IANA time zone the patient booked in. On booked, rescheduled, and reminder. |
| `durationMinutes` | integer | Slot length. On booked and rescheduled. |
| `cancelledBy` | string | `patient` or `prescriber`. On cancelled only. |
| `cancellationReason` | string | Free text. On cancelled, when a reason was given. |
| `bookingUrl` | string | Apex-hosted booking page for the patient. On consultation_requested only. |
| `bookingExpiresAt` | string | ISO 8601 expiry of the booking link. On consultation_requested only. |
| `timestamp` | string | ISO 8601. |

Fields that do not apply to an event are omitted, not null.

#### `appointment.consultation_requested`

The prescriber needs to speak with the patient before deciding. Email the patient the `bookingUrl` before `bookingExpiresAt`. This event is sent together with `item.consultation_requested`.

```json
{
  "event": "appointment.consultation_requested",
  "requestId": "c2f1e7a9-5d3b-4f80-a6e1-9b8c7d6e5f40",
  "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
  "patientName": "Jordan Rivera",
  "patientEmail": "jordan.rivera@example.com",
  "prescriberName": "Dr. Priya Natarajan",
  "bookingUrl": "https://apextelemed.com/book/4f1e9c7a2b8d6e0f3a5c7b9d1e2f4a6c8b0d2e4f6a8c0b1d3e5f7a9c1b3d5e7f",
  "bookingExpiresAt": "2026-09-09T09:31:02.118Z",
  "timestamp": "2026-09-02T09:31:02.118Z"
}
```

#### `appointment.booked`

```json
{
  "event": "appointment.booked",
  "requestId": "c2f1e7a9-5d3b-4f80-a6e1-9b8c7d6e5f40",
  "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
  "appointmentId": "d7e6f5a4-b3c2-4d1e-9f0a-8b7c6d5e4f31",
  "patientName": "Jordan Rivera",
  "patientEmail": "jordan.rivera@example.com",
  "prescriberName": "Dr. Priya Natarajan",
  "startTime": "2026-09-05T15:00:00.000Z",
  "endTime": "2026-09-05T15:15:00.000Z",
  "timezone": "America/Chicago",
  "durationMinutes": 15,
  "timestamp": "2026-09-02T14:08:21.774Z"
}
```

#### `appointment.rescheduled`

Same fields as `appointment.booked`, with the new times. `appointmentId` is unchanged.

#### `appointment.cancelled`

```json
{
  "event": "appointment.cancelled",
  "requestId": "c2f1e7a9-5d3b-4f80-a6e1-9b8c7d6e5f40",
  "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
  "appointmentId": "d7e6f5a4-b3c2-4d1e-9f0a-8b7c6d5e4f31",
  "patientName": "Jordan Rivera",
  "patientEmail": "jordan.rivera@example.com",
  "prescriberName": "Dr. Priya Natarajan",
  "cancelledBy": "patient",
  "cancellationReason": "Schedule conflict",
  "timestamp": "2026-09-03T08:02:11.310Z"
}
```

After a cancellation the request item remains pending and the prescriber can issue a new booking link, which arrives as another `appointment.consultation_requested`.

#### `appointment.reminder`

Sent ahead of the appointment according to the prescriber's reminder settings. The default schedule includes a reminder 24 hours before the start time. Carries `startTime`, `endTime`, and `timezone` but not `durationMinutes`.

### Survey events

#### `survey.completed`

Sent when a patient submits a survey through the embed, the Apex-hosted survey page, or a returning-member token. This is the only server-side signal for anonymous submissions, which are otherwise invisible to you until the patient signs up and a request is created. Use it for abandoned-checkout follow-up. See [Survey v2 server API](/api/survey-v2-server/) and [Survey v2 embed](/api/survey-v2-embed/).

| Field | Type | Description |
| --- | --- | --- |
| `event` | string | `survey.completed`. |
| `responseId` | string | Survey response UUID. Pass it as `v2SurveyResponseId` when creating the request. |
| `mode` | string | `initial` or `refill`. |
| `qualified` | boolean | Whether the patient qualified for at least one of the surveyed drugs. Per-drug reasons are not included. |
| `drugIds` | string[] | The drugs the survey covered. |
| `selectedDrugId` | string \| null | Always `null` at present. |
| `memberId` | string \| null | Set for returning-member token submissions. `null` for anonymous embed and hosted submissions. |
| `patientName` | string | From the survey's contact section. Omitted if not collected. |
| `patientEmail` | string | From the survey's contact section. Omitted if not collected. |
| `timestamp` | string | ISO 8601. |

```json
{
  "event": "survey.completed",
  "responseId": "b4c3d2e1-f0a9-4b8c-9d7e-6f5a4b3c2d10",
  "mode": "initial",
  "qualified": true,
  "drugIds": ["semaglutide-inj"],
  "selectedDrugId": null,
  "memberId": null,
  "patientName": "Jordan Rivera",
  "patientEmail": "jordan.rivera@example.com",
  "timestamp": "2026-09-01T13:57:40.226Z"
}
```

## Handling checklist

- Verify the signature on the raw body before doing anything else.
- Return 2xx quickly; queue the work.
- Dedupe on the body hash or on `event` plus IDs plus `timestamp`.
- Never assume order. Re-read the request or conversation from the API when you need current state.
- Ignore unknown `event` values rather than failing; new events are added without notice.
- Log the `X-Webhook-Timestamp` and `event` of every delivery you accept. With no delivery IDs, that pair plus the request or conversation ID is how you and Apex support will correlate an event later.
