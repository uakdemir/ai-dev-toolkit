#!/usr/bin/env node
'use strict';
// Reports prose duplicated across skills, as CANDIDATES for the shared-rules registry.
//
// THIS IS A REPORTER, NOT A GATE. It always exits 0 unless it cannot run.
//
// Why it must not gate: the strongest signal it produces is near-duplication, and near-duplication
// is ambiguous by construction. Measured on this corpus, the highest-scoring pair was
//
//   review-code: "Every remaining issue resolves to apply or push back"
//   review-doc:  "Every remaining issue resolves to apply, defer, or push back"
//
// which looks exactly like a rule that forked and is in fact a deliberate, documented divergence:
// review-code states "There is no 'defer' option" and its coder.md rejects `"deferred"` as a value,
// because a code fix must be made or rejected while a document fix can genuinely lack information.
// No similarity metric can tell that from drift. A human can, in about ten seconds.
//
// The loop this closes:
//     duplication report -> a human decides "shared" or "deliberately different"
//       -> if shared, it becomes a references/shared-rules/*.md entry
//         -> check D in check-shared-semantics.cjs enforces it from then on
//
// Exact duplicates are the benign half — copies that agree today. Near-duplicates are where forks
// live, which is why they are reported separately and first.
//
// Node built-ins only. Exit 0 always (2 if it cannot run).
//
// Usage:  node report-duplication.cjs [plugin-root] [--min-chars N] [--near 0.85]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const argv = process.argv.slice(2);
const pluginRoot = argv.filter((a) => !a.startsWith('--'))[0] || process.cwd();
const num = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const MIN_CHARS = num('--min-chars', 120);
const NEAR = num('--near', 0.85);

const skillsDir = path.join(pluginRoot, 'skills');
if (!fs.existsSync(skillsDir)) {
  process.stderr.write('cannot run: no skills/ directory under ' + pluginRoot + '\n');
  process.exit(2);
}

const SKIP_DIR = /(^|\/)templates(\/|$)/;
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(full)) walk(full); }
    else if (e.name.endsWith('.md')) files.push(full);
  }
})(skillsDir);

const rel = (f) => path.relative(pluginRoot, f);
const skillOf = (f) => path.relative(skillsDir, f).split(path.sep)[0];

// A registered rule's canonical sentence is duplicated ON PURPOSE: check A2 in
// check-shared-semantics.cjs requires every governed skill to state it verbatim, precisely so that
// citing a rule cannot pass for agreeing with it. Reporting that as duplication would tell the
// reader to undo the thing the contract demands.
const canonicals = [];
const rulePaths = [];
const rulesDir = path.join(pluginRoot, 'references', 'shared-rules');
if (fs.existsSync(rulesDir)) {
  for (const name of fs.readdirSync(rulesDir)) {
    if (!name.endsWith('.md')) continue;
    rulePaths.push('references/shared-rules/' + name);
    const fm = fs.readFileSync(path.join(rulesDir, name), 'utf8').match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const c = fm[1].match(/^canonical:\s*(.+)$/m);
    if (c) canonicals.push(c[1].trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' '));
  }
}
// A short paragraph that cites a rule file is a POINTER, and check C requires every governed skill
// to carry one. Two skills' pointers read alike because they say the same true thing; the only way
// to make them differ is to say it worse. Same logic as the canonical sentence, with a length guard
// so a long paragraph that merely happens to mention a rule is still compared.
const POINTER_MAX = 400;
const isContractual = (norm) =>
  canonicals.some((c) => c && norm.includes(c)) ||
  (norm.length <= POINTER_MAX && rulePaths.some((r) => norm.includes(r)));

