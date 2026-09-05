#!/usr/bin/env node
'use strict';
// Validates a review JSON against the schema in the corresponding skill's SKILL.md.
//
//   --schema code  (default)  review-code.json — skills/review-code/SKILL.md
//   --schema doc              review-doc.json  — skills/review-doc/SKILL.md
//
// The two artifacts share their count semantics and their severity enum, and diverge in their
// top-level keys, their per-issue keys, and their category enums. One script with a schema table
// keeps the count-consistency logic — the part three pipeline gates depend on — written once.
//
// Node built-ins only. Exit 0 = valid, 1 = invalid, 2 = unreadable.
const fs = require('node:fs');

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
// `origin` is the ONLY per-issue flag, and it answers one question: did this round's own fix phase
// cause this finding? The self-review pass sets "self-review" on what it raises against the fixer's
// edits; everything else is "document" and counts.
//
// There was a second field, `phase`, recording WHICH pass found a finding. It existed only because
// rounds used to carry findings forward and flip `origin` at the boundary, which destroyed that
// record. Rounds no longer carry anything forward — each one reviews the document fresh and reports
// its own numbers — so `origin` never changes after it is set and `phase` has nothing to recover.
const ORIGINS = ['document', 'self-review'];

const SCHEMAS = {
  code: {
    top: ['critical_count', 'high_count', 'coverage', 'issues'],
    issueRequired: ['severity', 'category', 'location', 'confidence', 'problem', 'suggested_fix'],
    categories: ['bug', 'architecture', 'spec-drift', 'security', 'verification-gap'],
  },
  doc: {
    top: ['critical_count', 'high_count', 'fact_check_accuracy', 'fact_check_claims', 'issues'],
    issueRequired: ['id', 'severity', 'category', 'location', 'confidence', 'problem', 'suggested_fix'],
    categories: [
      'completeness', 'consistency', 'scope', 'structure',
      'fact-check', 'verify', 'vague-action', 'vague-step',
      'dependency-gap', 'ordering-issue', 'agent-pitfall',
      'missing-criteria', 'cross-reference',
    ],
  },
};

// `origin` is optional on every issue and defaults to "document". Optional rather than required
// because an absent value is not ambiguous: the recount below reads it as "document", which is what
// every pass but the self-review pass produces. Requiring the field would reject an artifact for
// omitting the default it already means.
const ISSUE_OPTIONAL = ['origin'];

const COVERAGE_REQUIRED = ['files_in_diff', 'files_inspected', 'not_inspected'];
const FACT_CHECK_CLAIM_REQUIRED = ['claim', 'verdict'];
const VERDICTS = ['ACCURATE', 'INACCURATE', 'PARTIALLY ACCURATE', 'STALE'];
const ID_PATTERN = /^ISSUE-\d{3,}$/;

const errors = [];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;

const argv = process.argv.slice(2);
let schemaName = 'code';
let path = null;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--schema') {
    schemaName = argv[i + 1];
    i += 1;
  } else if (argv[i].startsWith('--schema=')) {
    schemaName = argv[i].slice('--schema='.length);
  } else if (path === null) {
    path = argv[i];
  } else {
    process.stderr.write('unexpected argument: ' + argv[i] + '\n');
    process.exit(2);
  }
}

const knownSchema = Object.prototype.hasOwnProperty.call(SCHEMAS, schemaName);
if (!path || !knownSchema) {
  process.stderr.write('usage: node validate-review-json.cjs [--schema code|doc] <path-to-review.json>\n');
  if (path && !knownSchema) {
    process.stderr.write('unknown schema "' + schemaName + '"; expected code or doc\n');
  }
  process.exit(2);
}
const schema = SCHEMAS[schemaName];

let raw;
try {
  raw = fs.readFileSync(path, 'utf8');
} catch (e) {
  process.stderr.write('cannot read ' + path + ': ' + e.message + '\n');
  process.exit(2);
}

let doc;
try {
  doc = JSON.parse(raw);
} catch (e) {
  process.stderr.write('not valid JSON: ' + e.message + '\n');
  process.exit(1);
}

