---
title: Overview
description: What the Apex Telemed platform does, the three ways to integrate with it, and what you need before you start.
sidebar:
  order: 1
---

Apex Telemed is a B2B telemedicine platform. You bring the patients and the storefront. Apex brings licensed providers, the medical qualification surveys, and pharmacy fulfilment.

A typical integration moves a patient through these steps:

1. The patient completes an Apex qualification survey, either embedded on your site or driven from your backend.
2. Your system creates a **member** (the patient) and a **prescription request** for one or more drugs.
3. An Apex provider reviews the request and approves it, denies it, or asks for a call.
4. Approved items are sent to a pharmacy. Apex notifies you by **webhook** at each step, and the request is billed to your partner account.

## Three ways to integrate

| Surface | What it is | Best for |
| --- | --- | --- |
| [Partner API](/api/) | A server-to-server REST API: members, requests, drugs, surveys, billing, messaging, and webhooks. | Teams with an existing platform who want full control over the patient experience. |
| [Survey helper](/survey-helper/) | npm packages that render the Apex qualification survey inside your own site. A headless core plus React and Solid adapters. | Any site that wants the survey on its own pages, in its own design. |
| [Partner SDK (partner-core)](/partner-sdk/) | A SolidJS library with an API client, stores, headless flows, and themed pages for a complete patient portal: signup, survey, checkout, subscriptions, dashboard, and messaging. | Teams building a new patient-facing site from scratch. |

The surfaces combine. Most integrations use the Partner API on the server and the survey helper in the browser. The partner SDK includes the survey helper. See [Choosing an integration](/getting-started/choosing-an-integration/) for a fuller comparison.

## What you need from Apex

- **A partner account** and access to the partner portal. The portal is where you reveal or rotate your API key, set your webhook URL, and review requests, members, and billing.
- **Sandbox credentials.** Sandbox and production are separate environments with separate keys. Apex provisions a sandbox partner during onboarding. See [Environments](/getting-started/environments/).
- **A publishable key and allow-listed origins** if you embed the survey in the browser. Apex configures both for you.
- **A tenant and tenant key** if you build a site on the partner SDK.

[Authentication](/getting-started/authentication/) explains each credential, where it is used, and how to keep it safe.

## Your first API call

Confirm your API key works by listing the drugs available to your partner account. Replace the key with the one shown in the partner portal under Settings.

```bash
curl https://apextelemed-dev.web.app/api/v1/drugs \
  -H "x-api-key: apx_0123456789abcdef0123456789abcdef"
```

A `200` response with a list of drugs means you are ready to [create a member and submit a request](/api/requests/).

## Next steps

- Read the [Partner API overview](/api/) for conventions, error handling, and the full endpoint list.
- Follow the [survey helper getting started guide](/survey-helper/) to render the survey on your site.
- Set up [webhooks](/api/webhooks/) so your system learns about request decisions without polling.
