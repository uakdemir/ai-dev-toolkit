#!/usr/bin/env bash
# TDD harness for scripts/check-artifact.cjs -- the check that the create-artifact skill runs on a page.
#
# Each case makes one small page from tests/fixtures/artifact-pages/base.html with one part changed.
# The changed part is the broken rule, and the case names the rule ids that the check must report:
# as FAIL lines for a rule that the gate refuses, or as WARN lines ("warn:<ids>") for each other rule.
# The pages go into a scratch Git repository: the check finds the shared folder from the repository
# root, and --final reads the tracked files.
#
# Usage:  ./check-artifact-test.sh [path-to-ai-dev-tools]
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="${1:-$HERE/..}"
PLUGIN="$(cd "$PLUGIN" 2>/dev/null && pwd)" || { printf 'cannot run: plugin root not a directory\n' >&2; exit 2; }
CHECK="$PLUGIN/scripts/check-artifact.cjs"
FIX="$PLUGIN/tests/fixtures/artifact-pages"
STARTER="$PLUGIN/skills/create-artifact/template.html"
# Most cases assert exit 1, and `node <missing>.cjs` also exits 1. Without these guards, a suite that
# points at a missing script reports PASS for each of them.
[ -f "$CHECK" ]         || { printf 'cannot run: check script not found at %s\n' "$CHECK" >&2; exit 2; }
[ -f "$FIX/base.html" ] || { printf 'cannot run: fixtures not found at %s\n' "$FIX" >&2; exit 2; }
[ -f "$STARTER" ]       || { printf 'cannot run: starter page not found at %s\n' "$STARTER" >&2; exit 2; }

