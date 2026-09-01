# Apex Telemed Developer Docs

Public developer documentation for the Apex Telemed platform, published at
https://thefortifiedgrp.github.io/apex-devdocs/.

It unifies three previously separate sets of docs:

| Section | Covers | Source of truth for behaviour |
| --- | --- | --- |
| Getting started | Overview, choosing an integration, environments, authentication | this repo |
| Partner API | The REST API under `/api/v1`, `/api/v2/public`, `/api/v2/embed`, webhooks | `apextelemed` backend routes, controllers, and zod schemas |
| Survey helper | `@apextelemed/survey-core`, `-react`, `-solid` | [`apex-survey-helper`](https://github.com/thefortifiedgrp/apex-survey-helper) |
| Partner SDK | `@apextelemed/partner-core` | `apex-partner-core` |

This repo is the canonical home for partner-facing prose. The source repos keep
their READMEs short and link here.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321/apex-devdocs/
npm run build    # also validates every internal link
```

Built with [Astro Starlight](https://starlight.astro.build/). Node 22 or newer.

## Writing pages

Pages live under `src/content/docs/<section>/` as Markdown. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for the conventions: frontmatter, sidebar
ordering, root-relative links, asides, and the accuracy rules for API
reference pages.

## Deployment

Every push to `main` builds the site and deploys it to GitHub Pages through
`.github/workflows/deploy.yml`. Pull requests run the same build (which fails
on broken internal links) through `.github/workflows/ci.yml`.

### Moving to a custom domain

1. Add a `public/CNAME` file containing the domain (for example
   `docs.apextelemed.com`) and point a DNS `CNAME` at
   `thefortifiedgrp.github.io`.
2. In the deploy workflow, set `DOCS_SITE=https://docs.apextelemed.com` and
   `DOCS_BASE=/` as environment variables for the build step.
3. Update `DEVELOPER_DOCS_URL` in the apextelemed partner portal.

Content does not change: internal links are written root-relative and the
build prefixes the base path.
