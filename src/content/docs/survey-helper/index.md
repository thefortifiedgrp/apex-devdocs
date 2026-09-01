---
title: Getting started
description: Install the Apex survey helper SDK and render the qualification survey on your own site with React, Solid, or no framework.
sidebar:
  order: 1
---

The survey helper is the SDK for embedding the Apex Telemed qualification survey (survey v2) on your own site. It composes the survey for the drugs you sell, walks the patient through it one step at a time, hides questions whose conditions are not met, checks qualification between steps, keeps a draft so a refresh resumes where the patient left off, and submits the response to Apex. You supply every element of the UI. The SDK ships no markup and no CSS.

## Packages

| Package | What it is | Install |
| --- | --- | --- |
| `@apextelemed/survey-core` | Framework-agnostic engine and API client. Zero runtime dependencies. | `npm install @apextelemed/survey-core` |
| `@apextelemed/survey-react` | React hook (`useSurveyV2Flow`) over the core. | `npm install @apextelemed/survey-core @apextelemed/survey-react` |
| `@apextelemed/survey-solid` | Solid hook (`useSurveyV2Flow`) over the core. | `npm install @apextelemed/survey-core @apextelemed/survey-solid` |

All three packages are published to npm under the MIT license and ship ESM and CommonJS builds with TypeScript declarations. The React adapter needs `react` 18 or later. The Solid adapter needs `solid-js` 1.9 or later. The three packages are versioned together, so install matching versions.

