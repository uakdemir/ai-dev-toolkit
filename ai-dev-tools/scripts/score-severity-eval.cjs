#!/usr/bin/env node
'use strict';
// Scores a review-doc.json produced against the severity-vs-confidence fixtures.
// Node built-ins only. Exit 0 = eval passed, 1 = eval failed, 2 = unreadable input.
//
// Usage:
//   node score-severity-eval.cjs <review-doc.json> <EXPECTATIONS.json>
//
// What it asserts, and only this: findings sitting in the (uncertain x catastrophic) and
// (certain x cosmetic) cells land on the correct side of the critical line. High-vs-medium is
// deliberately not asserted -- it is arguable, and an eval that asserts arguable things stops
// measuring the invariant it exists for.

const fs = require('node:fs');

const reviewPath = process.argv[2];
const expectPath = process.argv[3];
if (!reviewPath || !expectPath) {
  process.stderr.write('usage: node score-severity-eval.cjs <review-doc.json> <EXPECTATIONS.json>\n');
  process.exit(2);
}

function readJson(p) {
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    process.stderr.write('cannot read ' + p + ': ' + e.message + '\n');
    process.exit(2);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    process.stderr.write(p + ' is not valid JSON: ' + e.message + '\n');
    process.exit(2);
  }
}

const review = readJson(reviewPath);
const expected = readJson(expectPath);
const issues = Array.isArray(review.issues) ? review.issues : [];

if (issues.length === 0) {
  process.stderr.write('no issues in ' + reviewPath + ' -- nothing to score\n');
  process.exit(2);
}

// The mapping under test. If severity is still derived from confidence, every finding obeys this.
function oldMapping(confidence) {
  if (typeof confidence !== 'number') return '(no confidence)';
  if (confidence >= 80) return 'critical';
  if (confidence >= 60) return 'high';
  if (confidence >= 40) return 'medium';
  return '(below floor)';
}

const haystack = (issue) =>
  [issue.location, issue.problem, issue.suggested_fix].filter(Boolean).join(' \x00 ').toLowerCase();

const SEV_RANK = { critical: 3, high: 2, medium: 1, low: 0 };

function findMatch(planted) {
  const keys = planted.match_any.map((k) => k.toLowerCase());
  const scored = issues
    .map((i) => {
      const h = haystack(i);
      return { issue: i, keyHits: keys.filter((k) => h.includes(k)).length };
    })
    .filter((x) => x.keyHits > 0);
  if (scored.length === 0) return null;
  // MOST SPECIFIC match wins, then most severe among equally specific ones.
  //
  // Severity alone was the original rule, on the reasoning that if the reviewer split one defect
  // across several findings, the strongest rating is the one the loop's gates act on. That holds
  // only while every match IS the same defect. Against a real review it is not: `match_any` lists
  // carry broad tokens ("invariant", "backup", "queue", "payouts") that also occur in unrelated
  // findings, and severity-first then hands the verdict to whichever unrelated finding happens to
  // be rated highest.
  //
  // Measured: A2 ("four invariants" vs five listed — certain, cosmetic) matched four findings.
  // The real one was rated `low` at confidence 95, exactly as the fix intends; an unrelated
  // critical about the cutter's selection predicate clipped the bare token "invariant" and took
  // the verdict, reporting a discriminator failure that had not happened. A1, B1 and C2 were
  // PASSING for the same wrong reason — a critical existed among their matches, so nobody noticed.
  //
  // Key-hit count is the right discriminator because a planted defect's own finding matches
  // several of its keys while a coincidental one usually clips a single broad token. Severity
  // remains the tiebreak, so a genuinely split defect still resolves to its strongest rating.
  scored.sort((a, b) =>
    (b.keyHits - a.keyHits) ||
    ((SEV_RANK[b.issue.severity] ?? -1) - (SEV_RANK[a.issue.severity] ?? -1)));
  return { issue: scored[0].issue, matchCount: scored.length };
}

const rows = [];
let discriminatorFails = 0;
let controlFails = 0;
let notDetected = 0;

