## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Project conventions

This is the public developer documentation for Apex Telemed. Read
[CONTRIBUTING.md](./CONTRIBUTING.md) before adding or editing pages: it covers
frontmatter, sidebar ordering, root-relative links (never hard-code the
`/apex-devdocs/` base path; `plugins/base-links.mjs` adds it at build), asides,
and the accuracy rules for API reference pages. Reference pages must be
verified against the owning repo's current code, never against older prose.
`npm run build` fails on broken internal links; run it before committing.
