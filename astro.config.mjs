// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { satteri } from '@astrojs/markdown-satteri';
import starlightLinksValidator from 'starlight-links-validator';
import { baseLinksPlugin } from './plugins/base-links.mjs';

/**
 * Where the site is served from.
 *
 * GitHub Pages serves project sites under a sub-path, so `base` is the repo
 * name. When the docs move to a custom domain (e.g. docs.apextelemed.com),
 * set DOCS_SITE to that origin and DOCS_BASE to '/' (and add a `CNAME` file
 * under public/). Nothing else needs to change: content links are written
 * root-relative and rewritten at build by baseLinksPlugin.
 */
const SITE = process.env.DOCS_SITE ?? 'https://thefortifiedgrp.github.io';
const BASE = process.env.DOCS_BASE ?? '/apex-devdocs';

// https://astro.build/config
export default defineConfig({
	site: SITE,
	base: BASE,
	trailingSlash: 'always',
	markdown: {
		processor: satteri({ mdastPlugins: [baseLinksPlugin(BASE)] }),
	},
	integrations: [
		starlight({
			title: 'Apex Telemed Developer Docs',
			description:
				'Integrate with the Apex Telemed platform: the Partner API, the survey embed SDK, and the partner-core site library.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/thefortifiedgrp/apex-devdocs' },
			],
			editLink: {
				baseUrl: 'https://github.com/thefortifiedgrp/apex-devdocs/edit/main/',
			},
			lastUpdated: true,
			customCss: ['./src/styles/custom.css'],
			plugins: [
				starlightLinksValidator({
					// Content links are root-relative and rewritten by baseLinksPlugin.
					errorOnRelativeLinks: false,
				}),
			],
			sidebar: [
				{
					label: 'Getting started',
					items: [{ autogenerate: { directory: 'getting-started' } }],
				},
				{
					label: 'Partner API',
					items: [{ autogenerate: { directory: 'api' } }],
				},
				{
					label: 'Survey helper',
					items: [{ autogenerate: { directory: 'survey-helper' } }],
				},
				{
					label: 'Partner SDK (partner-core)',
					items: [{ autogenerate: { directory: 'partner-sdk' } }],
				},
			],
		}),
	],
});
