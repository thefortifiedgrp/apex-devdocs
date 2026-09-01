---
title: Installation and configuration
description: Install the package, set up Vite and the solid export condition, call configure() at boot, and wire the boot-time helpers.
sidebar:
  order: 2
---

## Install

```bash
npm install @apextelemed/partner-core solid-js
```

The package pulls in `@apextelemed/survey-core`, `@apextelemed/survey-solid` and `dompurify` as regular dependencies. Everything else is a peer dependency you install yourself.

| Peer dependency | Version | Required | Used for |
| --- | --- | --- | --- |
| `solid-js` | `^1.9.0` | yes | The whole package is written against Solid's reactive runtime. |
| `@playwright/test` | `>=1.50.0` | no | The seam suite from `/testing`. See [Testing your site](/partner-sdk/testing-your-site/). |
| `@supabase/supabase-js` | `^2.0.0` | no | Live updates for support threads in `useMessagesThread` and `MemberPortal`. Without it the hook polls; nothing breaks. |

Node 18 or newer is required.

## Build setup

The supported build is Vite with `vite-plugin-solid`. Two settings matter.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    // One Solid runtime for the app and the package. Without this a second
    // copy of solid-js can be resolved for the package, and signals created
    // in the package stop notifying components rendered by your copy.
    dedupe: ['solid-js'],
  },
  server: {
    // Keep backend requests same-origin in development.
    proxy: {
      '/api': { target: 'https://api.example.com', changeOrigin: true },
    },
  },
});
```

A matching `tsconfig.json` uses Solid's JSX settings and bundler resolution so the package's `exports` map is honoured:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  }
}
```

### The `solid` export condition

Every JavaScript entry in the package is published under two export conditions:

- **`solid`** resolves to `.jsx` files: the source with types stripped but the JSX left uncompiled. `vite-plugin-solid` puts `solid` first in `resolve.conditions`, so Vite compiles that JSX inside your app with Solid's compiler. This is the best output: correct fine-grained reactivity, real hot reload for package components, and one Solid runtime shared with your code.
- **`import`** resolves to `.js` files: the same code already compiled with Solid's Babel preset, plus the `.d.ts` types. Anything that resolves without the Solid plugin lands here, for example server-side rendering, a Vitest config without `vite-plugin-solid`, or another bundler. It works, but package components cannot participate in hot reload.

The package cannot ship raw `.tsx` and let you compile it. Vite pre-bundles dependencies with esbuild, and esbuild cannot perform Solid's compile-time JSX transform, so components would render once and never update.

Two entries are different. `/testing` ships only compiled JavaScript and types, because Playwright refuses to strip types from files under `node_modules`. The four `/theme/*.css` entries are plain stylesheets.

:::caution
Within one bundle, every subpath must resolve through the same condition. The package is built around module singletons: `configure()` writes a value that every store and API module reads, and each store is created once at import time. If some subpaths resolve to the `solid` graph and others to the `import` graph, or if two copies of the package end up in `node_modules`, you get two sets of singletons. `configure()` then writes config the stores never read, and your chrome watches a different `authStore` than the package's pages. Nothing throws. See [Gotchas](/partner-sdk/gotchas/#two-copies-of-the-package).
:::

## Configure at boot

Call `configure()` once, before any module that imports the package's stores or API. The stores hydrate from storage as soon as configuration is available, so the safe pattern is a dedicated setup module imported on the first line of your entry file.

```ts
// src/setup.ts
import { configure } from '@apextelemed/partner-core/config';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api';

configure({
  apiBase,
  tenantKey: import.meta.env.VITE_TENANT_KEY,
  storagePrefix: 'acme',
  // Embedded survey through the backend proxy (no key in the browser).
  apexEmbedApiBase: `${apiBase}/apex`,
});
```

```tsx
// src/index.tsx
import './setup'; // line 1, before anything that touches the package
import { render } from 'solid-js/web';
import { PrimitivesProvider } from '@apextelemed/partner-core/primitives';
import { startCartCapture } from '@apextelemed/partner-core/flows';
import '@apextelemed/partner-core/theme/flow.css';
import './theme/brand.css';
import { sitePrimitives } from './primitives';
import App from './App';

startCartCapture();

render(
  () => (
    <PrimitivesProvider value={sitePrimitives}>
      <App />
    </PrimitivesProvider>
  ),
  document.getElementById('root')!,
);
```

`getConfig()` returns the current configuration and throws if `configure()` has not run, so an early import surfaces as a hard error at boot rather than a silent empty store. The `/config` subpath also exports `onConfigured(cb)`, which the package's own stores use to defer storage reads; it is not needed in site code.

