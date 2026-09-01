---
title: Choosing an integration
description: Compare the Partner API, the survey helper, and the partner SDK, and see how they fit together.
sidebar:
  order: 2
---

Apex offers three integration surfaces. They are not competing options. Each one covers a different layer of the patient journey, and most partners use two of them together.

## At a glance

| | Partner API | Survey helper | Partner SDK (partner-core) |
| --- | --- | --- | --- |
| Runs | On your server | In the patient's browser (or proxied through your server) | In the patient's browser |
| Language | Any, over HTTPS | TypeScript: React, Solid, or framework-free | TypeScript, SolidJS |
| Credential | API key | Publishable key (or API key when proxied) | Tenant key plus publishable key |
| You own | Everything: UI, data, flow | The survey UI and page around it | Branding and primitives; Apex owns the flows |
| Apex owns | Provider review, pharmacy, billing | The questions, qualification logic, and drug results | Signup, checkout, subscriptions, dashboard, messaging logic |
| Typical team | Backend engineers with an existing platform | Frontend engineers adding the survey to a site | A team building a new patient portal quickly |

## Partner API

Use the [Partner API](/api/) when you already have a platform that manages patients and orders. You create [members](/api/members/) and [requests](/api/requests/) from your backend, look up [drugs](/api/drugs/), receive [webhooks](/api/webhooks/) as providers act, and reconcile [billing](/api/billing/). Nothing Apex-specific runs in your frontend.

You can also drive the qualification survey entirely from your server with the [server-side survey v2 API](/api/survey-v2-server/), which is useful for native apps or for keeping every key off the client.

## Survey helper

Use the [survey helper](/survey-helper/) when you want the Apex qualification survey on your own pages, in your own design. The headless core owns the question flow, visibility rules, draft persistence, and qualification calls. The React and Solid adapters give you a hook that exposes the current phase and the actions that move it forward. You render the questions however you like.

The survey helper talks to the [embed API](/api/survey-v2-embed/) directly from the browser using a publishable key, or through your backend using an API key. See [Authentication and modes](/survey-helper/auth-and-modes/).

A completed survey produces a survey response and a set of qualified drugs. From there you either let the patient continue on your site or create a request through the Partner API.

## Partner SDK (partner-core)

Use the [partner SDK](/partner-sdk/) when you are building a new patient-facing site and want the whole funnel without writing it yourself. It ships an API client, persistent stores, headless flow hooks for every page, and optional themed pages that render through a small set of UI primitives you provide. It includes the survey helper.

The SDK talks to a per-partner tenant on the Apex partner backend rather than to the Partner API directly, so it needs a tenant key in addition to the publishable key. Apex sets up the tenant during onboarding.

## Combining them

- **API plus survey helper** is the most common pairing: the survey runs in the browser, and your backend creates the request and handles webhooks.
- **API plus server-side survey** keeps every credential on the server and works for native apps.
- **Partner SDK alone** covers a complete portal. You can still call the Partner API from your backend for reporting or back-office tooling.

If you are unsure, start with the Partner API. Every other surface builds on the same members, requests, and webhooks.
