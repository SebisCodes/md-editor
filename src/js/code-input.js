/**
 * Typing in the code: what typing sets off (code view, preview after a pause, undo step and
 * storing after a pause, sync.js), and the typing help: shortcuts, Tab and Shift+Tab to indent,
 * Enter to go on with a list or quote, and marks or brackets typed around a selection.
 */

import { state, areas, ui } from './state.js?v=2';
import { addHistoryStep, undo, redo } from './history.js?v=3';
import { renderCode } from './code-view.js?v=3';
import { startRenderSoon, showSourceMark, RENDER_DELAY } from './preview.js?v=3';
import { saveToStorage } from './storage.js?v=3';
import { writeCodeRange, applyMarkSwitch, applyCommentSwitch } from './code-edit.js?v=3';
import { addNamedSnippet } from './snippets.js?v=3';
import { getLineStartOf } from './text-position.js?v=2';

/** Code longer than this renders after a longer pause. */
const LONG_CODE = 60000;
const LONG_CODE_RENDER_DELAY = 600;
/** The pause after typing before it becomes an undo step, in milliseconds. */
const HISTORY_DELAY = 600;
/** The pause after typing before the document is stored, in milliseconds. */
const SAVE_DELAY = 400;
/** One step of indentation. */
const INDENT = '  ';
/** A typed mark or bracket and its closing partner, put around a selection. */
const PAIRS = { '*': '*', _: '_', '`': '`', '~': '~', $: '$', '[': ']', '(': ')', '"': '"' };
/** A list item at the start of a line: quote markers, marker, space, task box, text. */
const LIST_ITEM = /^(\s*(?:>\s?)*\s*)([-*+]|(\d{1,9})([.)]))(\s+)(\[[ xX]\]\s+)?(.*)$/;

/**
 * Connects the typing in the code and its keys.
 * @returns {void}
 */
export function startCodeInput() {
    ui.ta.addEventListener('input', readTypedCode);
    ui.ta.addEventListener('keydown', handleCodeKey);
}

/**
 * Takes the typed code: draws it, renders the preview after a pause, makes the undo step and
 * stores the document after a pause, and tells sync.js (an input handler).
 * @returns {void}
 */
function readTypedCode() {
    state.code = ui.ta.value;
    renderCode();
    startRenderSoon(state.code.length > LONG_CODE ? LONG_CODE_RENDER_DELAY : RENDER_DELAY);
    clearTimeout(state.histTimer);
    state.histTimer = setTimeout(addHistoryStep, HISTORY_DELAY);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveToStorage, SAVE_DELAY);
    areas.sync?.handleChange();
}

/**
 * Runs a key in the code: a shortcut, Escape, Tab, Enter or a mark around the selection (a
 * keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleCodeKey(event) {
    if (runShortcut(event)) return;
    if (event.key === 'Escape') { ui.ta.blur(); return; }
    const hasSelection = ui.ta.selectionStart !== ui.ta.selectionEnd;
    if (event.key === 'Tab') { event.preventDefault(); writeIndent(event.shiftKey); return; }
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing && !hasSelection) { writeLineBreak(event); return; }
    if (PAIRS[event.key] && hasSelection && !event.isComposing) {
        event.preventDefault();
        const start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
        writeCodeRange(start, end, event.key + ui.ta.value.slice(start, end) + PAIRS[event.key], start + 1, end + 1);
    }
}

/**
 * Runs the shortcuts of the code: Undo, Redo, bold, italic, link, math, show the place in the
 * preview, comment. Returns whether the key was one (the caller stops then).
 * @param {KeyboardEvent} event - the key.
 * @returns {boolean} true when the key ran a shortcut.
 */
function runShortcut(event) {
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier) return false;
    const key = event.key;
    let run = null;
    if (!event.altKey && (key === 'z' || key === 'Z')) run = event.shiftKey ? redo : undo;
    else if (key === 'y') run = redo;
    else if (key === 'b') run = () => applyMarkSwitch('**');
    else if (key === 'i') run = () => applyMarkSwitch('*');
    else if (key === 'k') run = () => addNamedSnippet('link');
    else if (key === 'm') run = () => applyMarkSwitch('$');
    else if (key === 'Enter') run = () => showSourceMark({ always: true });
    else if (key === '/') run = applyCommentSwitch;
    if (!run) return false;
    event.preventDefault();
    run();
    return true;
}

/**
 * Tab and Shift+Tab: indents or outdents the selected lines; Tab at a cursor outside a list
 * item types two spaces.
 * @param {boolean} outdent - true for Shift+Tab.
 * @returns {void}
 */
function writeIndent(outdent) {
    const value = ui.ta.value, start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    const lineStart = getLineStartOf(value, start);
    if (start === end && !outdent && !/^\s*([-*+]|\d+[.)])\s/.test(value.slice(lineStart, start + 1) + ' ')) { writeCodeRange(start, end, INDENT); return; }
    const lineBreak = value.indexOf('\n', end - (end > start && value[end - 1] === '\n' ? 1 : 0));
    const lineEnd = lineBreak < 0 ? value.length : lineBreak;
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const out = lines.map(line => (outdent ? line.replace(/^ {1,2}|^\t/, '') : INDENT + line)).join('\n');
    writeCodeRange(lineStart, lineEnd, out, start === end ? Math.max(lineStart, start + out.length - (lineEnd - lineStart)) : lineStart, start === end ? undefined : lineStart + out.length);
}

/**
 * Enter at a cursor: goes on with a list (the next number, a new task box) or a quote, ends
 * either on an empty item or quote line, and keeps the line's indentation.
 * @param {KeyboardEvent} event - the key, whose default is prevented when the editor writes the line break.
 * @returns {void}
 */
function writeLineBreak(event) {
    const value = ui.ta.value, start = ui.ta.selectionStart;
    const lineStart = getLineStartOf(value, start);
    const before = value.slice(lineStart, start);
    const item = LIST_ITEM.exec(before);
    if (item) { event.preventDefault(); writeListLineBreak(item, lineStart); return; }
    const quote = /^(\s*(?:>\s?)+)(.*)$/.exec(before);
    if (quote) {
        event.preventDefault();
        if (!quote[2].trim()) { writeCodeRange(lineStart, start, '\n', lineStart + 1); return; }
        writeCodeRange(start, start, '\n' + quote[1]);
        return;
    }
    const indent = /^[ \t]*/.exec(before)[0];
    if (indent) { event.preventDefault(); writeCodeRange(start, start, '\n' + indent); }
}

/**
 * Enter in a list item: a new item with the next number (and an empty task box), or the end of
 * the list on an empty item.
 * @param {RegExpExecArray} item - the match of LIST_ITEM on the text before the cursor.
 * @param {number} lineStart - where the line starts.
 * @returns {void}
 */
function writeListLineBreak(item, lineStart) {
    const value = ui.ta.value, start = ui.ta.selectionStart;
    const lineEnd = value.indexOf('\n', start);
    if (!item[7].trim() && !value.slice(start, lineEnd < 0 ? value.length : lineEnd).trim()) {
        const keep = item[1].replace(/[ \t]+$/, '');
        writeCodeRange(lineStart, start, keep + '\n' + keep, lineStart + keep.length * 2 + 1);
        return;
    }
    const marker = item[3] ? `${+item[3] + 1}${item[4]}` : item[2];
    writeCodeRange(start, start, '\n' + item[1] + marker + item[5] + (item[6] ? '[ ] ' : ''));
}
