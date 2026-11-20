"""Editing text in the preview: paragraphs, headings, list
items, quotes and table cells that stand in the code as shown can be
changed on the page; Enter or a click elsewhere writes the change into the
code with Markdown's special characters escaped, Escape cancels, and each
change is one undo step. Pictures are moved by dragging them between
blocks: their Markdown goes there as a paragraph of its own, in one undo
step; a click stays a click and Escape cancels. On a touch screen a
swipe that starts on a picture scrolls, a long press starts the move.
Dropped on another picture, a picture goes beside it; two pictures each
alone in a table cell change places.

    php -S 127.0.0.1:8192 -t src src/php/router.php          (in the project folder)
    python tests/inplace_test.py"""

import base64
import os
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8192/')
HERE = os.path.dirname(os.path.abspath(__file__))
failures = []

DOC = """# Intro

The quick brown fox jumps over **the lazy** dog.

- first item
- second item

> A quoted line.

| Name | City |
|------|------|
| Anna | Bern |

Price: 5 \\* 3 and Tom &amp; Jerry.
"""


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


def get_code(page):
    """Returns the editor's code.

    Args:
        page (Page): the editor page.

    Returns:
        str: the code.
    """
    return page.evaluate('mdEditor.state.code')


def get_run(page, text):
    """Returns the first editable run of the preview that contains a text.

    Args:
        page (Page): the editor page.
        text (str): the text.

    Returns:
        Locator: the run.
    """
    return page.locator('#doc .t[data-md-s]', has_text=text).first


PICS = """# Pictures

First paragraph.

![Cover](title-picture.jpg)

Second paragraph with text.

- one
- two

Last paragraph with ![Cover](title-picture.jpg) inside.
"""

GALLERY = """# Gallery

![Cover](title-picture.jpg)
![One](picture-1.jpg)
![Three](picture-3.jpg)
![Two](picture-2.jpg)

| A | B | C |
|---|---|---|
| ![One](picture-1.jpg) | ![Two](picture-2.jpg) | ![Three](picture-3.jpg) |

End.
"""


def move_picture(page, loc, to, frac=0.75, escape=False, fx=0.5):
    """Drags a picture with the mouse to a point of another element.

    Args:
        page (Page): the editor page.
        loc (Locator): the picture.
        to (Locator): the element to drop it on.
        frac (float): the height of the point in the element, 0 at its top, 1 at its bottom.
        escape (bool): True to press Escape before the mouse is released.
        fx (float): the width of the point in the element, 0 at its left, 1 at its right.

    Returns:
        bool: True when the drop line was shown during the move.
    """
    a = loc.bounding_box()
    page.mouse.move(a['x'] + a['width'] / 2, a['y'] + min(a['height'] / 2, 40))
    page.mouse.down()
    b = to.bounding_box()
    page.mouse.move(b['x'] + b['width'] * fx, b['y'] + b['height'] * frac, steps=12)
    shown = page.evaluate('!document.querySelector(".picture-target").hidden')
    if escape:
        page.keyboard.press('Escape')
    page.mouse.up()
    page.wait_for_timeout(250)
    return shown


