#!/usr/bin/env node
'use strict';
// Enforces the SHARED-SEMANTICS CONTRACT: a rule that governs more than one skill is written once,
// declares which skills it governs, and cannot silently fork.
//
// Severity-is-consequence is the first rule in the registry, but it is not special. It forked
// because nothing knew that `review-code` and `review-doc` were supposed to agree about it -- the
// fix landed in one, the verification was scoped to the files that fix touched, and the divergence
// survived a year of edits. The registry is what makes that structurally impossible: a shared rule
// names its own scope, and this gate holds every skill in that scope to it.
//
// Rules live in references/shared-rules/*.md with front-matter:
//
//     ---
//     name: severity-is-consequence
//     applies-to: [review-code, review-doc]
//     canonical: Severity is consequence, not certainty.
//     detector: severity-from-confidence
//     ---
//
// Four checks per rule:
//   A  source    -- the rule file exists and contains its own canonical sentence
//   B  detector  -- the named detector finds no violation in any governed skill
//   C  contract  -- every governed skill references the rule file by path
//   D  coverage  -- no skill OUTSIDE applies-to produces findings the rule governs. Scans a
//                  skill's SKILL.md, prompts/ and agents/; a skill's references/ tree is
//                  reference material, not a finding producer (see isReferenceFile).
//
// D is the one that stops the next fork: a new sibling skill that starts assigning severities
// without joining the contract is a violation the day it is written, not a year later.
//
// Node built-ins only. Exit 0 = every contract holds, 1 = violated, 2 = cannot run.
//
// Usage:  node check-shared-semantics.cjs [plugin-root]      # default: cwd

const fs = require('node:fs');
const path = require('node:path');

const pluginRoot = process.argv[2] || process.cwd();
const skillsDir = path.join(pluginRoot, 'skills');
const RULES_DIR_REL = 'references/shared-rules';
const rulesDir = path.join(pluginRoot, RULES_DIR_REL);

if (!fs.existsSync(skillsDir)) {
  process.stderr.write('no skills/ directory under ' + pluginRoot + '\n');
  process.exit(2);
}

const errors = [];
const rel = (f) => path.relative(pluginRoot, f);

// ---- detectors ---------------------------------------------------------------
//
// A detector knows two things: how to spot a violation of its rule, and how to spot a file that is
// DOING the governed thing at all (used by check D to find skills that should have joined the
// contract). Add a rule to the registry, add its detector here.

const SEVERITY_WORD = '(?:critical|high|medium|low)';
const SEVERITY_LITERAL = new RegExp(
  [
    '["\'`]' + SEVERITY_WORD + '["\'`]',
    '(?:->|=>|→)\\s*["\'`]?' + SEVERITY_WORD,
    '^\\s*\\|.*\\b' + SEVERITY_WORD + '\\b.*\\|',
    'severity\\s*[:=]\\s*["\'`]?' + SEVERITY_WORD,
  ].join('|'),
  'i'
);
// A confidence score is always 40-100 — two digits or exactly 100. Matching bare \d{1,3} instead
// makes every "sub-steps 1-4" and "at least 3 digits" in the corpus look like a threshold, and
// check D scans EVERY skill, not just the review family: `refactor-to-monorepo` has its own
// `Confidence:` tiers spelled high/medium/low, and it tripped on "sub-steps 1-4" until this bound
// went in. The \b on both sides is what stops ">= 1000" matching on its inner "00".
const NUM = '\\b(?:100|\\d{2})\\b';
const COMPARISON = '(?:' +
  '(?:>=|<=|>|<|≥|≤)\\s*' + NUM +
  '|' + NUM + '\\s*(?:-|–|—|to)\\s*' + NUM +
  '|\\b(?:at least|or above|or higher|or greater|above|below|under|over|between)\\b[^\\n]{0,14}' + NUM +
  ')';
// The GAP is deliberately short: long enough to cross a joining word ("severity critical WHEN
// confidence 80"), too short to cross the other four issue fields -- otherwise the six-field worked
// example in review-code's SKILL.md becomes a false positive and the gate loses its credibility.
const GAP = '[^\\n]{0,20}?';
const PAIRED_ASSIGNMENT = new RegExp(
  'confidence\\s*[:=]?\\s*\\d{1,3}' + GAP + 'severity\\s*[:=]?\\s*["\'`\\\\]{0,2}' + SEVERITY_WORD +
  '|severity\\s*[:=]?\\s*["\'`\\\\]{0,2}' + SEVERITY_WORD + '["\'`\\\\]{0,2}' + GAP + 'confidence\\s*[:=]?\\s*\\d{1,3}',
  'i'
);
const SET_BOTH = /set\s+both[^\n]{0,30}confidence[^\n]{0,30}severity|set\s+both[^\n]{0,30}severity[^\n]{0,30}confidence/i;
const WINDOW = 4;

