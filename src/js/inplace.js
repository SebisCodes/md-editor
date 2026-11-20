/**
 * Editing text on the page. Text from the code comes as <span class="t" data-md-s="offset">,
 * each character on the page standing for itself in the code (or for a backslash escape).
 *
 * The flow of an edit:
 *   1. a click (pointerup) makes the run under the pointer editable, with the cursor where the
 *      click was, and puts the code's cursor on the same character;
 *   2. Enter types a new paragraph, Shift+Enter a new line (both shown in the run as typed);
 *   3. Ctrl+Enter, Enter's paragraph inside bold or a link (refused), or a click elsewhere ends
 *      the edit: the changed part goes into the code with Markdown's special characters
 *      escaped and its line breaks written as Markdown (inplace-text.js), one undo step;
 *   4. Escape cancels.
 * pointerup, not click: when a click ends the edit of another run, the page is drawn anew and
 * the run under the pointer is a new element.
 */

import { state, ui, CHANGED_MEANWHILE, showToast } from './state.js?v=2';
import { setCode, addPendingHistoryStep } from './history.js?v=3';
import { showCodePosition } from './code-view.js?v=3';
import { showSourceMark } from './preview.js?v=3';
import { findCharacterAt, getRangeAtPoint, getCaretOffset } from './page-position.js?v=2';
import { getRunOffsets, formatTypedText, getRenumberedCode, isInsideMarkup } from './inplace-text.js?v=2';

const RUN = '.t[data-md-s]';
/** Typed text that ends with the start of a new paragraph or list item: the spaces after the split go. */
const ENDS_WITH_NEW_LINE = /\n[ \t>]*(?:(?:[-*+]|\d+[.)])[ \t]+(?:\[ \][ \t]+)?)?$/;
const CHANGED_IN_CODE = 'This text changed in the code - wait for the preview, then try again';
const EDIT_HELP = 'Editing on the page - Enter: new paragraph, Shift+Enter: new line, Ctrl+Enter or a click elsewhere keeps it, Escape cancels';
const PARAGRAPH_IN_MARKUP = 'A new paragraph inside bold, italic or a link is made in the code - Shift+Enter makes a new line';

/**
 * The run being edited.
 * @typedef {object} TextEdit
 * @property {HTMLElement} span - the run.
 * @property {number} at - where it starts in the code.
 * @property {string} before - its text before the edit.
 * @property {boolean} cell - true inside a table cell.
 */

/** @type {TextEdit|null} */
let editing = null;
let helpShown = false;

/**
 * Tells whether a run of the page is being edited (and still on the page).
 * @returns {boolean} true while an edit is open.
 */
export function isTextEditOpen() {
    return !!editing?.span.isConnected;
}

/**
 * Tells whether an edit was started and has not ended yet.
 * @returns {boolean} true while an edit is open, also when its run left the page.
 */
export function isTextEditing() {
    return !!editing;
}

/**
 * Connects the clicks, keys and focus of the page for editing its text.
 * @returns {void}
 */
export function startInplaceEditing() {
    ui.doc.addEventListener('pointerup', startEditAtPointer);
    ui.doc.addEventListener('keydown', handleEditKey);
    ui.doc.addEventListener('focusout', event => { if (editing && event.target === editing.span) stopTextEdit(true); });
}

/**
 * Starts editing the run under the pointer; a click with Ctrl or Cmd, and text being selected,
 * keep their meaning (a pointerup handler).
 * @param {PointerEvent} event - the pointer's release.
 * @returns {void}
 */
function startEditAtPointer(event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    const selection = getSelection();
    if (selection && !selection.isCollapsed && ui.doc.contains(selection.anchorNode) && !editing) return;   // the user selects text
    const run = findRunAt(event.clientX, event.clientY);
    if (run && !run.isContentEditable && ui.doc.contains(run)) startTextEdit(run, event.clientX, event.clientY);
}

/**
 * Runs the keys of an edit: Ctrl+Enter keeps it, Enter and Shift+Enter type a new paragraph or
 * line, Escape cancels (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleEditKey(event) {
    if (!editing || event.target !== editing.span) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); stopTextEdit(true); }
    else if (event.key === 'Enter') {
        // In the run as typed, in the code when the edit ends (formatTypedText).
        event.preventDefault();
        if (!event.shiftKey && isInsideMarkup(editing.span)) { showToast(PARAGRAPH_IN_MARKUP); return; }
        document.execCommand('insertText', false, event.shiftKey ? '\n' : '\n\n');
    }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopTextEdit(false); }
}

/**
 * Returns the run at a point: the one under it, or the nearest one on that line of the block
 * under it (a click right of a line's end edits that line, the cursor at its end).
 * @param {number} x - the point's x in the viewport.
 * @param {number} y - the point's y in the viewport.
 * @returns {HTMLElement|null} the run, null when there is none.
 */