function checkKeys(obj, required, optional, label) {
  for (const k of required) {
    if (!(k in obj)) errors.push(label + ': missing required key "' + k + '"');
  }
  for (const k of Object.keys(obj)) {
    if (!required.includes(k) && !optional.includes(k)) {
      errors.push(label + ': unexpected key "' + k + '" (additionalProperties: false)');
    }
  }
}

const counts = { critical: 0, high: 0, medium: 0, low: 0 };
const excluded = { critical: 0, high: 0, medium: 0, low: 0 };

if (!isObj(doc)) {
  errors.push('top level: expected an object');
} else {
  checkKeys(doc, schema.top, [], 'top level');

  if ('critical_count' in doc && !isNonNegInt(doc.critical_count)) {
    errors.push('critical_count: expected a non-negative integer');
  }
  if ('high_count' in doc && !isNonNegInt(doc.high_count)) {
    errors.push('high_count: expected a non-negative integer');
  }

  if (schemaName === 'code' && 'coverage' in doc) {
    const c = doc.coverage;
    if (!isObj(c)) {
      errors.push('coverage: expected an object');
    } else {
      checkKeys(c, COVERAGE_REQUIRED, [], 'coverage');
      if ('files_in_diff' in c && !isNonNegInt(c.files_in_diff)) {
        errors.push('coverage.files_in_diff: expected a non-negative integer');
      }
      if ('files_inspected' in c && !isNonNegInt(c.files_inspected)) {
        errors.push('coverage.files_inspected: expected a non-negative integer');
      }
      if ('not_inspected' in c) {
        if (!Array.isArray(c.not_inspected)) {
          errors.push('coverage.not_inspected: expected an array');
        } else {
          c.not_inspected.forEach((p, i) => {
            if (typeof p !== 'string') {
              errors.push('coverage.not_inspected[' + i + ']: expected a string');
            }
          });
        }
      }
    }
  }

  if (schemaName === 'doc') {
    if ('fact_check_accuracy' in doc &&
        !(Number.isInteger(doc.fact_check_accuracy) &&
          doc.fact_check_accuracy >= 0 && doc.fact_check_accuracy <= 100)) {
      errors.push('fact_check_accuracy: expected an integer in 0..100');
    }
    if ('fact_check_claims' in doc) {
      if (!Array.isArray(doc.fact_check_claims)) {
        errors.push('fact_check_claims: expected an array');
      } else {
        doc.fact_check_claims.forEach((c, i) => {
          const at = 'fact_check_claims[' + i + ']';
          if (!isObj(c)) { errors.push(at + ': expected an object'); return; }
          checkKeys(c, FACT_CHECK_CLAIM_REQUIRED, [], at);
          if ('claim' in c && typeof c.claim !== 'string') {
            errors.push(at + '.claim: expected a string');
          }
          if ('verdict' in c && !VERDICTS.includes(c.verdict)) {
            errors.push(at + '.verdict: ' + JSON.stringify(c.verdict) +
              ' is not one of ' + VERDICTS.join('|'));
          }
        });
      }
    }
  }

  if ('issues' in doc) {
    if (!Array.isArray(doc.issues)) {
      errors.push('issues: expected an array');
    } else {
      // Ids are handles within a round — the fix report's dispositions and tmp/response_analysis.md
      // both cite them — so a duplicate misroutes a disposition onto the wrong finding. Rejected
      // here rather than discovered downstream.
      const seenIds = new Set();
      doc.issues.forEach((it, i) => {
        if (isObj(it) && typeof it.id === 'string') {
          if (seenIds.has(it.id)) {
            errors.push('issues[' + i + '].id: ' + JSON.stringify(it.id) +
              ' is a duplicate; ids must be unique across the issues array');
          }
          seenIds.add(it.id);
        }
      });
      doc.issues.forEach((it, i) => {
        const at = 'issues[' + i + ']';
        if (!isObj(it)) { errors.push(at + ': expected an object'); return; }
        checkKeys(it, schema.issueRequired, ISSUE_OPTIONAL, at);
        if (schemaName === 'doc' && 'id' in it &&
            !(typeof it.id === 'string' && ID_PATTERN.test(it.id))) {
          errors.push(at + '.id: ' + JSON.stringify(it.id) + ' does not match ^ISSUE-\\d{3,}$');
        }
        if ('origin' in it && !ORIGINS.includes(it.origin)) {
          errors.push(at + '.origin: ' + JSON.stringify(it.origin) +
            ' is not one of ' + ORIGINS.join('|'));
        }
        if ('severity' in it) {
          if (!SEVERITIES.includes(it.severity)) {
            errors.push(at + '.severity: ' + JSON.stringify(it.severity) +
              ' is not one of ' + SEVERITIES.join('|'));
          } else if (it.origin === 'self-review') {
            excluded[it.severity] += 1;
          } else {
            counts[it.severity] += 1;
          }
        }
        if ('category' in it && !schema.categories.includes(it.category)) {
          errors.push(at + '.category: ' + JSON.stringify(it.category) +
            ' is not one of ' + schema.categories.join('|'));
        }
        if ('confidence' in it &&
            !(Number.isInteger(it.confidence) && it.confidence >= 40 && it.confidence <= 100)) {
          errors.push(at + '.confidence: expected an integer in 40..100, got ' +
            JSON.stringify(it.confidence));
        }
        for (const k of ['location', 'problem', 'suggested_fix']) {
          if (k in it && typeof it[k] !== 'string') {
            errors.push(at + '.' + k + ': expected a string');
          }
        }
      });
    }
  }
}

