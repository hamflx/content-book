# Blog deployment

The blog uses `hamflx/blog-gen`, with articles from the `hamflx/content`
submodule at `src/posts`. The static export is `public/`.
`book.toml` and `theme/` are retained from the previous mdBook setup.

Cloudflare Pages hosts this site as project `blog`. Its production branch is
`main`. This is a Direct Upload project: pushing Git commits does not publish
the website. Keep a verified copy of the static export outside Git.

## Navigation updates

Edit `[[site.navigation]]` entries in `blog-gen.toml`. The generator's shared
layout adds them after Home on both the index and article pages.
Use `hamflx/blog-gen` revision `76b88f2` or a later revision that supports
`site.url` and configurable navigation.

For an existing site, a navigation-only refresh preserves article HTML,
descriptions, keywords, analytics, and assets. It does not call an AI service.
Place the generator checkout beside this checkout, install its dependencies
with `bun install --frozen-lockfile`, and restore the verified site export to
`public/`. Then, from this directory, run:

```sh
node scripts/refresh-navigation.mjs ../blog-gen
```

This validates every page before writing and updates only navigation markup
and its stylesheet from the generator template. It is not a full site rebuild.

## Canonical URLs and indexing files

`site.url` in `blog-gen.toml` identifies the production origin. Home links use
`/`, and article links and canonical URLs omit `.html`. The actual files remain
HTML files: Cloudflare Pages serves the extensionless URLs and redirects the
older `.html` URLs automatically. Keep those redirects for existing links.

To update a verified existing export without regenerating articles or AI
summaries, run:

```sh
node scripts/refresh-seo.mjs ../blog-gen
```

The script validates all pages before writing. In existing HTML it changes only
canonical tags and destinations of links to known site pages. It retains article
text, descriptions, keywords, images, analytics, and external links. It also
creates `sitemap.xml`, `robots.txt`, and a styled `404.html` from the generator
templates. Running it again produces identical output. Run it after a navigation
refresh when updating both features.

The sitemap includes only the homepage and article canonical URLs. It excludes
the error page, subdomains, and preview URLs; it does not invent last-modified
dates. `robots.txt` permits crawling and points to that sitemap. The top-level
`404.html` disables Pages' automatic homepage fallback, so unknown URLs return
HTTP 404 instead of a duplicate homepage with HTTP 200.

## Full rebuild

Install dependencies and run `bun run build:package` in the generator checkout.
Initialize this repository's article submodule using
`git submodule update --init --recursive`, then run the generator from here:

```sh
node ../blog-gen/bin/cli.js
```

The existing configuration enables AI summaries and keywords. A full rebuild
requires the appropriate credentials and cache; disabling AI also omits
cache-derived metadata. Restore or persist that metadata before using a full
rebuild to replace the existing export. Review the generated content diff.

## Preview and production

Review the exact source diff, commit metadata, and complete export for private
information. Never upload `.env`, source checkouts, logs, or local credentials.
Use a clean, committed release checkout and upload only `public/`.

After authenticating Wrangler with Pages deployment access:

```sh
npx wrangler@4.149.0 pages deploy public --project-name=blog --branch=preview-seo
```

Check every page's navigation and Home link, desktop and mobile layouts, and
external destinations. Also verify:

- Each canonical URL returns HTTP 200 directly and has one self-referencing
  canonical tag; its `.html` variant still redirects to it.
- `/sitemap.xml` is XML with exactly the intended canonical URLs, and
  `/robots.txt` is plain text containing the production sitemap URL.
- Unknown root and nested paths return HTTP 404 with the error page. Its Home
  link works from any depth, and it does not canonicalize to the homepage.
- Production HTML has no `noindex`; Pages preview responses retain their
  automatic `X-Robots-Tag: noindex` header.
- Existing article text, summaries, keywords, and asset hashes are preserved.

Publish the same verified export without rebuilding:

```sh
npx wrangler@4.149.0 pages deploy public --project-name=blog --branch=main
```

Recheck the production domain after publication. Keep the prior successful
production deployment and the release export hashes until verification is
complete. If necessary, select that previous deployment in Cloudflare Pages
and choose **Rollback to this deployment**.

Store release receipts, deployment IDs, and local paths outside the repository.

After publication, submit `https://hamflx.dev/sitemap.xml` in Search Console and
inspect the final canonical article URLs. Existing intended redirects and the
account service's intentional `noindex` are expected exclusions. These changes
improve indexing signals but do not guarantee Google will index every article.
