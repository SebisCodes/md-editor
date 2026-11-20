# Using the Markdown Editor

The Markdown Editor shows your Markdown next to a live preview with a readable page layout.
A click in the preview jumps to its place in the code, and you can edit the text right in
the preview. It understands CommonMark with GitHub's extensions and math.

Open it at https://md.giit.ch/. It is free, needs no sign-up, and runs in your browser: your
documents stay there unless you send them somewhere yourself.

## What it can do

- CommonMark with GitHub's extensions: tables (with alignment), task lists (clickable in the
  preview), strikethrough, autolinks and footnotes; math in `$…$` and `$$…$$` (KaTeX);
  headings get the same anchors as on GitHub, so `[see below](#my-heading)` works.
- Raw HTML in the Markdown is shown without scripts, styles, frames, forms, SVG and `on…`
  attributes; `javascript:` links are removed.
- Code with Markdown highlighting and an outline of the headings.
- Problems with their line: missing pictures, links to `#anchors` that are not there, code
  blocks that are never closed, table rows with another number of cells than the header,
  math errors.
- Insert: headings, bold and italic, links, pictures, lists, task lists, tables, quotes,
  code blocks, math, footnotes, horizontal rules.
- Templates: README, article, meeting notes, checklist.

## Getting started

1. **Start**: choose a template under **New**, open a `.md` file or paste Markdown.
2. **Write**: type in the code, or edit text in the preview. **Insert** has ready-made
   pieces.
3. **Export**: save an HTML page, a PDF or the `.md` file with its pictures.

## Editing in the preview

Click text in the preview to edit it right there: paragraphs, headings, list items, quotes
and table cells. The cursor is where you clicked, and the code's cursor goes to the same
place. **Enter** starts a new paragraph (in a list a new item with the same marker, and a
numbered list is numbered on), **Shift+Enter** inserts a hard line break. **Ctrl+Enter**
(Cmd+Enter on macOS) or a click elsewhere applies the edit; **Escape** cancels. Characters
such as `*` or `_` are escaped so they stay text. Each edit is one step for Undo.

A click on math, a picture or code jumps to its place in the code instead. **Ctrl+click**
follows a link. A check box of a task list ticks the task in the code.

The right side panel has **Insert**, **Pictures** and **Outline**. **Insert > New page**
sets a page break for printing and PDF; the preview shows it as a dashed line. In
**Export**, "Apply page breaks" turns them off for a PDF.

## Your documents

Your documents are kept only in your browser (in `localStorage`, their pictures in
IndexedDB), not on a server, and stay there after you close the page. **My documents** (the
folder button at the top left) lists every document of this browser: open, rename,
duplicate, download (`.md`, or a ZIP with its pictures) and delete them.

Clearing the browser's site data removes them, so download the ones you want to keep, or let
the editor send them to your own server: **Save to server** (the cloud button) sets up a
webhook, an address that gets every saved version (see [EMBEDDING.md](EMBEDDING.md#webhook)
for what it receives). Nothing is sent until you enter an address there.

**Opening files:** `.md` files become new documents; a ZIP with a `.md` file and its
pictures opens as one document. Pictures dropped or pasted go into the open document.

## Pictures

Pictures are stored with their document and used by `![description](name.png)` or `<img
src="name.png">`. Drag or paste a picture into the editor, or add it in the **Pictures**
tab. A missing picture is listed as a problem. Pictures linked from other websites load from
those sites.

## Export

**Export** offers:

- **HTML**: one file with the uploaded pictures and the styles inside; pictures linked from
  other websites remain external links.
- **PDF** through the print dialog: choose "Save as PDF" as the printer. The browser's
  header and footer are left out, and the editor's address is centered at the bottom of
  every page.
- **Plain text**.
- The **`.md`** file, with its pictures as a ZIP.

**Download .md** in the bar saves the code.

**Export > Open in another editor** converts the document in the browser to LaTeX, Typst or
HTML and opens the result as a new document in that editor. Anything the other format cannot
hold is listed first. Pictures do not travel.

## AI Assistant

Any AI can work with you: ChatGPT, Claude, Gemini, Copilot or the AI in your coding tool.
Nothing to install and no key needed. Click **AI Assistant**, then **Copy prompt**, paste it
into your AI and say what it should do. The prompt holds the instructions and the current
document.

The AI answers with a link that carries the document after the `#`; click it and the
document appears in your editor. **Undo** takes every change back. The links look like this:

- `https://md.giit.ch/#b64=<base64url of the UTF-8 text>`
- `https://md.giit.ch/#md=<URL-encoded text>`
- `https://md.giit.ch/#z=<base64url of the zlib-compressed text>` (shortest)
- `&mode=add` adds text at the end of the open document.
- `&file=new&name=<name>` makes a new document next to your others, `&file=<name>` changes
  that one; without `&file=` the open document changes.
- `&part=N&of=M&id=<name>` sends a long document in several links; the editor collects the
  parts.

A tab opened with such a link hands the document to the editor tab you used last. You can
also paste the AI's whole answer into the editor (Ctrl+V outside the code); links that a
terminal broke over several lines are joined. When the editor is embedded in another
website, links cannot reach it, so paste the answer there.

**Browser agents (WebMCP):** in browsers that offer WebMCP, the page registers tools for AI
agents that run in the page itself: `get_document`, `get_problems`, `list_sections`,
`set_document`, `insert_text`, `replace_text`, `show_line`, `undo`, and `list_files`,
`open_file`, `new_file` for your other documents (no tool deletes a document). Every change
is one step for Undo.

## Languages

The editor speaks English at `/`, German `/de/`, French `/fr/`, Italian `/it/`, Spanish
`/es/`, Portuguese `/pt/`, Dutch `/nl/`, Polish `/pl/`, Turkish `/tr/`, Russian `/ru/`,
Ukrainian `/uk/`, Chinese `/zh/`, Japanese `/ja/` and Korean `/ko/`. Opening
`https://md.giit.ch/` leads to the language you picked before in a language menu, or else to
your browser's language. A language picked in the menu holds for every giit.ch site. The
prompt for the AI is always in English.

## Color theme

Light, dark or automatic (following your system): the theme switch in the bar sets it, and
the editor remembers your choice.

## Keyboard shortcuts

On macOS use Cmd instead of Ctrl. The **Help** dialog in the editor lists them as well.

| Keys | Action |
|---|---|
| Ctrl + B / I | Bold / italic around the selected text |
| Ctrl + K | Link |
| Ctrl + M | Math: `$…$` around the selection |
| Ctrl + / | Lines in or out of a comment (`<!-- -->`) |
| Ctrl + Enter | Show the cursor's place in the preview |
| Tab / Shift + Tab | Indent / outdent |
| Ctrl + Z / Y | Undo / redo |
| Ctrl + S | Save (download `.md`, or to your server) |
| Ctrl + E | Export |
| Ctrl + O | My documents |
| Ctrl + P | Print / save as PDF |

Enter in a list starts the next item (`-`, `1.`, `- [ ]`, `>`); on an empty item it ends the
list. `*` `_` `` ` `` `~` `$` `[` `(` close by themselves around a selection.

## On your own website

The editor can be embedded in other websites with an iframe, opened in a window of its own
or used as a read-only viewer. See [EMBEDDING.md](EMBEDDING.md).
