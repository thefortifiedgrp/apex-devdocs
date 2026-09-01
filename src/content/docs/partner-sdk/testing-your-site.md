---
title: Testing your site
description: The seam suite from the testing subpath, what its four checks catch, the adapter you supply, the Playwright wiring, and the CI workflow.
sidebar:
  order: 7
---

The package proves its own flows against a real backend in its own test suite. What no package test can prove is whether a particular site wired the package up correctly, and that is a narrow, fast set of questions. `@apextelemed/partner-core/testing` ships that suite. Your site supplies a small adapter describing itself; the checks come from the package, so a check added upstream reaches every site on its next upgrade.

Everything is mocked. The suite needs no backend, no credentials and no fixtures of yours, which is what lets it run on a fork pull request and act as a required check.

The subpath is compiled JavaScript with type declarations and is meant for Playwright specs only. Never import it from application code. `@playwright/test` 1.50 or newer is a peer dependency.

## The four checks

| Check | What it does | What it catches |
| --- | --- | --- |
| `routes` | Visits every route in the adapter with a logged-out mock and watches for uncaught exceptions and an empty document | A route that throws on boot, a missing provider, a page whose data hook threw and was swallowed by an error boundary. A "used before `configure()`" error is reported by name. |
| `boot` | Seeds a session and a cart in storage the way a returning visitor would have them, loads the app cold, and requires both keys to still be there. With `authedMarker` set it also requires the authenticated view to render. | A store module that loaded before `configure()`, snapshotted an empty prefix and never re-read, so a refresh logs the member out |
| `storage` | Walks every route and audits localStorage: no package key written without your prefix, no unknown unprefixed key, no prefixed key the package does not declare, except those you allow | Site chrome that kept its own pre-migration `auth` or `cart` writer, so two stores fight over one browser |
| `singleton` | Logs in through your real login form and expects the nav to change in the same tab, then logs out and expects the session gone from storage | Two copies of the auth store in the bundle: login updates one and the chrome reads the other |

The routes check watches uncaught exceptions only, not console errors, so a third-party script that logs cannot make it flaky. The singleton check needs `nav` and `patient` in the adapter and is skipped otherwise.

## Wiring a site

Three files.

### `e2e/seam.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { defineSeamSuite } from '@apextelemed/partner-core/testing';

defineSeamSuite(
  {
    siteName: 'acme',
    storagePrefix: 'acme',           // must match configure()
    apiBase: '/api',                 // must match configure()
    routes: { home: '/', login: '/login', signup: '/signup', dashboard: '/dashboard', catalog: '/catalog' },
    nav: { loggedOutText: 'Log In', loggedInText: 'Dashboard', logOutText: 'Log Out' },
    patient: { email: 'user@test.com', password: 'test1234' },
    authedMarker: '[data-testid="dashboard"]',
    allowStorageKeys: ['acme-theme'],
  },
  { test, expect },
);
```

`test` and `expect` are passed in rather than imported inside the package. Node resolves a symlinked package's imports from its real path, so an import of `@playwright/test` inside the suite would load a second copy from the package's own dependencies, which Playwright rejects outright. Passing the runner keeps the shipped file free of any Playwright import.

### `playwright.seam.config.ts`

```ts
import { defineConfig } from '@playwright/test';
import { assertSeamEnv } from '@apextelemed/partner-core/testing';

assertSeamEnv();

