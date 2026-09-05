#!/usr/bin/env node
'use strict';
// Checks that every reference a plugin document makes to ANOTHER PLUGIN FILE resolves.
//
// These skills describe other people's codebases, so most paths in the corpus are examples --
// `package.json`, `src/auth/index.ts`, `tsconfig.json` -- and must not be checked. A naive link
// checker flags 87 files of that noise and gets switched off the same day.
//
// The discriminator: a reference is plugin-internal when its BASENAME exists somewhere under the
// plugin. `failure-handling/endless-loop.md` names a file this plugin really has, so if it does not
// resolve from the citing document it is a broken path, not an example. `package.json` names no
// file here, so it is an example and is skipped.
//
// This catches exactly one bug class, and it is a real one: a path stated relative to the wrong
// root. An agent told to read `failure-handling/endless-loop.md` from `stages/` does not find it.
//
// Node built-ins only. Exit 0 = every internal reference resolves, 1 = broken, 2 = cannot run.
//
// Usage:  node check-doc-links.cjs [plugin-root]      # default: cwd

const fs = require('node:fs');
const path = require('node:path');

const pluginRoot = process.argv[2] || process.cwd();
if (!fs.existsSync(path.join(pluginRoot, 'skills'))) {
  process.stderr.write('cannot run: no skills/ directory under ' + pluginRoot + '\n');
  process.exit(2);
}

// scaffold templates are payload describing a GENERATED project, not this plugin.
const SKIP_DIR = /(^|\/)templates(\/|$)/;
const DOC_EXT = /\.md$/i;
const REF_EXT = /\.(?:md|cjs|sh)$/i;

const docs = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(full) && !e.name.startsWith('.')) walk(full); }
    else if (DOC_EXT.test(e.name)) docs.push(full);
  }
})(pluginRoot);

// Every file the plugin actually contains, indexed by basename. templates/ is excluded here too:
// those files are payload for a GENERATED project, so a doc saying "write `CLAUDE.md`" is talking
// about the user's repo and must not be matched against templates/expo/root/CLAUDE.md.
const byBasename = new Map();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(full) && !e.name.startsWith('.')) walk(full); }
    else {
      if (!byBasename.has(e.name)) byBasename.set(e.name, []);
      byBasename.get(e.name).push(full);
    }
  }
})(pluginRoot);

// `backticked/path.md` and [text](relative/path.md)
const BACKTICK = /`([^`\s]+\.(?:md|cjs|sh))`/g;
const MDLINK = /\[[^\]]*\]\(([^)\s#]+\.(?:md|cjs|sh))\)/g;

const errors = [];
const warnings = [];
let internalRefs = 0;
let skippedExamples = 0;

for (const doc of docs) {
  const text = fs.readFileSync(doc, 'utf8');
  const seen = new Set();
  for (const re of [BACKTICK, MDLINK]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1];
      if (seen.has(raw)) continue;
      seen.add(raw);
      if (/^(?:https?:|mailto:)/.test(raw)) continue;
      if (!REF_EXT.test(raw)) continue;

      const skillRoot = (() => {
        const rel = path.relative(pluginRoot, doc).split(path.sep);
        return rel[0] === 'skills' && rel[1]
          ? path.join(pluginRoot, 'skills', rel[1]) : null;
      })();

      // The corpus writes real plugin paths through these variables; they resolve at runtime.
      let ref = raw
        .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/?/g, '')
        .replace(/\$\{CLAUDE_SKILL_DIR\}\/?/g, '');
      const viaPluginRoot = raw.includes('${CLAUDE_PLUGIN_ROOT}');
      const viaSkillDir = raw.includes('${CLAUDE_SKILL_DIR}');

      // A path with a <placeholder> is a shape, not a location.
      if (/[<>{}*]/.test(ref)) { skippedExamples += 1; continue; }
      // tmp/ is the run's scratch output in the USER's repo, not a plugin file.
      if (/^\.?\/?tmp\//.test(ref)) { skippedExamples += 1; continue; }

      const base = path.basename(ref);
      const cands = [
        viaPluginRoot ? path.resolve(pluginRoot, ref) : null,
        viaSkillDir && skillRoot ? path.resolve(skillRoot, ref) : null,
        (!viaPluginRoot && !viaSkillDir) ? path.resolve(path.dirname(doc), ref) : null,
        (!viaPluginRoot && !viaSkillDir) ? path.resolve(pluginRoot, ref) : null,
        (!viaPluginRoot && !viaSkillDir && skillRoot) ? path.resolve(skillRoot, ref) : null,
      ].filter(Boolean);

      if (cands.some((c) => fs.existsSync(c))) { internalRefs += 1; continue; }
      if (!byBasename.has(base)) { skippedExamples += 1; continue; }  // example path, not ours

      internalRefs += 1;
      const real = byBasename.get(base).map((f) => path.relative(pluginRoot, f));
      const located = ref.includes('/');
      const msg =
        path.relative(pluginRoot, doc) + ': `' + raw + '` does not resolve from this document, ' +
        'but the plugin does contain ' + (real.length === 1 ? 'it' : 'files with that name') + ' at:\n' +
        real.map((r) => '      ' + r).join('\n');
      if (located) {
        errors.push(msg + '\n    A path stated relative to the wrong root. An agent told to read ' +
          'it will not find it.');
      } else {
        warnings.push(msg + '\n    Named but not located: an agent has to guess where it lives.');
      }
    }
  }
}

process.stdout.write('documents scanned          : ' + docs.length + '\n');
process.stdout.write('plugin-internal references : ' + internalRefs + '\n');
process.stdout.write('example paths skipped      : ' + skippedExamples + '\n');

if (warnings.length > 0) {
  process.stdout.write('\n' + warnings.length + ' reference(s) named but not located (warning, does not fail):\n\n');
  for (const w of warnings) process.stdout.write('  ' + w + '\n\n');
}

if (errors.length > 0) {
  process.stderr.write('\n' + errors.length + ' unresolvable internal reference(s):\n\n');
  for (const e of errors) process.stderr.write('  ' + e + '\n\n');
  process.exit(1);
}
process.stdout.write('every plugin-internal path reference resolves\n');
process.exit(0);
