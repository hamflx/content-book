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
Use `hamflx/blog-gen` revision `867461b` or a later revision that includes
configurable navigation.

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
npx wrangler@4.149.0 pages deploy public --project-name=blog --branch=preview-nav
```

Check every page's navigation and Home link, desktop and mobile layouts, and
external destinations. Publish the same verified export without rebuilding:

```sh
npx wrangler@4.149.0 pages deploy public --project-name=blog --branch=main
```

Recheck the production domain after publication. Keep the prior successful
production deployment and the release export hashes until verification is
complete. If necessary, select that previous deployment in Cloudflare Pages
and choose **Rollback to this deployment**.

Store release receipts, deployment IDs, and local paths outside the repository.
