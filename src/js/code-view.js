/**
 * The code view: the highlighted code under the text field, the colored lines of problems, the
 * band on the cursor's line, the line numbers (wrap.js), the status line, and showing a place
 * of the code.
 */

import { state, areas, ui, LINE_HEIGHT, NARROW_SCREEN } from './state.js?v=2';
import { highlight } from './markdown.js?v=8';
import { escapeHtml } from './util.js?v=3';
import { getLineIndex, getLineStartOf } from './text-position.js?v=2';
import { updateHistoryButtons } from './history.js?v=3';
import { showSourceMark } from './preview.js?v=3';

/** Longer code is shown without highlighting, so typing stays fast. */
const MAX_HIGHLIGHT_LENGTH = 600000;
const KILOBYTE = 1024;
/** The padding above the first line of the code field, in pixels. */
const CODE_PADDING_TOP = 10;
/** A position is scrolled to when it is closer than this to the right edge, in pixels. */
const RIGHT_EDGE_MARGIN = 60;
/** How far left of a position the code scrolls, in pixels. */
const LEFT_SCROLL_MARGIN = 40;
/** A position scrolled to stands a third down the code view. */
const SCROLL_SHARE = 3;
/** How many characters the width of one character is measured over. */
const MEASURE_LENGTH = 100;

const lineBand = document.createElement('div');
let characterWidth = 0;

/**
 * Puts the band of the cursor's line in place and follows the cursor and the scrolling.
 * @returns {void}
 */
export function startCodeView() {
    lineBand.className = 'line-band';
    lineBand.setAttribute('aria-hidden', 'true');
    ui.marks.before(lineBand);
    document.addEventListener('selectionchange', () => { if (document.activeElement === ui.ta) showLineBand(); });
    ui.ta.addEventListener('scroll', syncScroll);
    ui.ta.addEventListener('click', () => showSourceMark());
    ui.ta.addEventListener('keyup', event => { if (/Arrow|Home|End|Page/.test(event.key)) showSourceMark(); });
    ui.ta.addEventListener('blur', () => { if (state.lastMark) state.lastMark.classList.remove('source'); state.lastMark = null; });
}

/**
 * Draws the code: its highlighting, the lines with problems, the line numbers and the status
 * line (lines, size, words); updates Undo and Redo.
 * @returns {void}
 */
export function renderCode() {
    const code = state.code;
    ui.hl.innerHTML = code.length < MAX_HIGHLIGHT_LENGTH ? highlight(code) + '\n' : escapeHtml(code) + '\n';
    renderMarks();
    const lines = code.split('\n').length;
    areas.lineWrap.update(code);
    const bytes = new Blob([code]).size;
    const words = state.result ? state.result.words : 0;
    ui.status.textContent = `${lines} lines · ${bytes < KILOBYTE ? bytes + ' B' : (bytes / KILOBYTE).toFixed(1) + ' KB'} · ${words} ${words === 1 ? 'word' : 'words'}`;
    updateHistoryButtons();
}

/**
 * Gives the lines with problems a colored background (errors and notes).
 * @returns {void}
 */
function renderMarks() {
    const code = state.code;
    let out = '', last = 0;
    for (const [start, end, className] of getMarkRanges(code)) {
        if (start < last) continue;
        out += escapeHtml(code.slice(last, start)) + `<mark class="${className}">` + escapeHtml(code.slice(start, end) || ' ') + '</mark>';
        last = end;
    }
    ui.marks.innerHTML = out + escapeHtml(code.slice(last)) + '\n';
}

/**
 * Returns the lines with problems, one range per line, in code order.
 * @param {string} code - the code.
 * @returns {Array<[number, number, string]>} start, end and class ("err" or "warn") of each line.
 */
function getMarkRanges(code) {
    const ranges = [];
    const seen = new Set();
    for (const problem of state.result ? state.result.problems : []) {
        const lineStart = getLineStartOf(code, problem.pos);
        if (seen.has(lineStart)) continue;
        seen.add(lineStart);
        let lineEnd = code.indexOf('\n', lineStart);
        if (lineEnd < 0) lineEnd = code.length;
        ranges.push([lineStart, Math.max(lineEnd, lineStart + 1), problem.kind === 'error' ? 'err' : 'warn']);
    }
    return ranges.sort((a, b) => a[0] - b[0]);
}

/**
 * Moves the highlighting, the marks and the line numbers with the scrolled text field.
 * @returns {void}
 */
export function syncScroll() {
    const transform = `translate(${-ui.ta.scrollLeft}px, ${-ui.ta.scrollTop}px)`;
    ui.hl.style.transform = transform;
    ui.marks.style.transform = transform;
    ui.gutter.style.transform = `translateY(${-ui.ta.scrollTop}px)`;
    showLineBand();
}

/**
 * Puts the band on the cursor's line, so the cursor is easy to find; hidden while text is selected.
 * @returns {void}
 */
export function showLineBand() {
    const ta = ui.ta;
    lineBand.hidden = ta.selectionStart !== ta.selectionEnd;
    const line = getLineIndex(ta.selectionStart);
    lineBand.style.transform = `translateY(${CODE_PADDING_TOP + areas.lineWrap.getLineTop(line) - ta.scrollTop}px)`;
    lineBand.style.height = areas.lineWrap.getLineHeight(line) + 'px';
}

/**
 * Returns the width of one character of the code's font, measured once.
 * @returns {number} the width in pixels.
 */
function getCharacterWidth() {
    if (characterWidth) return characterWidth;
    const probe = document.createElement('span');
    probe.textContent = 'x'.repeat(MEASURE_LENGTH);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    probe.style.font = getComputedStyle(ui.ta).font;
    document.body.appendChild(probe);
    characterWidth = probe.getBoundingClientRect().width / MEASURE_LENGTH;
    probe.remove();
    return characterWidth;
}

/**
 * Puts the cursor (or a selection) at a position and scrolls the code there.
 * @param {number} position - the character offset.
 * @param {boolean} [focus] - false to leave the focus where it is (on a phone it stays anyway).
 * @param {number} [selectionEnd] - the end of the selection; the position itself for a cursor.
 * @returns {void}
 */
export function showCodePosition(position, focus = true, selectionEnd = position) {
    const ta = ui.ta;
    if (focus && !NARROW_SCREEN.matches) ta.focus({ preventScroll: true });
    ta.setSelectionRange(position, selectionEnd);
    const top = areas.lineWrap.getLineTop(getLineIndex(position)), height = ta.clientHeight;
    if (top < ta.scrollTop + LINE_HEIGHT || top > ta.scrollTop + height - LINE_HEIGHT * 2) ta.scrollTop = Math.max(0, top - height / SCROLL_SHARE);
    const x = (position - getLineStartOf(state.code, position)) * getCharacterWidth();
    if (x < ta.scrollLeft || x > ta.scrollLeft + ta.clientWidth - RIGHT_EDGE_MARGIN) ta.scrollLeft = Math.max(0, x - LEFT_SCROLL_MARGIN);
    syncScroll();
}
