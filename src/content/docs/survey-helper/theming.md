---
title: Theming
description: The survey helper ships no markup and no CSS. What you control, the optional branding data Apex sends, and accessibility notes for the UI you build.
sidebar:
  order: 6
---

The adapters are **headless**. They ship **no markup and no CSS**. You render every element and own all of the styling. There is nothing to override, reset, or fight with.

This is deliberate. A survey embedded in your site should look like your site. The SDK gives you data and behavior. Your design system gives it a body.

## What you control

Everything visual:

- The layout of each step, the question controls (inputs, selects, radios, checkboxes), buttons, progress indicators, error and validation text, the patient-info form, and the disqualified and complete screens.
- How you map `question.type` to a control. Each `V2Question` carries `type`, `options`, `required`, `helpText`, and `text`. Types are strings chosen when Apex authors a survey section, so render the ones you recognise and fall back to a text input for the rest. The engine gives only `multi_select` special handling: its answer is an array, and a visible `multi_select` the patient never touched is submitted as `[]`.
- Option grouping. A `V2QuestionOption` may carry a `group` string, for example a body-system category for a long list of conditions. Cluster options under subheadings by `group` if it suits your design, or ignore it.

Progress is yours to present too. `stepIndex` and `totalSteps` count the flattened steps; each `FlatStep` also carries `sectionTitle`, `sectionDescription`, `stepTitle`, and `stepDescription` if you want section headings or a section-level progress bar.

## Optional branding from Apex

A composed survey may include a `branding` block you can apply if you want the survey to reflect the branding configured for your partner account:

```ts
flow.state.composed?.branding
// → { logoUrl?: string; primaryColor?: string; companyDisplayName?: string }
```

Use it or ignore it. It is just data. The composed survey also lists the drugs it covers under `composed.drugs` as `{ drugId, name?, description? }`, which is handy for a heading such as "Qualification for Drug A".

## Accessibility and UX notes

Because you own the markup, you also own accessibility. A few suggestions:

- Render `validationError` in an element with `role="alert"` so screen readers announce it.
- Associate `helpText` with its control through `aria-describedby`.
- Use `question.text` as the visible label. Display `option.text ?? option.value` for choices and submit `option.value`. Do not display `value` directly: it is often a slug.
- Mark required questions visually. The engine blocks **Next** until every visible required question has an answer, but the patient should know which ones before they click.
- Disable **Next** while `submitting` is true, and show a waiting state instead of the form during the `submitting` phase, to prevent double submissions.
- Move focus to the step heading after each step change so keyboard and screen-reader users are not left at the bottom of the previous step.
- Use `type="date"` for `dob` (the engine expects `YYYY-MM-DD`) and constrain `state` to a two-letter code.

## Want a pre-styled drop-in?

These packages intentionally do not ship one. If you need a zero-build `<script>` widget with default styles, talk to Apex. That is a separate deliverable, not part of the headless packages.
