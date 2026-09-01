---
title: Flow hooks
description: The Tier 2 headless hooks, their options, returned state and actions, outcomes, and the pure helpers that ship beside them.
sidebar:
  order: 4
---

Flow hooks live in `@apextelemed/partner-core/flows`. Each one owns the logic of a page (loading, validation, submission, retries, persistence) and returns a flat object of reactive accessors and action functions with no markup. The Tier 3 pages are thin renderers over these same hooks, so a site that needs its own layout loses nothing by dropping down a tier.

Conventions that hold across every hook:

- **Accessors are functions.** Read `flow.step()` or `flow.outcome()` inside JSX or an effect for reactivity.
- **`outcome()`** is a discriminated union on `kind`. Switch on it for the page's top-level state.
- **Navigation is yours.** Hooks never redirect. Outcomes such as `needs_auth` or callbacks such as `onComplete` tell you when to.
- **Card data never reaches the backend.** Flows that take a card tokenize it in the browser with the tenant's payment provider (Authorize.Net Accept.js or QuickBooks) and send only the opaque token. `tokenizerReady()` gates submission and `tokenizerError()` reports a failed setup. The older aliases `acceptJsReady`, `acceptJsLoaded` and `acceptJsError` still exist on those flows but are deprecated.
- **Ambiguous failures reconcile.** A charge or create whose response was lost is checked against the server before you are allowed to retry, and retries reuse the same idempotency key. See [ApiError](/partner-sdk/api-client-and-stores/#apierror).

The examples on this page omit the Solid imports (`Show`, `Switch`, `Match`, `For`, `createSignal`, `createEffect`, `onMount`) and use a `navigate` function from your router.

## Survey

### `useSurveyV2Flow(options)`

The current survey. It wraps the Solid adapter from `@apextelemed/survey-solid`, injecting the connection details from `configure()` (`apexEmbedApiBase`, `apexPublishableKey`, `tenantKey`) and composing two things on top: funnel telemetry, which forwards engine events to the backend when the tenant enabled it, and a cross-device draft store, which mirrors answers to Apex (through the backend) so a recovery-email link can resume the survey on another device. Both are tenant-gated and silent otherwise. The hook throws immediately if `apexEmbedApiBase` is not configured.

The engine is built once from the options passed on the first run. Re-create the owning component to start a fresh survey.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `drugIds` | `string[]` | none | Drug ids to compose the questionnaire for. Pass your catalog products' `apex_drug_id` values. |
| `templateId` | `string` | none | Compose from a named survey template instead. |
| `mode` | `'initial' \| 'refill'` | `'initial'` | Intake or renewal check-in. |
| `token` | `string` | none | Returning-member token. Overrides `drugIds`, `templateId` and `mode`. |
| `skipPatientInfoWhenComplete` | `boolean` | `false` | Auto-submit at the end of the questions when the known identity is already complete, skipping the patient-info step. Pair with `knownPatientInfo`. |
| `knownPatientInfo` | `Partial<PatientInfo>` | none | Identity of a returning member, resolved before the hook runs. Prefills the patient-info step. |
| `requiredPatientInfoFields` | `Array<keyof PatientInfo>` | first name, last name, email, dob, state | Fields that must be present for the skip to fire. |
| `draftTtlMs` | `number` | 24 hours | Local draft lifetime. |
| `onEvent` | `(e: EmbedEvent) => void` | none | Engine lifecycle events. |
| `onError` | `(error: Error) => void` | none | Load and submit failures. |

Returned `SurveyV2Flow`:

| Member | Kind | Description |
| --- | --- | --- |
| `state` | state | The raw engine state as a Solid store: `phase`, `composed`, `flatSteps`, `stepIndex`, `answers`, `patientInfo`, `qualification`, `result`, `disqualifiedResult`, `validationError`, `busy`, `error` |
| `outcome()` | derived | `loading`, `load_failed { error }`, `questions`, `patient_info`, `submitting`, `disqualified { drugResults }`, `complete { result }` |
| `flatSteps()`, `stepIndex()`, `totalSteps()`, `currentStep()` | derived | Step navigation |
| `visibleQuestions()` | derived | Questions on the current step after visibility rules |
| `answers()`, `patientInfo()` | state | Current answers and identity |
| `submitting()`, `validationError()` | state | Inline state for the active step |
| `setAnswer(questionId, value)`, `setPatientInfo(patch)` | action | Update answers or identity |
| `next()`, `back()`, `submit()`, `restart()` | action | Navigation and submission |
| `engine` | | The underlying engine, for advanced use |

```tsx
import { useSurveyV2Flow } from '@apextelemed/partner-core/flows';
import { qualifiedDrugIds } from '@apextelemed/partner-core/api';

function Intake(props: { drugIds: string[] }) {
  const flow = useSurveyV2Flow({
    drugIds: props.drugIds,
    onError: (e) => console.error(e),
  });

  return (
    <Switch>
      <Match when={flow.outcome().kind === 'loading'}>Loading...</Match>
      <Match when={flow.outcome().kind === 'questions'}>
        <For each={flow.visibleQuestions()}>
          {(q) => <QuestionField question={q} value={flow.answers()[q.questionId]} onChange={(v) => flow.setAnswer(q.questionId, v)} />}
        </For>
        <button onClick={() => flow.back()} disabled={flow.stepIndex() === 0}>Back</button>
        <button onClick={() => flow.next()} disabled={flow.submitting()}>Next</button>
        <p>{flow.validationError()}</p>
      </Match>
      <Match when={flow.outcome().kind === 'patient_info'}>
        <PatientInfoForm value={flow.patientInfo()} onChange={flow.setPatientInfo} onSubmit={flow.submit} />
      </Match>
      <Match when={flow.outcome().kind === 'complete'}>
        <p>Eligible for {qualifiedDrugIds(flow.state.result!).length} medication(s).</p>
      </Match>
    </Switch>
  );
}
```

The hook forwards `drugIds` exactly as given. `SurveyV2Page` adds a fallback chain (token, then `drugIds`, then cart items, then `medicationStore`) and creates the prescriber requests after submission; a Tier 2 consumer does those itself. For the engine's own documentation see [Solid](/survey-helper/solid/) and [Headless survey](/survey-helper/headless/).

### `useSurveyFlow(options)` (deprecated)

The v1 survey. It cannot compose until a medication has been chosen: it resolves its target from the cart or `medicationStore`, and otherwise reports `needs_medication_selection`. New sites should not use it; it remains for sites that have not migrated. It has no `@deprecated` marker in the type definitions yet, so nothing in your editor will warn you.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `completionRedirectDelayMs` | `number` | `3000` | Accepted for compatibility; the hook itself does not use it. `SurveyPage` applies it. |

Outcomes: `loading`, `needs_medication_selection`, `load_failed { error }`, `in_progress`, `disqualified { reason }`, `drug_selection { drugs }`, `completed`. The returned `SurveyFlow` exposes `surveyTitle()`, `totalSteps()`, `currentStep()`, `step()`, `visibleQuestions()`, `answers()`, `setAnswer()`, `validationError()`, `submitting()`, `next()`, `back()`, `isLastStep()`, `selectedDrugId()`, `setSelectedDrugId()` and `confirmDrugSelection()`. Answers persist in sessionStorage for 24 hours. The helper `isQuestionVisible(question, answers)` evaluates v1 visibility conditions, and the types `SurveyQuestion`, `SurveyOption`, `FlatStep`, `AnswerValue`, `DrugResult`, `VisibilityCondition`, `SurveyOutcome` and `UseSurveyFlowOptions` are exported.

## Checkout and orders

### `useCheckoutFlow(options?)`

Prescription purchase. Loads the member's profile, whether a chargeable card is on file, and the status and locked price of one prescription request, then charges it through `paymentsApi.prescriptionCheckout`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `requestId` | `string` | the profile's legacy `apex_request_id` | The prescription request to check out. Usually read from a query parameter. |
| `drugId` | `string` | none | One drug within a multi-drug request. The backend then reports that line's status and price, so an approved item of a partially-approved request is purchasable alone. |
| `allowPendingPurchase` | `boolean` | `false` | Pay-before-review: show the card form on a `pending` request. The backend still holds fulfilment until a prescriber approves. |

Outcomes: `loading`, `load_failed { error }`, `no_prescription`, `pending_review { prescription }`, `denied { prescription }`, `awaiting_purchase { prescription }`, `completed`. A request that is already paid resolves to `completed` (approved) or `pending_review` (pending) rather than showing the card form again.

Returned `CheckoutFlow`:

| Member | Kind | Description |
| --- | --- | --- |
| `outcome()`, `profile()` | state | Page state and the loaded `User` |
| `address` | state | An `AddressPair` prefilled from the profile. Render it with `AddressFields`. |
| `pricing()` | derived | `PricingBreakdown { baseMedicationCents, promoDiscountCents, finalMedicationCents, promoCode? }`, from the locked snapshot on the request, falling back to the cart's applied promo |
| `hasPaymentMethod()` | state | True when an active or paused subscription holds a chargeable card, in which case no card form is needed |
| `tokenizerReady()`, `tokenizerError()` | state | Card tokenizer status |
| `cardNumber()`, `expiry()`, `cvv()` and setters | state | Formatted card fields |
| `paymentError()`, `processing()`, `canSubmit()` | state | Inline state |
| `submit()` | action | Validate addresses, verify deliverability, tokenize if needed, charge |

Deliverability is checked server-side before charging. An `undeliverable` result blocks; a `corrected` result stops the first submit so the customer can accept the suggested address (or press pay again to keep their own). A 409 from the backend is reconciled against the request's paid state, so a stale tab whose payment already landed shows success rather than an error.

```tsx
import { useCheckoutFlow } from '@apextelemed/partner-core/flows';
import { AddressFields } from '@apextelemed/partner-core';

function RxCheckout(props: { requestId: string }) {
  const flow = useCheckoutFlow({ requestId: props.requestId });
  const dollars = (c: number) => (c / 100).toFixed(2);

  return (
    <Switch>
      <Match when={flow.outcome().kind === 'pending_review'}>A prescriber is reviewing your request.</Match>
      <Match when={flow.outcome().kind === 'awaiting_purchase'}>
        <AddressFields address={flow.address} />
        <Show when={!flow.hasPaymentMethod()}>
          <input value={flow.cardNumber()} onInput={(e) => flow.setCardNumber(e.currentTarget.value)} />
          <input value={flow.expiry()} onInput={(e) => flow.setExpiry(e.currentTarget.value)} />
          <input value={flow.cvv()} onInput={(e) => flow.setCvv(e.currentTarget.value)} />
        </Show>
        <p>Total ${dollars(flow.pricing().finalMedicationCents)}</p>
        <p>{flow.paymentError()}</p>
        <button disabled={!flow.canSubmit() || flow.processing()} onClick={() => flow.submit()}>Pay</button>
      </Match>
      <Match when={flow.outcome().kind === 'completed'}>Order placed.</Match>
    </Switch>
  );
}
```

### `useCartCheckoutFlow()`

One-time purchase of the cart's non-subscription items through `paymentsApi.checkout`. No prescription, no recurring subscription, no card kept on file; the card form always renders. Requires an authenticated member.

Outcomes: `loading`, `needs_auth`, `needs_cart` (nothing one-time-purchasable in the cart), `in_progress`, `reconciling`, `completed { orderId?, amountCents? }`.

Returned `CartCheckoutFlow` mirrors `CheckoutFlow` (`outcome`, `profile`, `address`, tokenizer and card state, `paymentError`, `processing`, `canSubmit`, `submit`) and adds `items()` (the purchasable subset), `skippedSubscriptionItems()` (subscription lines excluded from this order) and `pricing()` as `CartCheckoutPricing { subtotalCents, promoDiscountCents, estimatedTotalCents, promoCode? }`. The promo discount is a client estimate; `completed.amountCents` carries the charged figure. On an ambiguous failure the flow looks for its own paid order in the last five minutes of order history rather than retrying the charge. Purchased lines are removed from the cart on success; subscription lines and the promo survive.

## Accounts and subscriptions

### `useSignupFlow(options)`

Membership signup in four steps: Account, Address, Payment, Confirm. Leaving the Account step checks email availability; leaving the Payment step tokenizes the card; Confirm calls `authStore.signupAndSubscribe`, which creates the account, charges the first membership payment and starts the subscription. Non-sensitive fields persist in localStorage for 7 days (never the password or card), and a refresh restores up to the Payment step.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `membershipAmountCents` | `number` | required | Charged on signup |
| `membershipIntervalDays` | `number` | `30` | Billing interval |
| `membershipProductLabel` | `string` | `'Membership'` | Medication label sent when the cart is empty |

Outcomes: `in_progress`, `submitting`, `reconciling`, `completed`.

Returned `SignupFlow`:

| Member | Kind | Description |
| --- | --- | --- |
| `step()`, `isConfirmStep()` | state | 0 to 3 |
| `error()`, `tokenizing()`, `submitting()`, `outcome()` | state | Inline state |
| `tokenizerReady()`, `tokenizerError()` | state | Card tokenizer status |
| `firstName`, `lastName`, `email`, `password`, `dateOfBirth`, `phone` | state | Account fields, each an accessor with a `setX` companion |
| `street`, `city`, `state`, `zip` | state | Address fields with setters |
| `cardNumber`, `expiry`, `cvv` | state | Card fields with formatting setters |
| `promoCode()`, `setPromoCode()` | state | Optional code sent at submit; not persisted |
| `next()`, `back()`, `submit()` | action | Navigation and submission |

If the cart holds items they are sent as the subscription's products; otherwise the membership label is used. Date of birth is validated as `YYYY-MM-DD` and the member must be 18 or older.

```tsx
import { useSignupFlow } from '@apextelemed/partner-core/flows';

function Signup() {
  const flow = useSignupFlow({ membershipAmountCents: 4900 });

  createEffect(() => {
    if (flow.outcome().kind === 'completed') navigate('/survey');
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); flow.isConfirmStep() ? flow.submit() : flow.next(); }}>
      <Switch>
        <Match when={flow.step() === 0}>
          <input value={flow.email()} onInput={(e) => flow.setEmail(e.currentTarget.value)} />
          <input type="password" value={flow.password()} onInput={(e) => flow.setPassword(e.currentTarget.value)} />
        </Match>
        <Match when={flow.step() === 1}>
          <input value={flow.street()} onInput={(e) => flow.setStreet(e.currentTarget.value)} />
        </Match>
        <Match when={flow.step() === 2}>
          <input value={flow.cardNumber()} onInput={(e) => flow.setCardNumber(e.currentTarget.value)} />
        </Match>
        <Match when={flow.step() === 3}>Review and confirm</Match>
      </Switch>
      <p>{flow.error()}</p>
      <button type="button" onClick={flow.back} disabled={flow.step() === 0}>Back</button>
      <button type="submit" disabled={flow.submitting() || (flow.step() === 2 && !flow.tokenizerReady())}>
        {flow.isConfirmStep() ? 'Start membership' : 'Continue'}
      </button>
    </form>
  );
}
```

### `useRegisterFlow()`

Account creation without a subscription or card, in three steps: Account, Address, Confirm. Uses `authStore.signup`. Emits `already_authenticated` on mount when a session exists so you can route onward instead of creating a duplicate. Drafts persist for 7 days up to the Address step.

Outcomes: `in_progress`, `already_authenticated`, `submitting`, `reconciling`, `completed`. The returned `RegisterFlow` has the same shape as `SignupFlow` minus the card, promo and tokenizer members.

### `useSubscribeFlow(options)`

Starts a membership for an already signed-in member who has items in the cart. Prefills the billing address from the profile, tokenizes the card and calls `subscriptionsApi.create` with the cart's products.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `membershipAmountCents` | `number` | required | Charged on subscription start |
| `membershipIntervalDays` | `number` | `30` | Billing interval |

Outcomes: `loading`, `needs_auth`, `needs_cart`, `already_subscribed`, `in_progress`, `reconciling`, `completed`. The mount-time guards are re-checked on submit, so a logout or emptied cart in another tab cannot produce a charge from this one.

Returned `SubscribeFlow`: `outcome()`, `error()`, `submitting()`, tokenizer status, `street`/`city`/`state`/`zip` with setters, `cardNumber`/`expiry`/`cvv` with setters, and `submit()`.

```tsx
import { useSubscribeFlow } from '@apextelemed/partner-core/flows';

function Subscribe() {
  const flow = useSubscribeFlow({ membershipAmountCents: 4900 });

  createEffect(() => {
    const o = flow.outcome();
    if (o.kind === 'needs_auth') navigate('/signup');
    if (o.kind === 'needs_cart') navigate('/catalog');
    if (o.kind === 'already_subscribed' || o.kind === 'completed') navigate('/survey');
  });

  return (
    <Show when={flow.outcome().kind === 'in_progress'}>
      <input value={flow.cardNumber()} onInput={(e) => flow.setCardNumber(e.currentTarget.value)} />
      <button disabled={!flow.tokenizerReady() || flow.submitting()} onClick={() => flow.submit()}>Subscribe</button>
      <p>{flow.error()}</p>
    </Show>
  );
}
```

### `useSubscriptionIntakeFlow(options)`

The survey-first funnel. A visitor qualifies through `useSurveyV2Flow` or `SurveyV2Page` before any account exists, then this flow collects Account, Address and Payment in three steps and creates the account, the subscription and the prescription request in one submit. A signed-in member instead has their profile updated and a subscription created on the existing account.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `surveyResult` | `SurveyResult` | required | `{ surveyResponseId, v2SurveyResponseId?, caseNotes?, drugId, drugName, dosage }`. Set `v2SurveyResponseId` from the v2 result so Apex generates the prescriber notes from the survey snapshot. |
| `pricing` | `MedicationPricing` | required | `{ productId, productName, priceCents, savingsPriceCents? }` |
| `intervalDays` | `number` | `30` | Billing interval |
| `isSavingsMember` | `() => boolean` | none | Read reactively. When true and the product has `savingsPriceCents`, that rate is quoted. Must reflect the same member the server resolves at charge time. |
| `singleSubscription` | `boolean` | `false` | The tenant sells one program, so any live subscription blocks a second. Turns the backend's `SUBSCRIPTION_EXISTS` rejection into an `already_subscribed` outcome. |

Outcomes: `in_progress`, `tokenizing`, `submitting`, `already_subscribed { productId? }`, `completed`. On mount an authenticated member is reconciled against their live subscriptions: an existing subscription to this product resolves straight to `completed`; under `singleSubscription`, one to any product resolves to `already_subscribed`.

Returned `SubscriptionIntakeFlow`:

| Member | Kind | Description |
| --- | --- | --- |
| `step()`, `stepCount` | state | 0 to 2; `stepCount` is the constant 3 |
| `outcome()`, `error()`, `submitting()`, `tokenizing()` | state | Inline state |
| `tokenizerReady()`, `tokenizerError()` | state | Card tokenizer status |
| `firstName`, `lastName`, `email`, `password`, `dateOfBirth`, `phone` | state | Account fields with setters. Email and password are skipped for a signed-in member. |
| `address` | state | An `AddressPair` for delivery plus billing override |
| `cardNumber`, `expiry`, `cvv` | state | Card fields with setters |
| `promoCode()`, `setPromoCode()`, `promoValidating()`, `promoError()`, `promoApplied()` | state | Promo entry state. A `?promo=` landing prefills the field after re-validation. |
| `applyPromo()`, `clearPromo()` | action | Validate or remove the code |
| `pricing()` | derived | `PromoPricing { baseCents, discountCents, finalCents, promoCode? }` |
| `surveyResult`, `medication` | | The options, echoed for rendering |
| `next()`, `back()`, `submit()` | action | Navigation and submission. A zero total skips the card entirely. |

```tsx
import { SurveyV2Page } from '@apextelemed/partner-core/pages';
import { useSubscriptionIntakeFlow, type SurveyResult } from '@apextelemed/partner-core/flows';
import { qualifiedDrugIds, type V2SubmitResult, type PatientInfo } from '@apextelemed/partner-core/api';

// A single-program site: one product, one Apex drug, one starting dose.
interface Product { id: string; name: string; apexDrugId: string; dosage: string; priceCents: number }

function IntakeRoute(props: { product: Product }) {
  const [survey, setSurvey] = createSignal<{ result: SurveyResult; patient: PatientInfo } | null>(null);

  const onComplete = (result: V2SubmitResult, patient: PatientInfo) => {
    if (!qualifiedDrugIds(result).includes(props.product.apexDrugId)) return;
    const drug = result.drugResults.find((d) => d.drugId === props.product.apexDrugId);
    setSurvey({
      result: {
        surveyResponseId: result.responseId,
        v2SurveyResponseId: result.responseId,
        drugId: props.product.apexDrugId,
        drugName: drug?.drugName ?? props.product.name,
        dosage: props.product.dosage,
      },
      patient,
    });
  };

  return (
    <Show when={survey()} fallback={<SurveyV2Page drugIds={[props.product.apexDrugId]} onComplete={onComplete} />}>
      {(s) => <IntakeForm survey={s().result} patient={s().patient} product={props.product} />}
    </Show>
  );
}

function IntakeForm(props: { survey: SurveyResult; patient: PatientInfo; product: Product }) {
  const flow = useSubscriptionIntakeFlow({
    surveyResult: props.survey,
    pricing: { productId: props.product.id, productName: props.product.name, priceCents: props.product.priceCents },
  });
  // Seed the identity the survey already collected so the member does not retype it.
  onMount(() => {
    flow.setFirstName(props.patient.firstName ?? '');
    flow.setLastName(props.patient.lastName ?? '');
    flow.setEmail(props.patient.email ?? '');
    flow.setDateOfBirth(props.patient.dob ?? '');
    flow.setPhone(props.patient.phone ?? '');
    flow.address.setShipping({
      street: props.patient.street1 ?? '',
      street2: props.patient.street2 ?? '',
      city: props.patient.city ?? '',
      state: props.patient.state ?? '',
      zip: props.patient.zipCode ?? '',
    });
  });
  return <IntakeSteps flow={flow} />;
}
```

The dosage comes from your catalog, not from the survey result: `V2DrugResult` reports eligibility per drug (`drugId`, `qualified`, `drugName`, disqualification reasons, recommendation flags) and carries no dose.

### `useUpdatePaymentMethodFlow(subscriptionId)`

Replaces the card on file for a subscription. Takes a reactive accessor returning the subscription id (or `null` while it resolves). Prefills the billing address from what the gateway already holds, validates it, tokenizes the new card and calls `subscriptionsApi.updatePaymentMethod`. The current card stays active until the update succeeds.

Returned `UpdatePaymentMethodFlow`: `cardNumber`/`expiry`/`cvv` with setters, `ready()`, `submitting()`, `error()` (tokenizer setup failures surface here too), `canSubmit()`, `submit()` resolving to `true` on success, `billing` (an `AddressPair` whose primary slot holds the billing address; render it with `AddressFields billingOnly`), and `billingLoaded()`.

### Subscription status helpers

Two questions get asked about a subscription's status, and conflating them strands members. `isReconcilable(status)` answers "did my create land?" and is true for any non-terminal row, including the transient states a new subscription passes through. `isLive(status)` answers "does this member already hold a subscription?" and mirrors the backend's own rule exactly. The sets `LIVE_SUBSCRIPTION_STATUSES` and `TERMINAL_SUBSCRIPTION_STATUSES` are exported so a site that reads subscriptions itself applies the same vocabulary.

## Member data

### `useDashboardData(options?)`

Loads everything a patient dashboard shows, as Solid resources. No markup ships for the dashboard; compose your own.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `authToken` | `() => string \| undefined` | none | Load the dashboard as another user, with every read carrying this token instead of the session. The admin preview uses it with a 15-minute impersonation token. |

Returned `DashboardData`:

| Member | Kind | Description |
| --- | --- | --- |
| `profile`, `subscription`, `rxStatus`, `rxList`, `pendingSurveys` | state | Resources. Reading the value is safe in the error state (it falls back to `null` or `[]`); `.loading` and `.error` reflect the real resource. |
| `refetchRxList()` | action | Re-read the prescription list, for example after cancelling a request |
| `displayName()` | derived | First name from the profile, then `authStore`, then `'Member'` |
| `activity()` | derived | `DashboardActivityItem[]` built from the prescription status, subscription and account age |
| `error()` | derived | A message when any read failed, or `null` |
| `retry()` | action | Refetch every resource |

```tsx
import { useDashboardData } from '@apextelemed/partner-core/flows';

function Dashboard() {
  const data = useDashboardData();
  return (
    <Show when={!data.error()} fallback={<button onClick={data.retry}>Try again</button>}>
      <h1>Hi, {data.displayName()}</h1>
      <For each={data.rxList()}>{(rx) => <RxCard rx={rx} />}</For>
      <For each={data.pendingSurveys()}>{(s) => <a href={`/renew/${s.renewalId}`}>Complete your check-in</a>}</For>
    </Show>
  );
}
```

Types: `DashboardData`, `DashboardSubscription`, `DashboardRxStatus`, `DashboardRxListItem`, `DashboardActivityItem`, `RxRequestStatus`. `formatRelativeTime(iso)` renders "5m ago" style strings.

### `useMemberPortalData()`

The data source behind `MemberPortal`. Reads `/members/me` and the member's request list and infers capabilities from the data rather than a business model: requests are a list, subscriptions are optional. Returns `member()`, `subscriptions()`, `primarySubscription()`, `hasBilling()`, `rxRequests()` (newest first), `primaryRx()`, `otherRx()`, `pendingSurveys()`, `firstName()`, `loading()`, `error()`, `refetch()`, `toTrackerRequest(rx)` and `trackerSubscription()`. Types: `MemberPortalData`, `MemberPortalSubscription`, `MemberPortalRx`.

### Tracker and shipping helpers

`buildTrackerView(request)` turns a `TrackerRequest` into a `TrackerView` of fulfilment stages (submitted, under review, approved, at the pharmacy, shipped) with consultation and denial branches, and `buildRefillView(subscription, now?)` turns a `TrackerSubscription` into a `RefillView` of check-in, refill and shipment events. Both are pure and never invent a date: when a cycle is running but the pharmacy has not shipped, `pendingFill` is true and the events carry no dates. `buildTrackingUrl(delivery)` returns the carrier's tracking page for FedEx, UPS and USPS, or the URL the backend already supplied. `formatStageDate` and `formatEventDate` format for display. Types: `TrackerRequest`, `TrackerRequestStatus`, `TrackerSubscription`, `TrackerSubscriptionStatus`, `StageState`, `FulfillmentStage`, `ShipmentInfo`, `TrackerView`, `RefillEvent`, `RefillView`, `TrackingUrlCarrier`.

## Messaging

### `useMessagesThread(options?)`

One inbox over two sources: clinical patient-to-prescriber conversations proxied from Apex, and the backend's own customer-to-support threads. The hook merges them, routes every operation to the right API, polls, and upgrades support threads to live updates when `@supabase/supabase-js` is installed and the backend provides realtime credentials.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `pollIntervalMs.conversations` | `number` | `30000` | Conversation list poll |
| `pollIntervalMs.messages` | `number` | `10000` | Open-thread poll |
| `autoPoll` | `boolean` | `true` | Set false to drive refreshes yourself |

Polling pauses while the document is hidden. A `?c=<conversationId>` query parameter selects that conversation once the list has loaded, and the open conversation is written back to the URL so a reload keeps it.

Returned `MessagesThread`:

| Member | Kind | Description |
| --- | --- | --- |
| `conversations()`, `loadingConversations()` | state | Merged, newest first. `Conversation.source` is `'clinical'` or `'support'`. |
| `selectedId()`, `selectedSource()`, `messages()`, `loadingMessages()` | state | The open thread |
| `draft()`, `setDraft()`, `sending()`, `startingThread()` | state | Compose state |
| `selectConversation(id)`, `clearSelection()` | action | Open a thread (loads, marks read, starts polling) or go back to the list |
| `send()` | action | Send the draft with an optimistic bubble; rolls back and restores the draft on failure |
| `refreshConversations()` | action | Manual refetch |
| `startSupportThread(subject, body, file?)` | action | Open a support thread (members cannot start clinical conversations). Resolves `{ created, attachmentFailed }`. |
| `sendAttachment(file, text?)` | action | Upload to the open support thread |
| `resolveAttachmentUrl(id, force?)` | action | Exchange a support attachment id for a short-lived signed URL |

```tsx
import { useMessagesThread, formatConversationTime, formatMessageTime } from '@apextelemed/partner-core/flows';

function Messages() {
  const thread = useMessagesThread();
  return (
    <div class="split">
      <ul>
        <For each={thread.conversations()}>
          {(c) => (
            <li onClick={() => thread.selectConversation(c.id)}>
              {c.participantName} <small>{formatConversationTime(c.lastMessageAt)}</small>
              <Show when={c.unreadCount}>{(n) => <b>{n()}</b>}</Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={thread.selectedId()}>
        <For each={thread.messages()}>{(m) => <p>{m.senderName}: {m.text} <small>{formatMessageTime(m.createdAt)}</small></p>}</For>
        <textarea value={thread.draft()} onInput={(e) => thread.setDraft(e.currentTarget.value)} />
        <button disabled={thread.sending()} onClick={() => thread.send()}>Send</button>
      </Show>
    </div>
  );
}
```

Types: `MessagesThread`, `Conversation`, `ThreadMessage`, `UseMessagesThreadOptions`.

## Catalog

### `useCatalog()`

Fetches the product list once. Returns `products` (a resource of `CatalogProduct[]`), `weightLoss()` and `peptides()` (products in and not in the `weight-loss` category), and `filterByCategory(slug)`.

### `useProductDetail(productId)`

Takes a reactive accessor of the product id. Returns `product` (resource), `dosageOptions()` (from the linked Apex drug's available doses, priced by overlay or base price), `selectedDosage()` and `setSelectedDosage()`, `selectedPrice()`, `selectedSalePrice()`, `pricingMode()` (`'per_dose'` or `'flat_fee'`, the latter collapsing the picker to one hidden dose), `inCart()` and `addToCart()`, which adds the product at the selected dose and opens the cart drawer.

### `useMedicationSelect(options?)`

Catalog browse plus "select for survey", for the deprecated v1 funnel. Writes to `medicationStore` and calls `onSelected` afterwards. Options: `onSelected`, `generalConsultationLabel` (default `'General Consultation'`). Returns `products`, `weightLoss()`, `peptides()`, `selectMedication(product)` and `selectGeneralConsultation()`.

Helpers: `lowestPrice(product)`, `lowestSalePrice(product, basePrice)`, `categoryColor(id, { palette? })` for a stable procedural colour per category, and `DEFAULT_COLOR_PALETTE`.

## Addresses

### `useAddressPair(options?)`

Shared shipping plus billing state for checkout-bearing flows. Until the member edits a billing field, `billing()` mirrors the live shipping address, so the billing form always reads as populated and the charged address always matches what is shown.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `initialShipping` | `Partial<AddressValue>` | empty | Prefill |
| `initialBilling` | `Partial<AddressValue>` | none | Start billing as an explicit override |
| `billingSameAsShippingDefault` | `boolean` | `false` | Start with the checkbox on. Off by default so the billed address is visible before an AVS decline rather than after. |
| `verify` | `(a: CheckoutAddress) => Promise<AddressVerifyResult>` | `addressesApi.verify` | Replace the deliverability verifier |

Returned `AddressPair`: `shipping()`, `setShippingField(field, value)`, `setShipping(patch)`, `billingSameAsShipping()`, `setBillingSameAsShipping()`, `billing()`, `setBillingField()`, `billingIsOverride()`, `effectiveBilling()`, `shippingErrors()`, `billingErrors()`, `validate()`, `deliverability()`, `verifying()`, `verifyShipping()` and `applyNormalized()`. Deliverability checks time out client-side after 3.5 seconds and fail open to `unchecked`.

Pure helpers: `validateAddress(address, label?, { enforceAvailability? })` returning `AddressErrors`, `hasErrors(errors)`, `normalizeState(input)` (accepts `tx`, `TX` or `Texas`), `US_STATES`, `US_STATE_OPTIONS`, `availableStates(extraExcluded?)` and `availableStateOptions(extraExcluded?)` (minus the tenant's `unavailableStates`), and `stateAvailabilityNote()`. Types: `AddressValue`, `AddressErrors`, `AddressPair`, `UseAddressPairOptions`, `ValidateAddressOptions`.

## Affiliate portal data

Four resource hooks gated on `affiliateAuthStore.isAuthenticated()`; each returns the resource plus `refetch()`. A pending (unapproved) affiliate gets a 403 from these endpoints, which resolves to `null` or an empty list rather than an error.

| Hook | Resource |
| --- | --- |
| `useAffiliateStats()` | `stats`: `AffiliateDashboardStats \| null` |
| `useAffiliateConversions({ limit? })` | `conversions`: `AffiliateConversion[]` |
| `useAffiliateDownline()` | `downline`: `AffiliateDownlineMember[]` |
| `useAffiliateLinks()` | `links`: `AffiliateDashboardLinks \| null` |

## Funnel capture helpers

These back abandoned-survey recovery. `useSurveyV2Flow` and `SurveyV2Page` wire them automatically; you need them only when rendering your own pre-survey email gate.

| Function | Description |
| --- | --- |
| `createFunnelTelemetry()` | A forwarder whose `onEvent(e)` posts survey lifecycle events once the tenant's config resolves, buffering until then |
| `captureFunnelEmail(email)` | Post the email the gate collected into the current funnel session |
| `emailGateAnswered()`, `markEmailGateAnswered()` | Whether this device already answered or skipped the gate |
| `redeemResumeLink()` | Redeem a `?resume=` token at most once per page load. Adopts the emailed session, marks the gate answered and resolves to the saved draft or `null`. Call it before deciding whether to show a gate. |
| `resetResumeRedemption()` | Test seam that forgets the memoised redemption |

Cart capture (`startCartCapture`, `restoreCartFromLink`, `CartCaptureOptions`) is covered under [Boot-time calls](/partner-sdk/installation/#boot-time-calls).

## Card formatting helpers

`formatCardNumber`, `formatExpiry` and `formatCvv` are the formatters the flows' setters apply (digits only, spaced groups of four, `MM/YY`, up to four CVV digits). Use them if you render inputs that bypass a flow's setters.
