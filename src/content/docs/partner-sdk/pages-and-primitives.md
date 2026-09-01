---
title: Pages and primitives
description: The Tier 3 surface, the Primitives contract your site implements, every themed page and portal with its props, and the AddressFields component.
sidebar:
  order: 5
---

Tier 3 components render a flow's structure and leave the look to you. Customer-facing pages draw their form fields, buttons and cards from the `Primitives` you provide through context. The admin, member and affiliate portals are themed with CSS variables instead and take small adapter objects for auth and routing. Import pages from `@apextelemed/partner-core/pages` and the primitives contract from `@apextelemed/partner-core/primitives`.

## The `Primitives` contract

`Primitives` is a fixed set of twelve Solid components. Every customer-facing page is written against exactly these props, so each prop is a contract every site must meet. Implement all twelve, or spread `defaultPrimitives` and override the ones you care about.

```tsx
import { PrimitivesProvider, type Primitives } from '@apextelemed/partner-core/primitives';
import { defaultPrimitives } from '@apextelemed/partner-core/primitives/default';
import { Button, Card, TextField } from './components';

const sitePrimitives: Primitives = {
  ...defaultPrimitives,
  Button,
  Card,
  TextField,
};

render(() => (
  <PrimitivesProvider value={sitePrimitives}>
    <App />
  </PrimitivesProvider>
), root);
```

`usePrimitives()` returns the current set and throws when called outside a provider. Package pages call it; your own components can too.

