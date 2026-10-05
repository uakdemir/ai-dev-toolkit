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
//   D  coverage  -- no skill OUTSIDE applies-to produces findings the rule governs. Scans every
//                  text file under the skill EXCEPT its references/ tree, which is reference
//                  material rather than a finding producer (see isReferenceFile). Those
//                  references/ trees, and the plugin-root references/ tree, are swept separately
//                  with the strict scan() instead -- exempt from D's loose coverage predicate,
//                  never from the rule. A detector marked `governedOnly` is swept over the
//                  plugin-root tree alone: its rule does not cover the other skills.
//
// D is the one that stops the next fork: a new sibling skill that starts assigning severities
// without joining the contract is a violation the day it is written, not a year later.
//
// Node built-ins only. Exit 0 = every contract holds, 1 = violated, 2 = cannot run.
//
// Usage:  node check-shared-semantics.cjs [plugin-root]      # default: cwd

const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
// --print-coverage lists, per detector, every file where `governs()` is true. It is output only:
// the contract checks below still run and the exit code is unchanged.
//
// Why it exists: check D's two worst defects -- three false positives on the real corpus, and a
// detector blind to the plainest phrasings of its own rule -- both came from ONE root cause. The
// predicate was never run against the real tree in both its modes; it was reasoned about instead.
// A committed snapshot of this output turns "we believe it is clean" into something that fires the
// day the corpus moves. See scripts/check-detector-coverage.sh.
const printCoverage = argv.includes('--print-coverage');
const pluginRoot = argv.filter((a) => !a.startsWith('--'))[0] || process.cwd();
const skillsDir = path.join(pluginRoot, 'skills');
const RULES_DIR_REL = 'references/shared-rules';
// A governed skill's prompt is not always Markdown, and `.endsWith('.md')` made a .txt prompt
// invisible to check B.
const TEXT_EXT = /\.(?:md|markdown|txt)$/i;
const rulesDir = path.join(pluginRoot, RULES_DIR_REL);

if (!fs.existsSync(skillsDir)) {
  process.stderr.write('no skills/ directory under ' + pluginRoot + '\n');
  process.exit(2);
}

const errors = [];
const rel = (f) => path.relative(pluginRoot, f);

// The contract at the top of this file promises exit 2 for "cannot run". Every readFileSync and
// readdirSync below was unguarded, so an unreadable file threw and Node exited 1 -- which callers
// and the mutation harness both read as "contract violated". A gate that reports a permissions
// error as a violation is a gate that cries wolf; one that reports a crash as a PASS (17 of the
// suite's 39 cases assert exit 1) is worse. Fail as 2.
process.on('uncaughtException', (e) => {
  process.stderr.write('cannot run: ' + e.message + '\n');
  process.exit(2);
});

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
  '|\\b(?:at least|at most|or above|or higher|or greater|or more|above|below|under|over|between)\\b[^\\n]{0,14}' + NUM +
  // Trailing qualifiers. "confidence 80 or above" and "confidence 80+" state the same threshold as
  // ">= 80"; only the leading form was matched, so both walked straight past the gate.
  '|' + NUM + '\\s*(?:\\+|(?:or|and)\\s+(?:above|higher|greater|more|over|better))' +
  ')';
