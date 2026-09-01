---
title: Headless core
description: Drive the survey engine from vanilla JS, Vue, Svelte, or web components with @apextelemed/survey-core, and plug in your own draft store or API client.
sidebar:
  order: 5
---

If you're not on React or Solid, or you want to drive the flow from vanilla JS, Vue, Svelte, or web components, use `@apextelemed/survey-core` directly. It has zero runtime dependencies and ships ESM and CommonJS builds with TypeScript declarations.

```bash
npm install @apextelemed/survey-core
```

## The engine

`createSurveyV2Engine(options)` returns a small imperative state machine. Subscribe to it, render from `getState()`, and call its actions from your UI.

```ts
import { createSurveyV2Engine, isQuestionVisible } from '@apextelemed/survey-core';

const engine = createSurveyV2Engine({
  apiBaseUrl: 'https://apextelemed.com/api',
  publishableKey: 'pk_0123456789abcdef0123456789abcdef',
  drugIds: ['drug-A'],
  onComplete: (r) => console.log('done', r.responseId),
});

const unsubscribe = engine.subscribe(render);
render();

function render() {
  const s = engine.getState();
  switch (s.phase) {
    case 'loading':       /* spinner */ return;
    case 'error':         /* show s.error */ return;
    case 'disqualified':  /* show s.disqualifiedResult.drugResults */ return;
    case 'submitting':    /* spinner */ return;
    case 'complete':      /* show s.result */ return;
    case 'questions': {
      const step = s.flatSteps[s.stepIndex];
      const visible = step.questions.filter((q) => isQuestionVisible(q, s.answers));
      // render `visible`; wire inputs to engine.setAnswer(q.questionId, value)
      // wire Next to engine.next() and Back to engine.back()
      return;
    }
    case 'patient_info':
      // render the patient-info form; wire fields to engine.setPatientInfo({ ... })
      // wire Submit to engine.submit()
      return;
  }
}

// when tearing down:
unsubscribe();
engine.destroy();
```

The engine starts loading in a microtask after creation, so subscribers attached synchronously never miss the first transition.

