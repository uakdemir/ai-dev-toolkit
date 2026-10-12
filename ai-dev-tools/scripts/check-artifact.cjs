#!/usr/bin/env node
'use strict';
// Checks one engineering artifact page against the rules of skills/create-artifact/SKILL.md.
//
//   node check-artifact.cjs [--final] [--assets <dir>] <page.html>
//
//   --final         also apply the rules of a page that goes into Git: each shared file is in Git, the
//                   folder name has no date, and a tracked Markdown file links to the page
//   --assets <dir>  the shared folder, when it is not <repository root>/docs/superpowers/artifacts/assets
//
// One line for each broken rule:  FAIL  <rule>  line <n>: <what is wrong>
// A page above the soft size target gets a WARN line and passes.
//
// The check reads text with patterns. It does not run the page. Thus it does not see a request that a
// script builds from parts, and it does not see the layout: look at the page at a width of 400 pixels.
//
// Node built-ins only. Exit 0 = pass, 1 = one or more broken rules, 2 = the check cannot run.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SOFT_PAGE_BYTES = 60000;
const MAX_PAGE_BYTES = 150000;
const MAX_ASSET_BYTES = 200000;
const ASSET_TYPES = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.woff2', '.woff', '.ttf', '.otf'];
const RUNTIME_MARKS = ['/_blob/', 'support.js', '<x-dc', 'claude.use', 'window.claude'];

