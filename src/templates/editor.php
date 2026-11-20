<?php
/**
 * The editor page: markup and keys of the shared language packs (src/php/page.php).
 */
?>
<!DOCTYPE html>
<html <?= build_html_attributes() ?>>
<head>
<meta charset="utf-8">
<!-- The same policy as the server header (.htaccess), in case the header is ever missing; frame-ancestors only works as a header. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= get_text('title') ?></title>
<meta name="description" content="<?= get_text('description') ?>">
<meta name="author" content="Sebastian Grünwald, Grünwald Innovation">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#2b59c3">
<link rel="canonical" href="<?= escape_html(get_page_url()) ?>">
<?= build_hreflang_links() ?>
<meta property="og:type" content="website">
<meta property="og:locale" content="<?= get_page_locale() ?>">
<meta property="og:site_name" content="Markdown Editor">
<meta property="og:title" content="<?= get_text('og_title') ?>">
<meta property="og:description" content="<?= get_text('og_description') ?>">
<meta property="og:url" content="<?= escape_html(get_page_url()) ?>">
<meta property="og:image" content="https://md.giit.ch/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/img/logo.svg">
<link rel="stylesheet" href="/css/style.css?v=29">
<link rel="stylesheet" href="/css/doc.css?v=6">
<link rel="stylesheet" href="/vendor/katex/katex.min.css?v=0.16.22">
<script src="/js/lang-menu.js?v=1" defer></script>
<script src="/js/theme.js?v=8" data-editor-page></script>
<script src="/vendor/katex/katex.min.js?v=0.16.22" defer></script>
<script src="/vendor/markdown-it/markdown-it.min.js?v=14.1.0" defer></script>
<script src="/vendor/markdown-it/markdown-it-footnote.min.js?v=4.0.0" defer></script>
<script type="application/ld+json"><?= get_json_ld('jsonld') ?></script>
</head>
<body>