### Options (`CreateSurveyV2EngineOptions`)

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `apiBaseUrl` | `string` | required | `https://apextelemed.com/api`, or your proxy base. Trailing slashes are trimmed. |
| `publishableKey` | `string` | | Sent as `x-apex-publishable-key`. Browser-direct mode. |
| `tenantKey` | `string` | | Sent as `X-Tenant-Key`. Proxy mode. |
| `drugIds` | `string[]` | | Required unless `token` is set. |
| `templateId` | `string` | | Optional partner survey template. |
| `mode` | `'initial' \| 'refill'` | not sent | The server treats a missing mode as `initial`. |
| `token` | `string` | | Returning-member token. Overrides `drugIds`, `templateId`, and `mode`. |
| `skipPatientInfoWhenComplete` | `boolean` | `false` | Auto-submit at the end of the questionnaire when identity is complete. See [Returning customers](/survey-helper/auth-and-modes/#returning-customers-without-a-token). |
| `knownPatientInfo` | `Partial<PatientInfo>` | | Seeds patient info on load. On the token path the server's member record wins for overlapping fields. |
| `requiredPatientInfoFields` | `Array<keyof PatientInfo>` | `firstName`, `lastName`, `email`, `dob`, `state` | Fields that must all be present for the skip to fire. |
| `onEvent` | `(e: EmbedEvent) => void` | | Lifecycle events. See [Events](#events). |
| `onComplete` | `(r: V2SubmitResult) => void` | | Called once on a successful submit. |
| `onError` | `(err: Error) => void` | | Called when the survey fails to load or to submit. |
| `client` | `EmbedApiClient` | built from the options above | Inject your own API client (tests, custom transport). |
| `fetch` | `typeof fetch` | global `fetch` | Inject a fetch implementation (tests, SSR). |
| `storage` | `Storage \| null` | `window.localStorage` | Backing store for the default draft store. `null` disables drafts. |
| `draftTtlMs` | `number` | 24 hours | Time-to-live for the default draft store. |
| `draftStore` | `DraftStore` | local store built from `storage` and `draftTtlMs` | Replace draft persistence entirely. Takes precedence over `storage` and `draftTtlMs`. |
| `autoLoad` | `boolean` | `true` | When `false`, the engine is created idle in `loading` and never composes the survey. There is no public method to start the load later, so this only serves tests that assert the initial state. |

`createSurveyV2Engine` throws synchronously if neither `token` nor a non-empty `drugIds` is provided.

### Engine surface

```ts
interface SurveyV2Engine {
  getState(): SurveyV2State;
  subscribe(listener: () => void): () => void;  // returns unsubscribe
  setAnswer(questionId: string, value: unknown): void;
  setPatientInfo(patch: Partial<PatientInfo>): void;
  next(): Promise<void>;
  back(): void;
  submit(): Promise<void>;
  restart(): void;
  destroy(): void;
}
```

`getState()` returns a **stable reference** that only changes when the state changes. That makes it a drop-in snapshot for `useSyncExternalStore`-style adapters and cheap for dirty checks. Listeners are called synchronously after every change. A listener that throws is logged and does not stop the others.

`destroy()` clears all listeners, removes the `pagehide` listener, and makes the engine ignore any network response that is still in flight. Create a new engine to start over with different options.

### Engine state

| Field | Type | Description |
| --- | --- | --- |
| `phase` | `SurveyV2Phase` | See [Phases](#phases). |
| `composed` | `V2ComposedSurvey \| null` | The composed survey as returned by Apex, including `drugs` and optional `branding`. |
| `flatSteps` | `FlatStep[]` | Steps in navigation order. Steps with no questions are dropped. |
| `stepIndex` | `number` | Index of the current step. |
| `answers` | `Record<string, unknown>` | Answers keyed by `questionId`. |
| `patientInfo` | `PatientInfo` | Collected patient fields, seeded from `knownPatientInfo` or the token's member record. |
| `memberId` | `string \| null` | The member resolved from a token. `null` on the `drugIds` path. |
| `qualification` | `V2QualificationResult \| null` | The most recent mid-stream qualification check. |
| `result` | `V2SubmitResult \| null` | The submit result once `phase` is `complete`. |
| `disqualifiedResult` | `{ drugResults: V2DrugResult[] } \| null` | The check that disqualified the patient. |
| `validationError` | `string \| null` | Client-side validation message for the current step or form. |
| `busy` | `boolean` | A `next()` qualification check is in flight. Not set during `submit()`, which uses the `submitting` phase instead. |
| `error` | `string \| null` | Message for the `error` phase. |

### Phases

```text
loading → questions ⇄ patient_info → submitting → complete
                 ↘ disqualified
   (any network failure) → error
```

- **`loading`.** The engine composes the survey (by `drugIds` or by `token`), flattens it into steps, restores a draft if the store has one, and lands on the first step that has at least one visible question. On failure it moves to `error` and calls `onError`.
- **`questions`.** `setAnswer()` records an answer, clears `validationError`, and saves the draft. `next()` first checks that every **visible required** question on the current step has a non-empty answer, otherwise it sets `validationError` to "Please answer all required questions before continuing." and stops. It then posts all answers so far to the qualification check. If the check returns at least one drug result and every drug is `qualified: false`, the draft is cleared and the phase becomes `disqualified`. Otherwise the engine advances to the next step that has a visible question, skipping steps hidden by the answers so far. When no such step remains, the phase becomes `patient_info`. `back()` moves to the previous step with a visible question and is a no-op on the first one.
- **`patient_info`.** `setPatientInfo()` merges fields. `submit()` requires `firstName`, `lastName`, `email`, `dob`, and `state` and a plausible email address, sets `validationError` naming the missing fields otherwise, then moves to `submitting`. `back()` returns to `questions` on the same step. If `skipPatientInfoWhenComplete` is on and the guard passes, the engine calls `submit()` itself as soon as it enters this phase; if that submit fails, it returns to `patient_info` with a validation message instead of `error`.
- **`submitting`.** The response is posted. On success the draft is cleared, the phase becomes `complete`, `result` is set, and `onComplete` fires. On failure the phase becomes `error` and `onError` fires.
- **`disqualified`.** Terminal. `disqualifiedResult.drugResults` and `qualification` hold the verdict. `restart()` starts a fresh survey.
- **`error`.** Reached from a failed load, a failed qualification check, or a failed submit. `error` holds the message (the server's `error` field when there is one). A failed qualification check does **not** call `onError` or emit an event. `restart()` works after a failed `next()` or `submit()` because the survey is still loaded. After a failed load, create a new engine.

`restart()` clears the draft, resets `answers`, `stepIndex`, `qualification`, `disqualifiedResult`, `validationError`, and `error`, and returns to `questions`. It keeps `composed`, `flatSteps`, `patientInfo`, and `memberId`, so a returning member does not retype their details.

The submit payload records an answer for every question the patient was shown. A `multi_select` question that was visible but never touched is sent as `[]`, so "reported none" is distinguishable from "never asked" downstream. Hidden questions are never fabricated.

### Events

`onEvent` receives `{ type, data? }`. Analytics hosts should treat `abandoned` as "last seen leaving", not as a terminal state, and forward it with `fetch(..., { keepalive: true })`.

| `type` | `data` |
| --- | --- |
| `survey:loaded` | `{ resumed: boolean }` |
| `step:shown` | `{ stepIndex, stepCount, phase: 'questions' \| 'patient_info' }` |
| `step:completed` | `{ stepIndex, stepCount }` |
| `qualification:checked` | `{ qualified, drugResults }` |
| `disqualified` | `{ drugResults }` |
| `submit:succeeded` | `{ responseId }` |
| `submit:failed` | `{ error: string }` |
| `abandoned` | `{ phase, stepIndex, stepCount }` on `pagehide` while in `questions`, `patient_info`, or `submitting` |

The patient-info form is reported as the pseudo-step at `stepIndex === stepCount`. An `onEvent` handler that throws is logged and ignored.

## Draft persistence

A draft is the patient's answers plus the step they were on:

```ts
interface Draft {
  answers: V2Answer[];   // { questionId, value }[]
  stepIndex: number;
  savedAt: number;       // epoch milliseconds, set by the store
}
```

Patient info is never part of the draft. The engine saves after every `setAnswer()` and every step change, loads once during `loading`, and clears on submit, on disqualification, and on `restart()`.

### The default store

By default drafts live in `localStorage` under a key from `draftKey()`:

```ts
draftKey({ publishableKey, tenantKey, token, drugIds, templateId, mode })
// → "apex:draft:v1:<publishableKey ?? tenantKey ?? 'anon'>:<tok:token | hash(drugIds, templateId, mode)>"
```

The `drugIds` are sorted before hashing, so the order you pass them in does not change the key. Drafts older than `draftTtlMs` (default 24 hours) are discarded on load. If `localStorage` is unavailable or throws, the store silently does nothing and the survey runs without resume.

The low-level helpers are exported for hosts that want to inspect or clear a draft outside the engine, for example on logout: `loadDraft(key, opts)`, `saveDraft(key, draft, opts)`, `clearDraft(key, opts)`, and `createLocalDraftStore(key, opts)`. `opts` is a `StorageOptions` of `{ storage?: Storage | null; ttlMs?: number }`.

### Your own store

Implement `DraftStore` to keep drafts anywhere, including on your server so a patient can resume on a different device:

```ts
interface DraftStore {
  load(): Promise<Draft | null>;
  save(draft: Omit<Draft, 'savedAt'>): void;
  clear(): void;
}
```

Rules a store must follow:

- **Never throw.** The engine treats the store as a convenience and does not guard its calls. Catch everything and return `null` from `load()` on failure.
- **`save()` and `clear()` are fire-and-forget.** They are called from synchronous UI paths, so do not make the caller wait. Losing a draft costs the patient a retype, never correctness.
- **`load()` may be slow.** It runs once, during `loading`, after the survey has been composed.
- **You own the identity.** The engine does not pass a key to a custom store. Close over whatever identifies the patient and the survey, for example your session ID plus the drug IDs, and enforce your own expiry.

```ts
import { createSurveyV2Engine, type Draft, type DraftStore } from '@apextelemed/survey-core';

function createServerDraftStore(sessionId: string): DraftStore {
  const url = `/my-backend/survey-drafts/${encodeURIComponent(sessionId)}`;
  return {
    async load() {
      try {
        const res = await fetch(url, { credentials: 'include' });
        return res.ok ? ((await res.json()) as Draft) : null;
      } catch {
        return null;
      }
    },
    save(draft) {
      void fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, savedAt: Date.now() }),
      }).catch(() => {});
    },
    clear() {
      void fetch(url, { method: 'DELETE', credentials: 'include' }).catch(() => {});
    },
  };
}

const engine = createSurveyV2Engine({
  apiBaseUrl: 'https://apextelemed.com/api',
  publishableKey: 'pk_0123456789abcdef0123456789abcdef',
  drugIds: ['drug-A'],
  draftStore: createServerDraftStore(session.id),
});
```

Apex also offers server-side draft endpoints, authenticated with your API key, that your backend can use as the storage behind such a store. They are not callable from the browser. See the [server-side survey API reference](/api/survey-v2-server/).

## Other exports

### `flattenComposedSurvey(survey)`

Turns a `V2ComposedSurvey` into `FlatStep[]`: one entry per section and step pair, sections, steps, and questions each sorted by `order`, steps with no questions dropped. Use it if you call the compose endpoint yourself.

### `isQuestionVisible(question, answers)`

Evaluates a question's `visibilityConditions` against the answer map. A question with no conditions is always visible. All conditions must match (AND). For each condition:

- A missing, `null`, or empty-string answer never matches.
- Values are compared case-insensitively as strings after boolean normalization: `yes`, `true`, and `1` are equivalent, as are `no`, `false`, and `0`.
- Operators: `equals` (also `eq`, `=`, `==`), `not_equals` (also `neq`, `ne`, `!=`), and `contains`. For `contains`, an array answer matches when any element equals the value, and a string answer matches when it includes the value. Unknown operators fall back to `equals`.

The adapters use this for `visibleQuestions`, and the engine uses it for required-field validation, step skipping, and the submit payload.

### `createEmbedApiClient(options)`

The low-level client the engine uses. `options` is `{ apiBaseUrl, publishableKey?, tenantKey?, fetch? }`. It returns:

```ts
interface EmbedApiClient {
  composeSurvey(opts: { drugIds: string[]; templateId?: string; mode?: 'initial' | 'refill' }): Promise<V2ComposedSurvey>;
  composeSurveyByToken(token: string): Promise<{ composed: V2ComposedSurvey; patientInfo: PatientInfo; memberId: string; mode: 'initial' | 'refill' }>;
  checkQualification(body: { drugIds?: string[]; templateId?: string; mode?: 'initial' | 'refill'; token?: string; answers: V2Answer[] }): Promise<V2QualificationResult>;
  submitSurvey(body: { drugIds?: string[]; templateId?: string; mode?: 'initial' | 'refill'; token?: string; answers: V2Answer[]; patientInfo: PatientInfo }): Promise<V2SubmitResult>;
  selectDrug(responseId: string, drugId: string): Promise<void>;
}
```

Non-2xx responses throw `EmbedApiError` with `status`, `message` (the server's `error` field, or `HTTP <status>`), and `body`. The engine never calls `selectDrug`. Use it after `complete` when the response qualified for several drugs and the patient picks one. Endpoint details are in the [API contract](/survey-helper/api-contract/).

### Eligibility helpers

The survey owns the qualification verdict. These pure helpers let you act on it, most importantly to decide which drugs may go into a prescription request. A drug the survey marked ineligible must never be forwarded to a prescriber.

- `qualifiedDrugIds(result)` returns the drug IDs marked `qualified: true`. Accepts anything with a `drugResults` array (`state.result`, `state.qualification`, `state.disqualifiedResult`) or `null`.
- `disqualifiedDrugIds(result)` returns the drug IDs marked `qualified: false`.
- `disqualificationReasonText(drugResult)` returns a display string: the first non-empty entry of `disqualificationReasons`, else the legacy `disqualificationReason`, else "Not eligible based on your answers".

IDs are the Apex drug IDs the survey was composed for. Match them against the Apex drug ID you stored on your cart item, not a display name.

```ts
import { qualifiedDrugIds } from '@apextelemed/survey-core';

const allowed = new Set(qualifiedDrugIds(engine.getState().result));
const items = cart.filter((item) => allowed.has(item.apexDrugId));
```

## Writing your own framework adapter

An adapter is about thirty lines: construct the engine, subscribe to mirror `getState()` into your framework's reactivity, expose `setAnswer`, `setPatientInfo`, `next`, `back`, `submit`, and `restart`, derive `currentStep` and `visibleQuestions`, and call `destroy()` on teardown. The [React](https://github.com/thefortifiedgrp/apex-survey-helper/blob/main/packages/react/src/useSurveyV2Flow.ts) and [Solid](https://github.com/thefortifiedgrp/apex-survey-helper/blob/main/packages/solid/src/useSurveyV2Flow.ts) adapters are good references. Copy one and swap the reactivity primitive.