`defaultPrimitives` (from `/primitives/default`) is a complete implementation with class names only. Import `@apextelemed/partner-core/theme/flow.css` once at boot and brand it through the `--app-flow-*` variables. See [Theming](/partner-sdk/theming/#flowcss).

### Component props

**`Button`** (`ButtonProps`)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` | Visual emphasis |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | |
| `type` | `'button' \| 'submit'` | `'button'` | |
| `disabled` | `boolean` | | |
| `loading` | `boolean` | | Show a busy state and block clicks |
| `fullWidth` | `boolean` | | |
| `onClick` | `(e: MouseEvent) => void` | | |
| `children` | `JSX.Element` | required | |

**`TextField`** (`TextFieldProps`)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string` | required | Controlled value |
| `onInput` | `(v: string) => void` | required | Called with the new string |
| `type` | `'text' \| 'email' \| 'password' \| 'tel' \| 'date' \| 'number'` | `'text'` | |
| `label`, `placeholder`, `error` | `string` | | Label, placeholder and inline error text |
| `required`, `disabled` | `boolean` | | |
| `autocomplete` | `string` | | Passed through to the input |
| `inputmode` | `'text' \| 'numeric' \| 'tel' \| 'email' \| 'decimal'` | | |

**`Textarea`** (`TextareaProps`): `value`, `onInput`, `label`, `placeholder`, `rows`, `error`, `required`.

**`Select`** (`SelectProps`): `value`, `onChange(v)`, `options: SelectOption[]` (`{ value, label }`), `label`, `placeholder`, `error`, `required`, `disabled`.

**`RadioGroup`** (`RadioGroupProps`): `value`, `onChange(v)`, `options: ChoiceOption[]` (`{ value, label, description? }`), `label`, `error`.

**`CheckboxGroup`** (`CheckboxGroupProps`): `values: string[]`, `onChange(vs)`, `options: ChoiceOption[]`, `label`, `error`.

**`Card`** (`CardProps`)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `JSX.Element` | required | |
| `variant` | `'primary' \| 'inset'` | `'primary'` | `primary` is the page-level container, `inset` is nested content |
| `padding` | `'sm' \| 'md' \| 'lg' \| 'none'` | | |
| `class` | `string` | | Extra class names |

**`Banner`** (`BannerProps`): `variant: 'error' | 'success' | 'warning' | 'info'` and `children`.

**`StatusPill`** (`StatusPillProps`): `status: Status` where `Status` is `'active' | 'pending' | 'processing' | 'completed' | 'approved' | 'denied' | 'paused' | 'cancelled' | 'new'`, plus an optional `label` override.

**`Spinner`** (`SpinnerProps`): `size?: 'sm' | 'md' | 'lg'`.

**`Heading`** (`HeadingProps`): `level: 1 | 2 | 3`, `children`, `class?`.

**`StepIndicator`** (`StepIndicatorProps`): `current: number`, `total: number`, `labels?: string[]`.

All prop types are exported by name, along with `ButtonVariant`, `ButtonSize`, `BannerVariant`, `SelectOption`, `ChoiceOption` and `Status`.

:::tip
Resist adding props to your implementations that the package pages do not pass. They will never be exercised, and the temptation to fork a package page to pass them is how sites drift away from the shared logic. If a page genuinely needs a variant, that is a change to the package's contract.
:::

## Customer pages

These pages render through `Primitives` and report navigation through callbacks. They never navigate for you.

### `SurveyV2Page`

The current survey page over `useSurveyV2Flow`. It accepts every option of that hook (`drugIds`, `templateId`, `mode`, `token`, `skipPatientInfoWhenComplete`, `knownPatientInfo`, `requiredPatientInfoFields`, `draftTtlMs`, `onEvent`, `onError`) plus:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `onComplete` | `(result: V2SubmitResult, patientInfo: PatientInfo) => void` | | Fires after the result screen and after any prescriber requests were created. `patientInfo` is the identity the engine collected, so a survey-first site can hand it to `useSubscriptionIntakeFlow` without asking again. |
| `onLoadFailed` | `(error: string) => void` | | The survey could not load |
| `onDisqualified` | `(drugResults: V2DrugResult[]) => void` | | Fires once when the answers disqualify every drug. The page still shows its own "not eligible" screen; use `disqualificationReasonText` to read the reason. |
| `onRequestFailed` | `(error: Error) => void` | | Creating a prescriber request from the cart failed. `onComplete` does not fire in that case; the page shows an error with a retry. |
| `onNoDrugIntent` | `() => void` | | The fallback panel's CTA was clicked because no drug intent could be resolved. Route to your catalog. |
| `noDrugIntentLabel` | `string` | `'Browse medications'` | Label for that CTA |
| `completionCtaLabel` | `string` | | When set, the completion screen shows a primary button with this label |
| `onCompletionCta` | `() => void` | | Its click handler. Use this to move on after the member has seen the per-drug eligibility summary rather than redirecting from `onComplete`. |

Behaviour worth knowing:

- **Drug intent** is resolved in this order: `token`, then `drugIds`, then cart items that carry a `drugId`, then `medicationStore`. With nothing to compose against the page renders the no-intent panel instead of the engine.
- **Email gate.** For an anonymous guest on a tenant with the funnel email gate enabled, the page asks for an email before the questions (skippable unless the tenant made it required, shown once per device, never for signed-in members or resume links).
- **Signed-in members** have their profile mapped into the patient-info step, and identity answered inside the questionnaire is mirrored into patient info and not asked twice.
- **After submission**, if the cart holds items, the page creates one prescriber request per eligible cart line, dropping lines the survey disqualified (matched by the item's `apexDrugId`). Each request carries the v2 response id, the applied promo and the patient info. Lines leave the cart as their request lands, so a retry only re-sends what failed. An empty cart creates nothing, which is the survey-first case.
- State dropdowns respect both the tenant's `unavailableStates` and the `excludedStates` the composed survey carries.
- Mid-survey prescription photo questions upload the file out of band and store only the returned photo id in the answer.

```tsx
import { SurveyV2Page } from '@apextelemed/partner-core/pages';

<SurveyV2Page
  drugIds={catalog.map((p) => p.apex_drug_id).filter(Boolean)}
  completionCtaLabel="Go to my dashboard"
  onCompletionCta={() => navigate('/dashboard')}
  onNoDrugIntent={() => navigate('/catalog')}
  onRequestFailed={(e) => reportError(e)}
/>
```

### `SurveyPage` (deprecated)

The v1 page over `useSurveyFlow`. It needs a medication in the cart or `medicationStore` before it can load. Props: `onNeedsMedicationSelection`, `onComplete`, `completionRedirectDelayMs` (default 3000 ms on the completion screen before `onComplete` fires). Use `SurveyV2Page` for new work.

### `CheckoutPage`

Prescription purchase over `useCheckoutFlow`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `requestId` | `string` | profile fallback | The request to check out |
| `drugId` | `string` | | One drug of a multi-drug request |
| `paymentMode` | `'on_approval' \| 'upfront'` | `'on_approval'` | `upfront` shows the card form on a pending request (pay before review) |
| `onStartSurvey` | `() => void` | | "Start questionnaire" on the no-prescription and denied screens |
| `onContactProvider` | `() => void` | | "Message provider" on the denial and success screens |
| `onComplete` | `() => void` | | "Back to dashboard" and the success screen |

### `CartCheckoutPage`

One-time cart checkout over `useCartCheckoutFlow`. Requires a signed-in member.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | `'Checkout'` | |
| `subtitle` | `string` | `'Review your order and pay'` | |
| `onNeedsAuth` | `() => void` | | No session. Route to `RegisterPage` or login and back. |
| `onNeedsCart` | `() => void` | | Nothing one-time-purchasable in the cart |
| `onComplete` | `(info: { orderId?: string; amountCents?: number }) => void` | | The success screen's CTA. Not fired automatically, so the member sees the confirmation first. |

### `SignupPage`

Four-step membership signup over `useSignupFlow`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `membershipAmountCents` | `number` | required | |
| `membershipIntervalDays` | `number` | `30` | |
| `membershipProductLabel` | `string` | `'Membership'` | Used when the cart is empty |
| `title` | `string` | `'Sign Up'` | |
| `subtitle` | `string` | derived from the amount | |
| `onComplete` | `() => void` | | After a successful signup |
| `loginHref` | `string` | `'/login'` | Footer link |
| `paymentBanner` | `() => JSX.Element` | | Rendered above the Payment step, for example an affiliate-referral confirmation |
| `promoField` | `(state: { value: string; onInput: (v: string) => void; disabled: boolean }) => JSX.Element` | | Render prop for a promo input below the card fields. The flow owns the value. |

### `RegisterPage`

Three-step account creation with no card or subscription, over `useRegisterFlow`. Props: `title` (default `'Create Your Account'`), `subtitle`, `onComplete`, `onAlreadyAuthenticated`, `loginHref` (default `'/login'`).

### `SubscribePage`

Membership start for a signed-in member with a cart, over `useSubscribeFlow`. Props: `membershipAmountCents` (required), `membershipIntervalDays` (default 30), `title` (default `'Start Your Membership'`), `subtitle`, and the callbacks `onNeedsAuth`, `onNeedsCart`, `onAlreadySubscribed`, `onComplete`.

### `UpdatePaymentMethod`

Card-on-file update over `useUpdatePaymentMethodFlow`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `subscriptionId` | `string` | the member's primary live subscription | |
| `onDone` | `() => void` | required | After a successful update |
| `onCancel` | `() => void` | required | The member backed out |
| `heading` | `string` | `'Update payment method'` | |

### `ForgotPasswordPage` and `ResetPasswordPage`

Self-serve password reset for patients. `ForgotPasswordPage` takes `redirectUrl` (required, the absolute URL of your reset page; the backend appends `?token=...&email=...` to it) and `onDone`. It always shows generic success copy. `ResetPasswordPage` takes `token` and `email` (both default to the query parameters of the current URL) and `onSuccess`.

These two pages are styled with the `--app-affiliate-*` variables and need `theme/affiliate.css` imported, not `flow.css`.

## Portals

Portals are themed by CSS variables and take adapter objects. Wrap each one in a small site component that builds the adapter from `authStore` or `affiliateAuthStore`, maps tabs to routes, and passes `topOffset` so the fixed-height shell sits below your header.

### `AdminDashboard`

Tenant back office with a sidebar of tabs: dashboard, customers, payments, subscriptions, products, categories, sales, promo-codes, affiliates, support, webhooks, email-templates and funnel (the `AdminTab` union). Import `theme/admin.css`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `activeTab` | `AdminTab` | | Controlled tab. Omit to let the component manage it. |
| `onTabChange` | `(tab: AdminTab) => void` | | Sync the URL or analytics |
| `defaultTab` | `AdminTab` | the first visible tab | Initial tab when uncontrolled |
| `topOffset` | `string` | `'0px'` | Height of your fixed header. The shell is `calc(100vh - topOffset)` tall and scrolls its main pane independently. |
| `tabIcons` | `Partial<Record<AdminTab, string>>` | | Icon class name per tab, rendered as `<span class={...} />` |
| `enabledTabs` | `AdminTab[]` | all | Whitelist. Groups whose tabs are all hidden lose their header too. |
| `topTabs` | `AdminTab[]` | `['dashboard']` | Ungrouped tabs at the top of the sidebar |
| `tabGroups` | `AdminTabGroup[]` | Customer Management, Catalog, Marketing, Configuration, Integrations | Labelled groups (`{ label, tabs }`) |
| `affiliates` | `AffiliatesProps` | | Controlled sub-tab for the Affiliates tab: `activeSubTab?: AffiliateSubTab` (`'overview' \| 'people' \| 'conversions' \| 'payouts' \| 'programs'`) and `onSubTabChange` |
| `productDefaultsLookup` | `(product: AdminProduct) => Partial<AdminProduct> \| null` | | Enables a "Reset to defaults" button in the product editor when it returns a partial |
| `toast` | `AdminToast` | `alert()` on error, silent on success | `{ success(message), error(message) }` for non-blocking notifications |
| `passwordResetRedirectUrl` | `string` | | Absolute URL of your reset page. Enables "Send password reset" in the customer detail panel. |
| `auth` | `AdminAuthAdapter` | none | Gate the dashboard. Without it no gating is applied and your route must guard. |

`AdminAuthAdapter`:

| Member | Type | Description |
| --- | --- | --- |
| `isAuthenticated` | `() => boolean` | Is there a session |
| `isHydrated` | `() => boolean` | Has the profile loaded. The gate shows a spinner until then, so a real admin refreshing the page is not bounced. |
| `isAdmin` | `() => boolean` | Once hydrated, is the user an admin |
| `onUnauthenticated` | `() => void` | Fired with no session |
| `onForbidden` | `() => void` | Fired when the hydrated user is not an admin |

```tsx
import { AdminDashboard, type AdminAuthAdapter, type AdminTab } from '@apextelemed/partner-core/pages';
import { authStore } from '@apextelemed/partner-core/stores';
import '@apextelemed/partner-core/theme/admin.css';
import './theme/admin-theme.css';

const PATH_TO_TAB: Record<string, AdminTab> = { '/admin': 'dashboard', '/admin/customers': 'customers' };
const TAB_TO_PATH = Object.fromEntries(Object.entries(PATH_TO_TAB).map(([p, t]) => [t, p]));

export function Admin() {
  const auth: AdminAuthAdapter = {
    isAuthenticated: authStore.isAuthenticated,
    isHydrated: () => authStore.user() !== null,
    isAdmin: authStore.isAdmin,
    onUnauthenticated: () => navigate('/login'),
    onForbidden: () => navigate('/dashboard'),
  };
  return (
    <AdminDashboard
      auth={auth}
      activeTab={PATH_TO_TAB[location.pathname] ?? 'dashboard'}
      onTabChange={(tab) => navigate(TAB_TO_PATH[tab] ?? '/admin')}
      topOffset="64px"
      passwordResetRedirectUrl={`${window.location.origin}/reset-password`}
    />
  );
}
```

Each tab is wrapped in its own error boundary, so a failure in one tab shows a retry panel instead of taking the shell down.

Two admin pieces are also exported standalone: `EmailTemplates` (the email-templates editor, no props) and `PatientDashboardPreview`, the read-only "view as customer" screen with props `token` (a 15-minute impersonation token from `adminApi.impersonateCustomer`), `customerName` and `onClose`. Both use the admin stylesheet.

### `MemberPortal`

The patient's home: an order tracker, optional medication guide, plan and billing, optional survey history, account, and messages. Built on `useMemberPortalData` and `useMessagesThread`. Import `theme/member-portal.css`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `brand` | `MemberPortalBrand` | required | `{ name, logoSrc?, homeHref, catalogHref? }`. `catalogHref` is the "back to shop" target and falls back to `homeHref`; pass `null` to drop the back link entirely for a site with no catalog. |
| `routes` | `MemberPortalRoutes` | required | `{ intake, renew: (renewalId) => string, paymentMethod }` |
| `auth` | `MemberAuthAdapter` | required | `{ isAuthenticated, isHydrated?, onSignOut }` |
| `guides` | `MedicationGuideResolver` | | `(medicationName) => MedicationGuideContent \| null`. Omit, or return `null`, to hide the Guide tab. |
| `legalLinks` | `LegalLink[]` | | `{ label, href }` footer links on the Account tab |
| `topOffset` | `number` | | Fixed-header offset in pixels |
| `surveyHistory` | `boolean` | `false` | Show the History tab listing the member's submitted surveys. Off by default because it exposes a new patient-facing data surface. |

Tabs appear when the data supports them: Plan only with a subscription, Guide only with resolvable content. The active tab lives in the URL hash, and a `?c=<conversationId>` query opens Messages on that conversation, which is how notification emails deep-link. Tab icons are Phosphor Icons class names (`ph-thin ph-...`); include that icon stylesheet in your page if you want the icons to render. The labels render regardless.

`MedicationGuideContent` is the shape of a reviewed leaflet: `title`, `summary`, `boxedWarning`, `doNotUseIf`, `titration`, `injectionSteps`, `storage`, `missedDose`, `contraception?`, `sideEffectsCommon`, `sideEffectsSerious`, `whenToCall`, `tips`, `disclaimers`. The package renders it and ships no copy.

### `AffiliatePortal`

Self-service portal for affiliates, on the affiliate token track. Tabs: overview, conversions, downline, referral, settings (`AffiliatePortalTab`). Import `theme/affiliate.css`.

Props: `activeTab`, `onTabChange`, `defaultTab`, `topOffset` (string, default `'0px'`), `tabIcons`, `enabledTabs`, and `auth: AffiliateAuthAdapter` (`{ isAuthenticated, isHydrated, onUnauthenticated? }`). Build the adapter from `affiliateAuthStore`, whose `isHydrated()` exists for this purpose.

### Affiliate account pages

All four use the affiliate stylesheet.

| Page | Props |
| --- | --- |
| `AffiliateRegister` | `onSuccess?(affiliateEmail)`, `onNavigateLogin?`. New affiliates start pending admin approval; route to a "pending" screen. |
| `AffiliateLogin` | `onSuccess?`, `onNavigateRegister?`, `onNavigateForgotPassword?` |
| `AffiliateForgotPassword` | `redirectUrl` (required, your affiliate reset page), `onNavigateLogin?` |
| `AffiliateResetPassword` | `token?`, `email?` (default to the query parameters), `onSuccess?` |

## `AddressFields`

A presentational shipping-plus-billing form driven by an `AddressPair`, exported from the package root. It renders through your `Primitives`, runs the deliverability check when focus leaves the shipping group, and shows the "did you mean" suggestion with a button that adopts it.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `address` | `AddressPair` | required | From `useAddressPair` or a flow's `address` member |
| `shippingHeading` | `string` | `'Shipping address'` | |
| `billingHeading` | `string` | `'Billing address'` | |
| `disabled` | `boolean` | | |
| `billingOnly` | `boolean` | | Render a single address with no "same as" checkbox and no deliverability check, for screens that collect a billing address alone. The pair's primary slot holds the values; pass a billing heading. |
| `parts` | `'all' \| 'shipping' \| 'billing'` | `'all'` | Render one half, for checkouts that put billing beside the card entry on a later step. Both halves drive the same pair. Do not combine with `billingOnly`. |

```tsx
import { AddressFields } from '@apextelemed/partner-core';

<AddressFields address={flow.address} parts="shipping" />
```
