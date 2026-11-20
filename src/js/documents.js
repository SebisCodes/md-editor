/**
 * The documents of "My documents" in the editor: opening one (each keeps its own undo history
 * and its pictures while the page is open), making a new one from the New menu or a template,
 * starting one over, and the "My documents" dialog with its renaming and deleting.
 */

import { START, TEMPLATES } from './samples.js?v=3';
import { openConfirmation } from './dialogs.js?v=5';
import { store } from './files.js?v=10';
import { assets } from './assets.js?v=6';
import { createFilesDialog } from './files-dialog.js?v=3';
import {
    state, areas, ui, NARROW_SCREEN, DEFAULT_NAME, STORAGE_FULL, STORAGE_FULL_FIRST, historyByDocument, getElement, getElements, showToast,
} from './state.js?v=2';
import { setCode, addHistoryStep, updateHistoryButtons, undo, redo } from './history.js?v=3';
import { saveToStorage } from './storage.js?v=3';
import { renderPreview } from './preview.js?v=3';
import { showCodePosition } from './code-view.js?v=3';
import { stopTextEdit } from './inplace.js?v=3';
import { showFilePicker } from './file-import.js?v=3';

const newButton = getElement('#btn-new'), newMenu = getElement('#new-menu');
/** An empty document. */
const BLANK = '';

/**
 * Shows the open document's name in the bar, in the tooltip of "My documents" and in the New menu.
 * @returns {void}
 */
export function showFileName() {
    getElement('#file-name').textContent = state.name;
    getElement('#btn-files').title = `"${state.name}" is open. My documents: open, rename, duplicate or delete your documents (Ctrl+O)`;
    getElement('#new-restart b').textContent = `Start "${state.name}" over`;
}

/**
 * Opens a document from "My documents". The document that is closed keeps the text being
 * edited on the page, the edits still waiting for the autosave and its undo history.
 * @param {string} id - the document's id.
 * @param {string} [code] - its code, when the caller has it (else it is read from storage).
 * @returns {void}
 */
export function openDocument(id, code) {
    clearTimeout(state.histTimer);
    stopTextEdit(true);
    if (state.saveTimer) { clearTimeout(state.saveTimer); saveToStorage(); }
    if (state.fileId) { addHistoryStep(); historyByDocument.set(state.fileId, { history: state.history, future: state.future }); }
    code ??= store.code(id) ?? BLANK;
    const kept = historyByDocument.get(id);
    state.fileId = id;
    state.name = store.getEntry(id)?.name || DEFAULT_NAME;
    state.savedCode = code;
    state.history = kept ? kept.history : [];
    state.future = kept ? kept.future : [];
    state.assets = assets.getCached(id);
    showOpenedCode(code);
    assets.get(id).then(pictures => { if (state.fileId === id && pictures !== state.assets) { state.assets = pictures; renderPreview(); } });
}

/**
 * Shows the code of a document that is opened, from its start.
 * @param {string} code - the code.
 * @returns {void}
 */
function showOpenedCode(code) {
    ui.ta.value = code;
    ui.ta.scrollTop = 0;
    ui.ta.setSelectionRange(0, 0);
    ui.scroller.scrollTop = 0;
    setCode(code, { history: false });
    addHistoryStep();
    updateHistoryButtons();
    showFileName();
    areas.files.render();
    areas.sync?.updateUi();
}

/**
 * Creates a document in "My documents" with its pictures and opens it, the cursor at its end.
 * A command that returns the new id, as the callers need it.
 * @param {string} name - the wanted name.
 * @param {string} code - the code.
 * @param {Object<string, string>} [pictures] - its pictures by name.
 * @param {boolean} [inMemory] - keep it in memory only (a page's document), never stored.
 * @returns {string|null} the new id, null when the browser storage is full.
 */
export function createDocument(name, code, pictures, inMemory = false) {
    let id;
    try { id = store.create(name, code, inMemory); } catch (e) {
        showToast(STORAGE_FULL_FIRST);
        return null;
    }
    if (pictures && Object.keys(pictures).length) assets.set(id, pictures);
    openDocument(id, code);
    if (!NARROW_SCREEN.matches) setTimeout(() => showCodePosition(code.length), 0);
    return id;
}

/**
 * Empties the open document after asking; its pictures stay, Undo brings the text back.
 * @returns {Promise<void>} settles when the document is emptied or left as it is.
 */