<header class="header">
    <div class="header-brand">
        <a class="back-to-editors" href="<?= escape_html(get_site_url('https://editors.giit.ch/')) ?>" title="All giit editors" aria-label="All giit editors"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></a>
        <a class="brand" href="<?= escape_html(get_language_path(get_template_language(), '')) ?>" aria-label="Markdown Editor - home">
            <img src="/img/logo.svg" alt="" width="28" height="28">
            <h1>Markdown Editor <span>online</span></h1>
        </a>
        <a class="by-giit" href="https://giit.ch/"><img src="/img/giit.svg" alt="" width="16" height="18">by giit.ch</a>
    </div>
    <div class="toolbar file" role="toolbar" aria-label="File">
        <button type="button" class="button with-symbol file-button" id="btn-files" title="My documents (Ctrl+O)" aria-label="My documents"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span id="file-name" class="file-title" data-no-i18n></span><svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <span class="menu-anchor">
            <button type="button" class="button with-symbol" id="btn-new" title="New document, or start this one over" aria-haspopup="menu" aria-expanded="false" aria-controls="new-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="txt">New</span></button>
            <span id="new-menu" class="menu" role="menu" aria-label="New" hidden>
                <button type="button" role="menuitem" data-new="blank"><b>New blank document</b><span>An empty page - your other documents stay as they are</span></button>
                <button type="button" role="menuitem" data-new="readme"><b>README</b><span>Project name, features, installation and usage</span></button>
                <button type="button" role="menuitem" data-new="article"><b>Article</b><span>Title, summary, sections and a quote</span></button>
                <button type="button" role="menuitem" data-new="notes"><b>Meeting notes</b><span>Agenda, decisions and a table of tasks</span></button>
                <button type="button" role="menuitem" data-new="checklist"><b>Checklist</b><span>Tasks to tick off, in groups</span></button>
                <button type="button" role="menuitem" data-new="example"><b>The welcome example</b><span>Shows what the editor can do</span></button>
                <button type="button" role="menuitem" data-new="restart" id="new-restart"><b>Start this document over</b><span>Empties the text, keeps the pictures - "Undo" brings it back</span></button>
            </span>
        </span>
        <button type="button" class="button" id="btn-open" title="Open a .md file (or a picture) from your computer (you can also drag it into the window)">Open file…</button>
        <input type="file" id="file" accept=".md,.markdown,.mdown,.mkd,.txt,.zip,text/markdown,text/plain,application/zip,image/*,application/pdf" multiple hidden>
        <span class="divider" aria-hidden="true"></span>
        <button type="button" class="button with-symbol" id="btn-undo" title="Undo the last change (Ctrl+Z)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg><span class="txt">Undo</span></button>
        <button type="button" class="button with-symbol" id="btn-redo" title="Redo the change you just undid (Ctrl+Y)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg><span class="txt">Redo</span></button>
    </div>
    <div class="toolbar output" role="toolbar" aria-label="Output">
        <span class="languages" data-languages><?= build_language_menu(get_text('language')) ?></span>
        <div class="schema" role="radiogroup" aria-label="Color theme">
            <button type="button" role="radio" data-theme-set="light" aria-checked="false" title="Light theme" aria-label="Light theme"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
            <button type="button" role="radio" data-theme-set="dark" aria-checked="false" title="Dark theme" aria-label="Dark theme"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg></button>
            <button type="button" role="radio" data-theme-set="auto" aria-checked="true" title="Same as your system setting" aria-label="Automatic theme (system setting)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button>
        </div>
        <button type="button" class="button with-symbol ai-button" id="btn-ai" title="Let any AI write in this editor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.9L19 9.5l-5.2 1.7L12 16l-1.8-4.8L5 9.5l5.2-1.6z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg><span class="txt">AI Assistant</span></button>
        <button type="button" class="button symbol" id="btn-sync" title="Save to your own server and embed the editor in your website" aria-label="Save to server"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8m-3-3 3 3 3-3"/></svg></button>
        <button type="button" class="button" id="btn-help" title="How it works and keyboard shortcuts (?)">Help</button>
        <button type="button" class="button" id="btn-download" title="Save the document as a .md file (Ctrl+S)">Download .md</button>
        <button type="button" class="button primary save" id="btn-save" hidden>Save</button>
        <button type="button" class="button primary" id="btn-export" title="HTML, PDF, plain text and more (Ctrl+E)">Export…</button>
    </div>
</header>

<nav class="views" role="tablist" aria-label="View">
    <button type="button" role="tab" data-pane="code" aria-selected="false">Code</button>
    <button type="button" role="tab" data-pane="draw" aria-selected="true">Preview</button>
    <button type="button" role="tab" data-pane="properties" aria-selected="false">Edit</button>
</nav>