// Paragraphs, normalised. Tables and fenced blocks are excluded: shared JSON examples and shared
// option tables are duplicated on purpose and drown everything else.
const paras = [];
let contractual = 0;
for (const f of files) {
  let fenced = false;
  const chunks = fs.readFileSync(f, 'utf8').split(/\n\s*\n/);
  for (const chunk of chunks) {
    if (/^\s*```/.test(chunk)) fenced = !fenced;
    if (fenced || /^\s*```/.test(chunk)) continue;
    const norm = chunk.replace(/\s+/g, ' ').trim();
    if (norm.length < MIN_CHARS) continue;
    if ((norm.match(/\|/g) || []).length > 6) continue;
    if (isContractual(norm)) { contractual += 1; continue; }
    paras.push({ file: f, skill: skillOf(f), norm, text: chunk.trim() });
  }
}

// ---- exact ---------------------------------------------------------------------
const byHash = new Map();
for (const p of paras) {
  const h = crypto.createHash('sha1').update(p.norm).digest('hex');
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push(p);
}
const exact = [...byHash.values()]
  .filter((g) => new Set(g.map((p) => p.file)).size >= 2)
  .sort((a, b) => b[0].norm.length - a[0].norm.length);

// ---- near ----------------------------------------------------------------------
// Similarity over word bags: cheap, and good enough to surface a pair for a human to read.
function similarity(a, b) {
  const A = new Set(a.split(' '));
  const B = new Set(b.split(' '));
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}
const near = [];
for (let i = 0; i < paras.length; i += 1) {
  for (let j = i + 1; j < paras.length; j += 1) {
    if (paras[i].skill === paras[j].skill) continue;      // within one skill is not a fork
    if (paras[i].norm === paras[j].norm) continue;        // reported as exact
    const lenRatio = Math.min(paras[i].norm.length, paras[j].norm.length) /
                     Math.max(paras[i].norm.length, paras[j].norm.length);
    if (lenRatio < 0.6) continue;
    const s = similarity(paras[i].norm, paras[j].norm);
    if (s >= NEAR) near.push({ s, a: paras[i], b: paras[j] });
  }
}
near.sort((x, y) => y.s - x.s);

// ---- report --------------------------------------------------------------------
const trunc = (t, n) => (t.length > n ? t.slice(0, n) + '…' : t);

process.stdout.write('paragraphs compared : ' + paras.length +
  ' (>= ' + MIN_CHARS + ' chars, across ' + files.length + ' files)\n');
process.stdout.write('exact duplicates    : ' + exact.length + '\n');
process.stdout.write('contractual repeats : ' + contractual +
  ' (a shared rule\'s canonical sentence, required verbatim by check A2 — not duplication)\n');
process.stdout.write('near duplicates     : ' + near.length + ' (>= ' + NEAR + ' similarity, cross-skill)\n');

if (near.length) {
  process.stdout.write('\n── NEAR DUPLICATES — a fork, or a deliberate difference? ' + '─'.repeat(20) + '\n');
  process.stdout.write('Read both. If they should agree, make it a shared rule. If they differ on purpose,\n');
  process.stdout.write('say so in the text so the next reader does not "fix" it.\n\n');
  for (const { s, a, b } of near.slice(0, 12)) {
    process.stdout.write('  [' + s.toFixed(2) + '] ' + a.skill + '  vs  ' + b.skill + '\n');
    process.stdout.write('      ' + rel(a.file) + '\n        ' + trunc(a.norm, 150) + '\n');
    process.stdout.write('      ' + rel(b.file) + '\n        ' + trunc(b.norm, 150) + '\n\n');
  }
}

if (exact.length) {
  process.stdout.write('\n── EXACT DUPLICATES — candidates for references/shared-rules/ ' + '─'.repeat(14) + '\n\n');
  for (const g of exact.slice(0, 15)) {
    const where = [...new Set(g.map((p) => rel(p.file)))].sort();
    process.stdout.write('  [' + where.length + ' files, ' + g[0].norm.length + ' chars]\n');
    for (const w of where) process.stdout.write('      ' + w + '\n');
    process.stdout.write('        "' + trunc(g[0].norm, 150) + '"\n\n');
  }
}

process.stdout.write('\nReporter only — nothing here fails a build. Promote what should be shared into\n');
process.stdout.write('references/shared-rules/, and check-shared-semantics.cjs will enforce it after that.\n');
process.exit(0);