async function resetDocument() {
    if (!state.code.trim()) { showToast('This document is empty already'); return; }
    const forId = state.fileId;
    if (!await openConfirmation({
        title: `Start "${state.name}" over?`,
        text: 'Everything is removed; the pictures of the document stay. "Undo" brings the text back as long as the page is open.',
        ok: 'Start over',
    })) return;
    if (state.fileId !== forId) return;                   // another document was opened while the question was open
    setCode(BLANK);
    showCodePosition(0);
    showToast(`"${state.name}" is empty now - "Undo" brings it back`);
}

/**
 * Runs a choice of the New menu: a blank document, a template, the welcome example, or
 * starting the open document over.
 * @param {string} kind - "blank", "restart", "example" or a key of TEMPLATES.
 * @returns {void}
 */
function openNewDocument(kind) {
    if (kind === 'restart') { resetDocument(); return; }
    const template = kind === 'example' ? START : TEMPLATES[kind];
    if (createDocument(template ? template.name : DEFAULT_NAME, template ? template.code : BLANK)) showToast(`New document "${state.name}" - your other documents are under "My documents"`);
}

/**
 * Connects the "My documents" dialog (files-dialog.js) to the editor.
 * @returns {object} the dialog's API: open and render.
 */
export function createDocumentsDialog() {
    return createFilesDialog({
        getCurrent: () => ({ id: state.fileId, name: state.name, code: state.code }),
        openDocument: id => { openDocument(id); showToast(`"${state.name}" opened`); },
        openNew: openNewDocument,
        renameDocument,
        onRemoved: closeRemovedDocument,
        showFilePicker,
        showToast,
    });
}

/**
 * Gives a document a new name.
 * @param {string} id - the document's id.
 * @param {string} name - the new name.
 * @returns {void}
 */
function renameDocument(id, name) {
    try { store.save(id, { name }); } catch (e) { showToast(STORAGE_FULL); return; }
    if (id === state.fileId) { state.name = name; showFileName(); areas.sync?.handleChange(); }
}

/**
 * Forgets the undo history of a deleted document; when it was open, opens the most recent
 * other one, or a new empty document.
 * @param {string} id - the deleted document's id.
 * @returns {void}
 */
function closeRemovedDocument(id) {
    historyByDocument.delete(id);
    if (id !== state.fileId) return;
    state.fileId = '';
    const next = store.getSortedEntries()[0];
    if (next) openDocument(next.id);
    else createDocument(DEFAULT_NAME, BLANK);
}

/**
 * Opens or closes the New menu; the first choice gets the focus when it opens.
 * @param {boolean} [open] - true to open; the opposite of its state when left out.
 * @returns {void}
 */
export function setNewMenuOpen(open = newMenu.hidden) {
    newMenu.hidden = !open;
    newButton.setAttribute('aria-expanded', open);
    if (open) newMenu.querySelector('button').focus();
}

/**
 * Tells whether the New menu is open.
 * @returns {boolean} true while it is open.
 */
export function isNewMenuOpen() {
    return !newMenu.hidden;
}

/**
 * Opens the template of the New menu entry that was clicked and closes the menu (a click handler).
 * @param {MouseEvent} event - the click in the menu.
 * @returns {void}
 */
function openNewDocumentFromMenu(event) {
    const choice = event.target.closest('[data-new]');
    if (!choice) return;
    setNewMenuOpen(false);
    openNewDocument(choice.dataset.new);
}

/**
 * Connects the New menu, "My documents", Undo and Redo in the bar.
 * @returns {void}
 */
export function startDocumentButtons() {
    newButton.addEventListener('click', () => setNewMenuOpen());
    newMenu.addEventListener('click', openNewDocumentFromMenu);
    newMenu.addEventListener('keydown', moveInNewMenu);
    document.addEventListener('pointerdown', event => { if (!newMenu.hidden && !event.target.closest('#new-menu, #btn-new')) setNewMenuOpen(false); });
    getElement('#btn-files').addEventListener('click', () => areas.files.open());
    getElement('#btn-undo').addEventListener('click', undo);
    getElement('#btn-redo').addEventListener('click', redo);
}

/**
 * Moves the focus in the New menu with the arrow keys; Escape closes it (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function moveInNewMenu(event) {
    const items = getElements('button', newMenu), index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    if (event.key === 'Escape') { event.stopPropagation(); setNewMenuOpen(false); newButton.focus(); }
}
