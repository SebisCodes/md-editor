/**
 * Changes of the code at the cursor from buttons and shortcuts: replacing a range as if typed,
 * marks around the selection, snippets, footnotes and HTML comments. Each change is one undo step.
 */

import { state, ui } from './state.js?v=2';
import { setCode, addHistoryStep, addPendingHistoryStep } from './history.js?v=3';
import { showCodePosition } from './code-view.js?v=3';
import { showSourceMark } from './preview.js?v=3';
import { getLineStartOf } from './text-position.js?v=2';

/** Where the cursor goes in a snippet. */
const CURSOR_MARK = '‸';
/** What the selected text replaces in a snippet. */
const SELECTION_MARK = '§';

/**
 * Replaces a range of the code as if it was typed: execCommand keeps the edit in the browser's
 * own undo and assistive tech; the fallback sets the text directly and reports the input.
 * @param {number} start - the start of the range.
 * @param {number} end - the end of the range.
 * @param {string} text - the new text.
 * @param {number} [selectionStart] - where the cursor (or selection) goes afterwards.
 * @param {number} [selectionEnd] - the end of the selection afterwards.
 * @returns {void}
 */
export function writeCodeRange(start, end, text, selectionStart, selectionEnd) {
    const ta = ui.ta;
    if (document.activeElement !== ta) ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, end);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
        ta.setRangeText(text, start, end, 'end');
        ta.dispatchEvent(new Event('input'));
    }
    if (selectionStart != null) ta.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
}

/**
 * Puts marks around the selection (**bold**), or takes them away when they are there (around
 * it or inside it).
 * @param {string} open - the opening mark.
 * @param {string} [close] - the closing mark; the opening one when left out.
 * @returns {void}
 */
export function applyMarkSwitch(open, close = open) {
    addPendingHistoryStep();
    const code = state.code, start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    const selection = code.slice(start, end);
    const isBoldAround = open === '*' && code[start - 2] === '*' && code.slice(start - 3, start) !== '***';
    if (code.slice(start - open.length, start) === open && code.slice(end, end + close.length) === close && !isBoldAround) {
        writeCodeRange(start - open.length, end + close.length, selection, start - open.length, end - open.length);
    } else if (selection.startsWith(open) && selection.endsWith(close) && selection.length >= open.length + close.length) {
        writeCodeRange(start, end, selection.slice(open.length, selection.length - close.length), start, end - open.length - close.length);
    } else writeCodeRange(start, end, open + selection + close, start + open.length, start + open.length + selection.length);
    addHistoryStep();
}

/**
 * Inserts a snippet at the cursor: "‸" marks where the cursor goes, "§" stands for the
 * selected text. A block snippet stands on its own lines with an empty line before and after.
 * Without a cursor in the code the snippet goes at the end.
 * @param {string} snippet - the snippet.
 * @param {boolean} [isBlock] - true for a block snippet.
 * @returns {void}
 */
export function addSnippet(snippet, isBlock = false) {
    addPendingHistoryStep();
    const ta = ui.ta, code = state.code;
    let start = ta.selectionStart, end = ta.selectionEnd;
    if (document.activeElement !== ta && start === 0 && end === 0 && code.trim()) start = end = code.length;
    let text = snippet.replace(SELECTION_MARK, code.slice(start, end) || '');
    if (isBlock) text = getBlockSnippet(code, start, end, text);
    let cursor = text.indexOf(CURSOR_MARK);
    text = text.replace(CURSOR_MARK, '');
    if (cursor < 0) cursor = text.length;
    writeCodeRange(start, end, text, start + cursor);
    addHistoryStep();
    showSourceMark();
}

/**
 * Returns a block snippet with the line breaks it needs to stand on its own lines with an
 * empty line before and after.
 * @param {string} code - the code.
 * @param {number} start - where the snippet goes.
 * @param {number} end - the end of the selection it replaces.
 * @param {string} text - the snippet.
 * @returns {string} the snippet with line breaks before and after.
 */
function getBlockSnippet(code, start, end, text) {
    const lineStart = getLineStartOf(code, start);
    const before = code.slice(0, start);
    if (code.slice(lineStart, start).trim()) text = '\n\n' + text;
    else if (lineStart > 0 && before.slice(0, lineStart - 1).trim() && !/\n\s*\n$/.test(before)) text = '\n' + text;
    const lineEnd = code.indexOf('\n', end);
    const after = code.slice(end, lineEnd < 0 ? code.length : lineEnd);
    if (after.trim()) text += '\n\n';
    else if (code.slice(end).trim() && !/^[^\n]*\n\s*\n/.test(code.slice(end))) text += '\n';
    return text;
}

/**
 * Adds a footnote: the mark [^n] (the first free number) at the cursor, the note at the end of
 * the document, and puts the cursor on the note.
 * @returns {void}
 */
export function addFootnote() {
    const used = new Set([...state.code.matchAll(/\[\^(\d+)\]/g)].map(match => +match[1]));
    let number = 1;
    while (used.has(number)) number++;
    const ta = ui.ta;
    let at = ta.selectionEnd;
    if (document.activeElement !== ta && at === 0) at = state.code.replace(/\s*$/, '').length;
    const marked = state.code.slice(0, at) + `[^${number}]` + state.code.slice(at);
    const code = marked.replace(/\s*$/, '') + `\n\n[^${number}]: `;
    addPendingHistoryStep();
    setCode(code);
    showCodePosition(code.length);
}

/**
 * Puts the selected lines into an HTML comment <!-- … -->, or takes them out of one.
 * @returns {void}
 */
export function applyCommentSwitch() {
    const ta = ui.ta, value = ta.value, start = ta.selectionStart, end = ta.selectionEnd;
    const lineStart = getLineStartOf(value, start);
    const lineBreak = value.indexOf('\n', end - (end > start && value[end - 1] === '\n' ? 1 : 0));
    const lineEnd = lineBreak < 0 ? value.length : lineBreak;
    const lines = value.slice(lineStart, lineEnd);
    const comment = /^<!--\s?([\s\S]*?)\s?-->$/.exec(lines.trim());
    const out = comment ? comment[1] : `<!-- ${lines} -->`;
    writeCodeRange(lineStart, lineEnd, out, lineStart, lineStart + out.length);
}
