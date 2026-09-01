/**
 * Sätteri mdast plugin: prefix root-relative Markdown links (`/api/members/`)
 * with the site `base`.
 *
 * Astro does not rewrite links inside Markdown when `base` is set, so without
 * this every author would have to remember the deployment sub-path. With it,
 * content is written against the site root and works unchanged when the docs
 * move between `/apex-devdocs/` on GitHub Pages and `/` on a custom domain.
 *
 * Only `/...` links are touched. Protocol-relative (`//`), absolute
 * (`https://`), anchor (`#`), and relative (`../`) links are left alone, and a
 * link that already carries the prefix is not prefixed twice.
 *
 * @param {string} base  The Astro `base` option.
 * @returns {import('satteri').MdastPluginDefinition}
 */
export function baseLinksPlugin(base) {
	const prefix = base.replace(/\/+$/, '');

	const prefixed = (url) => {
		if (!prefix || typeof url !== 'string') return undefined;
		if (!url.startsWith('/') || url.startsWith('//')) return undefined;
		if (url === prefix || url.startsWith(`${prefix}/`)) return undefined;
		return `${prefix}${url}`;
	};

	return {
		name: 'apex-base-links',
		link(node) {
			const url = prefixed(node.url);
			if (url === undefined) return;
			return { type: 'link', url, title: node.title ?? null, children: [...node.children] };
		},
		definition(node) {
			const url = prefixed(node.url);
			if (url === undefined) return;
			return {
				type: 'definition',
				identifier: node.identifier,
				label: node.label,
				url,
				title: node.title ?? null,
			};
		},
	};
}
