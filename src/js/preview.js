/**
 * The preview: the document rendered as a readable page (markdown.js), its text size, the frame
 * on the block of the code's cursor, and clicks on the page.
 *
 * A click on the page puts the code's cursor on the block that was clicked; a click on a check
 * box ticks the task in the code; Ctrl+click (Cmd+click) follows a link: #anchors in the
 * preview, other addresses in a new tab. Text that stands in the code as shown is edited on the
 * page itself (inplace.js).
 */

import { state, areas, ui, NARROW_SCREEN, getElement, getElements, showToast, translate, getClamped } from './state.js?v=2';
import { render } from './markdown.js?v=8';
import { escapeHtml } from './util.js?v=3';
import { setCode, addPendingHistoryStep } from './history.js?v=3';
import { renderCode, showCodePosition } from './code-view.js?v=3';
import { renderProblems } from './problems.js?v=3';
import { renderPictures } from './pictures-panel.js?v=3';
import { renderOutline } from './outline.js?v=3';
import { saveToStorage } from './storage.js?v=3';
import { showPane } from './layout.js?v=3';
import { isTextEditOpen } from './inplace.js?v=3';

/** How long the preview waits after typing before it renders, in milliseconds. */
export const RENDER_DELAY = 220;
/** The blocks of the page that get the frame of the code's cursor. */
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, tr, th, td, hr, table, .md-math-block, dt, dd';
const MIN_TEXT_SIZE = 0.6;
const MAX_TEXT_SIZE = 2;
const TEXT_SIZE_STEP = 0.1;
/** The distance from the top of the preview of a block or anchor scrolled to, in pixels. */
const ANCHOR_MARGIN = 16;
/** A framed block is scrolled to when it is closer than these to the top and bottom edge, in pixels. */
const MARK_TOP_MARGIN = 20;
const MARK_BOTTOM_MARGIN = 40;
/** A framed block scrolled to stands a third down the preview. */
const SCROLL_SHARE = 3;
const PERCENT = 100;
/** Text sizes are rounded to tenths. */
const SIZE_PRECISION = 10;
/** Addresses a Ctrl+click opens in a new tab. */
const OUTSIDE_LINK = /^(https?:|mailto:)/i;

/**
 * Renders the preview after a pause; the stage shows that it is computing meanwhile.
 * @param {number} [delay] - the pause in milliseconds.
 * @returns {void}
 */
export function startRenderSoon(delay = RENDER_DELAY) {
    clearTimeout(state.renderTimer);
    ui.stage.classList.add('computing');
    state.renderTimer = setTimeout(renderPreview, delay);
}

/**
 * Renders the code as the page of the preview (keeping its scroll position) and draws what
 * depends on it: problems, code view, pictures, outline and the frame of the cursor's block.
 * @returns {void}
 */
export function renderPreview() {
    clearTimeout(state.renderTimer);
    ui.stage.classList.remove('computing');
    state.result = getRenderResult();
    state.shownCode = state.code;
    const scrollTop = ui.scroller.scrollTop;
    ui.doc.replaceChildren(...state.result.root.childNodes);
    if (!state.code.trim()) ui.doc.innerHTML = `<p class="empty-hint">${escapeHtml(translate('The document is empty - write Markdown on the left, or choose a template under "New".'))}</p>`;
    ui.scroller.scrollTop = scrollTop;
    state.srcEls = getElements('[data-md-p]', ui.doc).filter(element => element.matches(BLOCKS)).map(element => [+element.dataset.mdP, element]).sort((a, b) => a[0] - b[0]);
    renderProblems();
    renderCode();
    if (!ui.pictures.hidden) renderPictures();
    renderOutline();
    showSourceMark({ scroll: false });
}

/**
 * Returns the rendered code, or a page that names an unexpected problem of the renderer.
 * @returns {import('./state.js').RenderResult} the page, outline, problems and words.
 */
function getRenderResult() {
    try {
        return render(state.code, { assets: state.assets });
    } catch (e) {
        console.error(e);
        const root = document.createElement('div');
        root.innerHTML = `<p>The preview stopped at an unexpected problem: ${escapeHtml(e.message)}</p>`;
        return { root, outline: [], problems: [{ pos: 0, kind: 'error', msg: 'The preview failed: ' + e.message }], words: 0 };
    }
}

/**
 * Shows the text size of the page in the preview and its button.
 * @returns {void}
 */
export function showTextSize() {
    ui.doc.style.fontSize = (state.size * PERCENT).toFixed(0) + '%';
    getElement('#size-label').textContent = Math.round(state.size * PERCENT) + '%';
}

/**
 * Sets the text size of the page (rounded to tenths, 60 % to 200 %) and stores it.
 * @param {number} size - the size, 1 for 100 %.
 * @returns {void}
 */
