/**
 * What the AI prompt (ai.js) and the WebMCP tools (mcp.js) read and change in the editor: the
 * open document with its selection, pictures and problems, its headings, "My documents", and
 * text inserted or replaced in the code (each change one undo step).
 */

import { state, areas, ui, AI_DOCUMENT } from './state.js?v=2';
import { store } from './files.js?v=10';
import { setCode } from './history.js?v=3';
import { showCodePosition } from './code-view.js?v=3';
import { showSourceMark } from './preview.js?v=3';
import { getLineIndex, getLinePosition } from './text-position.js?v=2';
import { openDocument, createDocument } from './documents.js?v=3';
import { getAppendedCode } from './incoming.js?v=3';

/**
 * Returns the document for the AI prompt and the agent.
 * @returns {object} code, name, files, pictures, selection (sel), problems with their lines and
 *   the page's context (PromptState in ai-prompt.js without framed and remote).
 */
export function getPromptState() {
    return {
        code: state.code, name: state.name, files: store.getSortedEntries().map(entry => entry.name), pictures: Object.keys(state.assets),
        sel: state.code.slice(ui.ta.selectionStart, ui.ta.selectionEnd),
        problems: (state.result?.problems || []).map(problem => `line ${getLineIndex(problem.pos) + 1}: ${problem.msg}`),
        context: areas.sync?.getContext() || null,
    };
}

/**
 * Returns the problems with their lines, for the agent.
 * @returns {Array<{pos: number, kind: string, msg: string, line: number}>} the problems, line 1-based.
 */
export function getProblemList() {
    return (state.result?.problems || []).map(problem => ({ ...problem, line: getLineIndex(problem.pos) + 1 }));
}

/**
 * Returns the headings with their lines, for the agent.
 * @returns {Array<{level: number, title: string, pos: number, id: string, line: number}>} the headings, line 1-based.
 */
export function getOutlineList() {
    return (state.result?.outline || []).map(entry => ({ ...entry, line: getLineIndex(entry.pos) + 1 }));
}

/**
 * Returns the documents of "My documents", the most recently changed first.
 * @returns {Array<{name: string, updated: number, open: boolean}>} name, last change and whether it is open.
 */
export function getFileList() {
    return store.getSortedEntries().map(entry => ({ name: entry.name, updated: entry.updated, open: entry.id === state.fileId }));
}

/**
 * Opens a document by name. Returns whether there is one (the agent is told).
 * @param {string} name - the document's name.
 * @returns {boolean} true when the document is open.
 */
export function openFileByName(name) {
    const entry = store.findByName(name);
    if (entry && entry.id !== state.fileId) openDocument(entry.id);
    return !!entry;
}

/**
 * Makes a new document and opens it. A command that creates an item and returns the name it
 * got, which the agent is told.
 * @param {string} name - the wanted name; "AI document" when empty.
 * @param {string} [code] - the Markdown; empty when left out.
 * @returns {string|null} the document's name, null when the browser storage is full.
 */
export function createFile(name, code) {
    return createDocument(name || AI_DOCUMENT, code || '') && state.name;
}

/**
 * Inserts Markdown at the end, at the cursor, or after the heading with a title (as its own
 * paragraph). Returns whether the place was found (the agent is told).
 * @param {string} text - the Markdown.
 * @param {string} where - "end", "cursor" or the title of a heading.
 * @returns {boolean} true when the text is inserted.
 */
export function addMarkdown(text, where) {
    let code;
    if (where === 'cursor') { const at = ui.ta.selectionStart; code = state.code.slice(0, at) + text + state.code.slice(at); }
    else if (where === 'end') code = getAppendedCode(state.code, text);
    else {
        const heading = (state.result?.outline || []).find(entry => entry.title.trim().toLowerCase() === where.trim().toLowerCase());
        if (!heading) return false;
        const lineBreak = state.code.indexOf('\n', heading.pos);
        const at = lineBreak < 0 ? state.code.length : lineBreak + 1;
        code = state.code.slice(0, at).replace(/\n*$/, '\n\n') + text.trim() + '\n\n' + state.code.slice(at).replace(/^\n+/, '');
    }
    setCode(code);
    return true;
}

/**
 * Replaces an exact piece of the code (the first match, or every match). The work of the
 * WebMCP tool replace_text, which returns the number of replaced places the tool sends back to
 * the agent.
 * @param {string} find - the text to find.
 * @param {string} replacement - the new text.
 * @param {boolean} all - true to replace every match.
 * @returns {number} the number of replaced places, 0 when the text is not there.
 */
export function updateText(find, replacement, all) {
    if (!find) return 0;
    const count = state.code.split(find).length - 1;
    if (!count) return 0;
    setCode(all ? state.code.split(find).join(replacement) : state.code.replace(find, () => replacement));
    return all ? count : 1;
}

/**
 * Shows a line of the code and its place in the preview.
 * @param {number} line - the line, 1-based.
 * @returns {void}
 */
export function showAgentLine(line) {
    showCodePosition(getLinePosition(line));
    showSourceMark({ always: true });
}
