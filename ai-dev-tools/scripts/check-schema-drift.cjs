#!/usr/bin/env node
'use strict';
// Checks that the JSON Schema each review skill PUBLISHES matches the schema its validator
// ENFORCES.
//
// Two copies of one truth, governing the artifact four auto-pipeline gates read. The SKILL.md block
// is what the reviewer agent is shown and writes against; the validator's table is what accepts or
// rejects the result. When they drift, a reviewer writes a conforming artifact that fails
// validation, or a non-conforming one that passes — and the orchestrator discards a whole review
// either way.
//
// This is the severity-is-consequence bug in data form: one rule, two copies, nothing that knows
// they are supposed to agree.
//
// Node built-ins only. Exit 0 = in sync, 1 = drift, 2 = cannot run.
//
// Usage:  node check-schema-drift.cjs [plugin-root]      # default: cwd

const fs = require('node:fs');
const path = require('node:path');

const pluginRoot = process.argv[2] || process.cwd();
const validatorPath = path.join(pluginRoot, 'scripts', 'validate-review-json.cjs');
if (!fs.existsSync(validatorPath)) {
  process.stderr.write('cannot run: no scripts/validate-review-json.cjs under ' + pluginRoot + '\n');
  process.exit(2);
}
const validator = fs.readFileSync(validatorPath, 'utf8');

// The SKILL.md block is fenced under a "## JSON Schema" heading.
function publishedSchema(skill) {
  const p = path.join(pluginRoot, 'skills', skill, 'SKILL.md');
  if (!fs.existsSync(p)) return { error: 'no SKILL.md for ' + skill };
  const m = fs.readFileSync(p, 'utf8').match(/## JSON Schema[\s\S]*?```json\n([\s\S]*?)\n```/);
  if (!m) return { error: 'skills/' + skill + '/SKILL.md: no "## JSON Schema" json block found' };
  try { return { schema: JSON.parse(m[1]) }; }
  catch (e) { return { error: 'skills/' + skill + '/SKILL.md: schema block is not valid JSON — ' + e.message }; }
}

// The validator's tables. Parsed rather than required(), so this stays a static check.
function listAt(source, label) {
  const m = source.match(new RegExp(label + '\\s*[:=]\\s*\\[([\\s\\S]*?)\\]'));
  if (!m) return null;
  return m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort();
}
function schemaBlock(name) {
  const m = validator.match(new RegExp('\\n  ' + name + ': \\{([\\s\\S]*?)\\n  \\},'));
  return m ? m[1] : null;
}

const SEVERITIES = listAt(validator, 'const SEVERITIES');
const ISSUE_OPTIONAL = listAt(validator, 'const ISSUE_OPTIONAL');

const errors = [];
let compared = 0;

for (const [name, skill] of [['doc', 'review-doc'], ['code', 'review-code']]) {
  const pub = publishedSchema(skill);
  if (pub.error) { errors.push(pub.error); continue; }
  const blk = schemaBlock(name);
  if (!blk) { errors.push('validate-review-json.cjs: no SCHEMAS.' + name + ' block found'); continue; }

  const items = pub.schema.properties.issues.items;
  const checks = [
    ['top-level required keys', (pub.schema.required || []).slice().sort(), listAt(blk, 'top')],
    ['issue required keys', (items.required || []).slice().sort(), listAt(blk, 'issueRequired')],
    ['category enum', (items.properties.category.enum || []).slice().sort(), listAt(blk, 'categories')],
    ['severity enum', (items.properties.severity.enum || []).slice().sort(), SEVERITIES],
  ];
  for (const [what, published, enforced] of checks) {
    compared += 1;
    if (enforced === null) {
      errors.push(skill + ' / ' + what + ': could not find the enforcing list in the validator');
      continue;
    }
    if (JSON.stringify(published) !== JSON.stringify(enforced)) {
      errors.push(
        skill + ' / ' + what + ' has drifted:\n' +
        '      SKILL.md publishes : ' + JSON.stringify(published) + '\n' +
        '      validator enforces : ' + JSON.stringify(enforced));
    }
  }

  // Optional keys must be published too, or `additionalProperties: false` rejects an artifact the
  // skill told its agent to write. This is exactly how `fixed_by_self_review` got invented.
  compared += 1;
  const publishedProps = Object.keys(items.properties || {}).sort();
  const publishedOptional = publishedProps.filter((k) => !(items.required || []).includes(k)).sort();
  if (ISSUE_OPTIONAL && JSON.stringify(publishedOptional) !== JSON.stringify(ISSUE_OPTIONAL)) {
    errors.push(
      skill + ' / optional issue keys have drifted:\n' +
      '      SKILL.md publishes : ' + JSON.stringify(publishedOptional) + '\n' +
      '      validator allows   : ' + JSON.stringify(ISSUE_OPTIONAL) + '\n' +
      '      An optional key the validator allows but the schema omits is a key no agent knows it may\n' +
      '      write; one the schema shows but the validator rejects fails every artifact that uses it.');
  }
}

process.stdout.write('schema comparisons: ' + compared + '\n');
if (errors.length > 0) {
  process.stderr.write('\n' + errors.length + ' schema drift(s) between SKILL.md and the validator:\n\n');
  for (const e of errors) process.stderr.write('  ' + e + '\n\n');
  process.exit(1);
}
process.stdout.write('every published schema matches the schema its validator enforces\n');
process.exit(0);
