---
title: Overview
description: What the partner SDK is, who it is for, what you need before you start, and how its three tiers fit together.
sidebar:
  order: 1
---

`@apextelemed/partner-core` is a SolidJS library for building patient-portal sites on the Apex Telemed platform. It ships the pieces every partner site needs and would otherwise rewrite: a typed API client, persistent auth and cart stores, headless flow hooks for signup, survey, checkout, subscriptions, dashboards and messaging, themed page components for those same flows, back-office portals (admin, member, affiliate), theme stylesheets, and a test kit that checks your site wired the package up correctly.

The package talks to the Apex partner backend, a multi-tenant service operated by Apex. It owns your tenant's members, orders, subscriptions, payments, support threads and email, and it brokers the embedded survey and prescription requests with the Apex platform. Every request carries your tenant key in the `X-Tenant-Key` header, and the backend uses it to select your tenant. Your browser code never calls the Apex Partner API directly. If you need server-side access to members, requests or webhooks, see the [Partner API](/api/) section.

The current published version is 0.3.0.

## Who it is for

Use the SDK when you are building a branded telehealth storefront or member portal for an Apex customer and want to own the look while reusing the logic. A typical site is a Vite + SolidJS single-page app. It supplies its own routes, chrome, design tokens and primitive components, and mounts the package's flows and pages behind them.

If you only need the medical questionnaire inside an existing site, the [survey helper](/survey-helper/) packages are a smaller dependency. The partner SDK wraps the same survey engine and adds everything around it.

## Prerequisites

| Need | Details |
| --- | --- |
| A tenant on the Apex partner backend | Apex provisions the tenant and gives you its tenant key. The key is sent as `X-Tenant-Key` and selects your tenant's data, feature flags and payment configuration. A site cannot create a tenant. |
| The backend base URL | Provided with the tenant. In development you usually proxy `/api` to it from Vite so requests stay same-origin. |
| Survey access | By default the embedded survey goes through the backend, which attaches your tenant's Apex credentials server-side. Only a browser-direct embed needs an Apex publishable key (`pk_` followed by 32 hex characters) and an Origin allow-list. See [Auth and modes](/survey-helper/auth-and-modes/). |
| Node and Solid | Node 18 or newer. `solid-js` 1.9 or newer as a peer dependency. Vite with `vite-plugin-solid` is the supported build. TypeScript 5 is recommended. |
| Optional peers | `@playwright/test` 1.50 or newer to run the [seam suite](/partner-sdk/testing-your-site/). `@supabase/supabase-js` 2.x for live support-thread updates; without it the messages hook polls. |

## Three tiers, picked per page

Every page in a partner site has a different ratio of logic complexity to visual divergence. The package exposes each flow at three levels so you can pick the highest one a page can live with, and mix per page.

| Tier | Import from | What you get | Use when |
| --- | --- | --- | --- |
| 1. Logic | `/config`, `/api`, `/stores` | Typed API client, persistent stores, shared types | Always. Every page sits on this layer. |
| 2. Headless flow | `/flows` | A hook returning reactive state, actions and derived values, with no markup | The page needs full control of its markup, or it is one the package deliberately does not ship (catalog, product detail, dashboard). |
| 3. Themed page | `/pages` with `/primitives` | A page component that renders the flow through the `Primitives` you provide | You accept the package's page structure and supply your own components (or start from `defaultPrimitives`). |

Some guidance for picking:

- Start every page at Tier 3 and drop down only when the structure genuinely does not fit. Reimplementing survey, checkout or signup logic in a site to change its layout is the most common mistake, and the flow hooks exist so you never have to.
- The admin, member and affiliate portals are Tier 3 components themed by CSS variables and wired through small adapter objects rather than `Primitives`. Back-office screens do not carry the brand the way the storefront does.
- Tier 2 hooks and Tier 3 pages share the same stores, so mixing tiers on one site is safe. A site can render `SurveyV2Page` and hand-build its dashboard on `useDashboardData()`.

The survey exists in two generations. The v2 flow (`useSurveyV2Flow`, `SurveyV2Page`) composes one questionnaire from a list of drug ids and can qualify a guest before an account exists. The v1 flow (`useSurveyFlow`, `SurveyPage`) needs a medication already chosen and is deprecated. Wire new sites to v2. See [Flow hooks](/partner-sdk/flows/).

