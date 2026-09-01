---
title: React adapter
description: Reference for the useSurveyV2Flow React hook, its options, the fields it returns, the outcome union, and the lifecycle events.
sidebar:
  order: 3
---

```bash
npm install @apextelemed/survey-core @apextelemed/survey-react
```

`react` 18 or later is a peer dependency. The hook is built on `useSyncExternalStore`. The package is headless: it renders nothing and ships no CSS.

## `useSurveyV2Flow(options)`

```tsx
import { useSurveyV2Flow } from '@apextelemed/survey-react';

const flow = useSurveyV2Flow({
  apiBaseUrl: 'https://apextelemed.com/api',
  publishableKey: 'pk_0123456789abcdef0123456789abcdef',
  drugIds: ['drug-A'],
});
```

### Options (`UseSurveyV2FlowOptions`)

| Option | Type | Notes |
| --- | --- | --- |
| `apiBaseUrl` | `string` | **Required.** `https://apextelemed.com/api`, or your proxy base. Trailing slashes are trimmed. |
| `publishableKey` | `string` | `pk_*` for [browser-direct mode](/survey-helper/auth-and-modes/#mode-a-browser-direct-publishable-key). Omit when proxying. |
| `tenantKey` | `string` | Sent as `X-Tenant-Key` in [proxy mode](/survey-helper/auth-and-modes/#mode-b-proxy-through-your-backend). |
| `drugIds` | `string[]` | Drugs to compose the survey for. Required unless `token` is set. |
| `templateId` | `string` | Optional partner survey template. |
| `mode` | `'initial' \| 'refill'` | Not sent unless set. The server treats a missing mode as `initial`. |
| `token` | `string` | Returning-member token. Overrides `drugIds`, `templateId`, and `mode`. |
| `skipPatientInfoWhenComplete` | `boolean` | Opt in to auto-submit at the end of the questionnaire when identity is already complete. Default `false`. See [Returning customers](/survey-helper/auth-and-modes/#returning-customers-without-a-token). |
| `knownPatientInfo` | `Partial<PatientInfo>` | Seeds patient info for a signed-in customer on the `drugIds` path. |
| `requiredPatientInfoFields` | `Array<keyof PatientInfo>` | Fields that must all be present for the skip to fire. Default: `firstName`, `lastName`, `email`, `dob`, `state`. |
| `draftTtlMs` | `number` | Draft time-to-live in milliseconds. Default 24 hours. `0` disables resume. |
| `onEvent` | `(e: EmbedEvent) => void` | Lifecycle events. See [Lifecycle events](#lifecycle-events). |
| `onComplete` | `(r: V2SubmitResult) => void` | Fired once on a successful submit. |
| `onError` | `(err: Error) => void` | Fired when the survey fails to load or to submit. |

:::note
The engine is constructed **once** when the component mounts, from the options passed on that first render. Later changes to `apiBaseUrl`, `drugIds`, `token`, and the other configuration options are ignored. To start a different survey, remount the component with a new React `key`. The three callbacks are the exception: the hook always calls the handler from your latest render, so inline arrow functions are fine.
:::

The React hook does not expose the `draftStore` option. To keep drafts on your own server, build the engine from the core directly. See [Custom draft store in React](#custom-draft-store-in-react).

### Returned `SurveyV2Flow`

All values are plain (not functions) and update on re-render.

| Field | Type | Description |
| --- | --- | --- |
| `state` | `SurveyV2State` | Raw engine snapshot. See [Engine state](/survey-helper/headless/#engine-state). |
| `outcome` | `SurveyV2Outcome` | Discriminated union on `.kind`. See below. |
| `flatSteps` | `FlatStep[]` | All steps (one per section and step pair with at least one question), in order. |
| `stepIndex` | `number` | Index of the current step in `flatSteps`. |
| `totalSteps` | `number` | `flatSteps.length`. |
| `currentStep` | `FlatStep \| null` | The active step. `null` before the survey loads. |
| `visibleQuestions` | `V2Question[]` | Questions on the current step whose visibility conditions match the current answers. |
| `answers` | `Record<string, unknown>` | Answer map keyed by `questionId`. |
| `setAnswer` | `(questionId: string, value: unknown) => void` | Record an answer. Clears `validationError` and saves the draft. |
| `patientInfo` | `PatientInfo` | Collected patient fields. |
| `setPatientInfo` | `(patch: Partial<PatientInfo>) => void` | Merge patient fields. Clears `validationError`. |
| `submitting` | `boolean` | A `next()` qualification check is in flight. During `submit()` the phase itself becomes `submitting` (see `outcome.kind`) and this flag stays `false`. |
| `validationError` | `string \| null` | Current client-side validation message. |
| `next` | `() => Promise<void>` | Validate required visible questions, run the qualification check, and advance. |
| `back` | `() => void` | Go to the previous visible step, or from the patient-info form back to the questions. |
| `submit` | `() => Promise<void>` | Validate patient info and submit. Only acts in the `patient_info` phase. |
| `restart` | `() => void` | Clear the draft and answers and return to the first step. Keeps patient info. |
| `engine` | `SurveyV2Engine` | The underlying engine, for advanced use. |

### `outcome.kind`

| `kind` | Engine phase | Extra fields |
| --- | --- | --- |
| `loading` | `loading` | |
| `load_failed` | `error` | `error: string` |
| `questions` | `questions` | |
| `patient_info` | `patient_info` | |
| `submitting` | `submitting` | |
| `disqualified` | `disqualified` | `drugResults: V2DrugResult[]` |
| `complete` | `complete` | `result: V2SubmitResult` |

:::caution
Despite its name, `load_failed` is reported for **any** failed network call: the initial compose, a qualification check during `next()`, or the final submit. Read `outcome.error` (or `state.error`) for the message. After a failed `next()` or `submit()`, the survey is still loaded and `restart()` returns the patient to the first step. After a failed load there is nothing to restart, so remount the component instead.
:::

### Lifecycle events

Each event passed to `onEvent` is `{ type, data? }`. The patient-info form counts as a pseudo-step at `stepIndex === stepCount`.

| `type` | `data` | When |
| --- | --- | --- |
| `survey:loaded` | `{ resumed: boolean }` | The survey composed successfully. `resumed` is true when a draft was restored. |
| `step:shown` | `{ stepIndex, stepCount, phase }` | A step is displayed: on load, after `next()`, after `back()`, and when the patient-info form appears (`phase: 'patient_info'`). |
| `step:completed` | `{ stepIndex, stepCount }` | `next()` passed validation and the qualification check for the step. |
| `qualification:checked` | `{ qualified, drugResults }` | Every qualification check, whether or not it disqualified. |
| `disqualified` | `{ drugResults }` | Every requested drug failed the check. |
| `submit:succeeded` | `{ responseId }` | The response was accepted. |
| `submit:failed` | `{ error: string }` | The submit call failed. |
| `abandoned` | `{ phase, stepIndex, stepCount }` | The page is being hidden (`pagehide`) while the survey is in progress. Can fire more than once per session. Forward it with `fetch(..., { keepalive: true })` so it survives the unload. |

### Types

The adapter re-exports the core types you need when rendering, so a React integration can import types from `@apextelemed/survey-react` alone: `SurveyV2State`, `SurveyV2Phase`, `FlatStep`, `PatientInfo`, `V2Question`, `V2QuestionOption`, `V2Section`, `V2Step`, `V2ComposedSurvey`, `V2DrugResult`, `V2QualificationResult`, `V2SubmitResult`, `EmbedEvent`, and `EmbedEventType`, plus the adapter's own `UseSurveyV2FlowOptions`, `SurveyV2Flow`, and `SurveyV2Outcome`.

Runtime helpers such as `isQuestionVisible`, `qualifiedDrugIds`, and `disqualificationReasonText` are not re-exported by the React package. Import them from `@apextelemed/survey-core`. See [Other exports](/survey-helper/headless/#other-exports).

## Rendering each phase

[Getting started](/survey-helper/#render-the-flow-with-react) shows a complete component, and [examples/react-vite](https://github.com/thefortifiedgrp/apex-survey-helper/tree/main/examples/react-vite) is a runnable app. The points that matter:

- **Questions.** Render `flow.visibleQuestions` for `flow.currentStep`. Show the option label as `option.text ?? option.value` and submit `option.value`. Wire **Next** to `flow.next` and **Back** to `flow.back`. `next()` refuses to advance while a required visible question is unanswered and sets `validationError` instead.
- **Patient info.** The required fields validated before submit are `firstName`, `lastName`, `email` (must look like an address), `dob` (`YYYY-MM-DD`), and `state` (two-letter code). Missing fields produce a `validationError` naming them.
- **Disqualified.** `flow.outcome.drugResults` lists each drug with `qualified` and its reasons. Use `disqualificationReasonText` from the core to get a display string. Offer `flow.restart` so the patient can start over.
- **Complete.** `flow.outcome.result.responseId` identifies the submission. If `result.callbackUrl` is set, Apex expects you to send the patient there next.

Disable **Next** while `flow.submitting` is true, and render a waiting state instead of the form while `flow.outcome.kind` is `submitting`, to avoid double submissions. Render `validationError` inside an element with `role="alert"`.

## Custom draft store in React

The engine accepts a `DraftStore` so drafts can live on your server instead of in `localStorage`, but the React hook does not pass one through yet. Build the engine yourself and mirror its state with `useSyncExternalStore`:

```tsx
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createSurveyV2Engine, type DraftStore, type SurveyV2Engine } from '@apextelemed/survey-core';

export function useSurveyEngine(draftStore: DraftStore) {
  const ref = useRef<SurveyV2Engine | null>(null);
  if (ref.current === null) {
    ref.current = createSurveyV2Engine({
      apiBaseUrl: 'https://apextelemed.com/api',
      publishableKey: 'pk_0123456789abcdef0123456789abcdef',
      drugIds: ['drug-A'],
      draftStore,
    });
  }
  const engine = ref.current;
  useEffect(() => () => engine.destroy(), [engine]);
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  return { engine, state };
}
```

From there, derive `currentStep` and the visible questions exactly as the adapter does. The adapter's source is a good template: [packages/react/src/useSurveyV2Flow.ts](https://github.com/thefortifiedgrp/apex-survey-helper/blob/main/packages/react/src/useSurveyV2Flow.ts). Implementing a `DraftStore` is covered in [Headless core](/survey-helper/headless/#draft-persistence).
