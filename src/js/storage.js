/**
 * Storing the open document and the settings in this browser. The settings (the open
 * document's id, the split between code and preview and the text size of the preview) go to
 * mdeditor.v1, the document itself to its file in "My documents" (files.js), its pictures to
 * IndexedDB (assets.js).
 *
 * Two tabs on one document: a tab whose document was changed in another tab while it had edits
 * of its own keeps both versions; a hidden tab without edits of its own shows the other tab's.
 */

import { state, areas, SETTINGS_KEY, showToast } from './state.js?v=2';
import { store } from './files.js?v=10';
import { assets } from './assets.js?v=6';
import { showFileName } from './documents.js?v=3';
import { setCode } from './history.js?v=3';

/** The message shown when the browser storage is full while a document is stored. */
const STORAGE_FULL_DOWNLOAD = 'The browser storage is full - download and delete documents under "My documents"';
let storageFullShown = false;

/**
 * The settings stored in this browser.
 * @typedef {object} Settings
 * @property {string} file - the id of the open document.
 * @property {number} split - the share of the width the code takes.
 * @property {number} size - the text size of the preview.
 */

/**
 * Stores the settings and, when it changed, the open document's code. When another tab changed
 * the document since this tab read or saved it, both versions are kept. Storage that is blocked
 * or full leaves the editor working without a saved draft.
 * @returns {void}
 */
export function saveToStorage() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ file: state.fileId, split: state.split, size: state.size })); } catch (e) { /* Storage blocked or full: the editor keeps working without a saved draft. */ }
    if (!state.fileId || state.code === state.savedCode) return;
    try {
        const stored = store.code(state.fileId);
        if (stored != null && stored !== state.savedCode && stored !== state.code) { saveBothVersions(); return; }
        store.save(state.fileId, { code: state.code });
        state.savedCode = state.code;
    } catch (e) {
        if (!storageFullShown) showToast(STORAGE_FULL_DOWNLOAD);
        storageFullShown = true;
    }
}

/**
 * Keeps this tab's version of a document that another tab changed meanwhile as a document of
 * its own (with a free name and a copy of the pictures); the other tab's version stays as it is.
 * @returns {void}
 */
function saveBothVersions() {
    const formerName = state.name, formerId = state.fileId;
    let id;
    try { id = store.create(formerName, state.code); } catch (e) { showToast(STORAGE_FULL_DOWNLOAD); return; }
    state.fileId = id;
    state.name = store.getEntry(id)?.name || formerName;
    state.savedCode = state.code;
    assets.copy(formerId, id);
    showFileName();
    areas.files.render();
    areas.sync?.updateUi();
    saveToStorage();
    showToast(`"${formerName}" was changed in another tab - your version here is kept as "${state.name}"`);
}

/**
 * Returns the stored settings.
 * @returns {Settings|null} the settings, null when none are stored or the storage is blocked.
 */
export function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { return null; }
}

/**
 * Follows the documents other tabs store.
 * @returns {void}
 */
export function startStorageSync() {
    addEventListener('storage', showOtherTabVersion);
}

/**
 * Shows the version of the open document that another tab saved, in a tab that is not on
 * screen and has no edits of its own: what the user is looking at never changes by itself (a
 * storage handler).
 * @param {StorageEvent} event - the change in the storage.
 * @returns {void}
 */
function showOtherTabVersion(event) {
    if (!state.fileId || !event.key || !event.key.endsWith(state.fileId) || event.newValue == null || store.isInMemory(state.fileId)) return;
    const stored = store.code(state.fileId);
    if (stored == null || stored === state.code || state.code !== state.savedCode || document.visibilityState !== 'hidden') return;
    state.savedCode = stored;
    setCode(stored);
}
