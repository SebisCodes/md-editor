"""AI status at the AI button and in the AI dialog: AI through the page,
browser agent (WebMCP) and AI links.

The button is green with a check mark only while an AI is connected: AI through the page
from its first result until the page ends its AI session, a browser agent until 5 minutes
after its last call (a test clock moves the time on). A document from an AI link, in this
tab or handed over from another one, shows the check mark for about 3 seconds only.

Start the editor first (php -S 127.0.0.1:8192 -t src src/php/router.php in the editor's folder),
then run this file from there; EDITOR_URL=http://127.0.0.1:<port>/ runs it
against another address. A second PHP server on 127.0.0.1:8099 plays the
page around the editor."""
import base64
import json
import os
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright

P = 'mdeditor'
EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8192/')
CONTENT = '# Page document\n\nHello.\n'

failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text)
    if not ok:
        failed.append(text)


HOST = """<!doctype html><meta charset="utf-8"><title>Host</title>
<iframe id="f" src="EDITOR?embed=1" style="width:1200px;height:800px;border:0"></iframe>
<script>
const P = 'PFX', ORIGIN = new URL('EDITOR').origin;
const frame = document.getElementById('f');
const send = m => frame.contentWindow.postMessage(m, ORIGIN);
addEventListener('message', e => {
  if (e.source !== frame.contentWindow || e.data.type !== P + ':ready') return;
  send({ type: P + ':load', name: 'Page document', content: CONTENT,
         ai: { label: 'Example Admin', prompt: 'Be short.', endpoint: location.origin + '/result' } });
});
</script>"""

# A stand-in for WebMCP: the tools land in window.tools, a test calls one like an agent would.
FAKE_MCP = "window.tools = []; document.modelContext = { registerTool(t) { window.tools.push(t); } };"

def get_ai_state(pg):
    """Returns the AI state shown at the AI button.

    Args:
        pg (Page): the editor page.

    Returns:
        str: "on", "waiting" or "" for none.
    """
    return pg.evaluate('document.getElementById("btn-ai").dataset.ai || ""')


def get_ai_title(pg):
    """Returns the tooltip of the AI button.

    Args:
        pg (Page): the editor page.

    Returns:
        str: the tooltip.
    """
    return pg.evaluate('document.getElementById("btn-ai").title')


def get_status_lines(pg):
    """Returns the lines of the AI status in the dialog, each with its state.

    Args:
        pg (Page): the editor page.

    Returns:
        list[str]: "<state> <text>" per line, "-" for a line without a state.
    """
    return pg.evaluate('[...document.querySelectorAll("#ai-status li")].map(li => (li.dataset.ai || "-") + " " + li.textContent)')

def wait_for_ai_state(pg, wanted, timeout):
    """Waits until the AI button shows a state.

    Args:
        pg (Page | Frame): the editor.
        wanted (str): the data-ai state, "" for the normal button.
        timeout (int): the longest wait in milliseconds.

    Returns:
        bool: True when the button showed the state in time.
    """
    try:
        pg.wait_for_function('s => (document.getElementById("btn-ai").dataset.ai || "") === s', arg=wanted, timeout=timeout)
        return True
    except PlaywrightTimeout:
        return False


def get_check_mark(pg):
    """Returns what the AI button shows at its top right.

    Args:
        pg (Page | Frame): the editor.

    Returns:
        str: the CSS content of the button's ::after, '"✓"' for the check mark.
    """
    return pg.evaluate("getComputedStyle(document.getElementById('btn-ai'), '::after').content")


