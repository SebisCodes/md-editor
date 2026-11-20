"""Browser test of the Markdown editor (Playwright, Google Chrome).

    php -S 127.0.0.1:8192 -t src src/php/router.php          (in the project folder)
    python tests/gui_test.py

Checks rendering, code <-> preview, problems, typing help, insert, task
boxes, My documents, pictures, AI links, export and the phone layout.
EDITOR_URL=http://127.0.0.1:<port>/ runs it against another address."""

import base64
import os
import sys
import zipfile
import zlib

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8192/')
HERE = os.path.dirname(os.path.abspath(__file__))
failures = []


def check_that(cond, what):
    """Prints one result line and notes a failure.

    Args:
        cond (bool): True when the check holds.
        what (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if cond else 'FAIL  ') + what)
    if not cond:
        failures.append(what)


def set_code(page, md):
    """Sets the editor's code and waits for the preview.

    Args:
        page (Page): the editor page.
        md (str): the Markdown.

    Returns:
        None: the editor holds the code.
    """
    page.evaluate('t => mdEditor.setCode(t)', md)
    page.wait_for_timeout(250)


def get_state(page, expr):
    """Returns a value of the editor state.

    Args:
        page (Page): the editor page.
        expr (str): a JavaScript expression over S, the editor state.

    Returns:
        Any: the value of the expression.
    """
    return page.evaluate(f'() => {{ const S = mdEditor.state; return {expr}; }}')


def set_caret_after(page, text):
    """Puts the cursor of the code after the first place of a text and focuses the code.

    Args:
        page (Page): the editor page.
        text (str): the text in the code.

    Returns:
        None: the cursor is after the text.
    """
    page.evaluate('t => { const a = document.querySelector("#code"); const i = a.value.indexOf(t) + t.length; a.focus(); a.setSelectionRange(i, i); }', text)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(800)

    # --- First visit: the welcome example ---
    check_that(get_state(page, 'S.name') == 'Welcome', 'the first visit opens the welcome example')
    check_that(get_state(page, 'S.result.problems.length') == 0, 'the example has no problems')
    check_that(page.locator('#doc .katex').count() >= 2 and page.locator('#doc .katex-display').count() == 1, 'math is typeset with KaTeX (inline and displayed)')
    check_that(page.locator('#doc .footnotes li').count() == 1 and page.locator('#doc sup.footnote-ref').count() == 1, 'the footnote goes to the end')
    check_that(page.locator('#doc input.md-task').count() == 2 and page.locator('#doc input.md-task:checked').count() == 1, 'task list with check boxes')
    check_that(page.locator('#doc table td').count() == 6 and page.locator('#doc th[style*="center"]').count() == 1, 'GFM table with alignment')
    check_that(page.locator('#doc s').count() == 1, 'strikethrough')
    check_that(page.locator('#tree li').count() == 3 and page.locator('#doc h2#md-tables-and-math').count() == 1, 'outline of headings, GitHub anchors')
    check_that('words' in page.inner_text('#code-status'), 'status shows lines, size and words')
    check_that(page.locator('#hl .k.h').count() >= 3 and page.locator('#hl .e').count() >= 1, 'Markdown highlighting (headings, math)')

    # --- Problems ---
    set_code(page, '# Title\n\n![logo](logo.png)\n\n[jump](#nowhere) and [ok](#title)\n\n| a | b |\n|---|---|\n| 1 | 2 | 3 |\n\n```js\nnever closed\n')
    probs = get_state(page, 'S.result.problems.map(p => p.msg)')
    check_that(any('Picture "logo.png" not found' in p for p in probs), 'a missing picture is reported')
    check_that(any('#nowhere' in p for p in probs) and not any('#title' in p for p in probs), 'a broken #anchor is reported, a good one is not')
    check_that(any('3 cells, the header has 2' in p for p in probs), 'a table row with more cells than the header is reported')
    check_that(any('never closed' in p for p in probs), 'an unclosed code block is reported')
    lines = page.locator('#code-error .line-number').all_inner_texts()
    check_that(lines == ['Line 3', 'Line 5', 'Line 9', 'Line 11'], 'problems with their line numbers: ' + str(lines))
    page.locator('#code-error [data-prob]').nth(1).click()
    check_that(page.evaluate('document.activeElement.id') == 'code', 'clicking a problem goes to the code')
    check_that(page.evaluate('(() => { const t = document.querySelector("#code"); return t.value.slice(0, t.selectionStart).split("\\n").length; })()') == 5, 'the cursor is on the problem\'s line')

    # --- Code <-> preview ---
    set_code(page, '# One\n\nFirst paragraph with $x^2$ math.\n\n## Two\n\n- item a\n- item b\n')
    page.locator('#doc .md-math .katex-html').click()
    caret = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionStart + 5); }')
    check_that(caret == '$x^2$', 'a click on math puts the cursor on its code: ' + repr(caret))
    check_that(page.locator('#doc .source').count() == 1, 'the cursor place is framed in the preview')
    set_caret_after(page, '- item')
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(100)
    check_that(page.locator('#doc li.source').count() == 1, 'moving the cursor in the code frames its block in the preview')
    page.click('[data-itab=structure]')
    page.locator('#tree button').nth(1).click()
    check_that(page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionStart + 6); }') == '## Two', 'the outline jumps to the heading')
    page.click('[data-itab=insert]')

    # --- Task boxes in the preview ---
    set_code(page, '- [ ] first\n- [x] second\n')
    page.locator('#doc input.md-task').first.click()
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.code') == '- [x] first\n- [x] second\n', 'a click on a check box ticks the task in the code')
    page.locator('#doc input.md-task').nth(1).click()
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.code') == '- [x] first\n- [ ] second\n', 'and unticks it')
    page.evaluate('mdEditor.undo()')
    check_that(get_state(page, 'S.code') == '- [x] first\n- [x] second\n', 'each click is one undo step')

    # --- Typing help ---
    set_code(page, '# List\n\n')
    page.evaluate('() => { const t = document.querySelector("#code"); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }')
    page.keyboard.type('- one')
    page.keyboard.press('Enter')
    page.keyboard.type('two')
    page.keyboard.press('Enter')
    page.keyboard.press('Enter')
    page.keyboard.type('1. first')
    page.keyboard.press('Enter')
    page.keyboard.type('second')
    page.keyboard.press('Enter')
    page.keyboard.press('Enter')
    page.keyboard.type('- [ ] task')
    page.keyboard.press('Enter')
    page.keyboard.type('next')
    page.wait_for_timeout(400)
    code = get_state(page, 'S.code')
    check_that('- one\n- two\n\n' in code, 'Enter in a list starts the next item, Enter on an empty item ends it')
    check_that('1. first\n2. second\n' in code, 'numbered lists count on')
    check_that('- [ ] task\n- [ ] next' in code, 'task lists continue with an empty box')
    page.keyboard.press('Shift+Home')
    page.keyboard.press('Control+b')
    check_that('**- [ ] next**' in get_state(page, 'S.code'), 'Ctrl+B makes the selection bold')
    page.keyboard.press('Control+z')
    page.wait_for_timeout(200)
    set_caret_after(page, 'second')
    page.keyboard.press('Shift+ArrowLeft')
    page.keyboard.press('Shift+ArrowLeft')
    page.keyboard.press('Control+i')
    check_that('seco*nd*' in get_state(page, 'S.code'), 'Ctrl+I makes the selection italic')
    page.keyboard.press('Control+k')
    check_that('seco*[nd](https://)*' in get_state(page, 'S.code'), 'Ctrl+K makes a link of the selection')

    # --- Insert ---
    set_code(page, '# Insert\n\nText here.\n')
    set_caret_after(page, 'Text here.')
    page.click('[data-ins=table]')
    check_that('Text here.\n\n| Column | Column |\n|--------|--------|' in get_state(page, 'S.code'), 'Insert > Table on its own lines')
    set_caret_after(page, 'Text here.')
    page.click('[data-sym="\\\\alpha"]')
    check_that('Text here.$\\alpha$' in get_state(page, 'S.code'), 'a Greek letter outside math goes into $…$')
    set_caret_after(page, 'Text')
    page.click('[data-ins=footnote]')
    page.wait_for_timeout(200)
    code = get_state(page, 'S.code')
    check_that('Text[^1] here.' in code and code.rstrip().endswith('[^1]:'), 'Insert > Footnote: the mark at the cursor, the note at the end')

    # --- My documents, templates ---
    page.click('#btn-new')
    page.click('[data-new=readme]')
    check_that(get_state(page, 'S.name') == 'README' and page.locator('#doc h1').inner_text() == 'Project name', 'New > README')
    page.click('#btn-files')
    check_that(page.locator('#files-grid .file-card').count() >= 2, 'My documents lists the documents')
    check_that(page.locator('#files-grid .current .mini-page b').inner_text() == 'Project name', 'the card shows the first heading')
    page.locator('#files-grid .file-card:not(.current) .file-open').first.click()
    check_that(get_state(page, 'S.name') == 'Welcome', 'a document opens from My documents')

    # --- Pictures ---
    page.set_input_files('#file', os.path.join(HERE, 'title-picture.jpg'))
    page.wait_for_timeout(600)
    check_that('title-picture.jpg' in get_state(page, 'Object.keys(S.assets)'), 'a picture is stored with the document')
    check_that('![title picture](title-picture.jpg)' in get_state(page, 'S.code'), 'and inserted as ![…](name)')
    check_that(page.locator('#doc img[data-md-name="title-picture.jpg"]').count() == 1 and page.evaluate('document.querySelector("#doc img[data-md-name]").src.startsWith("data:image/jpeg")'), 'the picture shows in the preview from the document\'s files')
    page.click('[data-itab=pictures]')
    check_that(page.locator('#pics-wrap .picture-card').count() == 1 and 'used 1×' in page.inner_text('#pics-wrap'), 'Pictures tab: the picture with where it is used')
    page.evaluate("() => mdEditor.setCode(mdEditor.state.code + '\\n<img src=\"logo.png\" width=\"40\">\\n')")
    page.wait_for_timeout(400)
    check_that('logo.png' in page.inner_text('#pics-wrap .missing-pictures'), 'Pictures tab: a picture the code asks for (HTML too) but is missing')
    page.click('[data-pic-ren="title-picture.jpg"]')
    page.fill('.picture-rename', 'cover')
    page.keyboard.press('Enter')
    page.wait_for_timeout(500)
    check_that('cover.jpg' in get_state(page, 'Object.keys(S.assets)') and '(cover.jpg)' in get_state(page, 'S.code') and 'title-picture.jpg' not in get_state(page, 'S.code'), 'Rename changes the picture and the code')
    check_that(page.locator('#doc img[data-md-name="cover.jpg"]').count() == 1, 'the preview still shows it')
    with page.expect_file_chooser() as fc:
        page.click('[data-pic-fill="logo.png"]')
    fc.value.set_files(os.path.join(HERE, 'title-picture.jpg'))
    page.wait_for_timeout(600)
    check_that('logo.png' in get_state(page, 'Object.keys(S.assets)') and page.locator('#pics-wrap .missing-pictures').count() == 0, '"Add file…" fills a missing picture under its name')
    check_that(page.locator('#doc img[data-md-name="logo.png"][width="40"]').count() == 1, 'an HTML <img> uses it too')
    page.click('[data-pic-del="logo.png"]')
    page.click('#ask-ok')
    page.wait_for_timeout(300)
    check_that('logo.png' not in get_state(page, 'Object.keys(S.assets)') and page.locator('#doc .md-picture-missing').count() == 1, 'Remove takes the picture away; the preview shows its name in a frame')
    page.click('[data-itab=insert]')

    # --- ZIP with pictures ---
    with page.expect_download() as d:
        page.click('#btn-download')
    path = d.value.path()
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
    check_that(d.value.suggested_filename == 'Welcome.zip' and 'Welcome.md' in names and 'cover.jpg' in names, 'Download .md with pictures gives a ZIP: ' + str(names))
    page.set_input_files('#file', path)
    page.wait_for_timeout(800)
    check_that(get_state(page, 'S.name').startswith('Welcome') and 'cover.jpg' in get_state(page, 'Object.keys(S.assets)') and page.locator('#doc img[data-md-name="cover.jpg"]').count() == 1, 'a ZIP with a .md and pictures opens as one document')

    # --- AI links: a new document, a pasted terminal answer, #md= ---
    md = '# From the AI\n\nText.\n'
    z = base64.urlsafe_b64encode(zlib.compress(md.encode())).decode().rstrip('=')
    page.goto(URL + '#z=' + z + '&file=new&name=AI%20report', wait_until='networkidle')
    page.wait_for_timeout(800)
    check_that(get_state(page, 'S.name') == 'AI report' and 'From the AI' in page.inner_text('#doc'), 'an AI link makes a new document')
    link = 'https://md.giit.ch/#b64=' + base64.urlsafe_b64encode('## Pasted\n\nAt the end.'.encode()).decode() + '&mode=add'
    answer = 'Here is the link:\n' + link[:40] + '\n' + link[40:] + '\nClick it.'
    page.click('#btn-ai')
    page.fill('#ai-paste', answer)
    page.wait_for_timeout(400)
    check_that(not page.locator('#ask').is_visible(), 'a link changes the document without a question')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.code') == '# From the AI\n\nText.\n\n## Pasted\n\nAt the end.\n', 'a link broken over lines can be pasted; mode=add appends at the end')
    page.goto(URL + '#md=' + '%23%20Plain%0A%0AURL-encoded.' + '&file=new&name=Plain', wait_until='networkidle')
    page.wait_for_timeout(800)
    check_that(get_state(page, 'S.name') == 'Plain' and page.locator('#doc h1').inner_text() == 'Plain', '#md= carries URL-encoded Markdown')

    # --- Export ---
    set_code(page, '# Export\n\nSome *text* with $a+b$ and a [link](https://example.com).\n\n- [x] done\n')
    page.click('#btn-export')
    page.select_option('#ex-format', 'html')
    with page.expect_download() as d:
        page.click('#ex-download')
    with open(d.value.path(), encoding='utf-8') as f:
        html = f.read()
    check_that('<article class="md-doc">' in html and '<h1 id="md-export">Export</h1>' in html and 'katex' in html and 'font/woff2' in html, 'export: one HTML file with styles and math fonts inside')
    check_that('data-md-' not in html and 'class="t"' not in html, 'export: without the editor\'s marks')
    page.select_option('#ex-format', 'txt')
    check_that(page.input_value('#ex-text').startswith('Export\n') and '$a+b$' in page.input_value('#ex-text') and '[x] done' in page.input_value('#ex-text'), 'export: plain text (math as TeX)')
    page.select_option('#ex-format', 'md')
    with page.expect_download() as d:
        page.click('#ex-download')
    check_that(d.value.suggested_filename == 'Plain.md', 'export: .md')
    page.select_option('#ex-format', 'pdf')
    check_that(page.locator('#ex-download').inner_text() == 'Print / Save as PDF' and page.locator('.only-pdf').is_visible(), 'export: PDF through the print dialog')
    page.keyboard.press('Escape')

    # --- Phone ---
    page.set_viewport_size({'width': 390, 'height': 800})
    page.wait_for_timeout(300)
    check_that(page.locator('.views').is_visible(), 'phone: Code / Preview / Insert tabs')
    check_that(page.evaluate('document.documentElement.scrollWidth') <= 391, 'phone: no sideways scrolling')
    page.click('[data-pane=code]')
    check_that(page.locator('#code').is_visible(), 'phone: the code view')

    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
