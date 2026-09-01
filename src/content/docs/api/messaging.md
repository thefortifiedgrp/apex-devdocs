---
title: Messaging
description: Let your patients exchange secure messages and attachments with the Apex prescriber reviewing their request.
sidebar:
  order: 7
---

The messaging API lets you build a patient inbox into your own product. You call it on behalf of a member; the other side of every conversation is an Apex prescriber working in the Apex provider portal.

All endpoints on this page are mounted under `https://apextelemed.com/api/v1/messages` and require your API key in the `x-api-key` header. See [Authentication](/getting-started/authentication/).

## How messaging works

**A conversation is a thread between one member and one prescriber.** It is identified by that pair, not by a request. Creating a conversation for a pair that already has one returns the existing thread, so you can call the create endpoint whenever the patient opens their inbox without worrying about duplicates.

**You send as the patient.** Every message you post through this API is stored with `senderRole: "patient"` and the member's name. The prescriber receives an email notification and replies from the provider portal. Their replies appear with `senderRole: "prescriber"`.

**Apex also posts system messages.** When a prescriber approves, denies, or requests a consultation for a request, or completes a visit without prescribing, Apex adds a short `senderRole: "system"` message to the conversation between that member and that prescriber. System messages are only added if the conversation already exists.

**Getting the prescriber's ID.** The prescriber is whoever acted on the member's request. Read `lineItems[].prescriberId` from [`GET /v1/requests/:id`](/api/requests/). It is `null` until a prescriber has acted on the item, so you cannot open a conversation for a request that nobody has reviewed yet.

