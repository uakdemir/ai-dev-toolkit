#!/usr/bin/env node
'use strict';
// Merges review-doc's fact-check artifact into the round's review JSON.
//
// The fact-checker runs alongside the reviewer and writes a file of its own, so neither agent waits
// for the other. This script is the one place their outputs meet. It appends the fact-check issues
// after the reviewer's, numbered from the reviewer's highest id + 1 (from ISSUE-001 when the reviewer
// found nothing); copies fact_check_claims and fact_check_accuracy; recounts critical_count and
// high_count over the whole array, origin "self-review" excluded
// (references/shared-rules/counts-exclude-self-review.md); validates the result with
// validate-review-json.cjs --schema doc; and only then renames it over the review JSON.
//
// Node built-ins only. Exit 0 = merged, and the validator's recount is printed. Exit 1 = the
// fact-check artifact is missing or invalid, or the merged result fails validation. Exit 2 = cannot
// run. On 1 and 2 the review JSON is byte-identical to what the reviewer wrote and no temp file is
// left behind; the caller treats any exit but 0 as a failed fact-check.
//
// Usage:  node merge-fact-check.cjs <review.json> <fact-check.json>

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fail(code, message) {
  process.stderr.write(message + '\n');
  process.exit(code);
}

const [reviewPath, factPath] = process.argv.slice(2);
if (!reviewPath || !factPath) {
  fail(2, 'usage: node merge-fact-check.cjs <review.json> <fact-check.json>');
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

let review;
try {
  review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
} catch (e) {
  fail(2, 'cannot read the review JSON ' + reviewPath + ': ' + e.message);
}
if (!isObj(review) || !Array.isArray(review.issues)) {
  fail(2, 'review JSON ' + reviewPath + ': expected an object with an issues array');
}

let fact;
try {
  fact = JSON.parse(fs.readFileSync(factPath, 'utf8'));
} catch (e) {
  fail(1, 'fact-check artifact missing or not JSON: ' + factPath + ': ' + e.message);
}

// Step 1: the shape the fact-checker promises. Ids are assigned here, so an artifact that brings its
// own is rejected rather than overwritten; and an origin other than "document" would drop a finding
// out of the gate counts, so it is rejected too.
const REQUIRED = ['severity', 'category', 'location', 'confidence', 'problem', 'suggested_fix'];
const errors = [];
if (!isObj(fact)) {
  errors.push('top level: expected an object');
} else {
  if (!(Number.isInteger(fact.fact_check_accuracy) &&
        fact.fact_check_accuracy >= 0 && fact.fact_check_accuracy <= 100)) {
    errors.push('fact_check_accuracy: expected an integer in 0..100');
  }
  if (!Array.isArray(fact.fact_check_claims)) errors.push('fact_check_claims: expected an array');
  if (!Array.isArray(fact.issues)) {
    errors.push('issues: expected an array');
  } else {
    fact.issues.forEach((it, i) => {
      const at = 'issues[' + i + ']';
      if (!isObj(it)) { errors.push(at + ': expected an object'); return; }
      for (const k of REQUIRED) {
        if (!(k in it)) errors.push(at + ': missing required key "' + k + '"');
      }
      if (it.category !== 'fact-check') errors.push(at + '.category: expected "fact-check"');
      if ('id' in it) errors.push(at + ': carries an id; ids are assigned by the merge');
      if ('origin' in it && it.origin !== 'document') {
        errors.push(at + '.origin: expected "document" when present');
      }
    });
  }
}
if (errors.length > 0) fail(1, 'fact-check artifact ' + factPath + ' is invalid:\n' + errors.join('\n'));

// Steps 2-4: number, append, copy, recount.
let max = 0;
for (const it of review.issues) {
  const m = /^ISSUE-(\d{3,})$/.exec(isObj(it) ? String(it.id) : '');
  if (m) max = Math.max(max, Number(m[1]));
}
let next = max + 1;
const appended = fact.issues.map((it) => ({ id: 'ISSUE-' + String(next++).padStart(3, '0'), ...it }));

const merged = {
  ...review,
  fact_check_accuracy: fact.fact_check_accuracy,
  fact_check_claims: fact.fact_check_claims,
  issues: review.issues.concat(appended),
};
const counted = merged.issues.filter((it) => !isObj(it) || it.origin !== 'self-review');
merged.critical_count = counted.filter((it) => isObj(it) && it.severity === 'critical').length;
merged.high_count = counted.filter((it) => isObj(it) && it.severity === 'high').length;

// Steps 5-6: validate a temp copy beside the review JSON (one filesystem, so the rename is atomic),
// and replace the review JSON only when the validator accepts it.
const dir = path.dirname(path.resolve(reviewPath));
const tmp = path.join(dir, '.' + path.basename(reviewPath) + '.merge-' + process.pid + '.tmp');
const discard = () => { try { fs.unlinkSync(tmp); } catch (_) { /* nothing to remove */ } };

try {
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n');
} catch (e) {
  discard();
  fail(2, 'cannot write the temp file ' + tmp + ': ' + e.message);
}

const validator = path.join(__dirname, 'validate-review-json.cjs');
const res = spawnSync(process.execPath, [validator, '--schema', 'doc', tmp], { encoding: 'utf8' });
if (res.status !== 0) {
  discard();
  fail(res.status === 1 ? 1 : 2, 'the merged result fails validation:\n' + (res.stderr || String(res.error || '')));
}

try {
  fs.renameSync(tmp, reviewPath);
} catch (e) {
  discard();
  fail(2, 'cannot replace ' + reviewPath + ' with the merged result: ' + e.message);
}
process.stdout.write(res.stdout);
process.exit(0);
