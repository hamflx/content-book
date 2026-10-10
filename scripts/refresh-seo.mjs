#!/usr/bin/env node
// Update indexing metadata and known page links without regenerating articles or AI metadata.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const generatorDir = path.resolve(process.argv[2] ?? '../blog-gen');
const require = createRequire(path.join(generatorDir, 'package.json'));
const TOML = require('@iarna/toml');
const Handlebars = require('handlebars');
const config = TOML.parse(await readFile('blog-gen.toml', 'utf8'));
assert(typeof config.site.url === 'string' && /^https?:\/\/[^/?#\s\\]+\/?$/i.test(config.site.url), 'site.url must be an absolute HTTP(S) origin');
const site = new URL(config.site.url);
assert(!site.username && !site.password && site.pathname === '/' && !site.search && !site.hash && !/[?#\s\\]/.test(config.site.url),
  'site.url must be an origin without credentials, path, query, or fragment');
const outputDir = path.resolve(config.paths.output);

async function htmlFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Static export must not contain symbolic links');
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (entry.name.endsWith('.html')) files.push(file);
  }
  return files.sort();
}

const files = (await htmlFiles(outputDir)).filter(file => path.relative(outputDir, file) !== '404.html');
assert(files.some(file => path.relative(outputDir, file) === 'index.html'), 'Restore a verified static export with index.html first');
const pagePaths = new Map();
for (const file of files) {
  const relative = path.relative(outputDir, file).replaceAll('\\', '/');
  assert(relative === 'index.html' || relative.startsWith(`${config.paths.posts}/`), 'Unexpected HTML page in the static export');
  const pathname = new URL(relative, site).pathname;
  const canonicalPath = relative === 'index.html' ? '/' : pathname.slice(0, -'.html'.length);
  pagePaths.set(pathname, canonicalPath);
  pagePaths.set(canonicalPath, canonicalPath);
}

const canonicalTag = /[ \t]*<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>[ \t]*\r?\n?/gi;
const anchorHref = /(<a\b[^>]*?\bhref=)(["'])(.*?)\2/gi;
const updates = [];
let linksUpdated = 0;
for (const file of files) {
  const original = await readFile(file, 'utf8');
  assert.equal((original.match(/<head>/g) ?? []).length, 1, 'Expected one document head');
  assert.equal((original.match(/<\/head>/g) ?? []).length, 1, 'Expected one closing document head');
  assert((original.match(canonicalTag) ?? []).length <= 1, 'Multiple canonical tags require manual review');
  const relative = path.relative(outputDir, file).replaceAll('\\', '/');
  const sourceUrl = new URL(relative, site);
  const canonical = new URL(pagePaths.get(sourceUrl.pathname), site).href;
  let updated = original.replace(canonicalTag, '');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  updated = updated.replace('</head>', `    <link rel="canonical" href="${Handlebars.escapeExpression(canonical)}">${newline}</head>`);
  updated = updated.replace(anchorHref, (match, prefix, quote, href) => {
    if (href.startsWith('#') || href.startsWith('?')) return match;
    // Preserve HTML entity spelling in existing query strings/fragments.
    const suffixIndex = href.search(/[?#]/);
    const pathname = suffixIndex < 0 ? href : href.slice(0, suffixIndex);
    const suffix = suffixIndex < 0 ? '' : href.slice(suffixIndex);
    let target;
    try { target = new URL(pathname, sourceUrl); } catch { return match; }
    const cleanPath = target.origin === site.origin ? pagePaths.get(target.pathname) : undefined;
    if (cleanPath === undefined) return match;
    const normalized = `${cleanPath}${suffix}`;
    if (normalized !== href) linksUpdated++;
    return `${prefix}${quote}${normalized}${quote}`;
  });
  // Only canonical tags and link destinations may differ in existing pages.
  const unchangedContent = html => html.replace(canonicalTag, '').replace(anchorHref, '$1$2$2');
  assert.equal(unchangedContent(updated), unchangedContent(original), 'Article content and existing metadata must remain unchanged');
  updates.push([file, updated]);
}

const renderLayout = Handlebars.compile(await readFile(path.join(generatorDir, 'src/templates/layout.html'), 'utf8'));
const renderNotFound = Handlebars.compile(await readFile(path.join(generatorDir, 'src/templates/404.html'), 'utf8'));
const notFound = renderLayout({
  title: `Page not found - ${config.site.title}`, siteTitle: config.site.title,
  siteDescription: config.site.description, siteFooter: config.site.footer,
  googleAnalyticsId: config.site.googleAnalyticsId, navigation: config.site.navigation ?? [],
  homeUrl: '/', rootPath: '', robots: 'noindex, follow', content: renderNotFound({ homeUrl: '/' }),
});
assert(/name="robots" content="noindex, follow"/.test(notFound), '404 template must be excluded from indexing');
assert(!/rel="canonical"/.test(notFound), '404 must not claim the homepage as canonical');
updates.push([path.join(outputDir, '404.html'), notFound]);
const xmlEscape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const urls = [...new Set(pagePaths.values())].sort().map(pathname => new URL(pathname, site).href);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
updates.push([path.join(outputDir, 'sitemap.xml'), sitemap]);
updates.push([path.join(outputDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', site).href}\n`]);

// Validate all existing pages and rendered templates before writing any output.
for (const [file, updated] of updates) await writeFile(file, updated, 'utf8');
console.log(`Updated ${files.length} canonical pages and ${linksUpdated} links; wrote sitemap.xml, robots.txt, and 404.html. Existing content and metadata are unchanged.`);