// Fenced blocks are where issue RECORDS live (schemas, worked examples). They are exempt from the
// proximity detector only -- the linkage detectors still scan them, so a rule hidden in a fence is
// still caught. What a fence buys is exemption from adjacency, never from linkage.
function fenceMap(lines) {
  const inFence = new Array(lines.length).fill(false);
  let open = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*```/.test(lines[i])) { open = !open; inFence[i] = true; continue; }
    inFence[i] = open;
  }
  return inFence;
}

const DETECTORS = {
  'severity-from-confidence': {
    describe: 'severity derived from a confidence value',
    // Does this file assign severities at all? Used by check D.
    governs: (text) =>
      /severity["'`]?\s*[:=]|set (?:both )?`?confidence`? and `?severity`?|\bseverity\b[^\n]{0,30}(?:->|=>|→)/i.test(text),
    scan(file, report) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const inFence = fenceMap(lines);
      const seen = new Set();
      const emit = (i, kind, detail) => {
        if (seen.has(i)) return;
        seen.add(i);
        report(i + 1, kind, detail, lines[i].trim().slice(0, 130));
      };
      for (let i = 0; i < lines.length; i += 1) {
        if (PAIRED_ASSIGNMENT.test(lines[i])) {
          emit(i, 'paired-assignment', 'a confidence value and a severity value are assigned as one paired output.');
          continue;
        }
        if (SET_BOTH.test(lines[i])) {
          emit(i, 'set-both', 'confidence and severity are set together as a single decision.');
          continue;
        }
        if (inFence[i]) continue;
        const hasConfidence = /\bconfidence\b/i.test(lines[i]);
        const hasComparison = new RegExp(COMPARISON, 'i').test(lines[i]);
        if (!hasConfidence && !hasComparison) continue;

        // Three independent tokens inside one window of unfenced lines, rather than one line
        // pattern -- so splitting the rule across a markdown table (header `confidence`, row
        // `>= 80`, cell `critical`) still trips it.
        let sawConfidence = false;
        let sawComparison = false;
        let sevLine = -1;
        for (let j = Math.max(0, i - WINDOW); j <= Math.min(lines.length - 1, i + WINDOW); j += 1) {
          if (inFence[j]) continue;
          if (/\bconfidence\b/i.test(lines[j])) sawConfidence = true;
          if (new RegExp(COMPARISON, 'i').test(lines[j])) sawComparison = true;
          if (sevLine < 0 && SEVERITY_LITERAL.test(lines[j])) sevLine = j;
        }
        if (sawConfidence && sawComparison && sevLine >= 0) {
          emit(i, 'threshold-to-severity',
            'a confidence value, a threshold and a severity literal (line ' + (sevLine + 1) +
            ') occur together: ' + lines[sevLine].trim().slice(0, 90));
        }
      }
    },
  },
};

// ---- the registry -------------------------------------------------------------

function parseFrontMatter(text, file) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  // The BODY, excluding the front-matter. Check A must search this and not the whole file: the
  // front-matter declares `canonical`, so a whole-file search always finds it and the check can
  // never fail. That is a check that cannot gate, which is worse than no check at all.
  const out = { _body: text.slice(m[0].length) };
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/i);
    if (!kv) continue;
    const key = kv[1].trim();
    let value = kv[2].trim().replace(/^["']|["']$/g, '');
    if (/^\[.*\]$/.test(value)) {
      value = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    out[key] = value;
  }
  out._file = file;
  return out;
}

function loadRules() {
  if (!fs.existsSync(rulesDir)) {
    errors.push('missing ' + RULES_DIR_REL + '/: a rule shared by two skills must be written once, ' +
      'in one file that names the skills it governs.');
    return [];
  }
  const rules = [];
  for (const name of fs.readdirSync(rulesDir).sort()) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(rulesDir, name);
    const text = fs.readFileSync(file, 'utf8');
    const fm = parseFrontMatter(text, file);
    if (!fm) {
      errors.push(rel(file) + ': no front-matter. A shared rule must declare `name`, `applies-to`, and `canonical`.');
      continue;
    }
    for (const key of ['name', 'applies-to', 'canonical']) {
      if (!fm[key]) errors.push(rel(file) + ': front-matter is missing `' + key + '`.');
    }
    if (fm['applies-to'] && !Array.isArray(fm['applies-to'])) {
      errors.push(rel(file) + ': `applies-to` must be a list, e.g. [review-code, review-doc].');
      fm['applies-to'] = [fm['applies-to']];
    }
    fm._text = text;
    fm._rel = rel(file);
    rules.push(fm);
  }
  return rules;
}

function skillFiles(skill) {
  const base = path.join(skillsDir, skill);
  if (!fs.existsSync(base)) return null;
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md')) out.push(full);
    }
  })(base);
  return out;
}