with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, 'host.html'), 'w') as f:
        f.write(HOST.replace('EDITOR', EDITOR).replace('PFX', P).replace('CONTENT', json.dumps(CONTENT)))
    server = subprocess.Popen(['php', '-S', '127.0.0.1:8099', '-t', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='chrome', headless=True)
            ctx = browser.new_context(viewport={'width': 1360, 'height': 860})
            errors = []

            # Top level, no WebMCP, one tab: nothing delivered yet
            a = ctx.new_page()
            a.on('pageerror', lambda e: errors.append(str(e)))
            a.goto(EDITOR, wait_until='load')
            a.wait_for_timeout(1200)
            check_that(get_ai_state(a) == '', 'a new page: the AI button is normal')
            s = get_status_lines(a)
            check_that(len(s) == 4 and s[0] == '- AI in this session: nothing received yet - copy the prompt for your AI', 'dialog: nothing received yet: ' + str(s[:1]))
            check_that(s[1] == '- AI through a website: not connected', 'dialog: no AI through a website')
            check_that(s[2] == '- Browser agent (WebMCP): not offered by this browser', 'dialog: no WebMCP in this browser')
            check_that(s[3] == 'on AI links: arrive in this tab', 'dialog: links arrive in the only tab')
            check_that('AI links: arrive in this tab' in get_ai_title(a) and 'nothing received yet' in get_ai_title(a), 'the button title lists the state and the ways')

            # A document from an AI link is no connection: the check mark for about 3 seconds, not green
            b64 = base64.urlsafe_b64encode(CONTENT.encode()).decode().rstrip('=')
            a.goto(EDITOR + '#b64=' + b64, wait_until='load')
            check_that(wait_for_ai_state(a, 'delivered', 5000), 'a document from an AI link: the check mark shows')
            check_that(get_check_mark(a) == '"✓"' and get_ai_state(a) != 'on', 'with a check mark, the button not green')
            check_that(get_status_lines(a)[0] == 'on AI in this session: a document from an AI link, just now', 'dialog: delivered by a link: ' + get_status_lines(a)[0])
            check_that(wait_for_ai_state(a, '', 6000), 'about 3 seconds later the button is normal again')
            check_that('a document from an AI link' in get_status_lines(a)[0], 'the dialog still names the delivery')
            a.goto(EDITOR, wait_until='load')
            a.wait_for_timeout(1200)
            check_that(get_ai_state(a) == '', 'a new page starts normal again (nothing is stored)')
            # The usual way: the AI's link opens a new tab, which hands the document to the open editor tab
            a.evaluate('dispatchEvent(new Event("focus"))')
            c = ctx.new_page()
            c.goto(EDITOR + '#b64=' + b64, wait_until='load')
            check_that(wait_for_ai_state(a, 'delivered', 8000) and 'a document from an AI link' in get_status_lines(a)[0], 'a link opened in another tab shows the check mark in the open editor')
            check_that(wait_for_ai_state(a, '', 6000), '... and then the normal button')
            c.close()
            a.goto(EDITOR, wait_until='load')
            a.wait_for_timeout(1200)

            # A second editor tab with WebMCP takes the focus: links go there; an agent call turns it green
            b = ctx.new_page()
            b.on('pageerror', lambda e: errors.append(str(e)))
            b.add_init_script(FAKE_MCP)
            b.clock.install()
            b.goto(EDITOR, wait_until='load')
            b.wait_for_timeout(800)
            b.evaluate('dispatchEvent(new Event("focus"))')
            a.wait_for_timeout(500)
            check_that(get_status_lines(a)[3] == '- AI links: go to another editor tab (the one used last)', 'the other tab knows links go to the tab used last')
            check_that(get_status_lines(b)[3] == 'on AI links: arrive in this tab', 'the focused tab says links arrive there')
            check_that(get_status_lines(b)[2] == '- Browser agent (WebMCP): available, not used yet', 'WebMCP offered, not used yet')
            check_that(get_ai_state(b) == '', 'WebMCP offered but not used: the button is normal')
            b.evaluate('window.tools.find(t => t.name === "undo").execute({})')
            b.wait_for_timeout(300)
            check_that(get_ai_state(b) == 'on' and get_status_lines(b)[0] == 'on AI in this session: a browser agent (WebMCP), just now', 'an agent call turns it green: ' + get_status_lines(b)[0])
            check_that(get_ai_state(a) == '', 'the other tab stays normal')
            b.clock.fast_forward('05:01')
            b.wait_for_timeout(300)
            check_that(get_ai_state(b) == '' and get_status_lines(b)[2] == '- Browser agent (WebMCP): available, last used 5 min ago', '5 minutes after the last agent call the button is normal again: ' + get_status_lines(b)[2])
            a.evaluate('dispatchEvent(new Event("focus"))')
            b.wait_for_timeout(500)
            check_that(get_status_lines(b)[3] == '- AI links: go to another editor tab (the one used last)', 'back in the first tab, links go there again')
            b.close()
            a.wait_for_timeout(500)
            check_that(get_status_lines(a)[3] == 'on AI links: arrive in this tab', 'a closed tab no longer counts')

            # Inside a page: the page's AI without a key, with the key, then a result from the AI
            h = ctx.new_page()
            h.on('pageerror', lambda e: errors.append(str(e)))
            h.goto('http://127.0.0.1:8099/host.html', wait_until='load')
            h.wait_for_timeout(2500)
            fr = next(x for x in h.frames if x.url.startswith(EDITOR))
            check_that(get_ai_state(fr) == 'waiting', 'endpoint without a key: yellow dot')
            s = get_status_lines(fr)
            check_that(s[1] == 'waiting AI through Example Admin (127.0.0.1:8099): connected, waiting for the key', 'dialog: waiting for the key: ' + s[1])
            check_that(s[3] == "- AI links: cannot reach the editor inside this website - paste the AI's answer here", 'inside a website links cannot reach the editor')
            h.evaluate("document.getElementById('f').contentWindow.postMessage({ type: '%s:ai', key: 'k'.repeat(48) }, new URL('%s').origin)" % (P, EDITOR))
            h.wait_for_timeout(2500)
            check_that(get_ai_state(fr) == '', 'with the key but nothing delivered yet: the button is normal')
            check_that(get_status_lines(fr)[1] == 'on AI through Example Admin (127.0.0.1:8099): connected', 'dialog: connected')
            h.evaluate("document.getElementById('f').contentWindow.postMessage({ type: '%s:load', name: 'Page document', content: %s, from: 'ai' }, new URL('%s').origin)" % (P, json.dumps(CONTENT), EDITOR))
            h.wait_for_timeout(1500)
            check_that(get_ai_state(fr) == 'on' and get_status_lines(fr)[0] == 'on AI in this session: a result through the page, just now', 'a result from the AI through the page turns it green: ' + get_status_lines(fr)[0])
            # A new document from the AI is a document of its own: the session goes on, the button stays green
            h.evaluate("document.getElementById('f').contentWindow.postMessage({ type: '%s:load', name: 'Other', content: %s, from: 'ai', target: 'new' }, new URL('%s').origin)" % (P, json.dumps(CONTENT), EDITOR))
            h.wait_for_timeout(2500)
            check_that(get_ai_state(fr) == 'on', 'a new document from the AI: still green')
            h.wait_for_timeout(4000)
            check_that(get_ai_state(fr) == 'on', 'the page\'s AI stays connected: still green after 4 seconds')
            # The page ends its AI session (popup closed): normal again; a new key alone does not make it green
            h.evaluate("document.getElementById('f').contentWindow.postMessage({ type: '%s:ai', clear: true }, new URL('%s').origin)" % (P, EDITOR))
            h.wait_for_timeout(500)
            check_that(get_ai_state(fr) == '' and get_status_lines(fr)[0] == '- AI in this session: nothing received yet - copy the prompt for your AI', 'the page ends the session: the button is normal again: ' + get_status_lines(fr)[0])
            h.evaluate("document.getElementById('f').contentWindow.postMessage({ type: '%s:ai', label: 'Example Admin', prompt: 'Be short.', endpoint: location.origin + '/result', key: 'm'.repeat(48) }, new URL('%s').origin)" % (P, EDITOR))
            h.wait_for_timeout(2500)
            check_that(get_ai_state(fr) == '', 'a new session with a new key: normal until the AI delivers')
            h.reload(wait_until='load')
            h.wait_for_timeout(2500)
            fr = next(x for x in h.frames if x.url.startswith(EDITOR))
            check_that(get_ai_state(fr) == 'waiting', 'after reloading the page: no longer green')

            check_that(not errors, 'no script errors: ' + '; '.join(errors))
            browser.close()
    finally:
        server.terminate()

print()
print('all passed' if not failed else f'{len(failed)} failed')
sys.exit(1 if failed else 0)