def run_click(page, loc, frac=0.5):
    """Clicks into an element at a point of its width, halfway down.

    Args:
        page (Page): the editor page.
        loc (Locator): the element.
        frac (float): the width of the point in the element, 0 at its left, 1 at its right.

    Returns:
        None: the click is done.
    """
    box = loc.bounding_box()
    page.mouse.click(box['x'] + box['width'] * frac, box['y'] + box['height'] / 2)
    page.wait_for_timeout(150)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(600)
    page.evaluate('t => mdEditor.setCode(t)', DOC)
    page.wait_for_timeout(300)

    # Which text is offered for editing
    shown = page.locator('#doc .t[data-md-s]').all_inner_texts()
    check_that('The quick brown fox jumps over ' in shown and 'the lazy' in shown and 'Intro' in shown, 'paragraph, bold text and heading are editable runs')
    check_that('first item' in shown and 'A quoted line.' in shown and 'Bern' in shown, 'list items, quotes and table cells too')
    check_that(any(t.startswith('Price: 5 * 3') for t in shown), 'text with a backslash escape is editable (the escape counts as its character)')
    check_that(not any('&' in t for t in shown), 'text with an entity (&amp;) is not offered - it is not in the code as shown')
    ok = page.evaluate('''() => [...document.querySelectorAll('#doc .t[data-md-s]')].every(s => { const c = mdEditor.state.code; let j = +s.dataset.mdS;
        for (const ch of s.textContent) { if (c[j] === '\\\\' && c[j + 1] === ch) j += 2; else if (c[j] === ch) j++; else return false; } return true; })''')
    check_that(ok, 'every run stands at its offset in the code')

    # Paragraph: the click puts the cursor there, typing goes in, Enter writes it
    para = get_run(page, 'quick brown')
    run_click(page, para, 0.3)
    check_that(page.evaluate('document.activeElement.classList.contains("edit")'), 'a click makes the text editable')
    left = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart - 12, t.selectionStart).split("\\n").pop(); }')
    check_that(len(left) > 0 and 'The quick brown fox'.find(left[-4:]) >= 0, 'the code cursor goes to the clicked character: ' + repr(left))
    page.keyboard.type('X')
    page.keyboard.press('End')
    page.keyboard.type('2*3 [a] a_b `c` <b> $5 ')
    before_undo = get_code(page)
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(300)
    c = get_code(page)
    check_that(left + 'X' in c, 'typing goes where the click was')
    check_that('jumps over 2\\*3 \\[a\\] a\\_b \\`c\\` \\<b> \\$5 **the lazy**' in c, 'Ctrl+Enter writes the text into the code, Markdown characters escaped: ' + repr(c.split('\n')[2]))
    check_that('2*3 [a] a_b `c` <b> $5 the lazy' in page.inner_text('#doc p'), 'the preview shows exactly what was typed')
    check_that(page.locator('#doc p strong').inner_text() == 'the lazy', 'the bold text stays bold')
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    check_that(get_code(page) == DOC, 'one undo step takes the whole edit back')
    page.evaluate('mdEditor.redo()')
    page.wait_for_timeout(200)

    # The escaped text can be edited again
    run_click(page, get_run(page, '2*3'), 0.9)
    page.keyboard.press('End')
    page.keyboard.type('!')
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(300)
    check_that('\\$5 !**the lazy**' in get_code(page) or '\\$5 !' in get_code(page), 'text with escapes stays editable, the escapes are kept')

    # Bold text inside the paragraph
    run_click(page, get_run(page, 'the lazy'))
    page.keyboard.press('Control+a')
    page.keyboard.type('the sleepy')
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(300)
    check_that('**the sleepy** dog.' in get_code(page), 'text inside **bold** is changed between its marks')

    # Heading, Escape cancels, a click elsewhere keeps
    run_click(page, get_run(page, 'Intro'))
    page.keyboard.press('Control+a')
    page.keyboard.type('Changed')
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    check_that(get_code(page).startswith('# Intro\n') and page.locator('#doc h1').inner_text() == 'Intro', 'Escape cancels the edit')
    run_click(page, get_run(page, 'Intro'))
    page.keyboard.press('Control+a')
    page.keyboard.type('Start')
    page.mouse.click(5, 5)
    page.wait_for_timeout(300)
    check_that(get_code(page).startswith('# Start\n') and page.locator('#doc h1#md-start').count() == 1, 'a click elsewhere keeps the edit (headings too, with a new anchor)')

    # List item, quote, table cell
    run_click(page, get_run(page, 'second item'))
    page.keyboard.press('End')
    page.keyboard.type(' + more')
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(300)
    check_that('- second item + more\n' in get_code(page), 'a list item is edited in place')
    run_click(page, get_run(page, 'A quoted line.'))
    page.keyboard.press('Control+a')
    page.keyboard.type('# not a heading')
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(300)
    check_that('> \\# not a heading\n' in get_code(page) and page.locator('#doc blockquote h1').count() == 0, 'a # at the start of a line is escaped, so it stays text')
    run_click(page, get_run(page, 'Bern'))
    page.keyboard.press('End')
    page.keyboard.type(' | Zug')
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(300)
    check_that('| Anna | Bern \\| Zug |' in get_code(page) and page.locator('#doc td').nth(1).inner_text() == 'Bern | Zug', 'a | in a table cell is escaped, the table keeps its columns')

    # Each edit was one step
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    check_that('| Anna | Bern |' in get_code(page) and '> \\# not a heading' in get_code(page), 'Undo takes back only the last edit on the page')

    # An address that becomes a link by itself keeps the text around it editable
    page.evaluate('t => mdEditor.setCode(t)', 'Settings come from the claude.ai console. Each source has a scope.\n')
    page.wait_for_timeout(300)
    shown = page.locator('#doc .t[data-md-s]').all_inner_texts()
    check_that('Settings come from the ' in shown and ' console. Each source has a scope.' in shown, 'text around claude.ai (a link made by itself) is editable')
    run_click(page, get_run(page, 'Each source'), 0.6)
    page.keyboard.type('ZZ')
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(300)
    c = get_code(page)
    check_that('ZZ' in c and c.index('ZZ') > c.index('claude.ai ') + 10 and 'claude.ai ' in c, 'typing there writes at the clicked place, not at the start')

    # Code blocks and math are not edited on the page: a click goes to the code
    page.evaluate('t => mdEditor.setCode(t)', 'Some $x^2$ math.\n\n```\ncode\n```\n')
    page.wait_for_timeout(300)
    page.locator('#doc pre').click()
    page.wait_for_timeout(100)
    check_that(not page.evaluate('!!document.querySelector("#doc [contenteditable]")') and page.evaluate('document.activeElement.id') == 'code', 'a code block is not edited on the page - the click goes to the code')
    # Moving pictures
    with open(os.path.join(HERE, 'title-picture.jpg'), 'rb') as f:
        jpg = 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode()
    page.evaluate('u => { mdEditor.state.assets = { "title-picture.jpg": u }; }', jpg)
    page.evaluate('t => mdEditor.setCode(t)', PICS)
    page.wait_for_timeout(400)
    pic = page.locator('#doc > p > img').first
    check_that(pic.evaluate('e => getComputedStyle(e).cursor') == 'grab', 'a picture shows the grab cursor')
    box = pic.bounding_box()
    page.mouse.click(box['x'] + 20, box['y'] + 20)
    page.wait_for_timeout(150)
    check_that(get_code(page) == PICS and page.evaluate('document.activeElement.id') == 'code'
          and page.evaluate('document.querySelector("#code").selectionStart') == PICS.index('![Cover]'), 'a click on a picture still goes to its code')
    second = page.locator('#doc p', has_text='Second paragraph')
    shown = move_picture(page, pic, second)
    moved = PICS.replace('![Cover](title-picture.jpg)\n\nSecond paragraph with text.\n', 'Second paragraph with text.\n\n![Cover](title-picture.jpg)\n', 1)
    check_that(shown, 'while dragging, a line shows where the picture lands')
    check_that(get_code(page) == moved, 'a picture dragged below the next paragraph moves there in the code: ' + repr(get_code(page)[:90]))
    sel = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionEnd); }')
    check_that(sel == '![Cover](title-picture.jpg)', 'the code shows the moved picture selected')
    check_that(page.evaluate('document.querySelector(".picture-target").hidden') and page.locator('#doc .dragging').count() == 0, 'the line is gone after the drop')
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    check_that(get_code(page) == PICS, 'one undo step puts the picture back')
    move_picture(page, page.locator('#doc > p > img').first, second, escape=True)
    check_that(get_code(page) == PICS and page.evaluate('document.querySelector(".picture-target").hidden'), 'Escape cancels the move')
    move_picture(page, page.locator('#doc > p > img').first, page.locator('#doc li', has_text='one'))
    check_that('- one\n\n  ![Cover](title-picture.jpg)\n- two\n' in get_code(page) and '\nFirst paragraph.\n\nSecond' in get_code(page),
          'dropped after a list item, it becomes a paragraph of that item: ' + repr(get_code(page)[:110]))
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    move_picture(page, page.locator('#doc p', has_text='Last paragraph').locator('img'), page.locator('#doc h1'), frac=0.2)
    check_that(get_code(page).startswith('![Cover](title-picture.jpg)\n\n# Pictures\n') and 'Last paragraph with inside.\n' in get_code(page),
          'a picture inside a paragraph moves out on its own, before the heading: ' + repr(get_code(page)[:60]))
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    move_picture(page, page.locator('#doc > p > img').first, page.locator('#doc p', has_text='First paragraph'), frac=0.9)
    check_that(get_code(page) == PICS, 'dropped where it already is, nothing changes')
    for _ in range(5):
        page.click('#size-up')
    page.evaluate('() => { scrollTo(0, 0); document.querySelector("#scroller").scrollTop = 0; }')
    page.wait_for_timeout(200)
    a = page.locator('#doc > p > img').first.bounding_box()
    v = page.locator('#scroller').bounding_box()
    page.mouse.move(a['x'] + 30, a['y'] + 30)
    page.mouse.down()
    page.mouse.move(a['x'] + 30, min(v['y'] + v['height'], 900) - 8, steps=8)
    page.wait_for_timeout(900)
    check_that(page.evaluate('document.querySelector("#scroller").scrollTop') > 100, 'near the bottom edge the page scrolls along')
    last = page.locator('#doc p', has_text='Last paragraph').bounding_box()
    page.mouse.move(last['x'] + 40, last['y'] + last['height'] + 4, steps=4)
    page.mouse.up()
    page.wait_for_timeout(250)
    check_that(get_code(page).endswith('Last paragraph with ![Cover](title-picture.jpg) inside.\n\n![Cover](title-picture.jpg)\n'), 'with a larger text size too, dropped after the last paragraph')
    page.click('#size-100')
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    page.evaluate('() => { const t = document.querySelector("#code"); t.value += "x"; t.dispatchEvent(new Event("input")); }')
    move_picture(page, page.locator('#doc > p > img').first, second)
    check_that(get_code(page) == PICS + 'x', 'while the preview is not current, a picture is not moved')
    # Pictures beside each other: reorder in a paragraph, swap and insert in a table
    page.evaluate('u => { mdEditor.state.assets = { "title-picture.jpg": u, "picture-1.jpg": u, "picture-2.jpg": u, "picture-3.jpg": u }; }', jpg)
    page.evaluate('t => mdEditor.setCode(t)', GALLERY)
    page.set_viewport_size({'width': 1440, 'height': 2000})
    page.wait_for_timeout(400)
    page.evaluate('() => { scrollTo(0, 0); document.querySelector("#scroller").scrollTop = 0; }')
    def get_paragraph_picture(alt):
        """Returns the picture with an alt text in a paragraph of the preview.

        Args:
            alt (str): the alt text.

        Returns:
            Locator: the picture.
        """
        return page.locator(f'#doc > p > img[alt="{alt}"]')

    def get_cell_picture(alt):
        """Returns the picture with an alt text in a table cell of the preview.

        Args:
            alt (str): the alt text.

        Returns:
            Locator: the picture.
        """
        return page.locator(f'#doc td img[alt="{alt}"]')

    move_picture(page, get_paragraph_picture('Two'), get_paragraph_picture('One'), frac=0.15, fx=0.15)
    check_that(page.evaluate('document.querySelector(".picture-target").hidden'), 'the line is gone after a drop on a picture')
    check_that('![Cover](title-picture.jpg)\n![Two](picture-2.jpg)\n![One](picture-1.jpg)\n![Three](picture-3.jpg)\n\n|' in get_code(page),
          'dropped on the first half of another picture, a picture goes before it, on its own line: ' + repr(get_code(page)[11:100]))
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    check_that(get_code(page) == GALLERY, 'one undo step restores the order')
    move_picture(page, get_paragraph_picture('Cover'), get_paragraph_picture('Three'), frac=0.85, fx=0.85)
    check_that('# Gallery\n\n![One](picture-1.jpg)\n![Three](picture-3.jpg)\n![Cover](title-picture.jpg)\n![Two](picture-2.jpg)\n\n|' in get_code(page),
          'dropped on the second half, it goes after it: ' + repr(get_code(page)[11:100]))
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    row = '| ![One](picture-1.jpg) | ![Two](picture-2.jpg) | ![Three](picture-3.jpg) |'
    a = get_cell_picture('One').bounding_box()
    page.mouse.move(a['x'] + a['width'] / 2, a['y'] + a['height'] / 2)
    page.mouse.down()
    b = get_cell_picture('Three').bounding_box()
    page.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2, steps=12)
    check_that(page.evaluate('document.querySelector(".picture-target").classList.contains("swap")'), 'over the middle of a picture alone in its cell, a frame shows the swap')
    page.mouse.up()
    page.wait_for_timeout(250)
    check_that(get_code(page) == GALLERY.replace(row, '| ![Three](picture-3.jpg) | ![Two](picture-2.jpg) | ![One](picture-1.jpg) |'),
          'dropped on the middle, the two pictures change places, the | stay: ' + repr(get_code(page).split('\n')[9]))
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    check_that(get_code(page) == GALLERY, 'one undo step takes the swap back')
    move_picture(page, get_cell_picture('One'), get_cell_picture('Two'), frac=0.5, fx=0.92)
    check_that(get_code(page) == GALLERY.replace(row, '| | ![Two](picture-2.jpg) ![One](picture-1.jpg) | ![Three](picture-3.jpg) |'),
          'dropped on the outer edge, it goes beside the picture; the cell separators stay: ' + repr(get_code(page).split('\n')[9]))
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    move_picture(page, get_paragraph_picture('Three'), get_cell_picture('One'), frac=0.5, fx=0.1)
    check_that(get_code(page) == GALLERY.replace('![Three](picture-3.jpg)\n![Two]', '![Two]').replace('| ![One](picture-1.jpg) |', '| ![Three](picture-3.jpg) ![One](picture-1.jpg) |'),
          'a picture from a paragraph goes into a table cell beside another: ' + repr(get_code(page)[11:150]))
    page.evaluate('mdEditor.undo()')
    page.wait_for_timeout(200)
    move_picture(page, get_paragraph_picture('One'), page.locator('#doc p', has_text='End.'))
    check_that(get_code(page).endswith('End.\n\n![One](picture-1.jpg)\n') and '![Cover](title-picture.jpg)\n![Three]' in get_code(page), 'the gaps between blocks still take pictures')
    page.set_viewport_size({'width': 1440, 'height': 900})

    # Moving pictures with a finger
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, has_touch=True, is_mobile=True)
    tp = ctx.new_page()
    tp.on('pageerror', lambda e: errors.append(str(e)))
    tp.goto(URL, wait_until='networkidle')
    tp.wait_for_timeout(600)
    cdp = ctx.new_cdp_session(tp)

    def send_touch(kind, x=0, y=0):
        """Sends a touch event through the DevTools protocol.

        Args:
            kind (str): "touchStart", "touchMove" or "touchEnd".
            x (float): the finger's x.
            y (float): the finger's y.

        Returns:
            None: the event is sent.
        """
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y}]})

    long_doc = PICS + '\nMore text.\n' * 30
    tp.evaluate('u => { mdEditor.state.assets = { "title-picture.jpg": u }; }', jpg)
    tp.evaluate('t => mdEditor.setCode(t)', long_doc)
    tp.wait_for_timeout(400)
    scroll = 'document.querySelector("#scroller").scrollTop'
    a = tp.locator('#doc > p > img').first.bounding_box()
    x, y = a['x'] + 40, a['y'] + 40
    send_touch('touchStart', x, y)
    for i in range(1, 8):
        send_touch('touchMove', x, y - 25 * i)
        tp.wait_for_timeout(16)
    send_touch('touchEnd')
    tp.wait_for_timeout(500)
    check_that(tp.evaluate(scroll) > 50 and tp.evaluate('mdEditor.state.code') == long_doc, 'a quick swipe that starts on a picture scrolls the page and moves nothing')
    tp.evaluate(scroll + ' = 0')
    tp.wait_for_timeout(200)
    a = tp.locator('#doc > p > img').first.bounding_box()
    x, y = a['x'] + 40, a['y'] + 40
    b = tp.locator('#doc p', has_text='Second paragraph').bounding_box()
    to = b['y'] + b['height'] * 0.8
    send_touch('touchStart', x, y)
    tp.wait_for_timeout(550)
    check_that(tp.locator('#doc .dragging').count() == 1, 'a long press picks the picture up (it dims)')
    for i in range(1, 11):
        send_touch('touchMove', x, y + (to - y) * i / 10)
        tp.wait_for_timeout(16)
    check_that(tp.evaluate('!document.querySelector(".picture-target").hidden') and tp.evaluate(scroll) == 0, 'then the finger moves it, the page does not scroll')
    send_touch('touchEnd')
    tp.wait_for_timeout(300)
    check_that(tp.evaluate('mdEditor.state.code') == moved + '\nMore text.\n' * 30, 'released below the next paragraph, the picture moves there in the code')
    tp.evaluate('mdEditor.undo()')
    tp.wait_for_timeout(200)
    a = tp.locator('#doc > p > img').first.bounding_box()
    tp.touchscreen.tap(a['x'] + 40, a['y'] + 40)
    tp.wait_for_timeout(300)
    check_that(tp.evaluate('mdEditor.state.code') == long_doc and tp.evaluate('document.querySelector("#code").selectionStart') == PICS.index('![Cover]'),
          'a tap on a picture still goes to its code')
    ctx.close()
    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
