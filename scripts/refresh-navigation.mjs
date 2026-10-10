#!/usr/bin/env node
// Refresh only the navigation in an existing, verified static export.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const generatorDir = path.resolve(process.argv[2] ?? '../blog-gen');
const require = createRequire(path.join(generatorDir, 'package.json'));
const TOML = require('@iarna/toml');
const Handlebars = require('handlebars');
const config = TOML.parse(await readFile('blog-gen.toml', 'utf8'));
const navigation = config.site.navigation ?? [];
assert(Array.isArray(navigation), 'site.navigation must be an array');
for (const item of navigation) {
  assert(item && typeof item.name === 'string' && item.name.trim(), 'Navigation name is required');
  assert(typeof item.url === 'string' && /^https?:\/\//i.test(item.url), 'An absolute HTTP(S) navigation URL is required');
  const url = new URL(item.url);
  assert(!url.username && !url.password, 'Navigation URLs must not contain credentials');
}

const layout = await readFile(path.join(generatorDir, 'src/templates/layout.html'), 'utf8');
const render = Handlebars.compile(layout);
const navPattern = /<nav\b[^>]*>[\s\S]*?<\/nav>/g;
const cssPattern = /        header nav \{[\s\S]*?(?=        \.content \{)/g;
const homePattern = /<a href="([^"]*index\.html)">Home<\/a>/;
const outputDir = path.resolve(config.paths.output);

async function htmlFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Static export must not contain symbolic links');
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (entry.name.endsWith('.html')) files.push(file);
  }
  return files;
}

function singleMatch(html, pattern, label) {
  const matches = [...html.matchAll(pattern)];
  assert.equal(matches.length, 1, `Expected exactly one ${label}`);
  return matches[0][0];
}

const files = await htmlFiles(outputDir);
assert(files.length > 0, 'Restore a verified static export before refreshing navigation');
const updates = [];
for (const file of files) {
  const original = await readFile(file, 'utf8');
  const oldNav = singleMatch(original, navPattern, 'navigation');
  const oldCss = singleMatch(original, cssPattern, 'navigation stylesheet');
  const homeHref = oldNav.match(homePattern)?.[1];
  assert(homeHref, 'Existing Home link is missing');
  const expectedHome = path.relative(path.dirname(file), path.join(outputDir, 'index.html')).replaceAll('\\', '/');
  assert.equal(homeHref, expectedHome, 'Existing Home link must point to the site index');
  const rendered = render({ navigation, rootPath: homeHref.slice(0, -'index.html'.length) });
  const newNav = singleMatch(rendered, navPattern, 'rendered navigation');
  const newCss = singleMatch(rendered, cssPattern, 'rendered navigation stylesheet');
  const updated = original.replace(oldNav, () => newNav).replace(oldCss, () => newCss);
  assert.equal(
    updated.replace(newNav, '').replace(newCss, ''),
    original.replace(oldNav, '').replace(oldCss, ''),
    'Content outside navigation must remain identical',
  );
  updates.push([file, updated]);
}

// Validate every page before writing any output.
for (const [file, updated] of updates) await writeFile(file, updated, 'utf8');
console.log(`Updated navigation in ${updates.length} pages; all other page content is unchanged.`);
