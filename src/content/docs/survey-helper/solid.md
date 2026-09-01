---
title: Solid adapter
description: Reference for the useSurveyV2Flow Solid hook, its options, the reactive accessors it returns, and a complete example.
sidebar:
  order: 4
---

```bash
npm install @apextelemed/survey-core @apextelemed/survey-solid
```

`solid-js` 1.9 or later is a peer dependency. Engine state is mirrored into a Solid store with `reconcile()`, so the returned **accessors are fine-grained reactive**. Read them inside JSX, memos, or effects. The package is headless: it renders nothing and ships no CSS.

## `useSurveyV2Flow(options)`

```tsx
import { useSurveyV2Flow } from '@apextelemed/survey-solid';

const flow = useSurveyV2Flow({
  apiBaseUrl: 'https://apextelemed.com/api',
  publishableKey: 'pk_0123456789abcdef0123456789abcdef',
  drugIds: ['drug-A'],
});
```

### Options (`UseSurveyV2FlowOptions`)

The options match the [React adapter](/survey-helper/react/#options-usesurveyv2flowoptions): `apiBaseUrl`, `publishableKey`, `tenantKey`, `drugIds`, `templateId`, `mode`, `token`, `skipPatientInfoWhenComplete`, `knownPatientInfo`, `requiredPatientInfoFields`, `draftTtlMs`, `onEvent`, `onComplete`, and `onError`, with one addition:

| Option | Type | Notes |
| --- | --- | --- |
| `draftStore` | `DraftStore` | Where in-progress answers are kept. Defaults to device-local `localStorage`. Supply a server-backed store for resume on any device. Takes precedence over `draftTtlMs`. See [Draft persistence](/survey-helper/headless/#draft-persistence). |

:::note
Call the hook inside a reactive owner (a component or `createRoot`). The engine is constructed **once** from the options passed at that time, including the three callbacks, and is destroyed automatically in `onCleanup`. To start a different survey, re-create the owning component.
:::

### Returned `SurveyV2Flow`

Same shape as React, except every read is an **accessor**. Call it.

| Field | Type |
| --- | --- |
| `state` | `SurveyV2State` (a Solid store; fields are reactive on direct read, for example `flow.state.result?.responseId`) |
| `outcome` | `Accessor<SurveyV2Outcome>` |
| `flatSteps` | `Accessor<FlatStep[]>` |
| `stepIndex` | `Accessor<number>` |
| `totalSteps` | `Accessor<number>` |
| `currentStep` | `Accessor<FlatStep \| null>` |
| `visibleQuestions` | `Accessor<V2Question[]>` |
| `answers` | `Accessor<Record<string, unknown>>` |
| `patientInfo` | `Accessor<PatientInfo>` |
| `submitting` | `Accessor<boolean>` |
| `validationError` | `Accessor<string \| null>` |
| `setAnswer` / `setPatientInfo` | Functions, same signatures as React. |
| `next` / `back` / `submit` / `restart` | Functions, same semantics as React. |
| `engine` | `SurveyV2Engine` |

The `outcome().kind` values, the `error` caveat, and the `onEvent` events are the same as in the React adapter. See [`outcome.kind`](/survey-helper/react/#outcomekind) and [Lifecycle events](/survey-helper/react/#lifecycle-events).

### Exports

Besides the hook and its types (`UseSurveyV2FlowOptions`, `SurveyV2Flow`, `SurveyV2Outcome`), the Solid package re-exports:

- The eligibility helpers `qualifiedDrugIds`, `disqualifiedDrugIds`, and `disqualificationReasonText` from the core, so a Solid integration can depend on `@apextelemed/survey-solid` alone for gating a cart on the verdict.
- The core types `SurveyV2State`, `SurveyV2Phase`, `FlatStep`, `PatientInfo`, `V2Question`, `V2QuestionOption`, `V2Section`, `V2Step`, `V2ComposedSurvey`, `V2DrugResult`, `V2QualificationResult`, `V2SubmitResult`, `EmbedEvent`, and `EmbedEventType`.

`isQuestionVisible` and the draft helpers are not re-exported. Import them from `@apextelemed/survey-core`.

## Example

```tsx
import { Switch, Match, For, Show } from 'solid-js';
import { useSurveyV2Flow, disqualificationReasonText } from '@apextelemed/survey-solid';

export function Intake() {
  const flow = useSurveyV2Flow({
    apiBaseUrl: 'https://apextelemed.com/api',
    publishableKey: 'pk_0123456789abcdef0123456789abcdef',
    drugIds: ['drug-A'],
    onComplete: (r) => console.log('submitted', r.responseId),
  });

  return (
    <Switch fallback={<p>Loading…</p>}>
      <Match when={flow.outcome().kind === 'load_failed'}>
        <p role="alert">Couldn't load the survey.</p>
      </Match>

      <Match when={flow.outcome().kind === 'disqualified'}>
        <h2>Not eligible</h2>
        <ul>
          <For each={flow.state.disqualifiedResult?.drugResults ?? []}>
            {(d) => <li>{d.drugName ?? d.drugId}: {disqualificationReasonText(d)}</li>}
          </For>
        </ul>
        <button onClick={flow.restart}>Start over</button>
      </Match>

      <Match when={flow.outcome().kind === 'complete'}>
        <h2>Thank you!</h2>
        <Show when={flow.state.result}>
          {(r) => <p>Response ID: {r().responseId}</p>}
        </Show>
      </Match>

      <Match when={flow.outcome().kind === 'patient_info'}>
        <form onSubmit={(e) => { e.preventDefault(); void flow.submit(); }}>
          <h2>Your details</h2>
          <input placeholder="First name" value={flow.patientInfo().firstName ?? ''}
            onInput={(e) => flow.setPatientInfo({ firstName: e.currentTarget.value })} />
          <input placeholder="Last name" value={flow.patientInfo().lastName ?? ''}
            onInput={(e) => flow.setPatientInfo({ lastName: e.currentTarget.value })} />
          <input placeholder="Email" type="email" value={flow.patientInfo().email ?? ''}
            onInput={(e) => flow.setPatientInfo({ email: e.currentTarget.value })} />
          <input placeholder="Date of birth" type="date" value={flow.patientInfo().dob ?? ''}
            onInput={(e) => flow.setPatientInfo({ dob: e.currentTarget.value })} />
          <input placeholder="State (2-letter)" value={flow.patientInfo().state ?? ''}
            onInput={(e) => flow.setPatientInfo({ state: e.currentTarget.value.toUpperCase() })} />
          <Show when={flow.validationError()}>
            <p role="alert">{flow.validationError()}</p>
          </Show>
          <button type="button" onClick={flow.back}>Back</button>
          <button type="submit" disabled={flow.submitting()}>
            {flow.submitting() ? 'Submitting…' : 'Submit'}
          </button>
        </form>
      </Match>

      <Match when={flow.outcome().kind === 'questions'}>
        <p>Step {flow.stepIndex() + 1} of {flow.totalSteps()}</p>
        <h2>{flow.currentStep()?.stepTitle ?? flow.currentStep()?.sectionTitle}</h2>
        <For each={flow.visibleQuestions()}>
          {(q) => (
            <label>
              {q.text}
              <Show
                when={q.options?.length}
                fallback={
                  <input
                    value={(flow.answers()[q.questionId] as string) ?? ''}
                    onInput={(e) => flow.setAnswer(q.questionId, e.currentTarget.value)}
                  />
                }
              >
                <select
                  value={(flow.answers()[q.questionId] as string) ?? ''}
                  onChange={(e) => flow.setAnswer(q.questionId, e.currentTarget.value)}
                >
                  <option value="" disabled>Select…</option>
                  <For each={q.options}>
                    {(o) => <option value={o.value}>{o.text ?? o.value}</option>}
                  </For>
                </select>
              </Show>
            </label>
          )}
        </For>
        <Show when={flow.validationError()}>
          <p role="alert">{flow.validationError()}</p>
        </Show>
        <button onClick={flow.back} disabled={flow.stepIndex() === 0}>Back</button>
        <button onClick={flow.next} disabled={flow.submitting()}>
          {flow.submitting() ? 'Checking…' : 'Next'}
        </button>
      </Match>
    </Switch>
  );
}
```

The `submitting` outcome falls through to the `Switch` fallback in this example. Add a `Match` for it if you want a distinct message.

See [examples/solid-vite](https://github.com/thefortifiedgrp/apex-survey-helper/tree/main/examples/solid-vite) for the runnable version.

## Server-backed drafts

Pass a `DraftStore` to keep in-progress answers on your own server so a patient can resume on another device:

```ts
import { useSurveyV2Flow } from '@apextelemed/survey-solid';
import type { DraftStore } from '@apextelemed/survey-core';

const draftStore: DraftStore = {
  load: async () => {
    const res = await fetch('/my-backend/survey-draft', { credentials: 'include' });
    return res.ok ? res.json() : null;
  },
  save: (draft) => {
    void fetch('/my-backend/survey-draft', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }).catch(() => {});
  },
  clear: () => {
    void fetch('/my-backend/survey-draft', { method: 'DELETE', credentials: 'include' }).catch(() => {});
  },
};

const flow = useSurveyV2Flow({ apiBaseUrl, publishableKey, drugIds: ['drug-A'], draftStore });
```

The contract a store must satisfy is in [Draft persistence](/survey-helper/headless/#draft-persistence).