function setTextSize(size) {
    state.size = getClamped(Math.round(size * SIZE_PRECISION) / SIZE_PRECISION, MIN_TEXT_SIZE, MAX_TEXT_SIZE);
    showTextSize();
    saveToStorage();
}

/**
 * Frames the block of the preview where the code's cursor is, while the code has the focus.
 * @param {object} [options] - scroll: false to leave the preview where it is; always: true to
 *   frame the block also when the code does not have the focus.
 * @returns {void}
 */
export function showSourceMark({ scroll = true, always = false } = {}) {
    if (state.lastMark) state.lastMark.classList.remove('source');
    state.lastMark = null;
    const blocks = state.srcEls;
    if (!blocks.length || (document.activeElement !== ui.ta && !always)) return;
    const block = findBlockAt(blocks, ui.ta.selectionStart);
    if (!block) return;
    block.classList.add('source');
    state.lastMark = block;
    if (!scroll) return;
    const box = block.getBoundingClientRect(), view = ui.scroller.getBoundingClientRect();
    if (box.bottom < view.top + MARK_TOP_MARGIN || box.top > view.bottom - MARK_BOTTOM_MARGIN) ui.scroller.scrollTop += box.top - view.top - view.height / SCROLL_SHARE;
}

/**
 * Returns the last block that starts at or before a position (binary search).
 * @param {Array<Array>} blocks - [offset, element] pairs, sorted by offset.
 * @param {number} position - the position in the code.
 * @returns {HTMLElement|null} the block, null when every block starts after the position.
 */
function findBlockAt(blocks, position) {
    let low = 0, high = blocks.length - 1, best = -1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (blocks[middle][0] <= position) { best = middle; low = middle + 1; } else high = middle - 1;
    }
    return best < 0 ? null : blocks[best][1];
}

/**
 * Scrolls the preview to an anchor of the page. Returns whether the anchor is there
 * (the caller tells the user when it is not).
 * @param {string} id - the anchor's id.
 * @returns {boolean} true when the preview scrolled to it.
 */
export function moveToAnchor(id) {
    const target = id && ui.doc.querySelector('#' + CSS.escape(id));
    if (!target) return false;
    const view = ui.scroller.getBoundingClientRect();
    ui.scroller.scrollTop += target.getBoundingClientRect().top - view.top - ANCHOR_MARGIN;
    return true;
}

/**
 * Connects the clicks on the page and the buttons of the text size.
 * @returns {void}
 */
export function startPreview() {
    ui.doc.addEventListener('click', handlePreviewClick);
    getElement('#size-down').addEventListener('click', () => setTextSize(state.size - TEXT_SIZE_STEP));
    getElement('#size-up').addEventListener('click', () => setTextSize(state.size + TEXT_SIZE_STEP));
    getElement('#size-100').addEventListener('click', () => setTextSize(1));
}

/**
 * Runs a click on the page: a check box ticks its task, Ctrl+click follows a link, a click on a
 * block shows its place in the code. Text being edited or selected keeps the click (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handlePreviewClick(event) {
    const box = event.target.closest('input.md-task');
    if (box) { event.preventDefault(); applyTaskSwitch(box); return; }
    const link = event.target.closest('a[href]');
    if (link) {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) { openLink(link); return; }
    }
    if (event.target.closest('[contenteditable], .t[data-md-s]') || isTextEditOpen()) return;   // text edited on the page (inplace.js)
    const selection = getSelection();
    if (selection && !selection.isCollapsed && ui.doc.contains(selection.anchorNode)) return;   // the user selects text
    const block = event.target.closest('[data-md-p]');
    if (!block || block.dataset.mdP === '') return;
    if (NARROW_SCREEN.matches) showPane('code');
    showCodePosition(+block.dataset.mdP);
    showSourceMark({ scroll: false, always: true });
}

/**
 * Follows a link of the page: an #anchor in the preview, an outside address in a new tab.
 * @param {HTMLAnchorElement} link - the link.
 * @returns {void}
 */
function openLink(link) {
    const href = link.getAttribute('href');
    if (href.startsWith('#')) {
        let id = href.slice(1);
        try { id = decodeURIComponent(id); } catch (e) { /* keep it */ }
        if (!moveToAnchor(id)) showToast('This anchor is not in the document');
    } else if (OUTSIDE_LINK.test(href)) window.open(href, '_blank', 'noopener');
}

/**
 * Ticks or unticks a task in the code ([ ] <-> [x]) for its check box on the page, one undo step.
 * @param {HTMLInputElement} box - the check box.
 * @returns {void}
 */
function applyTaskSwitch(box) {
    const at = +box.dataset.mdBox;
    if (!box.dataset.mdBox || !/^[ xX]$/.test(state.code[at] || '') || state.code[at - 1] !== '[') { showToast('This box changed in the code - wait for the preview, then try again'); return; }
    addPendingHistoryStep();
    setCode(state.code.slice(0, at) + (state.code[at] === ' ' ? 'x' : ' ') + state.code.slice(at + 1));
}
