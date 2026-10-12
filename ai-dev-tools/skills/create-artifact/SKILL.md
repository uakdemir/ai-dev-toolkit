---
name: create-artifact
argument-hint: "[new|publish|final|change|convert] [topic or path]"
description: "Use when the user asks to make, change, publish or finalize an engineering artifact: one HTML page that shows a decision, a system or a screen to a person. Applies to a decision page, a diagram page, a mockup page, an HTML artifact, and the conversion of a Claude Design board or canvas (`.dc.html`) into a page. Applies also when the user sends the answers to a decision page (an answer line such as `1A 2C`) or asks to make a page final. Use it before the Artifact tool and before `artifact-design`, also when the request does not name this skill."
---

<help-text>
/create-artifact — make, publish or finalize an engineering artifact

Usage: /create-artifact [action] [topic or path]

Actions:
  new <topic>        Make a draft page tmp/artifacts/<date>-<topic>.html
  publish <path>     Publish a copy of a page to Claude as a private page
  final <path>       Write the answers into a draft and move it into Git
  change <path>      Change a final page in place
  convert <board>    Convert a Claude Design board (.dc.html) into a page
  --help             Show this help

Without an action, the skill takes the action from the request.

Examples:
  /create-artifact new notification-settings
  /create-artifact final tmp/artifacts/2026-10-12-notification-settings.html
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside `<help-text>` tags above verbatim. Do not execute any skill logic.

# create-artifact

An engineering artifact is one HTML page that shows a decision, a system or a screen to a person. The page opens the same way from a disk with no network, in a browser and in the Claude artifact viewer. Only the final version goes into Git.

**The file in the repository obeys this skill. The guidance of the Artifact tool applies only to the copy that you publish.** The two disagree in five places, and in each place a session that follows the Artifact tool breaks the page:

| The Artifact tool and `artifact-design` say | The file in the repository |
|---|---|
| A Google Fonts link is permitted | No font from another host. System fonts, or the app typeface from the shared folder |
| A script from a content delivery network is permitted | No script from another host, and no library |
| Put a picture or a font into the file as `data:` text | Only SVG goes inside the file. A raster picture and a typeface are files in the shared folder |
| Browser storage is permitted for a convenience | No browser storage |
| Write no `<!doctype>`, `<html>`, `<head>` or `<body>` tag | The file has them. Only the publish copy has none |

Do not change a rule. If a rule does not work for a page, stop and tell the person.

## Folders

Read the `CLAUDE.md` of the repository first. If it names folders for artifacts, use those folders, and give the shared folder to the check script with `--assets`. If it names none, use these:

```
tmp/artifacts/<YYYY-MM-DD>-<topic>.html                             draft, gitignored
<owning-package>/docs/superpowers/artifacts/<topic>.html            final, in Git
docs/superpowers/artifacts/<topic>.html                             final that no package owns
docs/superpowers/artifacts/assets/pictures/                         shared raster pictures
docs/superpowers/artifacts/assets/fonts/                            shared typeface files and licences
tmp/artifacts/published/<topic>.html                                publish copy, gitignored
```

- `<topic>` is a short name in lower case with hyphens. `<YYYY-MM-DD>` is the date of today.
- A page is one file named for its topic. It has no folder of its own, because its pictures and its typeface are in the shared folder.
- The owning package is the package that holds the topic spec of the page.
- A draft is in `tmp/artifacts/` also when the person wants to keep it for some days. A draft does not go into a `docs/` folder, because its decision is not final.
- A page reaches the shared folder by a relative path. From a draft in `tmp/artifacts/`, the path is `../../docs/superpowers/artifacts/assets/pictures/<file>`. From a final in the root `docs/superpowers/artifacts/`, it is `assets/pictures/<file>`. When you move a page, calculate each path again.
- A page that names a shared file shows it only while the page is in its folder in the repository. Tell the person, if they want to copy the page to a different place.

## Rules

1. **One file.** A title, one style block, the content, one script at the end. Inline CSS, plain JavaScript, inline SVG. No framework, no library, no build step.
2. **No network request.** No script, stylesheet, font or picture from another host, and no `fetch`. A link (`<a href>`) to another host is permitted.
3. **No Claude runtime.** No `claude.use`, no `window.claude`, no `/_blob/` address, no Design board markup, no `support.js`.
4. **System fonts.** A screen mockup that must show the app typeface loads it with `@font-face` from the shared fonts folder by a relative path.
5. **Only SVG inside a file.** A raster picture comes from the shared pictures folder by a relative path. A shared file is 200,000 bytes or less.
6. **No browser storage.** No `localStorage`, `sessionStorage` or `indexedDB`. A decision page shows an answer line in a selectable area. Its Copy button calls `navigator.clipboard.writeText` inside the click, and selects the text if that fails.
7. **Real controls.** Each control is a `button`, an `input`, a `details` or a link, with a label and a visible focus state.
8. **A width of 400 pixels, light and dark colors, reduced motion.** At a width of 400 pixels, the page body does not scroll to the side: an object that is wider goes into a box with `overflow-x: auto`. A mockup of a screen keeps the colors of the screen. The page around it has light and dark colors.
9. **Content readable with no script.**
10. **A soft target of 60,000 bytes** for each page. When a page is larger, tell the author the size and the cause. The gate refuses a page above 150,000 bytes.
11. **No download link, and no `alert`, `confirm` or `prompt`.** The Claude viewer blocks them.

