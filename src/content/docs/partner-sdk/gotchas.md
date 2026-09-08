---
title: Gotchas
description: The silent failures that have actually bitten partner sites, what each one looks like, and the fix.
sidebar:
  order: 8
---

Every entry here is a failure that produces wrong behaviour rather than an error, or an error that names the wrong thing. Skim it before touching boot order, configuration, primitives, theming or the build, and come back to it when something "just stopped working".

## Boot order

### `configure()` ran after a store was imported

**Rule.** Call `configure()` in a dedicated setup module and import that module on the first line of your entry file, before any module that imports the package's stores, API or pages, including transitively through a route component.

**Why.** The stores hydrate from storage as soon as configuration exists and read the current prefix to do it. `getConfig()` throws when called before `configure()`, so an early API call is a hard error at boot; but a page that merely imported a store may render logged-out until the first live request.

**Symptom.** A logged-in member is logged out on refresh, the cart empties, or the console shows `configure({ apiBase, tenantKey, storagePrefix }) must be called before any API or store is used`. The seam suite's `routes` and `boot` checks catch both.

### Two copies of Solid

**Rule.** Set `resolve.dedupe: ['solid-js']` in `vite.config.ts`.

**Why.** Solid's reactivity is instance-scoped. When the package resolves a second copy of `solid-js` (most often with a `file:` or linked install), signals created inside the package never notify components rendered by your copy.

**Symptom.** A store update does not re-render; effects never fire across the package boundary; no error anywhere.

### Two copies of the package

**Rule.** Exactly one copy of `@apextelemed/partner-core` in the bundle, with every subpath resolved through the same export condition.

**Why.** `configure()` writes a module-level value and each store is created once at import. Two copies means two configs and two `authStore`s. It happens when a linked checkout and a registry install coexist, when a version mismatch nests a second copy under another dependency, or when you alias some subpaths to a different build than others.

**Symptom.** `configure()` appears to have no effect, or your header never notices a login the package's own pages completed. The seam suite's `singleton` check exists for this. Run `npm ls @apextelemed/partner-core` and expect one entry.

## Configuration

### `tenantKey` or `storagePrefix` copied from another site

**Rule.** Set both per site, from that site's environment.

**Why.** `tenantKey` selects the tenant on the backend. `storagePrefix` namespaces storage. Sites are usually started by copying a working one, and these two values are the ones that survive the copy unnoticed.

**Symptom.** Wrong-tenant data, or two sites on the same origin logging each other out and sharing a cart.

### The v2 survey renders nothing or errors on load

**Rule.** `apexEmbedApiBase` is required by `useSurveyV2Flow` and `SurveyV2Page`; the hook throws without it. `apexPublishableKey` is only needed for a browser-direct embed. Through the backend proxy, omit the key and make sure the tenant has Apex credentials configured on the backend.

**Why.** In proxy mode the backend attaches your tenant's Apex credentials server-side. A tenant without them fails the same way a missing key does in browser-direct mode, so check the tenant record before hunting through frontend config. See [Survey connection modes](/partner-sdk/installation/#survey-connection-modes).

### `idempotencyKeys` enabled too early

**Rule.** Leave `idempotencyKeys` off until Apex confirms your tenant's backend allow-lists the `Idempotency-Key` header for CORS and honours it.

**Why.** A custom request header triggers a preflight. If the backend does not allow-list it, the preflight fails and the browser never sends the request.

**Symptom.** Every charge, subscribe and register call fails with a CORS error the moment the flag is turned on.

### `createRequest` without `patientInfo`

`apexApi.createRequest` types `patientInfo` as optional, but the backend rejects a request without it with a 400. Always send it. `SurveyV2Page` does.

## Survey

### The survey is stuck on "pick a medication"

You are on the deprecated v1 flow. `useSurveyFlow` and `SurveyPage` cannot compose a questionnaire until a medication sits in the cart or `medicationStore`, and otherwise report `needs_medication_selection`. Move the page to `SurveyV2Page` (or `useSurveyV2Flow`) and pass `drugIds` explicitly. v2 can also qualify a guest before an account exists, which v1 cannot. Both v1 exports carry an `@deprecated` marker, so once you are on a build that includes it your editor strikes through every call site.

### `onComplete` fires but the member never saw the eligibility summary

`SurveyV2Page`'s `onComplete` fires after the result screen renders and any prescriber requests were created, and most sites navigate away in it. If you want the member to read the per-drug summary first, use `completionCtaLabel` and `onCompletionCta` and navigate from the button instead.

### Cart items vanish after the survey

`SurveyV2Page` creates one prescriber request per cart line and removes each line as its request lands. Lines the survey disqualified are dropped without a request, matched by the item's `apexDrugId`. If you add items to the cart yourself, copy `apex_drug_id` from the catalog product onto the item, or the eligibility gate cannot match it and forwards it regardless.

