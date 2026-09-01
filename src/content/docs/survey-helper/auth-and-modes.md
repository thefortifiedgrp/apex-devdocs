---
title: Authentication and modes
description: Browser-direct embeds with a publishable key, proxying through your own backend, initial versus refill flows, returning customers, and how drafts are stored.
sidebar:
  order: 2
---

There are two supported ways to integrate, depending on whether the browser talks to Apex directly or routes through your own backend. Both use the same SDK options. Only the credentials and the `apiBaseUrl` change.

## Mode A: browser-direct (publishable key)

The browser calls the Apex embed endpoints under `https://apextelemed.com/api/v2/embed/` directly, authenticating with your **publishable key**.

```ts
useSurveyV2Flow({
  apiBaseUrl: 'https://apextelemed.com/api',
  publishableKey: 'pk_0123456789abcdef0123456789abcdef',
  drugIds: ['drug-A'],
});
```

- The publishable key is `pk_` followed by 32 hex characters. It is sent on every request as the `x-apex-publishable-key` header.
- There are no test-mode keys. Sandbox (`https://dev.apextelemed.com/api`) and production (`https://apextelemed.com/api`) are separate deployments, and you get a separate publishable key and allow-list for each. See [Environments](/getting-started/environments/).
- The browser adds the `Origin` header automatically. Apex checks it against your allow-list.
- This is the simplest integration and the right one for most partners.

Apex rejects a request when the key is missing or unknown (HTTP 401), when embedding is not enabled for your partner account or the `Origin` is missing or not on your allow-list (HTTP 403), or when the per-IP rate limit is exceeded (HTTP 429 with a `Retry-After` header). The engine surfaces all of these as a load or submit error. The full status table is in the [embed API reference](/api/survey-v2-embed/).

### Security model

The publishable key is **safe to ship in your client bundle**. The threat model is the same as a Stripe `pk_*` key or a Mapbox public token:

- **Your partner ID is never in the browser.** Apex derives it server-side from the publishable key and ignores any partner identifier a client might send.
- **Every request is checked against your origin allow-list.** Add every site that will host the survey, for example `https://app.yourco.com` and `https://www.yourco.com`. Local development origins such as `http://localhost:5173` must be on the allow-list too, since the check is an exact match on the `Origin` value.
- **Submissions are rate-limited per IP** to limit abuse.
- **Rotation is immediate.** If a key leaks somewhere you don't control, ask Apex to rotate it. The old key stops working as soon as the rotation happens.

:::caution
The publishable key is **not** an API key. It cannot read data, list patients, or call any Partner API endpoint. It only authorizes composing, checking, and submitting an embedded survey from an allow-listed origin. Keep your `x-api-key` server-side. See [Authentication](/getting-started/authentication/).
:::

## Mode B: proxy through your backend

If your platform is multi-tenant, or you would rather not put any Apex key in the browser, route the embed calls through your own backend and attach your Apex API key there. The browser sends **no publishable key**. It can send a tenant identifier your backend understands instead.

```ts
useSurveyV2Flow({
  // Your own proxy base. It must expose the same /v2/embed/* paths.
  apiBaseUrl: 'https://app.yourco.com/apex/api',
  tenantKey: 'tnt_yourco',   // sent as X-Tenant-Key; your backend maps it to Apex credentials
  drugIds: ['drug-A'],
});
```

- `tenantKey` is sent as the `X-Tenant-Key` header on every request. It is optional: a single-tenant proxy that identifies the caller some other way can omit it.
- Your backend resolves the tenant, attaches that tenant's Apex API key (`apx_` followed by 32 hex characters) as `x-api-key`, and forwards the call to the server-side survey endpoints under `https://apextelemed.com/api/v2/public/`. Those endpoints run the same handlers as the embed endpoints, without the origin check or the embed rate limits.
- `publishableKey` is omitted entirely, so nothing sensitive reaches the browser.

