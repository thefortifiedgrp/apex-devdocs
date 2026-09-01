---
title: API client and stores
description: The Tier 1 surface, the typed transport, error and idempotency model, every namespaced API module, and the four persistent stores.
sidebar:
  order: 3
---

Tier 1 is what every page sits on. Import it from `@apextelemed/partner-core/api` and `@apextelemed/partner-core/stores`. All of it requires `configure()` to have run first. See [Installation and configuration](/partner-sdk/installation/).

## Transport

### `apiFetch`

```ts
function apiFetch<T = unknown>(
  endpoint: string,
  options?: RequestInit & {
    skipAuth?: boolean;
    authToken?: string;
    idempotencyKey?: string;
  },
): Promise<T>;
```

`apiFetch` is the patient-track transport every namespaced module uses. Given an endpoint path such as `/users/me`, it:

- Prefixes `apiBase` from config and sets the `x-tenant-key` header.
- Sets `Content-Type: application/json` when the body is a string and no content type was given. Pass a `FormData` body for uploads and it is left alone.
- Attaches `Authorization: Bearer <accessToken>` from patient token storage, unless `skipAuth` is set. Passing `authToken` sends that token for this one call instead, without touching stored tokens or the refresh path; the admin "view as customer" preview uses this with a short-lived impersonation token.
- Attaches a reCAPTCHA v3 token as `X-Recaptcha-Token` on the auth and payment endpoints when the tenant has reCAPTCHA enabled. This is automatic: the backend tells the package whether reCAPTCHA is on and which site key to use, and the package loads Google's script only then. Sites write no reCAPTCHA code.
- Sends `Idempotency-Key` when you pass `idempotencyKey` and `idempotencyKeys` is enabled in config. With the flag off the key is dropped silently.
- On a 401, refreshes the access token once and retries. The refresh is single-flight per tab and takes a cross-tab Web Lock, because the backend rotates the refresh token on every use and revokes the whole family if a spent token is replayed. A tab that loses the race adopts the token a peer already stored. If the retry still gets a 401, the tokens are cleared and the stores drop the session. If the refresh itself fails on a network error or 5xx, the tokens are kept and a retryable `ApiError` without a status is thrown.
- Parses error bodies of the shape `{ error | message, details?: string[], code?: string }` into an `ApiError`. A 204 resolves to `undefined`.

### `ApiError`

```ts
class ApiError extends Error {
  readonly status?: number;
  readonly ambiguous: boolean;
  readonly code?: string;
}
```

`ambiguous` is true when the outcome of the request is unknown: the connection dropped mid-flight, or the server answered 5xx after it may already have committed. For any charge or create call, treat an ambiguous failure as "maybe it worked": reconcile against server state before offering a retry, and reuse the same idempotency key if you do retry. A non-ambiguous error (4xx, declined card, validation) means nothing happened and is safe to retry with a fresh key. The flow hooks implement this for you.

`code` carries the backend's machine-readable discriminator when one is sent, for example `SUBSCRIPTION_EXISTS`. Branch on `code`, never on the message text, which is tuned per tenant.

### Idempotency keys

`newIdempotencyKey()` returns a UUID v4. Keep one key per logical operation, persist it across retries of that operation, and mint a new one only for a genuinely new operation. These methods accept `{ idempotencyKey }` as a trailing options argument:

- `authApi.registerAndSubscribe`
- `apexApi.submitSurvey`, `apexApi.createRequest`
- `paymentsApi.checkout`, `paymentsApi.prescriptionCheckout`
- `subscriptionsApi.create`
- `messagesApi.sendMessage`
- `supportApi.createThread`, `supportApi.sendMessage`

:::caution
The header is only sent when `idempotencyKeys: true` is set in `configure()`, and the backend only deduplicates on routes where its idempotency middleware runs. At the time of writing that does not include the one-time cart charge (`paymentsApi.checkout`), so the cart checkout flow never auto-retries an ambiguous charge; it reconciles against the order history instead. Do the same if you call the endpoint yourself.
:::

### Token storage