// A severity word written as plain prose, with no quotes, arrow, pipe or `severity:` in front of
// it. SEVERITY_LITERAL deliberately requires that markup, because across a 4-line window a bare
// word appears too often to be evidence. On ONE line, next to a confidence threshold, it is
// evidence -- "Findings with confidence >= 80 are critical." is the rule, stated in English.
// The (?!-) stops "high-severity", which occurs in the reporting-floor sentence both review skills
// carry and which is not a rating.
const SEV_BARE = '\\b' + SEVERITY_WORD + '\\b(?!-)';
// The GAP is deliberately short: long enough to cross a joining word ("severity critical WHEN
// confidence 80"), too short to cross the other four issue fields -- otherwise the six-field worked
// example in review-code's SKILL.md becomes a false positive and the gate loses its credibility.
const GAP = '[^\\n]{0,20}?';
const PAIRED_ASSIGNMENT = new RegExp(
  'confidence\\s*[:=]?\\s*\\d{1,3}' + GAP + 'severity\\s*[:=]?\\s*["\'`\\\\]{0,2}' + SEVERITY_WORD +
  '|severity\\s*[:=]?\\s*["\'`\\\\]{0,2}' + SEVERITY_WORD + '["\'`\\\\]{0,2}' + GAP + 'confidence\\s*[:=]?\\s*\\d{1,3}',
  'i'
);
// One line that carries a confidence token, a threshold, and a severity word is the mapping stated
// outright, however it is phrased. Scoped to a single line ON PURPOSE: the canonical rule paragraph
// itself says "are critical" and "is low", and the reporting floor says "confidence >= 40" a few
// lines away, so a windowed version of this would red the two skills that are written correctly.
// Requiring the COMPARISON is what separates a mapping from a record: review-code's six-field
// worked example sets `confidence: 85` and `severity: "critical"` on one line with no comparison
// between them, and must stay green (negative control N2).
const THRESHOLD_LINE = new RegExp(
  '\\bconfidence\\b(?=[^\\n]*' + COMPARISON + ')(?=[^\\n]*' + SEV_BARE + ')' +
  '|' + '(?:' + COMPARISON + ')(?=[^\\n]*\\bconfidence\\b)(?=[^\\n]*' + SEV_BARE + ')',
  'i'
);
// Deriving one axis from the other, stated as an instruction with no number anywhere.
// A: severity derived FROM confidence. B: both set together from one source.
// "rate" is deliberately NOT a verb here -- the canonical paragraph says "Rate `severity` ... Rate
// `confidence` separately", and the corrected Output Processing step says "assign `severity` and
// `confidence` independently". Both are the rule being obeyed, not broken; requiring `from` (A) or
// `both` (B) is what tells an instruction to derive apart from an instruction to rate.
const DERIVE_LINK = new RegExp(
  '\\b(?:deriv\\w*|comput\\w*|determin\\w*|map|mapp\\w*)\\b[^\\n]{0,30}\\bseverity\\b[^\\n]{0,20}\\bfrom\\b[^\\n]{0,40}\\bconfidence\\b' +
  '|\\b(?:set|assign|deriv\\w*|pick|choose)\\s+both\\b[^\\n]{0,40}(?:confidence[^\\n]{0,40}severity|severity[^\\n]{0,40}confidence)',
  'i'
);
const SET_BOTH = /set\s+both[^\n]{0,30}confidence[^\n]{0,30}severity|set\s+both[^\n]{0,30}severity[^\n]{0,30}confidence/i;
const WINDOW = 4;