### `PortalConfig`

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `apiBase` | `string` | required | Base URL for partner-backend requests, without a trailing slash. Either a path such as `/api` (same-origin or proxied) or an absolute URL. Endpoint paths are appended directly. |
| `tenantKey` | `string` | required | Sent as the `x-tenant-key` header on every backend request. Selects your tenant, its feature flags and its payment and Apex configuration. |
| `storagePrefix` | `string` | required | Prefix for every localStorage and sessionStorage key the package writes. Pick one unique value per site. See [Storage keys](#storage-keys-and-storageprefix). |
| `apexEmbedApiBase` | `string` | none | Base URL of the Apex v2 embedded survey API. Required by `useSurveyV2Flow`, `SurveyV2Page` and cross-device survey drafts; the hook throws without it. See [Survey connection modes](#survey-connection-modes). |
| `apexPublishableKey` | `string` | none | Apex publishable key (`pk_` followed by 32 hex characters). Only needed for browser-direct survey embeds. Sent as `x-apex-publishable-key`. Safe to ship in client code. |
| `unavailableStates` | `string[]` | none | USPS codes of states this tenant cannot ship to, for example `['DE']`. They are removed from every state dropdown built with `availableStateOptions()`, and shipping-address validation rejects them even when prefilled from a saved profile. Billing addresses are not restricted. |
| `unavailableStatesNote` | `string` | a generic sentence | Short note rendered near state dropdowns when `unavailableStates` is set, and used as the validation message for a saved address in one of those states. |
| `idempotencyKeys` | `boolean` | `false` | Send an `Idempotency-Key` header on charge and create requests so the backend can collapse a retried or double-submitted mutation. Leave off until Apex confirms your tenant's backend both allow-lists the header for CORS and honours it. Enabled too early, the preflight fails and the request never leaves the browser. |

### Survey connection modes

The embedded survey can reach Apex two ways. Both use the same hook and page; only the config differs.

**Through the partner backend (default).** Point `apexEmbedApiBase` at the backend's Apex mount and omit the publishable key. The backend resolves your tenant from `x-tenant-key` and attaches its Apex credentials server-side, so no key reaches the browser and no Origin allow-list is involved. This needs your tenant's Apex credentials configured on the backend, which Apex does at provisioning.

```ts
configure({
  apiBase: '/api',
  tenantKey: import.meta.env.VITE_TENANT_KEY,
  storagePrefix: 'acme',
  apexEmbedApiBase: '/api/apex',
});
```

**Browser-direct.** Point `apexEmbedApiBase` at Apex and supply the publishable key. Apex validates the key against the Origin allow-list configured for your partner account. Sandbox (`https://dev.apextelemed.com/api`) and production (`https://apextelemed.com/api`) are separate deployments with separate credentials: a key belongs to one of them, and there is no test-mode key. See [Auth and modes](/survey-helper/auth-and-modes/) and the [survey v2 embed API](/api/survey-v2-embed/).

```ts
configure({
  apiBase: '/api',
  tenantKey: import.meta.env.VITE_TENANT_KEY,
  storagePrefix: 'acme',
  apexEmbedApiBase: 'https://apextelemed.com/api',
  apexPublishableKey: import.meta.env.VITE_APEX_PUBLISHABLE_KEY,
});
```

A tenant whose backend record has no Apex credentials fails in proxy mode the same way a missing key fails in browser-direct mode: the survey never loads. Check the tenant before hunting for a frontend config problem.

## Storage keys and `storagePrefix`

Every key the package writes is `<storagePrefix>-<suffix>`. The prefix keeps two sites that share an origin (for example two apps on `localhost`) from reading each other's session and cart, and the seam suite audits your site's storage against this list.

| Suffix | Storage | Holds |
| --- | --- | --- |
| `auth` | localStorage | Patient access and refresh tokens plus user id |
| `affiliate-auth` | localStorage | Affiliate access and refresh tokens plus affiliate id |
| `affiliate-ref` | localStorage | Referral code captured from `?ref=`, 30-day TTL |
| `promo-code` | localStorage | Promo code captured from `?promo=`, 30-day TTL |
| `cart` | localStorage | Cart items |
| `cart-promo` | localStorage | Applied promo code |
| `cart-id` | localStorage | Stable cart id for abandoned-cart capture |
| `signup-draft` | localStorage | Non-sensitive signup fields, 7-day TTL |
| `register-draft` | localStorage | Non-sensitive registration fields, 7-day TTL |
| `subscription-intake-draft` | localStorage | Non-sensitive intake fields and the attempt's idempotency key, 7-day TTL |
| `funnel-email-done` | localStorage | Whether the pre-survey email gate was answered |
| `funnel-session` | sessionStorage | Survey session id for funnel telemetry |
| `survey-draft` | sessionStorage | Deprecated v1 survey answers and step, 24-hour TTL |
| `rx-checkout-key-<scope>` | sessionStorage | Idempotency key for one prescription checkout attempt |
| `cart-checkout-key-cart` | sessionStorage | Idempotency key for one cart checkout attempt |

Passwords and card numbers are never persisted. The package also takes a Web Lock named `<prefix>-auth-refresh` (and `<prefix>-affiliate-auth-refresh`) while refreshing a token so two tabs cannot replay the same refresh token.

The v2 survey engine keeps its in-progress draft under its own key from `@apextelemed/survey-core`, namespaced by the publishable key or tenant key rather than by `storagePrefix`. If the seam suite's storage audit reports it, declare it in the adapter's `allowStorageKeys`.

## Subpath imports

Prefer the specific subpath in site code. The root barrel exists for convenience and re-exports the same singletons, so mixing the two is safe as long as both resolve to one copy of the package.

```ts
import { configure, getConfig } from '@apextelemed/partner-core/config';
import { authApi, paymentsApi, type User } from '@apextelemed/partner-core/api';
import { authStore, cartStore } from '@apextelemed/partner-core/stores';
import { useDashboardData, useSurveyV2Flow } from '@apextelemed/partner-core/flows';
import { SurveyV2Page, AdminDashboard } from '@apextelemed/partner-core/pages';
import { PrimitivesProvider, type Primitives } from '@apextelemed/partner-core/primitives';
import { defaultPrimitives } from '@apextelemed/partner-core/primitives/default';
import { adminPreset, BREAKPOINTS } from '@apextelemed/partner-core/theme';
import '@apextelemed/partner-core/theme/admin.css';
```

Many sites add one-line re-export shims (`src/stores/auth.ts` exporting `authStore`, `src/api/client.ts` re-exporting `/api`) so application code imports local paths. That is optional.

## Boot-time calls

Beyond `configure()`, a few things belong at the top of your entry file.

**`PrimitivesProvider`.** Wrap the app once. Every Tier 3 customer page reads its components from this context and throws if it is missing. See [Pages and primitives](/partner-sdk/pages-and-primitives/).

**Theme stylesheets.** Import the package stylesheet for each portal surface you mount, then your own override file after it. Order matters: both define the same `:root` variables, and the later file wins. See [Theming](/partner-sdk/theming/).

**`startCartCapture(options?)`.** Call once at boot. It mirrors the cart to the backend as it changes (debounced, flushed on page hide) and redeems a `?cart=` recovery link on arrival. It fetches the tenant's cart-capture setting first and does nothing for tenants that have not opted in, so it is safe to call unconditionally. It returns a disposer and ignores a second call while one instance is running.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `debounceMs` | `number` | `2000` | Delay before a cart change is mirrored. |
| `email` | `() => string \| null \| undefined` | none | Email of an anonymous shopper collected outside the survey's email gate. Signed-in shoppers need nothing; the backend reads their email from the token. |

`restoreCartFromLink()` runs the `?cart=` redemption on its own and resolves to the restored cart or `null`, for sites that want to react to it (open the cart drawer, wait for the catalog). It is single-flight, so calling it alongside `startCartCapture()` does not restore twice.

**Referral and promo landings.** When a visitor arrives with `?ref=CODE`, call `captureAffiliateRef(code)`; the code is stored for 30 days and sent as `affiliateRef` on the attributable checkout and subscribe requests, which keeps attribution working when the backend's cross-site cookie is blocked. Call `affiliatePortalApi.track(code, landingPage)` as well if you want the backend to set that cookie and record the click. When a campaign link carries `?promo=CODE`, call `capturePromoCode(code)`; the subscription intake flow re-validates it and prefills the promo field.

```ts
// somewhere in your router's root, on first render
import { captureAffiliateRef, capturePromoCode, affiliatePortalApi } from '@apextelemed/partner-core/api';

const params = new URLSearchParams(window.location.search);
const ref = params.get('ref');
if (ref) {
  captureAffiliateRef(ref);
  void affiliatePortalApi.track(ref, window.location.pathname).catch(() => {});
}
const promo = params.get('promo');
if (promo) capturePromoCode(promo);
```

**Survey recovery links.** A `?resume=` link from a funnel-recovery email is redeemed inside `SurveyV2Page` and `useSurveyV2Flow`. You only need `redeemResumeLink()` if you render your own pre-survey email gate. See [Flow hooks](/partner-sdk/flows/#funnel-capture-helpers).

## Suggested environment variables

```bash
# .env.example
VITE_API_BASE_URL=/api
VITE_API_TARGET=https://api.example.com      # dev proxy target for /api
VITE_TENANT_KEY=your-tenant-key
# Only for browser-direct survey embeds (sandbox base: https://dev.apextelemed.com/api):
# VITE_APEX_EMBED_API_BASE=https://apextelemed.com/api
# VITE_APEX_PUBLISHABLE_KEY=pk_0123456789abcdef0123456789abcdef
```

Keep `tenantKey` and `storagePrefix` per site. Copying a working site and leaving either value behind ships your build against the wrong tenant, or makes two sites overwrite each other's storage.