// A declared count that contradicts the issues array is invalid output, not a
// warning. The orchestrator lifts these counts from the review output in flight to
// drive the auto-pipeline gates — references/common/error-logs-format.md specifies
// every gate against that in-flight value and says not to wire one to this file on
// disk — so a file that passes validation while under-declaring criticals trips an
// early exit on a review that found them. Fail closed; the writer fixes its own artifact.
//
// The recount excludes issues carrying `origin: "self-review"` — findings the round's own fix pass
// introduced. They are reported, never counted.
//
// The recount is over the WHOLE array, and that is correct because the array holds exactly one
// round's findings. Rounds do not carry findings forward: round 2 re-reads the document and reports
// what IT finds, so a defect round 1 fixed is simply absent rather than present-and-not-counted.
//
// That was not always true, and the difference mattered. When rounds carried findings forward, this
// recount counted them, while the reviewer was told to count only its own — two rules, no artifact
// able to satisfy both, and `critical_count` unable to decrease within a run. Removing carry-forward
// removed the contradiction without adding a field to mark what to skip.
// See references/shared-rules/counts-exclude-self-review.md.
if (errors.length === 0) {
  if (counts.critical !== doc.critical_count) {
    errors.push('critical_count: declared ' + doc.critical_count +
      ' but the issues array holds ' + counts.critical +
      ' with origin "document"' +
      (excluded.critical ? ' (' + excluded.critical + ' excluded as origin "self-review")' : '') +
      '; set it to the recount');
  }
  if (counts.high !== doc.high_count) {
    errors.push('high_count: declared ' + doc.high_count +
      ' but the issues array holds ' + counts.high +
      ' with origin "document"' +
      (excluded.high ? ' (' + excluded.high + ' excluded as origin "self-review")' : '') +
      '; set it to the recount');
  }
}

if (errors.length > 0) {
  for (const e of errors) process.stderr.write(e + '\n');
  process.exit(1);
}

const excludedTotal = excluded.critical + excluded.high + excluded.medium + excluded.low;
process.stdout.write('recount (' + schemaName + '): critical=' + counts.critical +
  ' high=' + counts.high + ' medium=' + counts.medium + ' low=' + counts.low +
  (excludedTotal ? '; excluded as self-review: critical=' + excluded.critical +
    ' high=' + excluded.high + ' medium=' + excluded.medium + ' low=' + excluded.low : '') + '\n');
process.exit(0);
