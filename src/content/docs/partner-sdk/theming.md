---
title: Theming
description: The four CSS-variable stylesheets and their variable families, the exported variable list, the UnoCSS preset, and the shared breakpoints.
sidebar:
  order: 6
---

Two theming mechanisms coexist. The customer flow pages take their look from the `Primitives` you implement, so they are themed by your own component library. The portals, the password pages and the `defaultPrimitives` implementation are themed by CSS variables: each has a stylesheet that declares defaults on `:root`, and you override individual variables in a stylesheet of your own.

## Cascade order

Import the package stylesheet first and your override second. Both define the same variables on `:root`, so source order decides, and an override that loads first silently loses to the defaults.

```ts
// src/index.tsx
import '@apextelemed/partner-core/theme/admin.css';   // defaults
import './theme/admin-theme.css';                       // your :root { --app-admin-*: ... }
```

```css
/* src/theme/admin-theme.css */
:root {
  --app-admin-bg: #f7f9fb;
  --app-admin-fg: #0f172a;
  --app-admin-primary: #2563eb;
  --app-admin-radius: 0;
  --app-admin-font-display: 'Orbitron', system-ui, sans-serif;
}
```

Import only the stylesheets for the surfaces you mount.

| Stylesheet | Variable family | Consumed by |
| --- | --- | --- |
| `@apextelemed/partner-core/theme/flow.css` | `--app-flow-*` | `defaultPrimitives`, and through it every customer page rendered with the defaults |
| `@apextelemed/partner-core/theme/admin.css` | `--app-admin-*` | `AdminDashboard`, `EmailTemplates`, `PatientDashboardPreview` |
| `@apextelemed/partner-core/theme/affiliate.css` | `--app-affiliate-*` | `AffiliatePortal`, `AffiliateLogin`, `AffiliateRegister`, `AffiliateForgotPassword`, `AffiliateResetPassword`, and also the patient `ForgotPasswordPage` and `ResetPasswordPage` |
| `@apextelemed/partner-core/theme/member-portal.css` | `--app-portal-*` | `MemberPortal` |

Colours are plain values, not alpha-tweaked by the components, so you can use any colour space in overrides.

## `flow.css`

Styling for `defaultPrimitives`. This is the cheap tier of storefront customisation: a site that does not need its own component structure passes `defaultPrimitives` to `PrimitivesProvider`, imports this file, and sets the variables below. A site that implements `Primitives` itself does not need this file.

Beyond colour, a few "character" knobs let very different brands come out of the same markup: corner radius, and the button's text transform, letter spacing and weight.

| Group | Variables |
| --- | --- |
| Surfaces | `--app-flow-surface`, `--app-flow-surface-raised`, `--app-flow-surface-inset` |
| Text | `--app-flow-fg`, `--app-flow-fg-muted`, `--app-flow-fg-on-primary`, `--app-flow-fg-on-danger`, `--app-flow-fg-on-success` |
| Typography | `--app-flow-font-body`, `--app-flow-font-display` |
| Borders | `--app-flow-border`, `--app-flow-border-strong` |
| Primary | `--app-flow-primary`, `--app-flow-primary-hover`, `--app-flow-primary-soft` |
| Status | `--app-flow-danger`, `--app-flow-danger-soft`, `--app-flow-success`, `--app-flow-success-soft`, `--app-flow-warning`, `--app-flow-warning-soft`, `--app-flow-info`, `--app-flow-info-soft` |
| Shape | `--app-flow-radius`, `--app-flow-radius-sm` |
| Buttons | `--app-flow-btn-transform`, `--app-flow-btn-tracking`, `--app-flow-btn-weight` |
| Select | `--app-flow-select-chevron` |

```css
/* brand.css, imported after flow.css */
:root {
  --app-flow-primary: #6b46c1;
  --app-flow-radius: 0.75rem;
  --app-flow-font-display: 'Sora', system-ui, sans-serif;
  --app-flow-btn-transform: uppercase;
  --app-flow-btn-tracking: 0.08em;
}
```

## `admin.css`

Defaults for the admin dashboard. The default palette is dark.

| Group | Variables |
| --- | --- |
| Page and surfaces | `--app-admin-bg`, `--app-admin-surface`, `--app-admin-surface-light` |
| Borders | `--app-admin-border`, `--app-admin-border-soft`, `--app-admin-border-strong` |
| Text | `--app-admin-fg`, `--app-admin-fg-muted`, `--app-admin-fg-subtle` |
| Typography | `--app-admin-font-display`, `--app-admin-font-body`, `--app-admin-font-mono` |
| Primary | `--app-admin-primary`, `--app-admin-primary-hover`, `--app-admin-primary-fg`, `--app-admin-primary-soft`, `--app-admin-primary-soft-fg` |
| Status | `--app-admin-success-bg`, `--app-admin-success-fg`, `--app-admin-warning-bg`, `--app-admin-warning-bg-strong`, `--app-admin-warning-fg`, `--app-admin-danger-bg`, `--app-admin-danger-bg-strong`, `--app-admin-danger-fg`, `--app-admin-info-bg`, `--app-admin-info-fg` |
| Shape | `--app-admin-radius`, `--app-admin-radius-sm`, `--app-admin-radius-lg` |

