#!/usr/bin/env node
'use strict';
// Validates a review-code.json against the schema in skills/review-code/SKILL.md.
// Node built-ins only. Exit 0 = valid, 1 = invalid, 2 = unreadable.
const fs = require('node:fs');

const TOP_REQUIRED = ['critical_count', 'high_count', 'coverage', 'issues'];
const ISSUE_REQUIRED = ['severity', 'category', 'location', 'confidence', 'problem', 'suggested_fix'];
const COVERAGE_REQUIRED = ['files_in_diff', 'files_inspected', 'not_inspected'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const CATEGORIES = ['bug', 'architecture', 'spec-drift', 'security', 'verification-gap'];

const errors = [];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;

const path = process.argv[2];
if (!path) {
  process.stderr.write('usage: node validate-review-json.cjs <path-to-review-code.json>\n');
  process.exit(2);
}

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

function checkKeys(obj, required, label) {
  for (const k of required) {
    if (!(k in obj)) errors.push(label + ': missing required key "' + k + '"');
  }
  for (const k of Object.keys(obj)) {
    if (!required.includes(k)) {
      errors.push(label + ': unexpected key "' + k + '" (additionalProperties: false)');
    }
  }
}

const counts = { critical: 0, high: 0, medium: 0, low: 0 };

if (!isObj(doc)) {
  errors.push('top level: expected an object');
} else {
  checkKeys(doc, TOP_REQUIRED, 'top level');

  if ('critical_count' in doc && !isNonNegInt(doc.critical_count)) {
    errors.push('critical_count: expected a non-negative integer');
  }
  if ('high_count' in doc && !isNonNegInt(doc.high_count)) {
    errors.push('high_count: expected a non-negative integer');
  }

  if ('coverage' in doc) {
    const c = doc.coverage;
    if (!isObj(c)) {
      errors.push('coverage: expected an object');
    } else {
      checkKeys(c, COVERAGE_REQUIRED, 'coverage');
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

  if ('issues' in doc) {
    if (!Array.isArray(doc.issues)) {
      errors.push('issues: expected an array');
    } else {
      doc.issues.forEach((it, i) => {
        const at = 'issues[' + i + ']';
        if (!isObj(it)) { errors.push(at + ': expected an object'); return; }
        checkKeys(it, ISSUE_REQUIRED, at);
        if ('severity' in it) {
          if (!SEVERITIES.includes(it.severity)) {
            errors.push(at + '.severity: ' + JSON.stringify(it.severity) +
              ' is not one of ' + SEVERITIES.join('|'));
          } else {
            counts[it.severity] += 1;
          }
        }
        if ('category' in it && !CATEGORIES.includes(it.category)) {
          errors.push(at + '.category: ' + JSON.stringify(it.category) +
            ' is not one of ' + CATEGORIES.join('|'));
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

if (errors.length > 0) {
  for (const e of errors) process.stderr.write(e + '\n');
  process.exit(1);
}

process.stdout.write('recount: critical=' + counts.critical + ' high=' + counts.high +
  ' medium=' + counts.medium + ' low=' + counts.low + '\n');
if (counts.critical !== doc.critical_count) {
  process.stdout.write('note: declared critical_count=' + doc.critical_count +
    ' differs from recount ' + counts.critical + '; the recount is authoritative\n');
}
if (counts.high !== doc.high_count) {
  process.stdout.write('note: declared high_count=' + doc.high_count +
    ' differs from recount ' + counts.high + '; the recount is authoritative\n');
}
process.exit(0);