The source, runnable examples, and release notes live in the public repository at [github.com/thefortifiedgrp/apex-survey-helper](https://github.com/thefortifiedgrp/apex-survey-helper).

:::note
Building a full patient portal (signup, checkout, subscriptions) rather than embedding a single survey? The [Partner SDK](/partner-sdk/) re-exports this core alongside the rest of the portal flows. See [Choosing an integration](/getting-started/choosing-an-integration/) for a comparison.
:::

## Prerequisites

You need three things from Apex before the survey will load:

1. A **publishable key** (`pk_live_…` or `pk_test_…`). It is safe to ship in your client bundle. See [Authentication](/getting-started/authentication/).
2. Your site's **origin on your allow-list**, for example `https://app.yourco.com`. Browser requests from any other origin are rejected.
3. One or more **drug IDs** to compose the survey for, or a **returning-member token** for a refill flow.

Keys and allow-lists are separate per environment. See [Environments](/getting-started/environments/).

:::tip
Don't want any Apex key in the browser, or running a multi-tenant platform? Route the calls through your own backend instead. See [Authentication and modes](/survey-helper/auth-and-modes/).
:::

## Install

```bash
# React
npm install @apextelemed/survey-core @apextelemed/survey-react

# Solid
npm install @apextelemed/survey-core @apextelemed/survey-solid

# No framework
npm install @apextelemed/survey-core
```

## Render the flow with React

```tsx
import { useSurveyV2Flow } from '@apextelemed/survey-react';

export function Intake() {
  const flow = useSurveyV2Flow({
    apiBaseUrl: 'https://apextelemed.com/api',
    publishableKey: import.meta.env.VITE_APEX_PUBLISHABLE_KEY,
    drugIds: ['drug-A'],
    onComplete: (r) => console.log('response', r.responseId),
  });

  switch (flow.outcome.kind) {
    case 'loading':
      return <p>Loading…</p>;
    case 'load_failed':
      return <p role="alert">Something went wrong: {flow.outcome.error}</p>;
    case 'submitting':
      return <p>Submitting…</p>;
    case 'disqualified':
      return <p>Unfortunately you're not eligible at this time.</p>;
    case 'complete':
      return <p>All set. We'll be in touch shortly.</p>;
  }

  if (flow.outcome.kind === 'patient_info') {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void flow.submit(); }}>
        <input placeholder="First name" value={flow.patientInfo.firstName ?? ''}
          onChange={(e) => flow.setPatientInfo({ firstName: e.target.value })} />
        <input placeholder="Last name" value={flow.patientInfo.lastName ?? ''}
          onChange={(e) => flow.setPatientInfo({ lastName: e.target.value })} />
        <input placeholder="Email" type="email" value={flow.patientInfo.email ?? ''}
          onChange={(e) => flow.setPatientInfo({ email: e.target.value })} />
        <input placeholder="Date of birth" type="date" value={flow.patientInfo.dob ?? ''}
          onChange={(e) => flow.setPatientInfo({ dob: e.target.value })} />
        <input placeholder="State (2-letter)" value={flow.patientInfo.state ?? ''}
          onChange={(e) => flow.setPatientInfo({ state: e.target.value.toUpperCase() })} />
        {flow.validationError && <p role="alert">{flow.validationError}</p>}
        <button type="button" onClick={flow.back}>Back</button>
        <button type="submit" disabled={flow.submitting}>Submit</button>
      </form>
    );
  }

  // questions phase
  return (
    <div>
      <p>Step {flow.stepIndex + 1} of {flow.totalSteps}</p>
      <h2>{flow.currentStep?.stepTitle ?? flow.currentStep?.sectionTitle}</h2>
      {flow.visibleQuestions.map((q) => (
        <label key={q.questionId}>
          <span>{q.text}</span>
          {q.options?.length ? (
            <select
              value={(flow.answers[q.questionId] as string) ?? ''}
              onChange={(e) => flow.setAnswer(q.questionId, e.target.value)}
            >
              <option value="" disabled>Select…</option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>{o.text ?? o.value}</option>
              ))}
            </select>
          ) : (
            <input
              value={(flow.answers[q.questionId] as string) ?? ''}
              onChange={(e) => flow.setAnswer(q.questionId, e.target.value)}
            />
          )}
        </label>
      ))}
      {flow.validationError && <p role="alert">{flow.validationError}</p>}
      <button onClick={flow.back} disabled={flow.stepIndex === 0}>Back</button>
      <button onClick={flow.next} disabled={flow.submitting}>Next</button>
    </div>
  );
}
```

That is the whole integration. The hook constructs the engine once when the component mounts and tears it down on unmount. See the [React adapter](/survey-helper/react/) for every option and field.

## Render the flow with Solid

The Solid API has the same shape. Every read is an accessor, so call it as a function.

```tsx
import { useSurveyV2Flow } from '@apextelemed/survey-solid';
import { Switch, Match, For, Show } from 'solid-js';

export function Intake() {
  const flow = useSurveyV2Flow({
    apiBaseUrl: 'https://apextelemed.com/api',
    publishableKey: import.meta.env.VITE_APEX_PUBLISHABLE_KEY,
    drugIds: ['drug-A'],
  });

  return (
    <Switch fallback={<p>Loading…</p>}>
      <Match when={flow.outcome().kind === 'load_failed'}>
        <p role="alert">Something went wrong.</p>
      </Match>
      <Match when={flow.outcome().kind === 'questions'}>
        <h2>{flow.currentStep()?.stepTitle ?? flow.currentStep()?.sectionTitle}</h2>
        <For each={flow.visibleQuestions()}>
          {(q) => (
            <label>
              {q.text}
              <input
                value={(flow.answers()[q.questionId] as string) ?? ''}
                onInput={(e) => flow.setAnswer(q.questionId, e.currentTarget.value)}
              />
            </label>
          )}
        </For>
        <Show when={flow.validationError()}>
          <p role="alert">{flow.validationError()}</p>
        </Show>
        <button onClick={flow.back} disabled={flow.stepIndex() === 0}>Back</button>
        <button onClick={flow.next} disabled={flow.submitting()}>Next</button>
      </Match>
      <Match when={flow.outcome().kind === 'patient_info'}>
        {/* patient-info form: flow.patientInfo(), flow.setPatientInfo(), flow.submit() */}
      </Match>
      <Match when={flow.outcome().kind === 'disqualified'}><p>Not eligible.</p></Match>
      <Match when={flow.outcome().kind === 'complete'}><p>Thanks!</p></Match>
    </Switch>
  );
}
```

See the [Solid adapter](/survey-helper/solid/) for the full reference, including the patient-info form.

## What the SDK does for you

- Composes the survey for your `drugIds` (or `token`) as soon as the engine is created.
- Walks the patient through one step at a time and skips steps whose questions are all hidden by earlier answers.
- Shows only the questions whose visibility conditions match the current answers.
- Runs a qualification check on every **Next**. If every requested drug is disqualified, the flow ends in `disqualified`.
- Collects the patient's details on a final form, validates the required fields, and submits the response.
- Saves a draft of the answers and current step to `localStorage`, so a refresh resumes the survey. Drafts expire after 24 hours and can be moved to your own server.
- Emits lifecycle events (`survey:loaded`, `step:shown`, `qualification:checked`, `submit:succeeded`, and more) for your analytics.

## Next steps

- [Authentication and modes](/survey-helper/auth-and-modes/): browser-direct versus proxy through your backend, the security model, refills and returning customers, draft persistence.
- [React adapter](/survey-helper/react/) and [Solid adapter](/survey-helper/solid/): every option, returned field, and event.
- [Headless core](/survey-helper/headless/): drive the engine from vanilla JS, Vue, Svelte, or web components, and plug in a server-backed draft store.
- [Theming](/survey-helper/theming/): what you control, optional branding data, accessibility notes.
- [API contract](/survey-helper/api-contract/): the endpoints the engine calls, the headers it sends, the exported types, and what a proxy must satisfy.
- Runnable examples: [examples/react-vite](https://github.com/thefortifiedgrp/apex-survey-helper/tree/main/examples/react-vite) and [examples/solid-vite](https://github.com/thefortifiedgrp/apex-survey-helper/tree/main/examples/solid-vite) in the repository. Copy the `.env.example`, set your publishable key and drug IDs, and run the Vite dev server.
- Release notes: the changelogs for [survey-core](https://github.com/thefortifiedgrp/apex-survey-helper/blob/main/packages/core/CHANGELOG.md), [survey-react](https://github.com/thefortifiedgrp/apex-survey-helper/blob/main/packages/react/CHANGELOG.md), and [survey-solid](https://github.com/thefortifiedgrp/apex-survey-helper/blob/main/packages/solid/CHANGELOG.md).