// Check D asks whether a skill PRODUCES review findings outside the contract. In this toolkit
// findings are produced by dispatched agents whose instructions live in prompts/ and agents/,
// orchestrated by SKILL.md. A skill's references/ tree is reference material those prompts read --
// and it is where the corpus keeps `severity` tokens belonging to entirely other domains:
// convention-enforcer's .editorconfig analyzer levels (`dotnet_diagnostic.CA2200.severity =
// warning`) and its `suggested_severity` for lint conventions, orchestrate's `count(severity ==
// "critical")` in the gate read contract. Scanning those with the loose `governs` predicate yields
// three false positives in skills that have no confidence axis at all, and a coverage check that
// cries wolf on the corpus it ships with is a check people switch off in week two.
//
// This narrows check D ONLY. Check B still reads every file of a governed skill, references/
// included, so a rule relocated into a governed skill's references/ is still caught.
function isReferenceFile(file) {
  return file.split(path.sep).includes('references');
}

const allSkills = fs.readdirSync(skillsDir).filter((s) =>
  fs.statSync(path.join(skillsDir, s)).isDirectory()).sort();

// ---- the four checks ----------------------------------------------------------

const rules = loadRules();
let filesChecked = 0;

for (const rule of rules) {
  const governed = Array.isArray(rule['applies-to']) ? rule['applies-to'] : [];
  const detector = rule.detector ? DETECTORS[rule.detector] : null;
  if (rule.detector && !detector) {
    errors.push(rule._rel + ': names detector "' + rule.detector + '", which this gate does not implement. ' +
      'Add it to DETECTORS or drop the field.');
  }

  // A -- source
  if (rule.canonical && !rule._body.includes(rule.canonical)) {
    errors.push(rule._rel + ': its body does not contain its own canonical sentence "' + rule.canonical +
      '". Declaring it in front-matter is not stating it.');
  }
  // A' -- the rule file is exempt from its own detector (it explains both sides), so it must not
  // be usable as the mapping's hiding place.
  if (rule.detector === 'severity-from-confidence') {
    const hit = rule._body.match(/confidence[^.\n]{0,40}\b\d{2,3}\b/i);
    if (hit) {
      errors.push(rule._rel + ': states a numeric confidence threshold ("' + hit[0].trim() +
        '"). The rule file is exempt from its own detector, so a mapping placed here would be invisible.');
    }
  }

  for (const skill of governed) {
    const files = skillFiles(skill);
    if (files === null) {
      errors.push(rule._rel + ': `applies-to` names skill "' + skill + '", which does not exist under skills/.');
      continue;
    }
    // B -- detector
    if (detector) {
      for (const f of files) {
        filesChecked += 1;
        detector.scan(f, (line, kind, detail, snippet) => {
          errors.push(rel(f) + ':' + line + ': [' + kind + '] ' + detail + '\n    ' + snippet +
            '\n    Governed by ' + rule._rel + ' (' + rule.name + ').');
        });
      }
    }
    // C -- contract
    if (!files.some((f) => fs.readFileSync(f, 'utf8').includes(rule._rel))) {
      errors.push('skills/' + skill + ': governed by ' + rule._rel +
        ' but never references it. Every governed skill must point at the single source, or ' +
        '"delete the rule and say nothing" passes.');
    }
  }

  // D -- coverage
  if (detector) {
    for (const skill of allSkills) {
      if (governed.includes(skill)) continue;
      const files = (skillFiles(skill) || []).filter((f) => !isReferenceFile(f));
      const doing = files.filter((f) => detector.governs(fs.readFileSync(f, 'utf8')));
      if (doing.length > 0) {
        errors.push('skills/' + skill + ': does ' + detector.describe.replace(/^severity derived from.*/, 'severity rating') +
          ' (' + doing.map(rel).join(', ') + ') but is not in ' + rule._rel + "'s `applies-to`. " +
          'A skill that does the governed thing must join the contract — this is how the rule forks.');
      }
    }
  }
}

// ---- unclaimed detectors ------------------------------------------------------
//
// A detector no rule in the registry claims still runs, over every skill. Without this, a tree with
// no registry at all reports one violation ("missing references/shared-rules/") and stops, hiding
// the very sites it exists to find — which is exactly the state of the plugin before this fix.

const claimed = new Set(rules.map((r) => r.detector).filter(Boolean));
for (const [key, detector] of Object.entries(DETECTORS)) {
  if (claimed.has(key)) continue;
  for (const skill of allSkills) {
    for (const f of skillFiles(skill) || []) {
      filesChecked += 1;
      detector.scan(f, (line, kind, detail, snippet) => {
        errors.push(rel(f) + ':' + line + ': [' + kind + '] ' + detail + '\n    ' + snippet +
          '\n    No rule in ' + RULES_DIR_REL + '/ claims detector "' + key + '" — register it.');
      });
    }
  }
}

// ---- report -------------------------------------------------------------------

process.stdout.write('shared rules: ' + rules.length + ' — ' +
  (rules.map((r) => r.name).join(', ') || 'none') + '\n');
process.stdout.write('files checked by detectors: ' + filesChecked + '\n');

if (errors.length > 0) {
  process.stderr.write('\n' + errors.length + ' shared-semantics violation(s):\n\n');
  for (const e of errors) process.stderr.write('  ' + e + '\n\n');
  process.exit(1);
}
process.stdout.write('every shared rule is single-sourced, referenced by all governed skills, and unforked\n');
process.exit(0);