<main id="work" class="workspace" data-show="draw">
    <section class="pane code-pane" aria-label="Markdown code">
        <div class="pane-header">
            <b>Code</b>
            <span id="code-status" class="muted"></span>
            <span class="right">
                <button type="button" class="button small" id="btn-wrap" aria-pressed="false" title="Wrap long lines in the view - each line of the code stays one line (Alt+Z)">Wrap</button>
                <button type="button" class="button small with-symbol" id="btn-copy" title="Copy the Markdown to the clipboard" aria-label="Copy code"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg><span class="txt">Copy</span></button>
            </span>
        </div>
        <div id="code-error" class="error problems" hidden role="status"></div>
        <div class="editor">
            <div class="gutter" aria-hidden="true"><div id="gutter"></div></div>
            <div class="code-field" id="code-layers">
                <pre class="layer marks" id="marks" aria-hidden="true"></pre>
                <pre class="layer hl" id="hl" aria-hidden="true"></pre>
                <textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="Markdown code"></textarea>
            </div>
        </div>
    </section>

    <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="Drag to change the width of the code area" title="Drag to change the width" tabindex="0"></div>

    <section class="pane draw-pane" aria-label="Preview">
        <div class="pane-header tools" role="toolbar" aria-label="Formatting">
            <div class="group">
                <button type="button" class="tool" data-wrap="**" title="Bold (Ctrl+B)" aria-label="Bold"><b class="tool-b">B</b></button>
                <button type="button" class="tool" data-wrap="*" title="Italic (Ctrl+I)" aria-label="Italic"><i class="tool-i">I</i></button>
                <button type="button" class="tool" data-wrap="~~" title="Strikethrough" aria-label="Strikethrough"><span class="tool-s">S</span></button>
                <button type="button" class="tool" data-wrap="`" title="Code in the text" aria-label="Code in the text"><span class="tool-tt">&lt;/&gt;</span></button>
                <button type="button" class="tool" data-snippet="link" title="Link (Ctrl+K)" aria-label="Link"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></button>
                <span class="divider" aria-hidden="true"></span>
                <button type="button" class="tool with-text" data-snippet="h2" title="Heading" aria-label="Heading"><span>H</span></button>
                <button type="button" class="tool" data-snippet="ul" title="Bulleted list" aria-label="Bulleted list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg></button>
                <button type="button" class="tool" data-snippet="ol" title="Numbered list" aria-label="Numbered list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 14.5a1.5 1.5 0 0 1 3 .3c0 1-3 2.2-3 3.7h3"/></svg></button>
                <button type="button" class="tool" data-snippet="task" title="Task list" aria-label="Task list"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="6" height="6" rx="1"/><path d="m4.5 7 1 1 2-2M12 7h9M12 17h9"/><rect x="3" y="14" width="6" height="6" rx="1"/></svg></button>
                <button type="button" class="tool" data-snippet="table" title="Table" aria-label="Table"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 10h18M3 14.5h18M9 5v14M15 5v14"/></svg></button>
                <button type="button" class="tool" data-snippet="picture" title="Picture" aria-label="Picture"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg></button>
                <button type="button" class="tool" data-snippet="quote" title="Quote" aria-label="Quote"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6v12M9 8h10M9 12h10M9 16h6"/></svg></button>
                <button type="button" class="tool" data-snippet="code" title="Code block" aria-label="Code block"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/></svg></button>
                <button type="button" class="tool with-text" data-snippet="inline-math" title="Math in the text (Ctrl+M)" aria-label="Math"><span class="tool-math">∑</span></button>
            </div>
        </div>
        <div id="stage" class="stage preview" tabindex="0" aria-label="Preview of the document: click text to edit it, Ctrl+click follows a link">
            <div id="scroller" class="scroller"><div class="sheet-frame"><article id="doc" class="md-doc" data-no-i18n></article></div></div>
            <div id="hint" class="hint-line" aria-live="polite"></div>
            <div class="group zoom size-group" role="toolbar" aria-label="Text size">
                <button type="button" class="tool" id="size-down" title="Smaller text in the preview" aria-label="Smaller text"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg></button>
                <button type="button" class="button small size-value" id="size-100" title="Normal text size"><span id="size-label">100%</span></button>
                <button type="button" class="tool" id="size-up" title="Larger text in the preview" aria-label="Larger text"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg></button>
            </div>
            <div class="stale-hint" aria-hidden="true">Updating…</div>
        </div>
    </section>

    <aside class="pane inspector" aria-label="Insert, pictures and outline">
        <div class="pane-header tabs" role="tablist">
            <button type="button" role="tab" data-itab="insert" aria-selected="true" title="Ready-made pieces: structure, text, math, symbols">Insert</button>
            <button type="button" role="tab" data-itab="pictures" aria-selected="false" title="The pictures of this document">Pictures</button>
            <button type="button" role="tab" data-itab="structure" aria-selected="false" title="The headings of the document">Outline</button>
        </div>
        <div id="insert-wrap" class="inspector-body"></div>
        <div id="pics-wrap" class="inspector-body" hidden></div>
        <div id="tree-wrap" class="inspector-body" hidden><p class="hint">The headings of the document. Click one to go there in the code and in the preview.</p><ul id="tree" class="tree outline"></ul></div>
    </aside>
</main>