**Knowing when the prescriber replies.** Apex sends a [`message.new`](/api/webhooks/#messagenew) webhook whenever a prescriber sends a message, and a [`message.system`](/api/webhooks/#messagesystem) webhook for system messages. Use these to email the patient with your own branding. Apex does not email patients directly.

**Polling.** There is no push channel to your patient UI. While the patient has their inbox open, poll [`GET /v1/messages/unread-count`](#get-v1messagesunread-count) for the badge and [`GET /v1/messages/conversations`](#get-v1messagesconversations) for the thread list. A poll interval of 30 to 60 seconds is appropriate; use the webhooks, not polling, to trigger notifications.

**IDs.** Conversation IDs, message IDs, member IDs, and prescriber IDs are all UUID strings.

## Objects

### Conversation

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Conversation UUID. |
| `memberId` | string | Your member. |
| `memberName` | string | Member's name, cached when the conversation was created. |
| `memberEmail` | string | Member's email, cached when the conversation was created. |
| `prescriberId` | string | The Apex prescriber. |
| `prescriberName` | string | Prescriber's display name. |
| `partnerId` | string | Your partner account ID. |
| `lastMessageAt` | string | ISO 8601 timestamp of the most recent message. Equals `createdAt` until the first message. |
| `lastMessagePreview` | string | First 80 characters of the last message, or the attachment name. Empty on a new conversation. |
| `lastMessageSenderId` | string | `senderId` of the last message. Empty on a new conversation. |
| `unreadByMember` | integer | Messages the patient has not read. Reset by the mark-read endpoint. |
| `unreadByPrescriber` | integer | Messages the prescriber has not read. |
| `createdAt` | string | ISO 8601 timestamp. |
| `updatedAt` | string | ISO 8601 timestamp. |

### Message

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Message UUID. |
| `conversationId` | string | Parent conversation. |
| `senderId` | string | The member ID for patient messages, the prescriber ID for prescriber messages, or the literal string `system`. |
| `senderRole` | string | `patient`, `prescriber`, or `system`. |
| `senderName` | string | Display name at the time of sending. |
| `type` | string | `text`, `attachment`, `system`, or `html`. |
| `text` | string | Plain-text body. For attachments, the original file name. For `html` messages, a plain-text rendering of the HTML. |
| `html` | string \| null | Present on `html` messages only. Prescriber-sent templated messages such as consultation invites use this type. Render it if you can, otherwise fall back to `text`. |
| `attachmentUrl` | string \| null | Download URL. See [Attachments](#attachments). |
| `attachmentName` | string \| null | Original file name. |
| `attachmentType` | string \| null | MIME type. |
| `attachmentSize` | integer \| null | Size in bytes. |
| `createdAt` | string | ISO 8601 timestamp. |

Fields that do not apply to a message are `null` when read back and omitted from the response to the call that created the message.

## Endpoints

### `POST /v1/messages/conversations`

Finds or creates the conversation between a member and a prescriber.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `memberId` | string | Yes | One of your members. |
| `prescriberId` | string | Yes | Taken from `lineItems[].prescriberId` on the member's request. |

```bash
curl -X POST https://apextelemed.com/api/v1/messages/conversations \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
    "prescriberId": "a1c4e8b2-7d6f-4e3a-9b0c-2f5d8e1a7c44"
  }'
```

**Response**

`201 Created` when a new conversation was created, `200 OK` when an existing one was returned. The body is the same shape in both cases.

```json
{
  "conversation": {
    "id": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
    "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
    "memberName": "Jordan Rivera",
    "memberEmail": "jordan.rivera@example.com",
    "prescriberId": "a1c4e8b2-7d6f-4e3a-9b0c-2f5d8e1a7c44",
    "prescriberName": "Dr. Priya Natarajan",
    "partnerId": "0b7c4d21-9e3f-4a6b-8d15-2c4e6f8a0b13",
    "lastMessageAt": "2026-09-02T09:20:14.007Z",
    "lastMessagePreview": "",
    "lastMessageSenderId": "",
    "unreadByMember": 0,
    "unreadByPrescriber": 0,
    "createdAt": "2026-09-02T09:20:14.007Z",
    "updatedAt": "2026-09-02T09:20:14.007Z"
  }
}
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": "memberId is required" }` | Missing or empty `memberId`. The message names whichever field failed first. |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 403 | `{ "error": "Member does not belong to this partner" }` | The member exists but is not yours. |
| 404 | `{ "error": "Member not found" }` | Unknown `memberId`. |
| 500 | `{ "error": "Prescriber not found" }` | Unknown `prescriberId`. |

### `GET /v1/messages/conversations`

Lists a member's conversations, most recently active first.

**Query parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `memberId` | string | Yes | One of your members. |

```bash
curl "https://apextelemed.com/api/v1/messages/conversations?memberId=6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90" \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{
  "conversations": [
    {
      "id": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
      "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
      "memberName": "Jordan Rivera",
      "memberEmail": "jordan.rivera@example.com",
      "prescriberId": "a1c4e8b2-7d6f-4e3a-9b0c-2f5d8e1a7c44",
      "prescriberName": "Dr. Priya Natarajan",
      "partnerId": "0b7c4d21-9e3f-4a6b-8d15-2c4e6f8a0b13",
      "lastMessageAt": "2026-09-02T10:41:55.612Z",
      "lastMessagePreview": "Thanks, I will start on Monday.",
      "lastMessageSenderId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
      "unreadByMember": 0,
      "unreadByPrescriber": 1,
      "createdAt": "2026-09-02T09:20:14.007Z",
      "updatedAt": "2026-09-02T10:41:55.612Z"
    }
  ]
}
```

The list is not paginated. A member typically has one conversation per prescriber they have worked with.

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": "memberId query parameter is required" }` | Missing `memberId`. |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 403 | `{ "error": "Member does not belong to this partner" }` | The member is not yours, or does not exist. |

### `GET /v1/messages/conversations/:id`

Returns one conversation.

```bash
curl https://apextelemed.com/api/v1/messages/conversations/9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55 \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{
  "conversation": {
    "id": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
    "memberId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
    "memberName": "Jordan Rivera",
    "memberEmail": "jordan.rivera@example.com",
    "prescriberId": "a1c4e8b2-7d6f-4e3a-9b0c-2f5d8e1a7c44",
    "prescriberName": "Dr. Priya Natarajan",
    "partnerId": "0b7c4d21-9e3f-4a6b-8d15-2c4e6f8a0b13",
    "lastMessageAt": "2026-09-02T10:41:55.612Z",
    "lastMessagePreview": "Thanks, I will start on Monday.",
    "lastMessageSenderId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
    "unreadByMember": 0,
    "unreadByPrescriber": 1,
    "createdAt": "2026-09-02T09:20:14.007Z",
    "updatedAt": "2026-09-02T10:41:55.612Z"
  }
}
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 403 | `{ "error": "Conversation does not belong to this partner" }` | The conversation exists but is not yours. |
| 404 | `{ "error": "Conversation not found" }` | Unknown ID. |

### `GET /v1/messages/conversations/:id/messages`

Lists the messages in a conversation in chronological order, oldest first.

**Query parameters**

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `limit` | integer | `50` | Maximum messages to return, 1 to 100. |
| `cursor` | string | | Accepted for forward compatibility. See the caution below. |

:::caution[Cursor pagination is not yet implemented]
The endpoint returns the first `limit` messages of the conversation, oldest first. When the conversation has more messages than `limit`, the response includes a non-null `nextCursor`, but sending it back as `cursor` currently returns the same first page. Request `limit=100` to read as much of a thread as possible in one call. This page will be updated when cursor paging is supported.
:::

```bash
curl "https://apextelemed.com/api/v1/messages/conversations/9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55/messages?limit=100" \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{
  "messages": [
    {
      "id": "f4a2c6e8-1b3d-4f5a-8c7e-9d0b1a2c3e61",
      "conversationId": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
      "senderId": "system",
      "senderRole": "system",
      "senderName": "System",
      "type": "system",
      "text": "Your prescription for Semaglutide 0.25 mg has been approved.",
      "html": null,
      "attachmentUrl": null,
      "attachmentName": null,
      "attachmentType": null,
      "attachmentSize": null,
      "createdAt": "2026-09-02T09:31:02.118Z"
    },
    {
      "id": "0c9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e72",
      "conversationId": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
      "senderId": "a1c4e8b2-7d6f-4e3a-9b0c-2f5d8e1a7c44",
      "senderRole": "prescriber",
      "senderName": "Dr. Priya Natarajan",
      "type": "text",
      "text": "Start with one injection per week. Let me know if you have nausea.",
      "html": null,
      "attachmentUrl": null,
      "attachmentName": null,
      "attachmentType": null,
      "attachmentSize": null,
      "createdAt": "2026-09-02T09:45:30.404Z"
    },
    {
      "id": "7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c83",
      "conversationId": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
      "senderId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
      "senderRole": "patient",
      "senderName": "Jordan Rivera",
      "type": "text",
      "text": "Thanks, I will start on Monday.",
      "html": null,
      "attachmentUrl": null,
      "attachmentName": null,
      "attachmentType": null,
      "attachmentSize": null,
      "createdAt": "2026-09-02T10:41:55.612Z"
    }
  ],
  "nextCursor": null
}
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": "..." }` | `limit` outside 1 to 100. |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 403 | `{ "error": "Conversation does not belong to this partner" }` | Not your conversation. |
| 404 | `{ "error": "Conversation not found" }` | Unknown ID. |

### `POST /v1/messages/conversations/:id/messages`

Sends a text message as the patient.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `text` | string | Yes | 1 to 5000 characters. Plain text; HTML is not interpreted. |

```bash
curl -X POST https://apextelemed.com/api/v1/messages/conversations/9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55/messages \
  -H "x-api-key: $APEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "text": "Thanks, I will start on Monday." }'
```

**Response `201 Created`**

```json
{
  "message": {
    "id": "7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c83",
    "conversationId": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
    "senderId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
    "senderRole": "patient",
    "senderName": "Jordan Rivera",
    "type": "text",
    "text": "Thanks, I will start on Monday.",
    "createdAt": "2026-09-02T10:41:55.612Z"
  }
}
```

**Side effects**

- The conversation's `lastMessageAt`, `lastMessagePreview`, and `lastMessageSenderId` are updated and `unreadByPrescriber` is incremented.
- The prescriber is emailed a notification containing the message text.
- No webhook is sent to you for messages you send.

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": "Message text is required" }` | Empty `text`. |
| 400 | `{ "error": "Message too long" }` | More than 5000 characters. |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 403 | `{ "error": "Conversation does not belong to this partner" }` | Not your conversation. |
| 404 | `{ "error": "Conversation not found" }` | Unknown ID. |

### `POST /v1/messages/conversations/:id/read`

Marks the conversation as read by the patient. Sets `unreadByMember` to `0`. Call it when the patient opens the thread.

```bash
curl -X POST https://apextelemed.com/api/v1/messages/conversations/9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55/read \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{ "success": true }
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 403 | `{ "error": "Conversation does not belong to this partner" }` | Not your conversation. |
| 404 | `{ "error": "Conversation not found" }` | Unknown ID. |

### `POST /v1/messages/conversations/:id/attachments`

Uploads a file as the patient and posts it to the conversation as an `attachment` message.

**Request**

`multipart/form-data` with a single part named `file`. Do not set `Content-Type` yourself; let your HTTP client set the multipart boundary.

| Constraint | Value |
| --- | --- |
| Maximum size | 10 MB (10,485,760 bytes) |
| Accepted types | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain` |

The MIME type is taken from the `Content-Type` of the multipart part, so make sure your client sends the correct one for the file.

```bash
curl -X POST https://apextelemed.com/api/v1/messages/conversations/9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55/attachments \
  -H "x-api-key: $APEX_API_KEY" \
  -F "file=@/path/to/lab-results.pdf;type=application/pdf"
```

**Response `201 Created`**

```json
{
  "message": {
    "id": "2d1c0b9a-8f7e-4d6c-b5a4-3c2b1a0f9e94",
    "conversationId": "9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55",
    "senderId": "6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90",
    "senderRole": "patient",
    "senderName": "Jordan Rivera",
    "type": "attachment",
    "text": "lab-results.pdf",
    "attachmentUrl": "https://storage.example.com/message-attachments/messages/9e2b7c41-3f5a-4d8e-b6c0-7a1f2e3d4c55/1756808515612_lab-results.pdf",
    "attachmentName": "lab-results.pdf",
    "attachmentType": "application/pdf",
    "attachmentSize": 184322,
    "createdAt": "2026-09-02T11:01:55.612Z"
  }
}
```

The exact host in `attachmentUrl` varies. Always use the URL as returned rather than constructing it.

**Side effects**

- Same conversation updates as a text message. The preview becomes `📎 lab-results.pdf`.
- The prescriber is **not** emailed for attachments.

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": "No file uploaded" }` | No `file` part in the request. |
| 400 | `{ "error": "File type image/svg+xml not allowed" }` | MIME type not in the accepted list. The message names the type you sent. |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |
| 403 | `{ "error": "Conversation does not belong to this partner" }` | Not your conversation. |
| 404 | `{ "error": "Conversation not found" }` | Unknown ID. |
| 500 | non-JSON body | The file is larger than 10 MB. The upload layer rejects it before the JSON error handler runs. Check the size client-side before uploading. |

### `GET /v1/messages/unread-count`

Returns the total number of messages the patient has not read across all of their conversations. Use it for an inbox badge.

**Query parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `memberId` | string | Yes | The member. |

```bash
curl "https://apextelemed.com/api/v1/messages/unread-count?memberId=6d3a9f2e-4b1c-4e7a-9c2d-1f8e5a7b3c90" \
  -H "x-api-key: $APEX_API_KEY"
```

**Response `200 OK`**

```json
{ "unreadCount": 2 }
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": "memberId query parameter is required" }` | Missing `memberId`. |
| 401 | `{ "error": "API Key missing" }` or `{ "error": "Invalid API Key" }` | Authentication failed. |

## Attachments

Attachment files are stored by Apex and served from the URL in `attachmentUrl`. Two things to know:

- **The URL is not authenticated.** Anyone who has the link can download the file. Do not expose attachment URLs to anyone other than the patient and their care team, and do not log them.
- **The URL contains the original file name.** Sanitise file names on your side if patients might upload files whose names reveal sensitive information.

Prescribers can also send attachments from the provider portal. They arrive as `attachment` messages with `senderRole: "prescriber"` and trigger no webhook, so a patient inbox that relies solely on `message.new` webhooks to refresh will miss them until the next poll.

## Unread counts

`unreadByMember` on a conversation, and the `unread-count` total, count messages the patient has not seen. They increase when a prescriber sends a text message or attachment, and when Apex posts a system message. They are reset to zero only by the mark-read endpoint, so call it every time the patient views a thread.