## The starter page and the check script

- The starter page is `${CLAUDE_PLUGIN_ROOT}/skills/create-artifact/template.html`. It holds the color tokens for light and dark, the system font stack, a header, a section, the answer line with Copy, and a footer with the date and the source paths. Start each page from it.
- The check script reads one page. It prints a `FAIL` line for a rule that the gate `engineering-artifacts-are-portable` refuses, and a `WARN` line for each other rule that a script can see:

  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/check-artifact.cjs <page>            # a draft
  node ${CLAUDE_PLUGIN_ROOT}/scripts/check-artifact.cjs --final <page>    # a page that goes into Git
  ```

  Exit 1 is one or more `FAIL` lines: correct each one and run the check again. Exit 0 is a pass. Exit 2 means that the check did not run.

  A `FAIL` rule is one of these: a load from another host, a raster picture inside the file, the Claude runtime, browser storage, a file that is not in the shared folder, a page above 150,000 bytes and, with `--final`, a page with no link from a Markdown file. A `WARN` line does not refuse the page. Read each one. Correct it, or tell the person which rule the page does not obey, and why.
- The check reads text. It does not see the layout, a missing label or a control that does nothing. If the session can open a browser, look at the page at a width of 400 pixels in light and in dark colors. If it cannot, tell the person that nobody looked at the layout.

## Actions

### New draft

1. Copy the starter page:
   `mkdir -p tmp/artifacts && cp ${CLAUDE_PLUGIN_ROOT}/skills/create-artifact/template.html tmp/artifacts/<YYYY-MM-DD>-<topic>.html`
2. Run `git check-ignore -q tmp/artifacts`. If the exit code is not 0, Git does not ignore the folder: tell the person before you continue.
3. Write the content into the copy. The title is a name of two to four words. A page with no decision has no form and no script: remove them, as the comment in the starter page says.
4. For a decision page, give each question a number and each option a letter. Mark the recommended option with `checked`. Write the line of the recommended answers into the `output` element.
5. If the page needs a picture or the app typeface, use a file from the shared folder. If the file is not there, ask the person for it. Do not put it into the page, and do not download it.
6. Put the date and the paths of the source files in the footer.
7. Run the check script. Correct each `FAIL` line, and read each `WARN` line.
8. Give the person the path of the page. For a decision page, tell them to send the answer line back in the conversation.

### Publish to Claude

The file in the repository stays the true version. To change a published page, change the file in the repository, make the copy again and publish again. Do not edit only the copy.

1. Run the check script on the page in the repository. Publish only a page that passes. Do not run the check on the publish copy: the copy has no document tags and its paths name no file on the disk, so the check refuses it.
2. Get the page contract of the Claude viewer in this session: do what the Artifact tool tells you to do before a publish (it names the `artifact-design` skill). Then read `references/viewer-contract.md` in this skill folder. If the contract of today refuses something that this skill makes, stop and tell the person.
3. Copy the page to `tmp/artifacts/published/<topic>.html`.
4. In the copy, delete these lines: `<!doctype html>`, `<html …>`, `<head>`, the `charset` and `viewport` meta tags, `</head>`, `<body>`, `</body>` and `</html>`. The copy then starts with `<title>`. The publisher adds its own document tags.
5. In the copy, change each relative path to the shared folder into `assets/pictures/<file>` or `assets/fonts/<file>`. A published page cannot name a file with `../`.
6. Publish the copy with the Artifact tool:
   - `file_path`: the copy.
   - `files`: one entry for each file that the copy names. The key is the path in the copy, and the value is the file in the shared folder. For a typeface file, give the type also: `{"assets/fonts/<file>.ttf": {"from": "<shared fonts folder>/<file>.ttf", "contentType": "font/ttf"}}`. The types are `font/ttf`, `font/otf`, `font/woff` and `font/woff2`.
   - `description`: one sentence that says what the page shows.
   - `icon`: one plain word, only on the first publish.
   - `url`: the address of the page, if it was published before. Find it with the `list` action. Without `url`, a new session makes a second page.
   - No `capabilities`.
7. Read the list of the published files (`action: "list"`, `scope: "files"`, with the `url`). It must show the page and each shared file.
8. Give the person the link. The page is private. Never change a sharing setting, and never tell the person to make the page public. If other people must see it, the person shares it from the Share menu of the page.

### Make final

1. Get the answer line from the person. Do not guess an answer, and do not make a page final with the recommended answers because nobody answered.
2. Write the answers into the HTML:
   - Put `checked` on the chosen option of each question, and remove it from the other options.
   - Put `disabled` on each `input`.
   - Write the answer line into the `output` element.
   - Remove the Copy button and its note. Remove the script also, if it has no other task.
   - Change the words that say "draft" or "recommended" where they are no longer true.
3. Put the date of the decision in the footer.
4. Move the page to the artifacts folder of its owner (see **Folders**): `<owning-package>/docs/superpowers/artifacts/<topic>.html`, or the root folder if no package owns the topic. The file name is the topic, with no date. Delete the draft file.
5. Calculate each relative path to the shared folder again. `git add` each shared file that is new.
6. Add a Markdown link to the page from the topic spec. A final page with no link from a Markdown file is an orphan. Use the link form of that spec: a path relative to it, `~/<path>` from the repository root, or `@<scope>/<package>/<path>`. The check reads the three forms. A link from a plan does not count, because a plan does not reach the trunk.
7. Run the check script with `--final`. Correct each `FAIL` line, and read each `WARN` line.
8. Commit the page, the spec and each new shared file in one commit, on the branch that the session started on. Use the commit message form of the repository. Do not make a branch, do not change the branch, and do not push.

### Change a final

1. Change the page in place. Git keeps the earlier version. Do not make a copy with a date or a version number in its name.
2. If the decision changed, put the new date of the decision in the footer.
3. Run the check script with `--final`, and commit on the branch that the session started on.

### Convert a Claude Design board

A board (`*.dc.html`) draws only inside the Claude Design runtime. The approved board becomes one final page.

1. Copy the starter page to the artifacts folder of its owner: `<owning-package>/docs/superpowers/artifacts/<topic>.html`. A conversion has no draft, because the design is approved. Remove the form, the script and their styles, as the comment in the starter page says.
2. Take the markup out of the `x-dc` tag. Do not take the `helmet` tag. Put the markup of each board into one wrapper `div` that has the width and the height of the board (the `$preview` values in `data-props`).
3. Move the styles from the `helmet` tag into the one style block. A rule for `body`, `button` or `a` in the board applies to the whole page now: change its selector so that it applies only inside the wrapper. The `button` rule and the `box-sizing` rule of the starter page apply inside the board also: set them back inside the wrapper, or the buttons of the board change their size.
4. Remove the font link. Use system fonts. If the mockup must show the app typeface, load it from the shared fonts folder. If the typeface file is not there, ask the person for it.
5. Change each `/_blob/` picture into a picture from the shared pictures folder. The picture at the platform address is not in Git. If no shared picture fits, ask the person.
6. Remove the `support.js` script tag and the `text/x-dc` script. If the `DCLogic` class holds state or handlers, port them into plain functions and pointer events in the one script at the end. Each control then does in the page what it does on the board. A class that only returns `{}` from `renderVals` has no logic, and the page gets no script.
   - A control that has no handler on the board stays a button that does nothing. Say so in the text of the page. Do not give a control a behaviour that the design did not approve.
   - Change each `sc-if` into the `hidden` attribute, and each `{{ }}` value into a value that the script sets.
   - Write the start state into the markup, so that the page is correct before the script runs.
   - A part that only a pointer can move, such as a slider rail, gets an `input` also, so that the keyboard can reach it.
   - If `node` is available, run the class of the board and the script of the page on the same events, and compare the results.
7. Put several boards side by side in a grid, each board in a box with `overflow-x: auto`. Browser zoom and scroll replace the canvas pan.
8. Keep the colors of the board inside the wrapper. The page around it keeps the light and dark tokens of the starter page. If the board has a transition or an animation, the reduced-motion rule of the starter page must stay.
9. Put the date of the approval in the footer. If the person did not give it, ask for it.
10. Do steps 5 to 8 of **Make final**: the shared files, the link from the topic spec, the check with `--final`, and the commit. Leave the board file where it is, unless the person tells you to remove it.

## What this skill does not do

- It does not publish a page publicly, and it does not change a sharing setting.
- It does not use a Claude runtime capability.
- It does not send feedback, a rating or a transcript to a vendor.

## Reasons that sound correct and are not

| The thought | The fact |
|---|---|
| "The font link follows the artifact page rules", "that host is allowed in the Claude viewer" | The page must open from a disk with no network. Offline, the face changes with no warning, and a mockup shows the wrong face |
| "A path to the typeface file fails offline, or the viewer blocks it, so I put the font into the file" | A relative path to the shared folder works from a disk. The publish step sends the file with the page, and the viewer shows it: see the first run in `references/viewer-contract.md` |
| "A relative path breaks when the page moves or is published" | **Make final** calculates the path again, and the publish copy uses `assets/…` |
| "The Claude viewer adds the document tags, so the file has none" | With no doctype, a browser draws the file from a disk in quirks mode. The file has the tags, and the publish copy has none |
| "Git ignores `tmp/`, so the draft goes into `docs/`" | A draft stays out of Git on purpose. Only a final goes into `docs/` |
| "The approved screen is dark, so the page is dark only" | The screen keeps its colors. The page around it has light and dark colors |
| "The person is in a hurry, so I do not run the check" | The check runs in less than one second |
