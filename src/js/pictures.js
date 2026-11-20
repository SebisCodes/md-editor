/**
 * The pictures of the open document: adding one (from a file, a drop or a paste), renaming one
 * with the references in the code (one undo step), removing one, and where they are stored.
 *
 * Each change belongs to the document it started on: when another document is opened while a
 * picture is being stored, only the document the change started on gets it.
 */

import { state, areas, showToast } from './state.js?v=2';
import { store } from './files.js?v=10';
import { assets, getFreeName, readAsDataUrl } from './assets.js?v=6';
import { openConfirmation } from './dialogs.js?v=5';
import { getAssetName } from './markdown.js?v=8';
import { setCode } from './history.js?v=3';
import { renderPreview } from './preview.js?v=3';
import { renderPictures } from './pictures-panel.js?v=3';
import { addSnippet } from './code-edit.js?v=3';
import { getPictureReferences, isReferenceTo, getAltText } from './picture-refs.js?v=3';

/** The types a picture of the document can have. */
const PICTURE_TYPES = /^(image\/(png|jpeg|gif|webp|svg\+xml)|application\/pdf)$/;
/** The largest picture a document takes, in bytes. */
const MAX_PICTURE_SIZE = 12 * 1024 * 1024;
const DEFAULT_PICTURE_NAME = 'picture.png';
/** How often the user is told that a picture could not be stored, at most, in milliseconds. */
const NOT_STORED_INTERVAL = 60000;
let notStoredShownAt = 0;

/**
 * Keeps the pictures of documents from a page (and in the viewer) in memory like the
 * documents, and tells the user (at most once a minute) when a picture could not be stored: it
 * is kept until the page closes.
 * @param {boolean} isViewer - true in the viewer, which stores nothing.
 * @returns {void}
 */
export function startPictureStorage(isViewer) {
    assets.setMemoryOnlyRule(id => isViewer || store.isInMemory(id));
    assets.setNotStoredHandler(showPictureNotStored);
}

/**
 * Tells the user that a picture could not be stored, at most once a minute.
 * @returns {void}
 */
function showPictureNotStored() {
    const now = Date.now();
    if (now - notStoredShownAt < NOT_STORED_INTERVAL) return;
    notStoredShownAt = now;
    showToast('The picture could not be stored in this browser (storage full or blocked) - it is kept only until the page is closed: download the document to keep it');
}

/**
 * Stores a picture with the open document.
 * @param {File} file - the picture: PNG, JPEG, GIF, WebP, SVG or PDF, at most 12 MB.
 * @param {boolean} insert - true to add ![…](name) at the cursor.
 * @param {string} [as] - the name to store it under (replacing that picture, or one the code asks for).
 * @returns {Promise<void>} settles when the picture is stored.
 */
export async function addPicture(file, insert, as) {
    const id = state.fileId;
    if (!PICTURE_TYPES.test(file.type)) { showToast('Pictures can be PNG, JPG, GIF, WebP, SVG or PDF'); return; }
    if (file.size > MAX_PICTURE_SIZE) { showToast('The picture is larger than 12 MB'); return; }
    const dataUrl = await readAsDataUrl(file);
    const pictures = state.fileId === id ? state.assets : assets.getCached(id);
    const name = as ? (getAssetName(pictures, as) || as) : getFreeName(pictures, (file.name || DEFAULT_PICTURE_NAME).toLowerCase());
    const added = await assets.add(id, name, dataUrl);
    // Another document was opened meanwhile: the picture stays with the document it was added to.
    if (state.fileId !== id) return;
    state.assets = added;
    renderPictures();
    if (insert) addSnippet(`![${getAltText(name)}](${name})‸`, false);
    renderPreview();
    showToast(as ? `"${name}" now shows the new picture` : `Picture "${name}" added to "${state.name}"`);
    areas.sync?.handleChange();
}

/**
 * Gives a picture a new name (a free one, with the old extension when none is typed); the
 * code's references follow in one undo step.
 * @param {string} oldName - the picture's name.
 * @param {string} wanted - the typed name.
 * @returns {Promise<void>} settles when the picture is renamed.
 */
export async function renamePicture(oldName, wanted) {
    const name = getNewPictureName(oldName, wanted);
    if (name === oldName) { renderPictures(); return; }
    const pictures = {};
    for (const [key, dataUrl] of Object.entries(state.assets)) pictures[key === oldName ? name : key] = dataUrl;
    const id = state.fileId, start = state.code;
    let code = start;
    for (const reference of getPictureReferences(state.code).filter(item => isReferenceTo(item.name, oldName)).reverse()) code = code.slice(0, reference.nameAt) + name + code.slice(reference.nameAt + reference.name.length);
    await assets.set(id, pictures);
    // Another document was opened meanwhile: only the document the rename started on changes.
    if (state.fileId !== id) {
        if (code !== start) try { store.save(id, { code }); } catch (e) { /* storage full */ }
        return;
    }
    state.assets = pictures;
    if (code !== state.code) {
        setCode(code);
        state.history[state.history.length - 1].rename = [oldName, name];
    } else renderPreview();
    renderPictures();
    areas.sync?.handleChange();
    showToast(`"${oldName}" is now "${name}"`);
}

/**
 * Returns the name a rename gives a picture: in its folder, in lower case, with the old
 * extension when none is typed, and free among the other pictures.
 * @param {string} oldName - the picture's name.
 * @param {string} wanted - the typed name.
 * @returns {string} the new name.
 */
function getNewPictureName(oldName, wanted) {
    const others = { ...state.assets };
    delete others[oldName];
    const folder = oldName.includes('/') ? oldName.slice(0, oldName.lastIndexOf('/') + 1) : '';
    let typed = wanted.trim().toLowerCase();
    if (!/\.[a-z0-9]+$/i.test(typed)) typed += (/(\.[a-z0-9]+)$/i.exec(oldName) || ['', ''])[1];
    return folder + getFreeName(others, typed.replace(/^.*\//, ''));
}

/**
 * Removes a picture from the open document after asking; places that use it show its name in a frame.
 * @param {string} name - the picture's name.
 * @returns {Promise<void>} settles when it is removed or kept.
 */
export async function removePicture(name) {
    if (!await openConfirmation({ title: `Remove "${name}"?`, text: 'The picture is removed from this document. Places that use it show its name in a frame. "Undo" does not bring it back.', ok: 'Remove' })) return;
    const id = state.fileId;
    const left = await assets.remove(id, name);
    if (state.fileId !== id) return;
    state.assets = left;
    renderPictures();
    renderPreview();
    areas.sync?.handleChange();
}