for (const planted of expected.planted) {
  const m = findMatch(planted);
  if (!m) {
    notDetected += 1;
    rows.push({
      id: planted.id,
      cell: planted.cell,
      role: planted.role,
      expect: planted.must_be_critical ? 'critical' : 'not critical',
      got: '-',
      conf: '-',
      wouldBe: '-',
      verdict: 'NOT_DETECTED',
    });
    continue;
  }
  const got = m.issue.severity;
  const conf = m.issue.confidence;
  const isCritical = got === 'critical';
  const pass = planted.must_be_critical ? isCritical : !isCritical;
  if (!pass) {
    if (planted.role === 'discriminator') discriminatorFails += 1;
    else controlFails += 1;
  }
  rows.push({
    id: planted.id,
    cell: planted.cell,
    role: planted.role,
    expect: planted.must_be_critical ? 'critical' : 'not critical',
    got: got + (m.matchCount > 1 ? ' (' + m.matchCount + ' matches)' : ''),
    conf: String(conf),
    wouldBe: oldMapping(conf),
    verdict: pass ? 'PASS' : 'FAIL',
    issueId: m.issue.id,
  });
}

// ---- report ----------------------------------------------------------------

const pad = (s, n) => String(s).padEnd(n);
process.stdout.write('\nSeverity-vs-confidence eval\n');
process.stdout.write('review: ' + reviewPath + '\n\n');
process.stdout.write(
  pad('id', 4) + pad('cell', 40) + pad('role', 15) + pad('expect', 14) +
  pad('got', 14) + pad('conf', 6) + pad('old-map', 10) + 'verdict\n'
);
process.stdout.write('-'.repeat(118) + '\n');
for (const r of rows) {
  process.stdout.write(
    pad(r.id, 4) + pad(r.cell, 40) + pad(r.role, 15) + pad(r.expect, 14) +
    pad(r.got, 14) + pad(r.conf, 6) + pad(r.wouldBe, 10) + r.verdict + '\n'
  );
}

// ---- global probe: is severity still a function of confidence? --------------
//
// If it is, EVERY finding obeys oldMapping(confidence), not just the planted ones. This is a
// heuristic, not a proof: a fixed pipeline could coincidentally agree on a small sample. It is
// only treated as a failure when the sample is big enough and spans more than one bucket, and
// its false-positive mode is that a genuinely consequence-rated run happened to line up.

const scored = issues.filter((i) => typeof i.confidence === 'number');
const agreeing = scored.filter((i) => i.severity === oldMapping(i.confidence));
const buckets = new Set(scored.map((i) => oldMapping(i.confidence)));
const agreementRate = scored.length ? agreeing.length / scored.length : 0;
const probeApplies = scored.length >= 6 && buckets.size >= 2;
const probeFails = probeApplies && agreementRate === 1;

process.stdout.write('\nglobal probe: ' + agreeing.length + '/' + scored.length +
  ' findings match oldMapping(confidence) across ' + buckets.size + ' confidence bucket(s)\n');
if (!probeApplies) {
  process.stdout.write('  (not applied: needs >= 6 scored findings spanning >= 2 buckets)\n');
} else if (probeFails) {
  process.stdout.write('  >>> 100% agreement: severity is still a function of confidence <<<\n');
} else {
  process.stdout.write('  severity and confidence diverge -- the axes are separate\n');
}

// ---- verdict ---------------------------------------------------------------

const failed = discriminatorFails > 0 || controlFails > 0 || probeFails;
process.stdout.write('\nsummary: ' + discriminatorFails + ' discriminator failure(s), ' +
  controlFails + ' control failure(s), ' + notDetected + ' not detected' +
  (probeFails ? ', global probe FAILED' : '') + '\n');

if (notDetected > 0) {
  process.stdout.write(
    'note: NOT_DETECTED is a detection outcome, not a severity failure. It does not fail the eval,\n' +
    '      but a discriminator that is never detected also never tested anything -- if a discriminator\n' +
    '      is NOT_DETECTED, the run is inconclusive for that cell and the fixture needs strengthening.\n'
  );
  const blindDiscriminators = rows.filter((r) => r.verdict === 'NOT_DETECTED' && r.role === 'discriminator');
  if (blindDiscriminators.length) {
    process.stdout.write('      inconclusive discriminators: ' +
      blindDiscriminators.map((r) => r.id).join(', ') + '\n');
  }
}

process.stdout.write(failed ? '\nEVAL FAILED\n' : '\nEVAL PASSED\n');
process.exit(failed ? 1 : 0);