<div id="ai-receive" class="receive" role="status" hidden>
    <div class="receive-box"><img src="/img/logo.svg" alt="" width="40" height="40"><h2></h2><p></p>
        <div class="receive-buttons"><button type="button" class="button primary" data-here>Open it here</button></div>
    </div>
</div>

<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div class="storage-hint" aria-hidden="true"><span>Drop the .md file or picture here</span></div>

<dialog id="export" class="dialog" aria-labelledby="ex-title">
    <form method="dialog" class="dialog-header"><h2 id="ex-title">Export</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="ex-row">
            <label class="field"><span>File name</span><input id="ex-name" spellcheck="false"></label>
            <label class="field"><span>Format</span>
                <select id="ex-format">
                    <optgroup label="Document">
                        <option value="html">HTML page (one file)</option>
                        <option value="pdf">PDF (print or save as PDF)</option>
                        <option value="txt">Plain text</option>
                    </optgroup>
                    <optgroup label="Markdown">
                        <option value="md">Markdown (.md)</option>
                        <option value="mdzip">Markdown with pictures (ZIP)</option>
                    </optgroup>
                </select>
            </label>
        </div>
        <div class="only-pdf"><p class="hint">The print dialog opens with the document only. Choose <b>Save as PDF</b> (or "Microsoft Print to PDF") as the printer. In Chrome and Edge, untick "Headers and footers" if the browser offers it. The text in the PDF stays sharp and can be selected.</p></div>
        <label hidden class="box ex-break"><input type="checkbox" id="ex-breaks" checked> <span>Apply page breaks</span></label>
        <textarea id="ex-text" class="only-text ex-text" readonly spellcheck="false" aria-label="Result"></textarea>
        <div class="dialog-footer">
            <span id="ex-info" class="muted"></span>
            <button type="button" class="button" id="ex-zip" title="Download everything at once: .md, pictures, HTML and text">All formats (ZIP)</button>
            <button type="button" class="button" id="ex-copy">Copy</button>
            <button type="button" class="button primary" id="ex-download">Download</button>
        </div>
    </div>
</dialog>

<dialog id="files" class="dialog files" aria-labelledby="files-title">
    <form method="dialog" class="dialog-header"><h2 id="files-title">My documents</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="files-toolbar">
            <input id="files-search" type="search" placeholder="Search by name" aria-label="Search your documents" spellcheck="false">
            <button type="button" class="button" id="files-import" title="Open a .md file from your computer as a new document">Open file…</button>
            <button type="button" class="button primary" id="files-new">New document</button>
        </div>
        <ul id="files-grid" class="file-grid"></ul>
        <p class="muted">Click a document to open it. They are stored only in this browser - nothing is uploaded. Clearing the browser's site data removes them, so download the ones you want to keep.</p>
        <div class="dialog-footer"><span id="files-info" class="muted"></span><button type="button" class="button" id="files-zip" title="Download every document as a .md file (with its pictures) in one ZIP">Download all (ZIP)</button></div>
    </div>
</dialog>

<dialog id="ask" class="dialog question" aria-labelledby="ask-title">
    <div class="dialog-header"><h2 id="ask-title"></h2></div>
    <div class="dialog-content"><p id="ask-text"></p>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button" id="ask-cancel">Cancel</button><button type="button" class="button primary" id="ask-ok">OK</button></div>
    </div>
</dialog>

