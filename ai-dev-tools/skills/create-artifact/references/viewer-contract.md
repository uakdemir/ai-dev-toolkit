# The page contract of the Claude viewer

This file is a record of the page contract on 2026-10-12. The source is the `artifact-design` skill and the description of the Artifact tool, as a session got them on that date. It is not written from memory.

The contract can change. Before each publish, get the contract in the session, as the publish step of `SKILL.md` says. If the contract of the session and this file disagree, the contract of the session is correct: tell the person, and correct this file.

## What the publisher does to a page

| Contract | What the publish copy does |
|---|---|
| The publisher puts its own document tags around the file: a doctype, `html`, `head` with the `charset` and `viewport` meta tags, a small reset, and `body`. The file must have none of these tags. | The copy has no document tags. It starts with `<title>`, then `<style>`. |
| The reset sets a light `color-scheme` on `:root`, a `body` margin of zero, a 14 pixel system font, `img { max-width: 100% }`, and `[hidden] { display: none !important }`. It also adds padding to `:root` for the safe areas of a phone. | The starter page sets its own colors, font and margin, so the reset changes nothing. Do not remove the padding of `:root`. |
| Only the first 8,000 bytes are read for the `<title>`. The title is the name of the page: two to four words, the same at each publish. | The title is the first line of the copy. |
| `icon` is one plain word at the first publish. A later publish does not give it. | See the publish step. |
| The page is 16 megabytes or less. Each other file is 15 megabytes or less. | A page is 150,000 bytes or less, and a shared file is 200,000 bytes or less. |
| The other files go in `files`. Each key is the path that the HTML names: relative, with no `/` at the start. The type comes from the file name for the usual types. Give `contentType` for other types. | Keys are `assets/pictures/<file>` and `assets/fonts/<file>`. Give `contentType` for a typeface file. The design guidance of the Artifact tool says to put a font into the file as `data:` text. That is not necessary: the first run below showed a typeface from a file. |
| A page is private when it is published. A session cannot change the sharing. | The person shares the page from its Share menu. |

## What the viewer refuses

| The viewer | This skill |
|---|---|
| Loads a script only from five content delivery networks, and a stylesheet only from Google Fonts. It blocks each other load from another host, and shows no error: pictures, media, `fetch`, a web socket. | The page loads nothing from another host. |
| Blocks a download that the page starts: an `<a download>` link and a save from a script. | Rule 11. |
| Does not show `alert`, `confirm` or `prompt`. `confirm` returns false and `prompt` returns null. | Rule 11. Put a confirmation step into the page. |
| Does not open the print dialog. | Do not add a Print button. |
| Has no place to send a form. | Handle `submit` in the script with `preventDefault()`. Give a form no `action`. |
| Permits `navigator.clipboard.writeText` inside a click. Some viewers refuse it. A read of the clipboard never works. | Rule 6: catch the refusal and select the text. |
| Opens a link to another site in a new tab. A `mailto:` or `tel:` link frequently does nothing. `window.open` works only for some viewers. | Use a real `<a href>`. Show an address or a number as text also. |
| Does not show another site in an `iframe`, `object` or `embed`. | Link to the site. |
| Refuses the camera, the microphone, the location and equivalent device functions. | Do not use them. |
| Gives each page its own browser storage, which can be empty or can throw. | Rule 6: no browser storage. |
| Gives the page only a plain `#anchor` from its link. It gives no query string. | Keep state in the page. |

## What the viewer expects of the styles

- The page works at a width of approximately 400 pixels. The page body does not scroll to the side. The side padding is 16 pixels or more at each width. Only a table, a diagram or a code block can be wider, each in its own box with `overflow-x: auto`.
- The viewer has three theme states. `data-theme="dark"` or `data-theme="light"` on the root element is a choice of the person. With no attribute, only `prefers-color-scheme` tells light from dark. Thus the colors are tokens in this form, which the starter page has:

  ```css
  :root { --bg: …; --ink: … }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: …; --ink: …; color-scheme: dark } }
  :root[data-theme="dark"] { --bg: …; --ink: …; color-scheme: dark }
  body { background: var(--bg); color: var(--ink) }
  ```

- `body` has a background from a token. With no background, the viewer shows its own ground behind the page.
- Change the visibility of an element with `element.hidden`, not with `style.display`.

## Where the contract permits more than this skill

The contract permits a Google Fonts link, a script from a content delivery network, a picture or a font as `data:` text, browser storage and runtime capabilities (`window.claude`). This skill permits none of them, because the page must open from a disk with no network and with no Claude runtime.

## The first run of the publish step

Date: 2026-10-12. The test page had one picture (`assets/pictures/test-card.png`, 615 bytes) and the app typeface (`assets/fonts/FrauncesSoft-Regular.ttf`, 72,428 bytes, sent with `contentType: "font/ttf"`).

| Check | Result |
|---|---|
| The publisher stores the page and the two files | Confirmed. The file list showed `index.html` (`text/html`), the picture (`image/png`) and the typeface (`font/ttf`). |
| The publisher adds its document tags around a copy that has none | Confirmed. The page that came back started with the tags of the publisher, then the `<title>` of the copy. |
| The picture and the typeface show in the Claude viewer | Confirmed by the founder. A session cannot see the viewer, so the test page showed a result line for a person to read. The line was `picture=yes typeface=yes`. |