### `ADMIN_CSS_VARIABLES`

The same thirty names, exported from `@apextelemed/partner-core/theme` as a readonly tuple, with the union type `AdminCssVariable`. Use it to generate an override stylesheet programmatically or to type a theme object.

```ts
import { ADMIN_CSS_VARIABLES, type AdminCssVariable } from '@apextelemed/partner-core/theme';

const overrides: Partial<Record<AdminCssVariable, string>> = {
  '--app-admin-bg': '#f7f9fb',
  '--app-admin-fg': '#0f172a',
};

const css = `:root{${ADMIN_CSS_VARIABLES
  .filter((v) => overrides[v])
  .map((v) => `${v}:${overrides[v]}`)
  .join(';')}}`;
```

### `adminPreset` for UnoCSS

Sites that use UnoCSS can merge `adminPreset` into their config to get utility classes that resolve to the admin variables. The CSS file must still be imported once; the preset only adds class sugar on top.

```ts
import { defineConfig, presetUno } from 'unocss';
import { adminPreset } from '@apextelemed/partner-core/theme';

export default defineConfig({
  presets: [presetUno()],
  theme: { ...adminPreset.theme },
  shortcuts: { ...adminPreset.shortcuts },
});
```

The preset contributes:

| Key | Adds |
| --- | --- |
| `theme.colors.admin` | `bg`, `surface`, `surface-light`, `border`, `border-soft`, `fg`, `fg-muted`, `primary`, `primary-soft`, `primary-soft-fg`, `success-bg`, `success-fg`, `warning-bg`, `warning-fg`, `danger-bg`, `danger-fg`, `info-bg`, `info-fg`, so `bg-admin-surface` or `text-admin-fg-muted` work |
| `theme.borderRadius` | `admin-sm`, `admin`, `admin-lg` |
| `theme.fontFamily` | `admin-display`, `admin-body`, `admin-mono` |
| `shortcuts` | `app-admin-card` (surface, border, radius) and `app-admin-card-soft` |

## `affiliate.css`

Defaults for the affiliate portal and account pages, and for the patient password pages. Same structure as the admin theme with a slightly smaller set.

| Group | Variables |
| --- | --- |
| Page and surfaces | `--app-affiliate-bg`, `--app-affiliate-surface`, `--app-affiliate-surface-light` |
| Borders | `--app-affiliate-border`, `--app-affiliate-border-soft`, `--app-affiliate-border-strong` |
| Text | `--app-affiliate-fg`, `--app-affiliate-fg-muted`, `--app-affiliate-fg-subtle` |
| Typography | `--app-affiliate-font-display`, `--app-affiliate-font-body`, `--app-affiliate-font-mono` |
| Primary | `--app-affiliate-primary`, `--app-affiliate-primary-hover`, `--app-affiliate-primary-fg`, `--app-affiliate-primary-soft`, `--app-affiliate-primary-soft-fg` |
| Status | `--app-affiliate-success-bg`, `--app-affiliate-success-fg`, `--app-affiliate-warning-bg`, `--app-affiliate-warning-fg`, `--app-affiliate-danger-bg`, `--app-affiliate-danger-fg` |
| Shape | `--app-affiliate-radius`, `--app-affiliate-radius-sm` |

## `member-portal.css`

Defaults for the member portal: a light, calm palette with one accent for fulfilment progress and primary buttons, a separate consultation colour, and message-bubble colours. `--app-portal-font-body` and `--app-portal-font-display` default to `inherit`, so the portal picks up the host page's fonts until you set a display face.

| Group | Variables |
| --- | --- |
| Page and surfaces | `--app-portal-bg`, `--app-portal-surface`, `--app-portal-surface-raised` |
| Text | `--app-portal-fg`, `--app-portal-fg-muted` |
| Typography | `--app-portal-font-body`, `--app-portal-font-display` |
| Borders | `--app-portal-border`, `--app-portal-border-strong` |
| Accent | `--app-portal-accent`, `--app-portal-accent-bright`, `--app-portal-accent-soft`, `--app-portal-accent-fill` |
| Messages | `--app-portal-bubble-own-bg`, `--app-portal-bubble-own-fg`, `--app-portal-bubble-own-meta` |
| Consultation and status | `--app-portal-consult`, `--app-portal-consult-soft`, `--app-portal-neutral`, `--app-portal-danger` |

The stylesheet also uses `--portal-top` for the fixed-header offset; `MemberPortal` sets it from its `topOffset` prop. Per-element `--i` and `--p` values are layout inputs set inline by the components, not theme tokens.

## Breakpoints

`BREAKPOINTS` and `media` are exported from `@apextelemed/partner-core/theme` so your layout code and the portals agree on where the sidebar collapses.

```ts
import { BREAKPOINTS, media, type Breakpoint } from '@apextelemed/partner-core/theme';

BREAKPOINTS; // { sm: 480, md: 768, lg: 1024, xl: 1280 } in px
media.mdUp;  // '(min-width: 768px)'
media.mdDown; // '(max-width: 767px)'

const isDesktop = window.matchMedia(media.lgUp).matches;
```

`media` provides `smUp`, `mdUp`, `lgUp`, `xlUp`, `smDown`, `mdDown` and `lgDown`.