<dialog id="ai" class="dialog ai-dialog" aria-labelledby="ai-title">
    <form method="dialog" class="dialog-header"><h2 id="ai-title">AI Assistant</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>Any AI can write with you - ChatGPT, Claude, Gemini, Copilot.</p>
        <ul id="ai-status" class="ai-status" aria-label="Connected AI"></ul>
        <ol class="steps">
            <li>Click <b>Copy prompt</b>.</li>
            <li>Paste it into your AI and say what it should write.</li>
            <li id="ai-step-link">The AI answers with a link: click it, or paste the whole answer below. <b>Undo</b> takes it back.</li>
        </ol>
        <div id="ai-remote" class="ai-remote" hidden>
            <p><b>Connected to <span id="ai-remote-host" data-no-i18n></span>:</b> the AI sends its result there, and it opens here. <span id="ai-key-exp" class="muted"></span></p>
            <details id="ai-remote-details" hidden><summary>What <span data-no-i18n></span> tells the AI</summary><pre id="ai-remote-prompt" class="ai-remote-prompt" data-no-i18n></pre></details>
        </div>
        <fieldset class="ai-target">
            <legend>The AI should</legend>
            <label><input type="radio" name="ai-target" value="change" checked><span><b>Change “<span id="ai-cur" data-no-i18n></span>”</b></span></label>
            <label><input type="radio" name="ai-target" value="new"><span><b>Make a new document</b></span></label>
        </fieldset>
        <label class="field ai-insert"><span id="ai-paste-label">The AI's answer (or press Ctrl+V anywhere):</span><textarea id="ai-paste" rows="2" spellcheck="false" placeholder="https://md.giit.ch/#…"></textarea></label>
        <p class="muted" id="ai-privacy">The document travels in the link after the “#”, which no server sees. What you paste into your AI is handled by its provider.</p>
        <textarea id="ai-prompt-text" class="ai-prompt-text" rows="6" readonly hidden aria-label="The prompt - copy it with Ctrl+C"></textarea>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button primary" id="ai-copy">Copy prompt</button></div>
    </div>
</dialog>