Two independent token tracks exist: patients and affiliates. A 401 on one never disturbs the other.

| Helper | Track | Description |
| --- | --- | --- |
| `authStorageKey()` | patient | The localStorage key, `<storagePrefix>-auth` |
| `getTokens()`, `setTokens(t)`, `clearTokens()` | patient | Read, write and clear `AuthTokens { accessToken, refreshToken, userId }` |
| `affiliateAuthStorageKey()` | affiliate | `<storagePrefix>-affiliate-auth` |
| `getAffiliateTokens()`, `setAffiliateTokens(t)`, `clearAffiliateTokens()` | affiliate | Same for `AffiliateAuthTokens { accessToken, refreshToken, affiliateId }` |
| `onTokensCleared(track, cb)` | both | Subscribe to same-tab token wipes for `'patient'` or `'affiliate'` (`TokenTrackName`). Returns an unsubscribe function. The stores use this; site code rarely needs it. |

Prefer `authStore` and `affiliateAuthStore` over these helpers. The stores keep reactive state in sync with storage, including across tabs.

## API modules

Each module is a plain object of methods returning promises. Types named here are exported from `/api`.

| Module | Purpose | Main methods |
| --- | --- | --- |
| `authApi` | Patient accounts | `login`, `register`, `refresh`, `registerAndSubscribe`, `checkEmail`, `requestPasswordReset`, `resetPassword` |
| `usersApi` | The signed-in patient's profile | `getProfile`, `updateProfile` |
| `membersApi` | Member-facing prescription and renewal data | `getMe`, `getRequests`, `cancelRequest`, `getPendingSurveys`, `completeSurvey`, `getSurveyResponses`, `getSurveyResponse` |
| `apexApi` | Prescription requests and the deprecated v1 survey | `createRequest`, `getRequestStatus`, `listRequests`, `sendToPharmacy`, `getSurveyForDrug`, `getSurvey`, `getSurveyByType`, `getConfig`, `submitSurvey`, `checkQualification`, `selectDrug`, `getPreviousAnswers` |
| `addressesApi` | Server-side US deliverability check | `verify` |
| `paymentsApi` | Payment configuration and one-time charges | `getConfig`, `checkout`, `prescriptionCheckout`, `initiate`, `callback` |
| `subscriptionsApi` | Recurring memberships | `list`, `create`, `get`, `cancel`, `pause`, `resume`, `getPaymentMethod`, `updatePaymentMethod` |
| `messagesApi` | Clinical patient-to-prescriber conversations | `listConversations`, `getConversation`, `listMessages`, `sendMessage`, `markAsRead`, `uploadAttachment`, `getUnreadCount` |
| `supportApi` | Customer-to-support threads on the backend | `listThreads`, `getThread`, `createThread`, `sendMessage`, `markAsRead`, `uploadAttachment`, `getAttachmentUrl`, `getUnreadCount`, `getRealtimeToken` |
| `productsApi` | Public catalog | `list`, `categories` |
| `promoCodesApi` | Promo validation | `validate` |
| `ordersApi` | One-time orders | `create`, `list`, `get` |
| `adminApi` | Tenant admin portal | Dashboard stats, customers, payments and refunds, subscriptions, webhook events, email templates, products and Apex drug import, sales, promo codes, categories, support inbox, QuickBooks connect |
| `adminAffiliatesApi` | Admin side of the affiliate program | Affiliates CRUD and stats, programs CRUD, conversions, `runTransitions`, `markPaid` |
| `affiliatePortalApi` | Affiliate self-service (own token track) | `register`, `login`, `logout`, `requestPasswordReset`, `resetPassword`, `getProfile`, `getStats`, `listConversions`, `listClicks`, `getLinks`, `getPromoCodes`, `getDownline`, `track` |

Notes on behaviour that is easy to miss:

