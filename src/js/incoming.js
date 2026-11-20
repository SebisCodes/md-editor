/**
 * Documents that arrive: from AI links and WebMCP agents (ai.js, mcp.js), and from the page
 * around the editor or ?src= (sync.js). A page's document never takes the place of one of the user's own.
 */

import { state, ui, AI_DOCUMENT, showToast } from './state.js?v=2';
import { VIEWER } from './sync.js?v=23';
import { store } from './files.js?v=10';
import { assets } from './assets.js?v=6';
import { setCode } from './history.js?v=3';
import { renderPreview } from './preview.js?v=3';
import { openDocument, createDocument } from './documents.js?v=3';
import { stopTextEdit } from './inplace.js?v=3';

/**
 * Which document a link or an agent means.
 * @typedef {object} DocumentTarget
 * @property {string} [file] - "new" for a new document, a name for that document (made when
 *   there is none), empty for the open one.
 * @property {string} [name] - the name of a new document.
 */

/**
 * A document from the page around the editor or from ?src= (sync.js's load).
 * @typedef {object} ExternalDocument
 * @property {string} name - its name.
 * @property {string} content - its Markdown.
 * @property {Object<string, string>} [assets] - its pictures by name.
 * @property {boolean} [replaceAssets] - true when the pictures are the whole set (what the page removed must not come back).
 * @property {string} [into] - the id of the page's document to replace.
 * @property {boolean} [asNew] - true to make a new document always.
 * @property {string} [page] - the origin of the page.
 * @property {boolean} [temp] - true for a document kept in memory only, never stored.
 */

/**
 * Returns code with text added at the end, after an empty line.
 * @param {string} code - the code.
 * @param {string} text - the text to add.
 * @returns {string} the code with the text and a line break at the end.
 */
export function getAppendedCode(code, text) {
    return (code.trim() ? code.replace(/\s*$/, '\n\n') : '') + text.trim() + '\n';
}

/**
 * Takes a document from an AI: into the document the link names (no question; Undo takes it
 * back), or a new one. Writes into the code before its first await, so a caller sees the new
 * problems right after the call.
 * @param {string} text - the Markdown.
 * @param {string} mode - "add" to add the text at the end; anything else replaces the document.
 * @param {DocumentTarget} [target] - which document.
 * @returns {Promise<void>} settles when the document is in the editor.
 */
export async function receiveDocument(text, mode, target = {}) {
    const wanted = String(target.file || '').trim();
    const isNew = wanted.toLowerCase() === 'new';
    const entry = isNew ? null : wanted ? store.findByName(wanted) : store.getEntry(state.fileId);
    stopTextEdit(true);
    if (!entry) {
        if (createDocument(isNew ? target.name || AI_DOCUMENT : wanted || AI_DOCUMENT, mode === 'add' ? getAppendedCode('', text) : text)) VIEWER || showToast(`New document "${state.name}" from the AI - your other documents are unchanged`);
        return;
    }
    if (entry.id !== state.fileId) openDocument(entry.id);
    setCode(mode === 'add' ? getAppendedCode(state.code, text) : text);
    const count = state.result.problems.length;
    VIEWER || showToast(count ? `Document received - the preview found ${count} ${count === 1 ? 'problem' : 'problems'}, see above the code` : `"${state.name}" changed by the AI - "Undo" takes it back`);
}

/**
 * Takes a document from the page around the editor or from ?src=: it replaces the document of
 * that name that came from the same page (one undo step) or becomes a new document.
 * @param {ExternalDocument} external - the document.
 * @returns {Promise<void>} settles when the document is open.
 */
export async function importExternalDocument({ name, content, assets: pictures, replaceAssets, into, asNew, page, temp }) {
    stopTextEdit(false);
    const entry = asNew ? null : (into && store.getEntry(into)) || store.list().find(item => item.name === name && item.page && item.page === page && !!item.temp === !!temp);
    if (entry) await updatePageDocument(entry, content, pictures, replaceAssets);
    else {
        const id = createDocument(name, content, pictures, !!temp);
        if (id && page) try { store.setEntryFields(id, { page }); } catch (e) { /* storage full: it just is not recognized next time */ }
        if (id && pictures) { state.assets = pictures; renderPreview(); }
    }
    ui.ta.setSelectionRange(0, 0);
    ui.ta.scrollTop = 0;
    ui.scroller.scrollTop = 0;
}

/**
 * Writes a page's document anew: its pictures (the whole set, or added to the ones it has), and
 * its code as one undo step.
 * @param {import('./files.js').FileEntry} entry - the page's document.
 * @param {string} content - its new Markdown.
 * @param {Object<string, string>} [pictures] - its pictures by name.
 * @param {boolean} [replaceAssets] - true when the pictures are the whole set.
 * @returns {Promise<void>} settles when the document is open with its pictures.
 */
async function updatePageDocument(entry, content, pictures, replaceAssets) {
    if (replaceAssets) await assets.set(entry.id, { ...(pictures || {}) });
    else if (pictures && Object.keys(pictures).length) await assets.set(entry.id, { ...(await assets.get(entry.id)), ...pictures });
    if (entry.id !== state.fileId) openDocument(entry.id);
    state.assets = await assets.get(entry.id);
    if (content !== state.code) setCode(content); else renderPreview();
}