<dialog id="sync" class="dialog" aria-labelledby="sync-title">
    <form method="dialog" class="dialog-header"><h2 id="sync-title">Save to your server</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>The editor can send each saved version to your own server (a <b>webhook</b>), so your work is kept where you want it. Nothing is sent until you enter an address here.</p>
        <div class="sync-fields">
            <label class="field"><span>Webhook address</span><input id="sync-url" type="url" placeholder="https://example.com/api/markdown" spellcheck="false" autocomplete="off"></label>
            <label class="field"><span>Token <small>(optional, sent as "Authorization: Bearer …"; kept until this tab is closed)</small></span><input id="sync-token" type="password" spellcheck="false" autocomplete="off"></label>
        </div>
        <label class="box sync-choice"><input type="checkbox" id="sync-auto"> Send automatically a few seconds after each change (otherwise only when you click <b>Save</b> or press Ctrl+S)</label>
        <label class="box sync-choice"><input type="checkbox" id="sync-doc"> Only for “<span id="sync-docname" data-no-i18n></span>” (other documents use the general address)</label>
        <details class="sync-help">
            <summary>What your server receives</summary>
            <p class="muted">A POST request with JSON (your server must allow CORS from https://md.giit.ch):</p>
            <pre class="code-example">{ "editor": "md", "event": "save", "id": "…", "name": "Notes",
  "content": "# Notes\n\n…",
  "assets": { "logo.png": "data:image/png;base64,…" },
  "updated": "YYYY-MM-DDTHH:MM:SS.000Z" }</pre>
        </details>
        <details class="sync-help">
            <summary>Embed the editor in your website</summary>
            <pre class="code-example">&lt;iframe src="https://md.giit.ch/?embed=1" style="width:100%;height:80vh;border:0"&gt;&lt;/iframe&gt;
&lt;script&gt;
const frame = document.querySelector('iframe');
addEventListener('message', e =&gt; {
  if (e.origin !== 'https://md.giit.ch' || e.source !== frame.contentWindow) return;
  if (e.data.type === 'mdeditor:ready')
    frame.contentWindow.postMessage({ type: 'mdeditor:load', name: 'Notes',
      content: '# Notes\n\n…', assets: {} }, 'https://md.giit.ch');
  if (e.data.type === 'mdeditor:save') saveOnYourServer(e.data.content, e.data.assets);
});
&lt;/script&gt;</pre>
            <p class="muted">Also possible: <code>?src=&lt;URL of a .md file&gt;</code> opens a file, <code>&amp;webhook=&lt;URL&gt;</code> saves this document there. The editor can also open in a window of its own (<code>?embed=window</code>), and your page can hand it its own AI prompt and a session key so the AI sends its result to your server (<code>mdeditor:ai</code>, <code>mdeditor:key-request</code>) - see "Use the editor on your own website" below the editor. Details are in <a href="/llms.txt">llms.txt</a>.</p>
        </details>
        <div class="dialog-footer"><span id="sync-status" class="muted"></span><button type="button" class="button" id="sync-test">Send now</button><button type="button" class="button primary" id="sync-ok">Save setting</button></div>
    </div>
</dialog>

<dialog id="help" class="dialog" aria-labelledby="help-title">
    <form method="dialog" class="dialog-header"><h2 id="help-title">Help</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content shortcuts">
        <h3>How it works</h3>
        <ol class="steps">
            <li><b>Write</b> Markdown on the left - or start with <b>New</b> and one of the templates. The preview in the middle shows the document as you type.</li>
            <li><b>Click text in the preview</b> to edit it right there: the cursor is where you clicked, and the code's cursor goes to the same place. <b>Enter</b> starts a new paragraph; <b>Shift+Enter</b> inserts a line break. <b>Ctrl+Enter</b> (<b>Cmd+Enter</b> on macOS) or a click elsewhere applies the edit; <b>Escape</b> cancels. Each edit is one step for Undo. Characters such as <code>*</code> or <code>_</code> are escaped so they stay text. A click on math, a picture or code jumps to its place in the code instead. <b>Ctrl</b> + click follows a link. A check box of a task list ticks the task in the code.</li>
            <li><b>Insert</b> on the right has ready-made pieces (headings, lists, tables, math, symbols); <b>Pictures</b> holds the pictures of the document; <b>Outline</b> lists the headings.</li>
            <li>Problems (a missing picture, a link to a heading that is not there, a code block that is never closed, a table row with too many cells) are listed above the code - click one to go there.</li>
            <li><b>My documents</b> (the folder button at the top left) lists every document kept in this browser.</li>
            <li><b>Export</b> makes an HTML page, a PDF (via the print dialog) or plain text. <b>Download .md</b> saves the code (with its pictures as ZIP).</li>
            <li><b>Export</b> also has <b>Open in another editor</b>: it converts the document and opens it as a new document there. Anything the other format cannot hold is listed first.</li>
            <li><b>Insert</b> &gt; <b>New page</b> sets a page break for printing and PDF; the preview shows it as a dashed line. Headings stay with their text and tables and pictures are not cut. In Export, <b>Apply page breaks</b> turns them off for a PDF.</li>
        </ol>
        <p class="muted">The preview understands CommonMark with GitHub's tables, task lists, strikethrough, autolinks and footnotes, and math in <code>$…$</code> and <code>$$…$$</code>. HTML in the Markdown is shown without scripts, styles, frames and forms.</p>
        <h3>Keyboard shortcuts</h3>
        <dl>
            <dt><kbd>Ctrl</kbd> + <kbd>B</kbd> / <kbd>I</kbd></dt><dd>Bold / italic around the selected text</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>Link</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>M</kbd></dt><dd>Math: <code>$…$</code> around the selection</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>/</kbd></dt><dd>Lines in or out of a comment (<code>&lt;!-- --&gt;</code>)</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>Show the cursor's place in the preview</dd>
            <dt><kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd></dt><dd>Indent / outdent</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>Undo / redo</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>S</kbd> / <kbd>E</kbd></dt><dd>Save (download .md, or to your server) / export</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>O</kbd></dt><dd>My documents</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>P</kbd></dt><dd>Print / save as PDF</dd>
        </dl>
        <p class="muted"><kbd>Enter</kbd> in a list starts the next item (<code>-</code>, <code>1.</code>, <code>- [ ]</code>, <code>&gt;</code>); on an empty item it ends the list. <code>* _ ` ~ $ [ (</code> close by themselves around a selection.</p>
    </div>
</dialog>

<div class="page-text">
<?= get_html('page_text') ?>
</div>

<?php include __DIR__ . '/footer.php'; ?>

<script type="module" src="/js/app.js?v=49"></script>
</body>
</html>