function findRunAt(x, y) {
    const element = document.elementFromPoint(x, y);
    const run = element?.closest(RUN);
    if (run) return run;
    const block = element?.closest('[data-md-p]');
    if (!block || !ui.doc.contains(block)) return null;
    const character = findCharacterAt(block, x, y);
    return character ? character.node.parentElement?.closest(RUN) || null : null;
}

/**
 * Makes a run editable with the cursor at a point (or the selection in it) and shows the same
 * place in the code. A run whose text does not match the code is not edited.
 * @param {HTMLElement} run - the run.
 * @param {number} x - the point's x in the viewport.
 * @param {number} y - the point's y in the viewport.
 * @returns {void}
 */
function startTextEdit(run, x, y) {
    if (isTextEditOpen()) return;
    editing = null;
    const at = +run.dataset.mdS, before = run.textContent;
    const offsets = getRunOffsets(state.code, before, at);
    if (!offsets) { showToast(CHANGED_IN_CODE); return; }
    const selection = getSelection();
    const range = (selection.rangeCount && !selection.isCollapsed && run.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null) || getRangeAtPoint(x, y, run);
    setRunEditable(run);
    editing = { span: run, at, before, cell: !!run.closest('td, th') };
    run.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(range && run.contains(range.startContainer) ? range : createRunStartRange(run));
    showCodePosition(offsets[Math.min(getCaretOffset(run), before.length)], false);
    showSourceMark({ scroll: false, always: true });
    if (!helpShown) { helpShown = true; showToast(EDIT_HELP); }
}

/**
 * Makes a run editable as plain text, with line breaks shown as typed.
 * @param {HTMLElement} run - the run.
 * @returns {void}
 */
function setRunEditable(run) {
    run.contentEditable = 'plaintext-only';
    if (run.contentEditable !== 'plaintext-only') run.contentEditable = 'true';
    run.spellcheck = true;
    run.classList.add('edit');
    run.style.whiteSpace = 'pre-wrap';
}

/**
 * Returns a collapsed range at the start of a run.
 * @param {HTMLElement} run - the run.
 * @returns {Range} the range.
 */
function createRunStartRange(run) {
    const range = document.createRange();
    range.setStart(run.firstChild || run, 0);
    return range;
}

/**
 * Ends the edit of the run: with keep, the changed part goes into the code (one undo step);
 * without, or when nothing changed, the run shows its text again. Nothing happens without an edit.
 * @param {boolean} keep - true to write the edit into the code.
 * @returns {void}
 */
export function stopTextEdit(keep) {
    const edit = editing;
    if (!edit) return;
    editing = null;
    const { span, at, before } = edit;
    const typed = span.textContent.replace(/ /g, ' ');
    span.removeAttribute('contenteditable');
    span.classList.remove('edit');
    span.style.whiteSpace = '';
    if (!keep || typed === before) { span.textContent = before; return; }
    const offsets = getRunOffsets(state.code, before, at);
    if (!offsets) { span.textContent = before; showToast(CHANGED_MEANWHILE); return; }
    writeTextEdit(edit, typed, offsets);
}

/**
 * Writes the changed part of an edit into the code, as Markdown, and puts the code's cursor after it.
 * @param {TextEdit} edit - the edit.
 * @param {string} typed - the run's text after the edit.
 * @param {number[]} offsets - the places in the code of the run's characters.
 * @returns {void}
 */
function writeTextEdit(edit, typed, offsets) {
    const { span, before, cell } = edit;
    const [same, sameEnd] = getUnchangedEnds(before, typed);
    const from = offsets[same], to = offsets[before.length - sameEnd];
    const lineStart = /^[\s>]*$/.test(state.code.slice(state.code.lastIndexOf('\n', from - 1) + 1, from));
    const place = { code: state.code, from, lineStart, cell, first: same === 0, rest: typed.slice(typed.length - sameEnd) };
    const markdown = formatTypedText(span, typed.slice(same, typed.length - sameEnd), place);
    if (markdown === '' && from === to) { span.textContent = before; return; }        // only empty paragraphs
    // A new paragraph or line starts without the space that stood at the split.
    let end = to;
    if (ENDS_WITH_NEW_LINE.test(markdown)) while (state.code[end] === ' ' || state.code[end] === '\t') end++;
    addPendingHistoryStep();
    const next = state.code.slice(0, from) + markdown + state.code.slice(end);
    setCode(markdown.includes('\n') ? getRenumberedCode(next, from + markdown.lastIndexOf('\n') + 1) : next);
    ui.ta.setSelectionRange(from + markdown.length, from + markdown.length);
    showCodePosition(from + markdown.length, false);
}

/**
 * Returns how many characters at the start and at the end of two texts are the same.
 * @param {string} before - the text before the edit.
 * @param {string} after - the text after it.
 * @returns {[number, number]} the length of the same start and of the same end (not overlapping it).
 */
function getUnchangedEnds(before, after) {
    let start = 0, end = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
    return [start, end];
}