## What is shipped

Import from the subpath you need. The root barrel re-exports most of them for convenience, but subpaths keep your imports explicit.

| Subpath | Tier | Contents |
| --- | --- | --- |
| `@apextelemed/partner-core` | all | Root barrel: everything from `/config`, `/api`, `/stores`, `/flows`, `/pages` and `/primitives`, plus `defaultPrimitives` and the `AddressFields` component |
| `@apextelemed/partner-core/config` | 1 | `configure`, `getConfig`, `PortalConfig` |
| `@apextelemed/partner-core/api` | 1 | `apiFetch`, `ApiError`, token helpers, idempotency keys, the namespaced API modules, affiliate and promo capture, funnel and cart transport, Apex v2 embed re-exports |
| `@apextelemed/partner-core/stores` | 1 | `authStore`, `affiliateAuthStore`, `cartStore`, `medicationStore` |
| `@apextelemed/partner-core/flows` | 2 | Every `use*Flow` and `use*Data` hook plus the pure helpers |
| `@apextelemed/partner-core/primitives` | 3 | The `Primitives` interface, `PrimitivesProvider`, `usePrimitives`, all prop types |
| `@apextelemed/partner-core/primitives/default` | 3 | `defaultPrimitives`, a working implementation styled by `flow.css` |
| `@apextelemed/partner-core/pages` | 3 | Themed pages and portals with their adapter types |
| `@apextelemed/partner-core/theme` | theming | `adminPreset`, `ADMIN_CSS_VARIABLES`, `BREAKPOINTS`, `media` |
| `@apextelemed/partner-core/theme/admin.css` | theming | Admin dashboard variable defaults |
| `@apextelemed/partner-core/theme/flow.css` | theming | Styling for `defaultPrimitives` |
| `@apextelemed/partner-core/theme/affiliate.css` | theming | Affiliate portal and password-page variable defaults |
| `@apextelemed/partner-core/theme/member-portal.css` | theming | Member portal variable defaults |
| `@apextelemed/partner-core/testing` | testing | `defineSeamSuite`, `assertSeamEnv`, adapter types, mocks, fixtures, storage contract |
| `@apextelemed/partner-core/package.json` | | The package manifest |

The full surface of each subpath is documented on the following pages: [Installation and configuration](/partner-sdk/installation/), [API client and stores](/partner-sdk/api-client-and-stores/), [Flow hooks](/partner-sdk/flows/), [Pages and primitives](/partner-sdk/pages-and-primitives/), [Theming](/partner-sdk/theming/) and [Testing your site](/partner-sdk/testing-your-site/).

## What stays out of the package

The package deliberately does not ship the parts that make a site a brand or a business:

- Route configuration and site chrome (router, header, nav, cart drawer). Pages report navigation events through callbacks and never navigate for you.
- Implementations of the `Primitives` interface. Each site builds its own Button, Card, TextField and so on in its own design language, or starts from `defaultPrimitives` and overrides.
- Design tokens and the CSS framework. The storefront look lives in your own configuration; the portals expose CSS variables you override.
- Marketing and branding pages (home, login, hero illustrations, product visuals).
- Catalog and product-detail markup. `useCatalog`, `useProductDetail` and `useMedicationSelect` supply the data.
- Per-site product catalogs and seed data. Products, categories, sales and promo codes live on the backend and are managed through `AdminDashboard`.
- Clinical guide copy for the member portal. You inject a resolver that returns reviewed content per medication.
- Server-side integration with the Apex Partner API (webhooks, server-to-server request creation). See [Partner API](/api/).

## License

The package is source-available, not open source. It is distributed under the Apex Telemed Platform Integration License, version 1.0 (August 2026). You may use, copy, modify, create derivative works of and redistribute the package, in source or compiled form, solely to build, deploy and operate a website, application or service that integrates with the platform and backend services Apex operates, through the interfaces Apex makes available to its customers, on behalf of a current Apex customer for that customer's own business. Using it with any other platform or backend, or to build a competing product, requires a separate written license. Redistributions must keep the license text and notices. `package.json` declares `SEE LICENSE IN LICENSE`, so dependency scanners report a custom license; that is expected.
