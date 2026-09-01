# Contributing

## Where things go

```
src/content/docs/
  index.mdx               landing page
  getting-started/        overview, choosing an integration, environments, authentication
  api/                    Partner API reference, one page per resource
  survey-helper/          survey-v2 embed SDK
  partner-sdk/            @apextelemed/partner-core
```

The sidebar is generated from these directories. Order pages with
`sidebar.order` in frontmatter; a directory's `index.md` is its landing page.

## Page conventions

- Frontmatter has `title`, a one-sentence `description`, and `sidebar.order`.
  No H1 in the body; the title comes from frontmatter.
- Internal links are root-relative with a trailing slash: `/api/members/`,
  `/survey-helper/react/#phase-by-phase-rendering`. The build prefixes the
  deployment base path (`plugins/base-links.mjs`), so never hard-code
  `/apex-devdocs/`. `npm run build` fails on a broken internal link.
- Endpoint headings: `` ### `POST /v1/requests` ``.
- Field tables: `| Field | Type | Required | Description |`.
- Callouts use Starlight asides: `:::note`, `:::tip`, `:::caution`,
  `:::danger`, closed with `:::`.
- Every fenced code block names its language.
- Second person, direct, short sentences. No marketing copy.

## Accuracy rules for reference pages

These docs are read by external developers who cannot see Apex source code,
so a wrong field is worse than a missing one.

- Every endpoint, field, header, status code, and behaviour must be verified
  against the current code in the owning repo before it is written down. The
  routes, controllers, and zod schemas are the source of truth; older prose
  is not.
- Document only partner-facing surfaces. Routes that require a portal login
  (JWT) are internal and do not belong here.
- Do not mention internal file paths, internal repo layout, hosting
  providers, or tooling. Do not paste real keys or internal URLs.
- When a behaviour changes in a source repo, update the page here in the same
  change or open an issue in this repo that links to the PR.

## Shared facts

Keep these consistent across pages:

| Fact | Value |
| --- | --- |
| Production API base | `https://apextelemed.com/api` |
| Sandbox API base | `https://apextelemed-dev.web.app/api` |
| API key | `apx_` + 32 hex, header `x-api-key` |
| Publishable key | `pk_` + 32 hex, header `x-apex-publishable-key`, origin allow-listed |
| Tenant key (partner SDK) | header `x-tenant-key` |
| Error body | `{ "error": "<message>" }` |
| npm packages | `@apextelemed/survey-core`, `@apextelemed/survey-react`, `@apextelemed/survey-solid`, `@apextelemed/partner-core` |