- `authApi.login`, `register`, `refresh` and `registerAndSubscribe` return `{ data: { user, accessToken, refreshToken, userId, subscriptionId? } }`. The `user` in that envelope carries only the id; call `usersApi.getProfile()` for the rest. `authStore` does this for you.
- `authApi.requestPasswordReset` and `affiliatePortalApi.requestPasswordReset` always succeed with generic copy, so a site cannot tell whether an account exists. Both take an absolute `redirectUrl` for your reset page; the backend appends `?token=...&email=...`.
- `paymentsApi.checkout`, `paymentsApi.prescriptionCheckout`, `subscriptionsApi.create` and `authApi.registerAndSubscribe` add `affiliateRef` from local storage automatically (see [Affiliate and promo capture](#affiliate-and-promo-capture)).
- `apexApi.createRequest` takes `CreateRequestPayload`. Always send `patientInfo` even though the type marks it optional; the backend rejects a request without it.
- `addressesApi.verify` fails open: the backend returns `status: 'unchecked'` when the verifier is unconfigured or unreachable.
- `supportApi.getRealtimeToken` answers 503 when the deployment has no realtime credentials. Treat that as "stay on polling", which is what `useMessagesThread` does.
- `affiliatePortalApi.track(refCode, landingPage?)` is a public GET that asks the backend to set its attribution cookie and record the click.
- `SUPPORT_ATTACHMENT_MIME_TYPES` and `SUPPORT_ATTACHMENT_MAX_BYTES` (10 MB) mirror the backend's allow-list so you can reject a file before uploading it.

### Apex v2 embed re-exports

The survey engine's embed client is re-exported so you can import its types from one place: `createEmbedApiClient`, `EmbedApiError` (also aliased as `ApexV2ApiError`), `qualifiedDrugIds`, `disqualifiedDrugIds`, `disqualificationReasonText`, and the types `EmbedApiClient`, `EmbedApiClientOptions`, `FetchLike`, `V2Question`, `V2QuestionOption`, `V2Step`, `V2Section`, `V2ComposedSurvey`, `V2DrugResult`, `V2QualificationResult`, `V2SubmitResult`, `V2Answer`, `V2VisibilityCondition`, `PatientInfo`, `EmbedEvent`, `EmbedEventType`. Their behaviour is documented under [Headless survey](/survey-helper/headless/) and the [survey v2 embed API](/api/survey-v2-embed/).

## Key exported types

| Group | Types |
| --- | --- |
| Auth and users | `AuthTokens`, `User`, `LoginPayload`, `RegisterPayload`, `RegisterAndSubscribePayload`, `UpdateProfilePayload`, `TokenTrackName` |
| Checkout and orders | `OrderItemInput`, `CheckoutAddress`, `CheckoutPayload`, `CheckoutResult`, `Order`, `CreateOrderPayload`, `PaymentInitiatePayload`, `PaymentCallbackPayload`, `AddressVerifyResult` |
| Subscriptions | `CreateSubscriptionPayload`, `UpdatePaymentMethodPayload` |
| Prescriptions and renewals | `CreateRequestPayload`, `SendToPharmacyPayload`, `MemberPrescriptionRequest`, `DeliveryInfo`, `RenewalStatus`, `PendingRenewalSurvey`, `CompleteSurveyPayload`, `MembersMeResponse`, `MemberSurveyMode`, `MemberSurveyResponseSummary`, `MemberSurveyTranscript`, `MemberSurveyTranscriptSection`, `MemberSurveyTranscriptItem` |
| Deprecated v1 survey | `SurveySubmitPayload`, `SelectDrugPayload` |
| Catalog and promos | `CatalogProduct`, `ProductSaleSummary`, `PublicCategory`, `PromoValidationResponse` |
| Messaging | `SendMessagePayload`, `SupportThread`, `SupportMessage`, `SupportAttachment`, `SupportThreadStatus`, `SupportRealtimeToken` |
| Generic | `ApiResponse<T>`, `PaginationParams`, `TemplateText`, `EmailTemplatesMap`, `Placeholder`, `TemplatePlaceholdersMap` |
| Admin | `AdminDashboardStats`, `AdminCustomer`, `AdminPayment`, `AdminSubscription`, `AdminWebhookEvent`, `AdminProduct`, `AdminCategory`, `AdminCategoryInput`, `AdminApexDrug`, `AdminListParams`, `AdminSale`, `AdminSaleInput`, `AdminPromoCode`, `AdminPromoCodeInput`, `DiscountType`, `AdminSupportStats`, `AdminSupportCustomer`, `AdminSupportThread` |
| Affiliates | `Affiliate`, `AffiliateProgram`, `AffiliateConversion`, `AffiliateStatus`, `CommissionStatus`, `AttributionMethod`, `PaymentType`, `AffiliatePaymentMethod`, `CommissionConfig`, `CustomerDiscountConfig`, `AffiliateEarningsBreakdown`, `CreateAffiliatePayload`, `UpdateAffiliatePayload`, `CreateAffiliateProgramPayload`, `UpdateAffiliateProgramPayload`, `AffiliateStatsResponse`, `AffiliateDownlineMember`, `AffiliateAuthTokens`, `AffiliateSession`, `AffiliateRegisterInput`, `AffiliateRegisterResponse`, `AffiliateDashboardProfile`, `AffiliateDashboardStats`, `AffiliateClickRecord`, `AffiliateDashboardLinks`, `AffiliateTrackResponse` |
| Funnel and cart capture | `FunnelConfig`, `FunnelDraftPayload`, `ResumedDraft`, `CartCaptureConfig`, `CartSnapshotLine`, `ResumedCart`, `ResumedCartLine` |

## Stores

All four stores are module singletons created inside a Solid root at import time. Each exposes reactive accessors (call them as functions inside JSX or effects) and plain action functions. `authStore` and `affiliateAuthStore` hydrate from storage as soon as `configure()` runs and converge on another tab's login or logout through the `storage` event.

### `authStore`

| Member | Kind | Description |
| --- | --- | --- |
| `tokens()` | state | `AuthTokens \| null` |
| `user()` | state | `User \| null`, populated by `fetchProfile()` |
| `isAuthenticated()` | state | True while tokens are held |
| `isAdmin()` | state | True when the fetched profile has the admin role |
| `loading()` | state | True during `login`, `signup` and `signupAndSubscribe` |
| `login(email, password)` | action | Logs in, stores tokens, fetches the profile |
| `signup(payload: RegisterPayload)` | action | Registers, stores tokens, fetches the profile. No charge. |
| `signupAndSubscribe(payload, opts?)` | action | Registers, charges the first membership payment and starts the subscription in one call. Accepts `{ idempotencyKey }`. Resolves with the auth envelope. |
| `logout()` | action | Clears tokens, the session, the cart and the applied promo (shared-browser hygiene) |
| `fetchProfile()` | action | Re-reads `/users/me`. Only a definitive 401 or 403 ends the session; a transient failure leaves it intact. |

### `affiliateAuthStore`

| Member | Kind | Description |
| --- | --- | --- |
| `tokens()`, `affiliate()`, `isAuthenticated()`, `loading()` | state | As above, for the affiliate track; `affiliate()` is the `Affiliate` record |
| `isHydrated()` | state | True once the stored session has been checked against the backend. The affiliate portal's auth adapter reads this to avoid bouncing a real affiliate during a refresh. |
| `login(email, password)` | action | Logs in and fetches the profile |
| `register(input: AffiliateRegisterInput)` | action | Registers. New affiliates start pending admin approval and are not logged in. |
| `logout()` | action | Calls the backend logout, then clears the session |
| `fetchProfile()` | action | Re-reads the affiliate profile |

### `cartStore`

Persisted to `<prefix>-cart` and `<prefix>-cart-promo`.

| Member | Kind | Description |
| --- | --- | --- |
| `items()` | state | `CartItem[]` |
| `appliedPromo()` | state | `AppliedPromoCode \| null` |
| `isOpen()` | state | Drawer open flag for site chrome |
| `count()`, `subtotalCents()` | derived | Line count and quantity-weighted subtotal |
| `hasGlp1()`, `isMultiItem()` | derived | Category and size checks some funnels branch on |
| `itemKey(productId, dosage)` | helper | The key used by `remove` and `setQuantity` |
| `add(item)` | action | Adds at quantity 1. Ignores an item whose product and dosage are already present. |
| `remove(key)`, `setQuantity(key, n)` | action | Remove a line, or set its quantity (floored, minimum 1) |
| `clear()` | action | Empties the items but keeps the applied promo, so a code entered before the survey still applies at checkout |
| `setPromo(promo \| null)` | action | Apply or remove a validated promo |
| `open()`, `close()`, `toggle()` | action | Drawer state |

`CartItem` carries `productId`, `productName`, `dosage`, `quantity`, `priceCents`, `drugId`, `categories` and optional `apexDrugId`, `thumbnailUrl`, `hideDoseLabel`, `isSubscription`, `requestedSku`, `requestedSkuId` and `requestedClinicalDose`. `apexDrugId` is what lets `SurveyV2Page` drop a cart line the survey disqualified, so copy it from the catalog product when you add items yourself. `useProductDetail().addToCart()` does this for you.

### `medicationStore`

In-memory only. Holds one `MedicationSelection { drugId: string | null; drugName: string }` via `selected()`, `select(selection)` and `clear()`. A null `drugId` means a general consultation. It feeds the deprecated v1 survey and is the last fallback for `SurveyV2Page`'s drug intent.

## Affiliate and promo capture

| Function | Description |
| --- | --- |
| `captureAffiliateRef(code)` | Store a referral code from a `?ref=` landing in `<prefix>-affiliate-ref` with a 30-day TTL |
| `readAffiliateRef()` | The stored code, or `null` when absent or expired |
| `clearAffiliateRef()` | Drop it |
| `capturePromoCode(code)`, `readPromoCode()`, `clearPromoCode()` | The same for a `?promo=` landing, in `<prefix>-promo-code` |

The referral code is sent explicitly as `affiliateRef` on `registerAndSubscribe`, `checkout`, `prescriptionCheckout` and `subscriptions.create`. The backend prefers it over its own cookie and still validates it server-side. A stored promo code only prefills an input; the member still applies it and the backend re-validates.

## Funnel and cart capture transport

These are the raw calls behind abandoned-survey and abandoned-cart recovery. They are exported for completeness; sites should use the wrappers in `/flows` (`startCartCapture`, `restoreCartFromLink`, `redeemResumeLink`) rather than calling these directly. Everything here is fire-and-forget and fails silently, because marketing instrumentation must never break the survey or the cart.

| Function | Description |
| --- | --- |
| `fetchFunnelConfig()` | The tenant's funnel-capture posture (`telemetry`, `emailGate`, `emailGateRequired`), fetched once and cached. Fails closed. |
| `funnelSessionId()` | Stable survey session id in sessionStorage, minted on first read |
| `peekFunnelSessionId()` | The same id without minting one |
| `adoptFunnelSessionId(id)` | Continue the session a recovery email points at |
| `postFunnelEvent(type, data?)` | Fire-and-forget event post with `keepalive` |
| `saveFunnelDraft(draft)` | Save in-progress answers to Apex through the backend; resolves to the draft id or `null`. Needs `apexEmbedApiBase`. |
| `fetchResumedDraft(token)` | Exchange a `?resume=` token for the saved answers, or `null` |
| `readResumeToken()`, `stripResumeToken()` | Read and remove the `?resume=` query parameter |
| `fetchCartConfig()` | Whether the tenant mirrors carts. Fails closed. |
| `cartId()`, `adoptCartId(id)`, `resetCartId()` | Stable cart id in localStorage, adoption from a recovery link, and reset after a purchase |
| `postCartSnapshot({ items, promoCode?, email? })` | Mirror the cart server-side (identity only; the backend re-prices) |
| `fetchResumedCart(token)` | Exchange a `?cart=` token for the saved, re-priced cart, or `null` |
| `readCartToken()`, `stripCartToken()` | Read and remove the `?cart=` query parameter |
| `resetFunnelConfigCache()`, `resetCartConfigCache()` | Test seams that forget the cached config |