pass=0; fail=0
ok()  { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

REPO="$WORK/repo"
SHARED="$REPO/docs/superpowers/artifacts/assets"
DRAFT="$REPO/tmp/artifacts/2026-10-12-case.html"
mkdir -p "$SHARED" "$(dirname "$DRAFT")" "$REPO/elsewhere"
cp -r "$FIX/assets/." "$SHARED/"
cp "$FIX/elsewhere/dot.png" "$REPO/elsewhere/dot.png"
head -c 200001 /dev/zero > "$SHARED/pictures/big.png"
git -C "$REPO" init -q
git -C "$REPO" add docs

BASE="$(cat "$FIX/base.html")"
A='../../docs/superpowers/artifacts/assets'   # from a draft in tmp/artifacts/ to the shared folder

# swap <text> <find> <put>: the text with each <find> changed into <put>, both literal.
swap() { printf '%s' "${1//"$2"/"$3"}"; }

# ids <FAIL|WARN> <output>: the sorted rule ids of the lines of that kind.
ids() { printf '%s\n' "$2" | sed -n "s/^$1  \\([a-z-]*\\)  .*/\\1/p" | sort -u | tr '\n' ' ' | sed 's/ $//'; }

# check <want> <label> <check-artifact arguments>: <want> is the sorted rule ids of the FAIL lines,
# "warn:<sorted rule ids>" for a pass with those WARN lines, or "" for a pass with no line.
check() {
  local want="$1" label="$2" out code got warned
  shift 2
  out="$(node "$CHECK" "$@" 2>&1)"; code=$?
  got="$(ids FAIL "$out")"; warned="$(ids WARN "$out")"
  if [ -z "$want" ] && [ "$code" -eq 0 ] && [ -z "$got$warned" ]; then ok "passes: $label"
  elif [ "${want#warn:}" != "$want" ] && [ "$code" -eq 0 ] && [ -z "$got" ] && [ "$warned" = "${want#warn:}" ]; then ok "warns (${want#warn:}): $label"
  elif [ -n "$want" ] && [ "$code" -eq 1 ] && [ "$got" = "$want" ]; then ok "refuses ($want): $label"
  else bad "$label -- want '${want:-pass}', got exit $code, FAIL '${got:-none}', WARN '${warned:-none}'"; fi
}

# draft <want> <label> <page text>: check the text as a draft page.
draft() { printf '%s\n' "$3" > "$DRAFT"; check "$1" "$2" "$DRAFT"; }
# one <want> <label> <find> <put>: check the base page with one part changed.
one() { draft "$1" "$2" "$(swap "$BASE" "$3" "$4")"; }

echo
echo "pages that pass"
one "" "the base page" 'NO-SUCH-TEXT' ''
check "" "the starter page of the skill" "$STARTER"
one "" "a link to another host, a link to a file, and the word fetch in the text" '<!--BODY-->' \
  '<p>We fetch the data. <a href="https://example.com/">Example</a> <a href="../../docs/spec.md">Spec</a></p>'
one "" "an SVG drawing as data: text" '/*CSS*/' \
  "h1 { background: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E\"); }"
one "" "an inline SVG drawing" '<!--BODY-->' \
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" role="img" aria-label="Dot"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>'
draft "" "a picture and a typeface from the shared folder" "$(swap "$(swap "$BASE" '<!--BODY-->' \
  "<img src=\"$A/pictures/dot.png\" alt=\"Dot\">")" '/*CSS*/' \
  "@font-face { font-family: \"Test\"; src: url(\"$A/fonts/test.ttf\") format(\"truetype\"); }")"
one "" "the name of a storage object in the text" '<!--BODY-->' '<p><code>localStorage</code> is not permitted.</p>'
one "" "a remote script inside a comment" '<!--HEAD-->' '<!-- <script src="https://cdn.example.com/lib.js"></script> -->'
one "" "a function with a name that starts with confirm" '/*JS*/' 'function confirmChoice() {} confirmChoice();'
one "" "motion with a reduced-motion rule" '/*CSS*/' \
  'h1 { animation: spin 1s linear infinite; } @media (prefers-reduced-motion: reduce) { h1 { animation: none; } }'
draft "" "a page with no script" "$(swap "$BASE" $'<script>\n/*JS*/\n</script>\n' '')"

echo
echo "network"
one "network" "a script from another host" '<script>' '<script src="https://cdn.example.com/lib.js">'
one "network" "a stylesheet from another host" '<!--HEAD-->' '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'
one "network" "a font from another host" '/*CSS*/' '@font-face { font-family: "X"; src: url(https://fonts.gstatic.com/x.woff2); }'
one "network" "a CSS import from another host" '/*CSS*/' '@import "https://example.com/a.css";'
one "network" "a picture from another host" '<!--BODY-->' '<img src="https://example.com/a.png" alt="">'
one "network" "a picture address that starts with two slashes" '<!--BODY-->' '<img src="//example.com/a.png" alt="">'
one "network" "a picture from another host in srcset" '<!--BODY-->' '<img srcset="https://example.com/a.png 2x" alt="">'
one "network" "a CSS picture from another host" '/*CSS*/' "h1 { background: url('http://example.com/a.png'); }"
one "network" "a call to fetch" '/*JS*/' 'fetch("data.json");'
one "network" "an XMLHttpRequest" '/*JS*/' 'new XMLHttpRequest();'
one "network" "a picture address that the script sets" '/*JS*/' 'new Image().src = "https://example.com/a.png";'

echo
echo "pictures and fonts inside the file"
one "data-picture" "a raster picture as data: text" '<!--BODY-->' '<img src="data:image/png;base64,iVBORw0KGgo=" alt="">'
one "warn:data-font" "a font as data: text" '/*CSS*/' '@font-face { font-family: "X"; src: url(data:font/woff2;base64,AAAA); }'

echo
echo "Claude runtime"
one "asset runtime" "a picture at a platform address" '<!--BODY-->' '<img src="/_blob/abc123" alt="">'
one "asset runtime" "the Design runtime script" '<script>' '<script src="./support.js">'
one "runtime" "Design board markup" '<!--BODY-->' '<x-dc name="board"></x-dc>'
one "runtime" "a call to claude.use" '/*JS*/' 'claude.use("db");'
one "runtime" "a read of window.claude" '/*JS*/' 'const hot = window.claude;'

echo
echo "browser storage"
one "storage" "localStorage" '/*JS*/' 'localStorage.setItem("a", "1");'
one "storage" "sessionStorage" '/*JS*/' 'sessionStorage.getItem("a");'
one "storage" "indexedDB" '/*JS*/' 'indexedDB.open("a");'
one "storage" "storage in an event attribute" '<!--BODY-->' '<button type="button" onclick="localStorage.clear()">Clear</button>'

echo
echo "dialogs and downloads"
one "warn:dialog" "alert" '/*JS*/' 'alert("Done");'
one "warn:dialog" "confirm" '/*JS*/' 'if (confirm("Sure?")) {}'
one "warn:dialog" "window.prompt" '/*JS*/' 'const answer = window.prompt("Name");'
one "warn:download" "a download link" '<!--BODY-->' '<a href="data.csv" download>Get the data</a>'

echo
echo "one file"
one "warn:structure" "no doctype" '<!doctype html>' ''
one "warn:structure" "no viewport meta tag" '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' ''
one "warn:structure" "no title" '<title>Test page</title>' ''
one "warn:structure" "two style blocks" '<!--HEAD-->' '<style>h1 { margin: 0; }</style>'
one "warn:structure" "two scripts" '<!--BODY-->' '<script>/* first */</script>'
draft "warn:structure" "content after the script" "$(swap "$(swap "$BASE" '<h1>Test page</h1>' '')" '</script>' $'</script>\n<h1>Test page</h1>')"

echo
echo "colors and motion"
one "warn:colors" "no dark colors" '@media (prefers-color-scheme: dark) { :root { --bg: #111111; --ink: #eeeeee; } }' ''
one "warn:motion" "CSS motion with no reduced-motion rule" '/*CSS*/' 'h1 { animation: spin 1s linear infinite; }'
one "warn:motion" "script motion with no reduced-motion rule" '/*JS*/' 'requestAnimationFrame(function step() {});'

echo
echo "files that the page names"
one "asset" "a file that does not exist" '<!--BODY-->' "<img src=\"$A/pictures/none.png\" alt=\"\">"
one "asset" "a file outside the shared folder" '<!--BODY-->' '<img src="../../elsewhere/dot.png" alt="">'
one "asset" "a file beside the page" '<!--BODY-->' '<img src="dot.png" alt="">'
one "asset" "a shared file larger than 200,000 bytes" '<!--BODY-->' "<img src=\"$A/pictures/big.png\" alt=\"\">"
one "asset" "a shared file that is not a picture or a typeface" '<script>' "<script src=\"$A/pictures/lib.js\">"

OTHER="$WORK/no-repo"
mkdir -p "$OTHER/page" "$OTHER/shared/pictures"
cp "$FIX/assets/pictures/dot.png" "$OTHER/shared/pictures/dot.png"
swap "$BASE" '<!--BODY-->' '<img src="../shared/pictures/dot.png" alt="Dot">' > "$OTHER/page/index.html"
check "" "a shared folder that --assets names" --assets "$OTHER/shared" "$OTHER/page/index.html"
check "asset" "no repository and no --assets" "$OTHER/page/index.html"

echo
echo "size"
PAD="$(head -c 60000 /dev/zero | tr '\0' 'x')"
one "warn:size" "a page above 60,000 bytes" '<!--BODY-->' "<p>$PAD</p>"
one "size" "a page above 150,000 bytes" '<!--BODY-->' "<p>$PAD$PAD$PAD</p>"

echo
echo "--final"
FINAL="$REPO/docs/superpowers/artifacts/topic.html"
swap "$BASE" '<!--BODY-->' '<img src="assets/pictures/dot.png" alt="Dot">' > "$FINAL"
check "orphan" "no Markdown file links to the page" --final "$FINAL"
printf '[The page](superpowers/artifacts/topic.html)\n' > "$REPO/docs/spec.md"
check "orphan" "only a Markdown file outside Git links to the page" --final "$FINAL"
git -C "$REPO" add docs/spec.md
check "" "a final page with a link from a tracked Markdown file" --final "$FINAL"

cp "$FIX/assets/pictures/dot.png" "$SHARED/pictures/new.png"
swap "$BASE" '<!--BODY-->' '<img src="assets/pictures/new.png" alt="Dot">' > "$FINAL"
check "asset" "a shared file that is not in Git" --final "$FINAL"
check "" "the same page as a draft" "$FINAL"

DATED="$REPO/docs/superpowers/artifacts/2026-10-12-topic.html"
printf '%s\n' "$BASE" > "$DATED"
printf '[The dated page](superpowers/artifacts/2026-10-12-topic.html)\n' >> "$REPO/docs/spec.md"
check "warn:name" "a date in the name of a final" --final "$DATED"

FOLDER="$REPO/docs/superpowers/artifacts/legacy"
mkdir -p "$FOLDER"
printf '%s\n' "$BASE" > "$FOLDER/index.html"
printf '[The folder page](superpowers/artifacts/legacy/index.html)\n' >> "$REPO/docs/spec.md"
check "warn:name" "a final named index.html" --final "$FOLDER/index.html"

OWNED="$REPO/apps/mobile/docs/superpowers/artifacts/topic.html"
mkdir -p "$(dirname "$OWNED")" "$REPO/apps/mobile/docs/superpowers/plans"
swap "$BASE" '<!--BODY-->' '<img src="../../../../../docs/superpowers/artifacts/assets/pictures/dot.png" alt="Dot">' > "$OWNED"
printf '[The page](../superpowers/artifacts/topic.html#top)\n' > "$REPO/apps/mobile/docs/specs.md"
git -C "$REPO" add apps/mobile/docs/specs.md
check "orphan" "a link that goes to a different page" --final "$OWNED"
printf '[The page](superpowers/artifacts/topic.html)\n' > "$REPO/apps/mobile/docs/superpowers/plans/plan.md"
git -C "$REPO" add apps/mobile/docs/superpowers/plans/plan.md
check "orphan" "only a plan links to the page" --final "$OWNED"
printf '[The page](superpowers/artifacts/topic.html#top)\n' > "$REPO/apps/mobile/docs/specs.md"
check "" "a final page in a package folder" --final "$OWNED"
printf '[The page](~/apps/mobile/docs/superpowers/artifacts/topic.html#top)\n' > "$REPO/apps/mobile/docs/specs.md"
check "" "a link from the repository root with ~/" --final "$OWNED"
printf '[The page](@tune-dating/mobile/docs/superpowers/artifacts/topic.html)\n' > "$REPO/apps/mobile/docs/specs.md"
check "" "a link through the package name" --final "$OWNED"
printf '[The page](@tune-dating/other/docs/superpowers/artifacts/topic.html)\n' > "$REPO/apps/mobile/docs/specs.md"
check "orphan" "a link through a different package name" --final "$OWNED"

echo
echo "commands that cannot run"
node "$CHECK" "$WORK/none.html" >/dev/null 2>&1; [ $? -eq 2 ] && ok "exit 2: the page does not exist" || bad "missing page"
node "$CHECK" >/dev/null 2>&1; [ $? -eq 2 ] && ok "exit 2: no page is given" || bad "no page"
node "$CHECK" --final "$OTHER/page/index.html" >/dev/null 2>&1; [ $? -eq 2 ] && ok "exit 2: --final outside a Git repository" || bad "--final outside Git"

echo
printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