export default defineConfig({
  testDir: './e2e',
  testMatch: 'seam.spec.ts',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### `package.json`

```json
{
  "scripts": {
    "test:seam": "NODE_OPTIONS=--preserve-symlinks playwright test --config playwright.seam.config.ts"
  }
}
```

### Why `--preserve-symlinks`

When the package is installed as a symlink (a `file:` dependency or a linked checkout during development), Node resolves the suite's files to their real path, outside your project root. Playwright keys tests by the path of the file that declared them, so the tests it collected in the parent no longer match what a worker loads, and the run fails with "Test not found in the worker process", which says nothing about symlinks. `--preserve-symlinks` keeps the package at its `node_modules` path.

The flag has to be set before Node starts. Neither the package nor a Playwright config can apply it late, which is why the script sets it in `NODE_OPTIONS`. `assertSeamEnv()` throws with a message that names the real problem when the flag is missing, and it does so for every install, symlinked or not, so keep the script as shown even when you install from npm. `SEAM_NODE_OPTION` exports the flag string.

## The adapter

`SiteSeamAdapter` is deliberately small: the package already knows its own endpoints, storage keys and failure modes. You describe only what is genuinely yours.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `siteName` | `string` | required | Appears in test titles |
| `storagePrefix` | `string` | required | The value you pass to `configure()` |
| `apiBase` | `string` | `'/api'` | The value you pass to `configure()`. A path or an absolute URL; only the path part is matched. |
| `routes` | `SeamRoutes` | required | `home`, `login` and `signup` are required; `catalog`, `dashboard`, `checkout` and `survey` are optional. Every declared route is visited. |
| `nav` | `SeamNav` | none | Enables the singleton check: `selector` (default `nav`), `loggedOutText`, `loggedInText`, `logOutText` |
| `patient` | `SeamUser` | none | `{ email, password }` for the real UI login. Required when `nav` is set. The login request is mocked, so any values work. |
| `login` | `SeamLoginForm` | | Selector overrides: `email` (default `input[type="email"]`), `password` (default `input[type="password"]`), `submit` (default `button[type="submit"]`) |
| `authedMarker` | `string` | none | Selector that proves an authenticated view rendered, for the boot check |
| `allowStorageKeys` | `(string \| RegExp)[]` | `[]` | Keys your site writes itself, exempt from the storage audit |
| `strictNetwork` | `boolean` | `false` | Fail the storage spec on any backend call the suite has not mocked. Turn it on once the suite is green so a new package endpoint surfaces as a named failure rather than a hang. |
| `skip` | `Partial<Record<SeamCheck, string>>` | | Checks to skip, each with a reason. Skipped checks are reported as skipped, not dropped. `SeamCheck` is `'routes' \| 'boot' \| 'storage' \| 'singleton'`. |

## Mocks and fixtures for your own specs

The pieces the suite is built from are exported so your site's own Playwright specs can boot the app the same way.

| Export | Description |
| --- | --- |
| `mockCoreApi(page, { apiBase, user?, products?, tokens? })` | Registers a mock for every backend endpoint the package touches while booting a page: profile, member record, token refresh, catalog, subscriptions, requests, pending surveys, unread counts and payment config. Pass `user: null` for a logged-out visitor. Call before `page.goto()`. |
| `failOnUnmockedApi(page, apiBase)` | Answers any other backend call with a 599 naming the URL |
| `seedAuth(page, storagePrefix, tokens)` | Puts a session in storage before the page loads |
| `seedCart(page, storagePrefix, items)` | Puts cart items in storage before the page loads |
| `storageKeys(page)` | Every localStorage key, sorted |
| `routeGlob(apiBase, endpoint)` | The glob Playwright matches a request against for an endpoint under your `apiBase` |
| `MOCK_USER`, `MOCK_ADMIN`, `MOCK_TOKENS`, `MOCK_PRODUCTS`, `MOCK_CART_ITEM` | Canned payloads. `MOCK_PRODUCTS` holds one subscription and one one-time product. |
| `CORE_STORAGE_SUFFIXES`, `CORE_STORAGE_SUFFIX_PATTERNS`, `coreStorageKey`, `coreStorageKeys`, `isCoreStorageKey`, `isUnprefixedCoreKey` | The storage-key contract the audit uses |

Types: `SiteSeamAdapter`, `SeamRoutes`, `SeamNav`, `SeamUser`, `SeamLoginForm`, `SeamCheck`, `SeamRunner`, `CoreMockOptions`, `MockTokens`, `CoreStorageSuffix`.

```ts
import { test, expect } from '@playwright/test';
import { mockCoreApi, seedAuth, MOCK_TOKENS, MOCK_USER } from '@apextelemed/partner-core/testing';

test('the cart drawer opens', async ({ page }) => {
  await mockCoreApi(page, { apiBase: '/api', user: MOCK_USER, tokens: MOCK_TOKENS });
  await seedAuth(page, 'acme', MOCK_TOKENS);
  await page.goto('/catalog');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByTestId('cart-drawer')).toBeVisible();
});
```

These mocks are only good enough to boot a page and exercise a seam. Anything that needs a truthful backend response belongs in a live test against a development tenant.

## The CI gate

A reusable GitHub Actions workflow lives in the SDK repository at `.github/workflows/site-seam-suite.yml`. It is available to sites in the Apex GitHub organisation and expects the SDK source to be checked out as a sibling of your site, which is how sites that link the package by path are laid out. It clones the SDK beside your checkout, installs both, builds the test kit, installs Chromium and runs your seam script, uploading the Playwright report on failure. Cloning the private repository needs a token that can read it.

```yaml
# .github/workflows/seam.yml
name: Core seam suite
on: [pull_request]
jobs:
  seam:
    uses: thefortifiedgrp/apex-partner-core/.github/workflows/site-seam-suite.yml@dev
    with:
      core-ref: dev          # SDK branch to test against (default dev)
      node-version: '22'     # default '22'
      seam-script: test:seam # npm script to run (default test:seam)
    secrets:
      core-token: ${{ secrets.APEX_CORE_TOKEN }}
```

A site that installs the package from npm does not need the sibling checkout. A plain workflow is enough:

```yaml
name: Core seam suite
on: [pull_request]
jobs:
  seam:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run test:seam
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: seam-report
          path: playwright-report/
```

Make the job a required check. A suite that needs secrets cannot be, which is the reason this one has none.