// ---- abort-sentinel / handoff-last-line vocabulary ----------------------------
// An ALL-CAPS token followed by ": ", quoted or backticked -- the shape of a returned sentinel.
const SENTINEL_TOKEN = /[`'"]([A-Z][A-Z_]{2,15}):\s/;
// A line is DEFINING a give-up convention, not merely containing a token that looks like one.
const ABORT_CONTEXT =
  /\b(?:abort\w*|sentinel|literal prefix|first line|gives? up|cannot (?:do|proceed|continue|complete))\b/i;
const LAST_LINE = /\b(?:last|final)\s+line\b/i;
// A document collecting what a run could not settle. Requiring this alongside LAST_LINE is what
// keeps orchestrate's breadcrumb rule -- also a last-line rule, about a different output -- out.
const DECISION_DOC =
  /needs your decisions|could not decide|needing a human decision|hands? back|handed back/i;
// The claim itself, as an assertion rather than a mention.
// The optional \w+ absorbs whatever noun sits between "the" and "last line" — "as the run's last
// line", "as the run last line", "as the output's final line". Pinning it to "run's " exactly is
// what let case S8 through: one missing apostrophe and the claim was invisible.
const CLAIMS_LAST_LINE =
  /\bis (?:always |deliberately )?the (?:last|final) line\b|\bas the (?:\w+'?s? )?(?:last|final) line\b/i;

// ---- untyped-agent-dispatch vocabulary ----------------------------------------
// The one agent type that carries a pin: `subagent_type: "ai-dev-tools:<level>-effort"`. Naming
// any other agent is not enough -- `general-purpose` takes the dispatching session's effort
// exactly as a call with no type does. Nor is a literal level: the type has a definition, so
// nothing is refused at dispatch, and every `--effort` value runs at that one level. Check B
// therefore requires a `<...>` placeholder where the level goes.
const PINNED_TYPE = /subagent_type:\s*["'`]ai-dev-tools:<[^<>"'`\n]+>-effort["'`]/;
// What check D looks for: the agent type named at all, quoted or not, level literal or not. It is
// tested over a whole file and never through agentCalls. For D a lost match is the quiet outcome,
// and a call written over several lines, an unquoted value, or a bracket ahead of the type each
// lost it.
const NAMES_PINNED_TYPE = /subagent_type:\s*["'`]?ai-dev-tools:[^"'`\n,)]*-effort/;
// The text of each Agent call written on a line, from its `Agent(` to its closing bracket. Each
// call is judged on its own text: testing the line as a whole lets a typed call vouch for an
// untyped fallback written beside it, and reading on past the bracket lets a pinned type quoted in
// the prose after an untyped call do the same. A call whose arguments held a bracket of their own
// would be cut short there. Check B is the only reader, and there that fails loudly rather than
// passing quietly.
const agentCalls = (line) => line.split(/\bAgent\(/).slice(1).map((rest) => rest.split(')')[0]);

// Fenced blocks are where issue RECORDS live (schemas, worked examples). They are exempt from the
// proximity detector only -- the linkage detectors still scan them, so a rule hidden in a fence is
// still caught. What a fence buys is exemption from adjacency, never from linkage.
function fenceMap(lines) {
  const inFence = new Array(lines.length).fill(false);
  // A plain boolean toggle flips on ANY line starting with three backticks, including the inner
  // fence of a nested block. One unbalanced marker then marks the whole rest of the file as fenced
  // and exempts it from the proximity detector -- and documentation ABOUT markdown output, which a
  // skills repo is full of, is exactly where nested fences appear. Track the opening marker's
  // length and close only on one at least as long.
  let openLen = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^\s*(`{3,})/);
    if (m) {
      if (openLen === 0) { openLen = m[1].length; inFence[i] = true; continue; }
      if (m[1].length >= openLen) { openLen = 0; inFence[i] = true; continue; }
    }
    inFence[i] = openLen > 0;
  }
  return inFence;
}

const DETECTORS = {
  'severity-from-confidence': {
    describe: 'severity derived from a confidence value',
    // Does this file assign severities at all? Used by check D.
    governs: (text) =>
      /severity["'`]?\s*[:=]|set (?:both )?`?confidence`? and `?severity`?|\bseverity\b[^\n]{0,30}(?:->|=>|→)/i.test(text) ||
      DERIVE_LINK.test(text) ||
      text.split('\n').some((l) => THRESHOLD_LINE.test(l)),
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
        if (SET_BOTH.test(lines[i]) || DERIVE_LINK.test(lines[i])) {
          emit(i, 'set-both', 'confidence and severity are set together, or severity is derived from confidence, as a single decision.');
          continue;
        }
        if (THRESHOLD_LINE.test(lines[i])) {
          emit(i, 'threshold-to-severity',
            'one line states a confidence threshold and the severity it produces.');
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

  // ---- abort-sentinel (agent-abort-contract) ----------------------------------
  //
  // The contract is worth exactly as much as its literalness: the orchestrator matches a prefix,
  // so a pass that gives up with `FAILED: ` is indistinguishable from a pass that ran and found
  // nothing. That is the failure mode the rule exists to prevent, and until this detector existed
  // nothing checked it -- checks A2 and C only proved the sentence was pasted into both skills.
  //
  // A sentinel is an ALL-CAPS token followed by ": ", quoted or backticked. `TODO: verify` in
  // test-audit and `FEATURE_NAME: ` in scaffold match that shape, which is why a hit only counts
  // on a line that is also TALKING about giving up.
  'abort-sentinel': {
    describe: 'a dispatched agent signalling that it cannot proceed',
    // The two signals must co-occur ON ONE LINE. Testing them against the whole file matched
    // skills/scaffold, which says "abort" a dozen times about its OWN exit and uses "sentinel" for
    // a NUL placeholder-escape 300 lines away — two true signals, no relationship. The governed
    // thing is narrower than the word "abort": it is a dispatched agent RETURNING a response whose
    // FIRST LINE carries a prefix. A skill that merely stops is not doing it.
    governs: (text) =>
      text.split('\n').some((l) =>
        (/\bfirst line\b/i.test(l) && /\b(?:begins?|starts?|prefix)\b/i.test(l)) ||
        (ABORT_CONTEXT.test(l) && SENTINEL_TOKEN.test(l))),
    scan(file, report) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (!ABORT_CONTEXT.test(lines[i])) continue;
        for (const m of lines[i].matchAll(new RegExp(SENTINEL_TOKEN.source, 'g'))) {
          if (m[1] === 'ABORT') continue;
          report(i + 1, 'wrong-sentinel',
            'defines a give-up signal with the prefix "' + m[1] + ': ", not the contract\'s ' +
            '"ABORT: ". The orchestrator matches the literal prefix, so this abort reads as a ' +
            'pass that ran and found nothing.',
            lines[i].trim().slice(0, 130));
        }
      }
    },
  },

  // ---- handoff-last-line (brainstorm-handoff) ---------------------------------
  //
  // Only the LAST line survives a scrollback; two skills each claiming a different one means the
  // reader learns to look in the wrong place. `governs` deliberately requires BOTH a last-line
  // claim and a decisions-document, so orchestrate/SKILL.md's "breadcrumb as the literal last
  // line" -- a different output, correctly its own -- is not dragged into this contract.
  'handoff-last-line': {
    describe: 'what a run prints as its final line when it has items to hand back',
    governs: (text) => LAST_LINE.test(text) && DECISION_DOC.test(text),
    scan(file, report) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (!CLAIMS_LAST_LINE.test(lines[i])) continue;
        if (/brainstorm|absolute path/i.test(lines[i])) continue;
        report(i + 1, 'displaced-last-line',
          'claims something other than the brainstorm document\'s absolute path is the last ' +
          'line printed. One line survives the scrollback; it is that path.',
          lines[i].trim().slice(0, 130));
      }
    },
  },

  // ---- untyped-agent-dispatch (agent-dispatch-pin) ----------------------------
  //
  // The rule shipped with no detector, so A2 and C were its whole binding: the canonical sentence
  // was pasted into both review skills and nothing looked at a dispatch. One site rewritten to
  // `Agent(prompt: ...)` put that agent back at the dispatching session's effort, with the gate
  // green and the iteration log still printing the pinned agent's name.
  //
  // It sees a call that is written out. A dispatch described only in prose is invisible to it,
  // which is why every governed site spells its call.
  'untyped-agent-dispatch': {
    describe: 'a dispatch of one of the plugin\'s effort-pinned agents',
    // `implement` and `orchestrate` dispatch with a prompt and nothing else, by design: neither
    // takes an effort for its agents. An untyped call is therefore a violation only inside a
    // governed skill, and the F4 sweep skips this detector in the references/ tree of a skill
    // outside the rule. It still runs it over the plugin-root tree, which the governed skills read.
    governedOnly: true,
    governs: (text) => NAMES_PINNED_TYPE.test(text),
    scan(file, report) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const failing = agentCalls(lines[i]).filter((call) => !PINNED_TYPE.test(call));
        if (failing.length === 0) continue;
        if (failing.every((call) => NAMES_PINNED_TYPE.test(call))) {
          report(i + 1, 'fixed-level-dispatch',
            'an Agent call that names an effort-pinned agent, but not as the quoted ' +
            '`ai-dev-tools:<--effort value>-effort`. A literal level runs every `--effort` ' +
            'value at that one level.',
            lines[i].trim().slice(0, 130));
          continue;
        }
        report(i + 1, 'untyped-dispatch',
          'an Agent call that names no effort-pinned agent. The Agent tool has no effort ' +
          'parameter, so this agent runs at the effort of the session that dispatched it, ' +
          'whatever `--effort` says.',
          lines[i].trim().slice(0, 130));
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
      else if (TEXT_EXT.test(e.name)) out.push(full);
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
function isReferenceFile(skill, file) {
  // Relative to the SKILL root, never the absolute path. Testing the absolute path made every
  // ancestor directory count: a plugin checked out under ~/references/, vendored into a docs tree,
  // or built in a scratch dir containing the word silently turned check D off, with no diagnostic.
  return path.relative(path.join(skillsDir, skill), file).split(path.sep).includes('references');
}

// A skill is a NAMED directory. Dot-directories under skills/ are tooling — `.claude`, `.git`,
// editor state — not skills, and walking them is how the gate met a config path masked to a
// character device and reported "cannot run" for a tree that was perfectly fine. Scaffold's
// template payload lives deeper (templates/**/.claude/) and is untouched by this.
const allSkills = fs.readdirSync(skillsDir).filter((s) =>
  !s.startsWith('.') && fs.statSync(path.join(skillsDir, s)).isDirectory()).sort();

// ---- the four checks ----------------------------------------------------------

const rules = loadRules();
let filesChecked = 0;
const detectorScope = new Map();

// F2: an EMPTY registry directory made every check vacuous -- A, A', A2, B, C and D all live
// inside `for (const rule of rules)` -- while the gate still printed its success sentence and
// exited 0. "Delete the rule file, then reword the mapping" was a two-step, fully green fork.
if (fs.existsSync(rulesDir) && rules.length === 0) {
  errors.push(RULES_DIR_REL + '/ holds no rules. An empty registry makes every check vacuous: ' +
    'a rule shared by two skills must be written once, in one file that names the skills it governs.');
}

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
  // A' -- a rule file is never scanned by any detector (it has to explain both sides), so it must
  // not be usable as the mapping's hiding place. It therefore may not pair a threshold with a
  // severity word on one line, whatever words surround them.
  //
  // The previous form anchored on the literal token "confidence" within 40 characters before the
  // number, so "- `\"critical\"` when the score is at least 80" slipped through: say "the score",
  // or put the number first, and the check was silent. It also ran only for detector-bearing
  // rules, leaving a sibling rule file completely unguarded — the same mapping pasted into
  // counts-exclude-self-review.md was green.
  {
    const bodyLines = rule._body.split('\n');
    for (let i = 0; i < bodyLines.length; i += 1) {
      const l = bodyLines[i];
      // Two forms, because each catches what the other misses. A number beside a SEVERITY WORD
      // is "critical when the score is at least 80" — a mapping that never says "confidence". A
      // number beside a CONFIDENCE TOKEN is "confidence 80 is usually worth escalating" — a
      // threshold that never names a severity. Either one, in the one file no detector scans, is
      // the mapping finding itself a hiding place.
      const bySeverity = new RegExp(NUM).test(l) && new RegExp(SEV_BARE, 'i').test(l);
      const byConfidence = /confidence[^.\n]{0,40}\b\d{2,3}\b|\b\d{2,3}\b[^.\n]{0,40}confidence/i.test(l);
      if (bySeverity || byConfidence) {
        errors.push(rule._rel + ': line ' + (i + 1) + ' states a numeric threshold beside ' +
          (bySeverity ? 'a severity word' : 'a confidence score') +
          ' — "' + l.trim().slice(0, 110) + '". No detector scans a rule file, so a mapping ' +
          'placed here would be invisible to every check.');
      }
    }
  }
  // A2 -- a governed skill must AGREE with the rule, not merely cite it. Check C tests only that
  // the path string occurs somewhere, which "We deliberately ignore <path> now." also satisfies,
  // and a skill can state the exact inverse of the canonical sentence without any detector firing
  // (no number, no markup). Requiring the sentence verbatim is what makes the two skills say the
  // same thing rather than merely point at the same file.
  if (rule.canonical) {
    for (const skill of governed) {
      const files = skillFiles(skill);
      if (files === null) continue;
      if (!files.some((f) => fs.readFileSync(f, 'utf8').includes(rule.canonical))) {
        errors.push('skills/' + skill + ': governed by ' + rule._rel + ' but nowhere states its ' +
          'canonical sentence "' + rule.canonical + '". Citing the rule is not agreeing with it.');
      }
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

  // D is hoisted below: two rules naming one detector must not emit the same coverage error twice.
  if (detector) {
    const seen = detectorScope.get(rule.detector) || { detector, skills: new Set(), rules: [] };
    for (const g of governed) seen.skills.add(g);
    seen.rules.push(rule._rel);
    detectorScope.set(rule.detector, seen);
  }
}

// ---- D -- coverage, once per detector -----------------------------------------

for (const [, { detector, skills, rules: owners }] of detectorScope) {
  for (const skill of allSkills) {
    if (skills.has(skill)) continue;
    const files = (skillFiles(skill) || []).filter((f) => !isReferenceFile(skill, f));
    const doing = files.filter((f) => detector.governs(fs.readFileSync(f, 'utf8')));
    if (doing.length > 0) {
      errors.push('skills/' + skill + ': does ' + detector.describe.replace(/^severity derived from.*/, 'severity rating') +
        ' (' + doing.map(rel).join(', ') + ') but is not in ' + owners.join(' / ') + "'s `applies-to`. " +
        'A skill that does the governed thing must join the contract — this is how the rule forks.');
    }
  }
}

// ---- F4 -- the trees no check reaches -----------------------------------------
//
// Check B runs only over skills named in an `applies-to`. Check D runs over everyone else but
// skips their references/ trees and uses the loose `governs` predicate. That leaves two places a
// full mapping can sit, fully green:
//
//   <pluginRoot>/references/**        nothing walked the plugin root outside skills/ -- and this
//                                     is where the toolkit already keeps shared prose, and where
//                                     shared-rules/ itself lives. The natural home for a shared
//                                     rule was the one place no detector could see.
//   skills/<non-governed>/references/ exempt from D by design, never reached by B.
//
// Both are swept here with the STRICT scan(), not `governs`. scan() is the same check B applies to
// governed skills and produces zero hits across the real corpus, so this closes the hiding places
// without reintroducing the three false positives that motivated narrowing D in the first place.
// The one exception is a `governedOnly` detector, which is swept over the first tree only.

function sweepStrict(files, why, inSkill) {
  for (const [key, detector] of Object.entries(DETECTORS)) {
    // A detector that binds governed skills only has nothing to say about a skill's own
    // references/ tree: check B has read it already, or its rule does not cover the skill. The
    // plugin-root tree belongs to no skill and the governed skills read it, so there it runs:
    // skipping it reopened the hiding place this block closes.
    if (detector.governedOnly && inSkill) continue;
    for (const f of files) {
      filesChecked += 1;
      detector.scan(f, (line, kind, detail, snippet) => {
        errors.push(rel(f) + ':' + line + ': [' + kind + '] ' + detail + '\n    ' + snippet +
          '\n    ' + why + ' (detector "' + key + '").');
      });
    }
  }
}

const rootRefsDir = path.join(pluginRoot, 'references');
if (fs.existsSync(rootRefsDir)) {
  const rootRefFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      // shared-rules/ holds the rule files themselves; check A' guards those, and they must be
      // free to explain the thing they forbid.
      if (e.isDirectory()) { if (path.resolve(full) !== path.resolve(rulesDir)) walk(full); }
      else if (TEXT_EXT.test(e.name)) rootRefFiles.push(full);
    }
  })(rootRefsDir);
  sweepStrict(rootRefFiles, 'Shared prose at the plugin root is governed by the same rules as the skills that read it');
}

for (const skill of allSkills) {
  const refFiles = (skillFiles(skill) || []).filter((f) => isReferenceFile(skill, f));
  if (refFiles.length) {
    sweepStrict(refFiles, 'skills/' + skill + '/references/ is exempt from check D\'s coverage sweep, not from the rule itself', true);
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

if (printCoverage) {
  for (const [key, detector] of Object.entries(DETECTORS)) {
    const hits = [];
    for (const skill of allSkills) {
      for (const f of skillFiles(skill) || []) {
        if (isReferenceFile(skill, f)) continue;
        if (detector.governs(fs.readFileSync(f, 'utf8'))) hits.push(rel(f));
      }
    }
    process.stdout.write('detector ' + key + ':\n');
    for (const h of hits.sort()) process.stdout.write('  ' + h + '\n');
  }
}

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