## Primitives and pages

### A page crashes with `usePrimitives() called outside <PrimitivesProvider>`

Wrap the app root in `PrimitivesProvider`. Every customer page reads its components from it.

### A page crashes rendering a missing primitive

`Primitives` is a fixed twelve-member interface, and each page uses several members. Implement all twelve, or spread `defaultPrimitives` and override. Do not add props to make one page look right; every prop on a primitive is a contract every site must implement, and a page that needs a variant is a package change.

### The admin dashboard overlaps the header, or auth redirects never happen

The portals use adapters, not `Primitives`. Pass `topOffset` matching your fixed header, and pass an `auth` adapter whose `onUnauthenticated` and `onForbidden` callbacks perform the redirect. Without an adapter no gating is applied and your route must guard. For `AdminDashboard`, make `isHydrated()` return true only after the profile has loaded, or a real admin refreshing the page is bounced before their role is known.

### Admin errors pop up as `alert()`

That is the default when no `toast` prop is given. Pass `{ success, error }` to route notifications through your own component.

### Member portal tabs have no icons

`MemberPortal` renders Phosphor Icons class names (`ph-thin ph-...`) and does not bundle the icon font. Include the Phosphor stylesheet in your page, or accept text-only tabs.

## Theming

### The portal shows the package's default colours

Import the package stylesheet before your override. Both define the same variables on `:root`, and the later file wins. Check which stylesheet a page needs: the patient `ForgotPasswordPage` and `ResetPasswordPage` use the `--app-affiliate-*` family and need `affiliate.css`, not `flow.css`. See [Theming](/partner-sdk/theming/#cascade-order).

### UnoCSS classes from `adminPreset` render unstyled

The preset maps classes to CSS variables; it does not define them. `admin.css` must still be imported once.

## Payments

### The pay button never enables

Card flows gate submission on `tokenizerReady()`. Read `tokenizerError()` too: it is set when the payment configuration could not be fetched, the tenant's provider is not configured, or the provider's script was blocked (ad blockers block Authorize.Net's Accept.js). Render it as a banner; otherwise the page shows a permanently disabled button with no explanation.

### A charge failed "ambiguously"

An `ApiError` with `ambiguous: true` means the response was lost and the server may have committed. The flows reconcile against the server before letting the member retry and reuse the same idempotency key when they do. If you call `paymentsApi`, `subscriptionsApi.create` or `authApi.registerAndSubscribe` yourself, do the same, and never auto-retry the one-time cart charge: the backend does not yet deduplicate that route, so a replay can be a second real charge.

### Card details reappear after a declined signup

Expected. After a definitive rejection `useSignupFlow` returns to the Payment step with the fields still filled, because the card token is single-use and has to be minted again. An ambiguous failure keeps the token so the retry replays the identical request.

## Messaging

### Support threads only update every ten seconds

Live updates need `@supabase/supabase-js` installed in your site and realtime credentials on the backend deployment. Without either, `useMessagesThread` silently stays on its poll. Clinical conversations always poll; there is nothing to subscribe to.

## Testing

### Playwright fails with "Test not found in the worker process"

The seam suite is running without `--preserve-symlinks`. Run it through the npm script that sets `NODE_OPTIONS`, and call `assertSeamEnv()` at the top of the Playwright config so the failure names the flag instead. See [Testing your site](/partner-sdk/testing-your-site/#why---preserve-symlinks).

### Playwright complains about `@playwright/test` being required twice

The suite must receive your `test` and `expect`: `defineSeamSuite(adapter, { test, expect })`. Importing them inside the package would load a second copy through the symlink's real path.

### The storage audit flags a key you did not write

Keys the package writes are documented under [Storage keys](/partner-sdk/installation/#storage-keys-and-storageprefix). The v2 survey engine keeps its draft under its own key, namespaced by publishable key or tenant key rather than by your prefix; a third-party script may write keys too. Declare anything your site knowingly writes or embeds in `allowStorageKeys`. A bare `auth` or `cart` key with no prefix is a real bug: some chrome is still writing the old, unprefixed key.

## Build

### Components render once and never update in a non-Vite build

You resolved the package's uncompiled JSX (the `solid` condition) without a Solid compiler in the pipeline, or you compiled it with a generic JSX transform. Use `vite-plugin-solid`, or make sure your tooling falls through to the `import` condition, which is precompiled. See [The `solid` export condition](/partner-sdk/installation/#the-solid-export-condition).

### Vitest sees a different build than the dev server

A Vitest config without `vite-plugin-solid` resolves the `import` condition while your dev server resolves `solid`. Both are the same code, so tests remain valid, but package components will not hot reload under the test runner and a test that inspects compiled output can differ. Use the same Vite config for both if you need parity.