function stop(message) {
  process.stderr.write(`cannot run: ${message}\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
let final = false;
let assetsDir = null;
let page = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--final') final = true;
  else if (args[i] === '--assets') { i += 1; assetsDir = args[i] ? path.resolve(args[i]) : stop('--assets needs a folder'); }
  else if (args[i].startsWith('--')) stop(`unknown option ${args[i]}`);
  else if (page === null) page = path.resolve(args[i]);
  else stop('give one page');
}
if (page === null) stop('usage: check-artifact.cjs [--final] [--assets <dir>] <page.html>');
if (!fs.existsSync(page) || !fs.statSync(page).isFile()) stop(`no file at ${page}`);

const raw = fs.readFileSync(page, 'utf8');
const bytes = fs.statSync(page).size;
const pageDir = path.dirname(page);

// Git gives the repository root. A search for a `.git` name is not sufficient: a worktree has a
// `.git` file, and a folder that is not a repository can hold a `.git` name.
function findRepoRoot(from) {
  try {
    return execFileSync('git', ['-C', from, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (error) {
    return null;
  }
}
const repoRoot = findRepoRoot(pageDir);
if (assetsDir === null && repoRoot !== null) assetsDir = path.join(repoRoot, 'docs', 'superpowers', 'artifacts', 'assets');
if (final && repoRoot === null) stop('--final needs a page inside a Git repository');

const fails = [];
const lineOf = (index) => raw.slice(0, index).split('\n').length;
const fail = (rule, index, message) => fails.push({ rule, line: lineOf(index), message });

// Each view has the length of the file, with the text of other kinds changed into spaces. A match
// in a view is then at the same position, and on the same line, as in the file.
const spaces = (text) => text.replace(/[^\n]/g, ' ');
const keep = (view, start, text) => view.slice(0, start) + text + view.slice(start + text.length);
const noComments = raw.replace(/<!--[\s\S]*?-->/g, spaces);
let tags = noComments;            // the markup, with no script text and no style text
let code = spaces(raw);           // the script text and the event attributes
let css = spaces(raw);            // the style text and the style attributes
const scripts = [];
const styles = [];
for (const m of noComments.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
  const start = m.index + m[0].indexOf('>') + 1;
  scripts.push({ index: m.index, end: m.index + m[0].length });
  code = keep(code, start, m[1]);
  tags = keep(tags, start, spaces(m[1]));
}
for (const m of noComments.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
  const start = m.index + m[0].indexOf('>') + 1;
  styles.push({ index: m.index });
  css = keep(css, start, m[1]);
  tags = keep(tags, start, spaces(m[1]));
}
for (const m of tags.matchAll(/\s(on[a-z]+|style)\s*=\s*("[^"]*"|'[^']*')/gi)) {
  const start = m.index + m[0].length - m[2].length;
  if (m[1].toLowerCase() === 'style') css = keep(css, start, m[2]);
  else code = keep(code, start, m[2]);
}

// ---- addresses: a load from another host, or a file that the page names ----
function checkAddress(address, index, what) {
  const value = address.trim();
  if (value === '' || value.startsWith('#') || /^(data|javascript|mailto|tel|about|blob):/i.test(value)) return;
  if (/^(https?:)?\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    fail('network', index, `${what} loads from another host: ${value}`);
    return;
  }
  if (value.startsWith('/')) {
    fail('asset', index, `${what} has an absolute path: ${value}. Use a relative path to the shared folder`);
    return;
  }
  checkSharedFile(value, index, what);
}

function checkSharedFile(value, index, what) {
  const file = path.resolve(pageDir, decodeURI(value.replace(/[?#].*$/, '')));
  if (assetsDir === null) {
    fail('asset', index, `${what} names the file ${value}, and no shared folder is known. Give it with --assets`);
    return;
  }
  if (path.relative(assetsDir, file).startsWith('..')) {
    fail('asset', index, `${what} names ${value}, which is not in the shared folder ${assetsDir}`);
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    fail('asset', index, `${what} names ${value}, and no file is there`);
    return;
  }
  if (!ASSET_TYPES.includes(path.extname(file).toLowerCase())) {
    fail('asset', index, `${what} names ${value}, which is not a picture or a typeface file`);
    return;
  }
  const size = fs.statSync(file).size;
  if (size > MAX_ASSET_BYTES) fail('asset', index, `${value} is ${size} bytes. A shared file is ${MAX_ASSET_BYTES} bytes or less`);
  if (final && !isTracked(file)) fail('asset', index, `${value} is not in Git. Add it before the page`);
}

function isTracked(file) {
  try {
    execFileSync('git', ['-C', repoRoot, 'ls-files', '--error-unmatch', '--', file], { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// A link (`a`, `area`) loads nothing until a person clicks it, so its address is not checked.
for (const tag of tags.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
  const name = tag[1].toLowerCase();
  if (name === 'a' || name === 'area') {
    if (/\sdownload\b/i.test(tag[2])) fail('download', tag.index, 'a download link. The Claude viewer blocks it');
    continue;
  }
  for (const attr of tag[2].matchAll(/\s(src|href|xlink:href|poster|data|srcset)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/gi)) {
    const value = attr[2].replace(/^["']|["']$/g, '');
    const what = `<${name} ${attr[1].toLowerCase()}>`;
    if (attr[1].toLowerCase() === 'srcset') {
      value.split(',').forEach((part) => checkAddress(part.trim().split(/\s+/)[0], tag.index, what));
    } else {
      checkAddress(value, tag.index, what);
    }
  }
}
for (const m of css.matchAll(/url\(\s*(["']?)([\s\S]*?)\1\s*\)/gi)) checkAddress(m[2], m.index, 'CSS url()');
for (const m of css.matchAll(/@import\s+(["'])(.*?)\1/gi)) checkAddress(m[2], m.index, 'CSS @import');

// ---- text patterns ----
function each(view, pattern, rule, message) {
  for (const m of view.matchAll(pattern)) fail(rule, m.index, message(m));
}
each(code, /\b(fetch\s*\(|XMLHttpRequest\b|WebSocket\b|EventSource\b|sendBeacon\b)/g, 'network',
  (m) => `the script makes a network request: ${m[1].replace(/\s*\($/, '')}`);
each(code, /\.src\s*=\s*["'`]((?:https?:)?\/\/[^"'`]*)/g, 'network', (m) => `the script loads from another host: ${m[1]}`);
each(raw, /data:image\/(?!svg\+xml)[a-z0-9.+-]*/gi, 'data-picture',
  (m) => `a raster picture inside the file (${m[0]}). Put the picture in the shared folder`);
each(raw, /data:(?:font\/|application\/(?:x-)?font)[a-z0-9.+-]*/gi, 'data-font',
  (m) => `a font inside the file (${m[0]}). Load it from the shared folder`);
for (const mark of RUNTIME_MARKS) {
  const at = raw.toLowerCase().indexOf(mark);
  if (at !== -1) fail('runtime', at, `the file holds ${mark}, which is part of the Claude runtime`);
}
each(code, /\b(localStorage|sessionStorage|indexedDB)\b/g, 'storage',
  (m) => `the script uses ${m[1]}. A page keeps no state in the browser`);
each(code, /(?:\bwindow\.|(?<![.\w$]))(alert|confirm|prompt)\s*\(/g, 'dialog',
  (m) => `the script calls ${m[1]}(). The Claude viewer does not show it`);
each(code, /\.download\s*=/g, 'download', () => 'the script starts a download. The Claude viewer blocks it');

// ---- one file: a title, one style block, the content, one script at the end ----
// A page that comes back from the Claude publisher has no document tags of its own. From a disk, a
// browser then draws it in quirks mode, and a phone draws it at desktop width.
if (!/^\s*<!doctype html>/i.test(raw)) fail('structure', 0, 'the page does not start with <!doctype html>');
if (!/<meta\b[^>]*\bname\s*=\s*["']?viewport/i.test(tags)) fail('structure', 0, 'the page has no viewport meta tag');
if (!/<title\b[^>]*>\s*\S/i.test(tags)) fail('structure', 0, 'the page has no title');
if (styles.length > 1) fail('structure', styles[1].index, `the page has ${styles.length} style blocks. Use one`);
if (scripts.length > 1) fail('structure', scripts[1].index, `the page has ${scripts.length} scripts. Use one, at the end`);
if (scripts.length === 1 && tags.slice(scripts[0].end).replace(/<\/(body|html)\s*>/gi, '').trim() !== '') {
  fail('structure', scripts[0].index, 'content comes after the script. Put the script at the end');
}

// ---- colors and motion ----
if (!/prefers-color-scheme/.test(css)) fail('colors', 0, 'the styles have no prefers-color-scheme rule, so the page has no dark colors');
const moves = /@keyframes|\banimation(?:-name)?\s*:|\btransition\s*:/.test(css) || /\brequestAnimationFrame\b|\.animate\s*\(/.test(code);
if (moves && !/prefers-reduced-motion/.test(css + code)) fail('motion', 0, 'the page has motion and no prefers-reduced-motion rule');

// ---- size ----
if (bytes > MAX_PAGE_BYTES) fail('size', 0, `the page is ${bytes} bytes. The limit is ${MAX_PAGE_BYTES}`);

// ---- a page that goes into Git ----
if (final) {
  const folder = path.basename(pageDir);
  if (/^\d{4}-\d{2}-\d{2}/.test(folder)) fail('name', 0, `the folder ${folder} starts with a date. A final has a topic name and no date`);
  if (path.basename(page) !== 'index.html') fail('name', 0, `the file is ${path.basename(page)}. A final is <topic>/index.html`);
  if (!hasMarkdownLink()) fail('orphan', 0, 'no tracked Markdown file links to this page. Add a link from the topic spec');
}

function hasMarkdownLink() {
  const tracked = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z', '--', '*.md'], { encoding: 'utf8' });
  for (const name of tracked.split('\0').filter(Boolean)) {
    const file = path.join(repoRoot, name);
    if (!fs.existsSync(file)) continue;
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\]\(\s*<?([^)\s>]+)/g)) {
      const target = path.resolve(path.dirname(file), m[1].replace(/[?#].*$/, ''));
      if (target === page || target === pageDir) return true;
    }
  }
  return false;
}

fails.sort((a, b) => a.line - b.line);
for (const f of fails) process.stdout.write(`FAIL  ${f.rule}  line ${f.line}: ${f.message}\n`);
if (bytes > SOFT_PAGE_BYTES && bytes <= MAX_PAGE_BYTES) {
  process.stdout.write(`WARN  size  the page is ${bytes} bytes, above the soft target of ${SOFT_PAGE_BYTES}. Tell the author why\n`);
}
if (fails.length > 0) {
  process.stdout.write(`${fails.length} broken rule(s) in ${page}\n`);
  process.exit(1);
}
process.stdout.write(`PASS  ${page}  ${bytes} bytes\n`);