Your proxy must preserve the five endpoint paths, methods, and JSON bodies described in the [API contract](/survey-helper/api-contract/#proxy-contract). It can mount them under any prefix as long as `apiBaseUrl` points at that prefix. The server-side endpoints themselves are documented in the [server-side survey API reference](/api/survey-v2-server/).

:::note
The engine uses `publishableKey`, or `tenantKey` when there is no publishable key, to namespace the draft it keeps in `localStorage`. If you omit both, every survey on the same origin shares one namespace. That is fine for a single-tenant proxy.
:::

## Initial versus refill flows

- **Initial** (the default): pass `drugIds`, and optionally `templateId` and `mode`. The SDK does not send `mode` unless you set it. The server treats a missing mode as `initial`.
- **Refill or returning member**: pass a one-time `token` issued by Apex instead. The token resolves the member, pre-fills their patient info, and scopes the survey to the drugs, template, and mode the token was minted with. When `token` is set, `drugIds`, `templateId`, and `mode` are ignored.

```ts
useSurveyV2Flow({ apiBaseUrl, publishableKey, token: 'the-token-from-apex' });
```

Tokens are minted server-side with your API key through the Partner API (see [Surveys](/api/surveys/)). A token is single-use and expires. It is consumed on submit, and a token that is already used, expired, or minted for a different partner makes the survey fail to load (`load_failed` in the adapters, phase `error` in the core). The pre-filled patient info and the resolved `memberId` are available on the engine state.

## Returning customers without a token

If you already know who the patient is (they are signed in to your site) but you are on the `drugIds` path rather than the token path, you can seed the patient-info form and optionally skip it altogether.

```ts
useSurveyV2Flow({
  apiBaseUrl,
  publishableKey,
  drugIds: ['drug-A'],
  knownPatientInfo: {
    firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
    dob: '1990-01-01', state: 'CA',
  },
  skipPatientInfoWhenComplete: true,
});
```

- `knownPatientInfo` seeds the engine's patient info when the survey loads. The patient can still edit the fields on the form. On the token path, the server's member record wins over any overlapping fields you pass here.
- `skipPatientInfoWhenComplete` is **off by default**. When it is on, the engine auto-submits at the end of the questionnaire instead of showing the patient-info form, but only if all three of these hold: you opted in, Apex has not vetoed the skip for your partner account, and every field in `requiredPatientInfoFields` is present with a valid email. An anonymous patient with empty patient info can never skip.
- `requiredPatientInfoFields` defaults to `firstName`, `lastName`, `email`, `dob`, and `state`. Widen it to whatever your downstream needs (for example a shipping address) so the skip never drops a field the form would otherwise force.
- If the automatic submit fails, the engine falls back to the patient-info form with a validation message so the patient can review and retry.

Resolve the known identity before the component mounts (or before you call the Solid hook). The engine is built once from the options passed at that time.

## Draft persistence and privacy

The engine saves an in-progress draft so a page refresh resumes the flow:

- The draft holds the **answers and the current step index** only. Patient info is never written to the draft.
- By default it lives in `localStorage` under a key built from your publishable key (or tenant key), plus the token or a hash of the drug IDs, template, and mode. Two surveys for different drug sets on the same site keep separate drafts.
- Drafts expire after **24 hours**. Override with `draftTtlMs`.
- The draft is deleted on a successful submit, on disqualification, and on `restart()`. A patient who was disqualified and comes back later starts a fresh survey rather than being denied again on the same answers.
- If `localStorage` is unavailable (private browsing, hardened browsers, quota errors), the survey still works, just without resume.

To disable resume in the adapters, set `draftTtlMs: 0`. Drafts are still written but never restored. To stop writing entirely, or to keep drafts on your own server so a patient can resume on another device, supply a custom `DraftStore`. The Solid hook and the headless core accept a `draftStore` option. The React hook does not expose it yet, so use the core directly there. See [Headless core](/survey-helper/headless/#draft-persistence).
