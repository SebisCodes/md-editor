/**
 * The Pictures tab: the pictures of the open document with their size and where the code uses
 * them ("used 2×" jumps there), the pictures the code asks for but that are missing ("Add file…"
 * stores one under that name), and per picture Insert, Rename (the references follow), Replace
 * (same name), Download and Remove. Its buttons keep the cursor in the code.
 */

import { state, ui, NARROW_SCREEN } from './state.js?v=2';
import { escapeHtml, saveFile } from './util.js?v=3';
import { getDataUrlBytes } from './assets.js?v=6';
import { getAssetName, isOutsideAddress } from './markdown.js?v=8';
import { showCodePosition } from './code-view.js?v=3';
import { showPane } from './layout.js?v=3';
import { addSnippet } from './code-edit.js?v=3';
import { addPicture, renamePicture, removePicture } from './pictures.js?v=3';
import { getPictureReferences, isReferenceTo, getAltText } from './picture-refs.js?v=3';

const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;
/** The types the file field offers. */
const PICTURE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf';
/** The size in pixels of each picture once loaded: "name|length" -> "640 × 480 px". */
const pictureSizes = {};
const pictureInput = document.createElement('input');

/**
 * Returns a size in KB or MB.
 * @param {number} bytes - the size.
 * @returns {string} at least "1 KB"; MB with one decimal from 1 MB.
 */
function formatSize(bytes) {
    return bytes < MEGABYTE ? `${Math.max(1, Math.round(bytes / KILOBYTE))} KB` : `${(bytes / MEGABYTE).toFixed(1)} MB`;
}

/**
 * Draws the Pictures tab: the header with the number and size of the pictures, the hint, the
 * missing pictures and a card per picture; the sizes in pixels follow once the pictures load.
 * @returns {void}
 */
export function renderPictures() {
    const box = ui.pictures;
    const pictures = Object.entries(state.assets);
    const references = getPictureReferences(state.code);
    const missing = [...new Set(references.filter(reference => reference.name && !isOutsideAddress(reference.name) && !getAssetName(state.assets, reference.name)).map(reference => reference.shown))];
    const total = pictures.reduce((sum, [, dataUrl]) => sum + getDataUrlBytes(dataUrl).length, 0);
    box.innerHTML = `
        <div class="picture-header"><button type="button" class="button primary" id="pic-add">Add pictures…</button>
            <span class="muted">${pictures.length ? `${pictures.length} ${pictures.length === 1 ? 'picture' : 'pictures'} · ${formatSize(total)}` : 'No pictures yet'}</span></div>
        <p class="hint">Pictures belong to “<span data-no-i18n>${escapeHtml(state.name)}</span>” and stay in your browser. Drop or paste them anywhere in the editor, or add them here; <code>![description](name)</code> uses them.</p>
        ${missing.length ? `<div class="missing-pictures"><h3>Missing in this document</h3><ul>${missing.map(renderMissingItem).join('')}</ul></div>` : ''}
        <ul class="picture-gallery">${pictures.map(([name, dataUrl]) => renderPictureCard(name, dataUrl, references)).join('')}</ul>`;
    showPictureSizes(box);
}

/**
 * Returns the list item of a picture the code asks for but the document does not have.
 * @param {string} name - the name in the code.
 * @returns {string} the HTML.
 */
function renderMissingItem(name) {
    return `<li><code data-no-i18n>${escapeHtml(name)}</code><button type="button" class="button small" data-pic-fill="${escapeHtml(name)}" title="Choose the file for ${escapeHtml(name)}">Add file…</button></li>`;
}

/**
 * Returns the preview of a picture in its card: the picture, or a label for a PDF or another file.
 * @param {string} name - the picture's name.
 * @param {string} dataUrl - its content.
 * @returns {string} the HTML.
 */
function renderPictureThumbnail(name, dataUrl) {
    if (/^data:application\/pdf[;,]/i.test(dataUrl)) return '<span class="picture-pdf">PDF</span>';
    if (/^data:image\//.test(dataUrl)) return `<img alt="" src="${escapeHtml(dataUrl)}" data-dim="${escapeHtml(name + '|' + dataUrl.length)}">`;
    return '<span class="picture-pdf">FILE</span>';
}

/**
 * Returns the card of a picture with its preview, name, size, uses and buttons.
 * @param {string} name - the picture's name.
 * @param {string} dataUrl - its content.
 * @param {import('./picture-refs.js').PictureReference[]} references - the pictures the code asks for.
 * @returns {string} the HTML.
 */
function renderPictureCard(name, dataUrl, references) {
    const used = references.filter(reference => isReferenceTo(reference.name, name)).length;
    const dimensions = pictureSizes[name + '|' + dataUrl.length];
    return `<li class="picture-card" data-name="${escapeHtml(name)}">
                <button type="button" class="picture-preview" data-pic="${escapeHtml(name)}" title="Insert ![…](${escapeHtml(name)}) at the cursor">${renderPictureThumbnail(name, dataUrl)}</button>
                <div class="picture-info"><code class="picture-title" title="${escapeHtml(name)}" data-no-i18n>${escapeHtml(name)}</code>
                    <small>${dimensions ? dimensions + ' · ' : ''}${formatSize(getDataUrlBytes(dataUrl).length)} · ${used ? `<button type="button" class="link-button" data-pic-show="${escapeHtml(name)}" title="Show where it is used">used ${used}×</button>` : 'not used yet'}</small></div>
                <div class="picture-actions">
                    <button type="button" class="button small" data-pic="${escapeHtml(name)}" title="![…](name) at the cursor">Insert</button>
                    <button type="button" class="button small" data-pic-ren="${escapeHtml(name)}" title="Rename - the code is changed along">Rename</button>
                    <button type="button" class="button small" data-pic-rep="${escapeHtml(name)}" title="Choose another file, keep the name">Replace</button>
                    <button type="button" class="button small" data-pic-dl="${escapeHtml(name)}" title="Download the picture">Download</button>
                    <button type="button" class="button small danger" data-pic-del="${escapeHtml(name)}" title="Remove the picture from this document">Remove</button>
                </div></li>`;
}

/**
 * Adds the size in pixels to each card once its picture has loaded (each size is measured once).
 * @param {HTMLElement} box - the Pictures tab.
 * @returns {void}
 */
function showPictureSizes(box) {
    for (const picture of box.querySelectorAll('img[data-dim]')) {
        const key = picture.dataset.dim;
        if (!pictureSizes[key]) picture.addEventListener('load', () => showPictureSize(picture, key), { once: true });
    }
}

/**
 * Notes the size of a loaded picture and writes it at the start of its card's line, once.
 * @param {HTMLImageElement} picture - the loaded picture of a card.
 * @param {string} key - the picture's key in pictureSizes.
 * @returns {void}
 */
function showPictureSize(picture, key) {
    pictureSizes[key] = `${picture.naturalWidth} × ${picture.naturalHeight} px`;
    const small = picture.closest('.picture-card')?.querySelector('small');
    if (small && !small.textContent.includes(' px')) small.insertAdjacentText('afterbegin', pictureSizes[key] + ' · ');
}

/**
 * Connects the buttons of the tab and the file field for adding pictures.
 * @returns {void}
 */
export function startPicturesPanel() {
    ui.pictures.addEventListener('mousedown', event => { if (event.target.closest('[data-pic]')) event.preventDefault(); });   // the code keeps its cursor
    ui.pictures.addEventListener('click', handlePictureClick);
    pictureInput.type = 'file';
    pictureInput.accept = PICTURE_ACCEPT;
    pictureInput.multiple = true;
    pictureInput.addEventListener('change', importChosenPictures);
}

/**
 * Runs a button of the tab (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handlePictureClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const data = button.dataset;
    if (button.id === 'pic-add') pictureInput.click();
    else if (data.pic) addSnippet(`![${getAltText(data.pic)}](${data.pic})‸`, false);
    else if (data.picShow) showPictureUse(data.picShow);
    else if (data.picRen) startPictureRename(button, data.picRen);
    else if (data.picRep || data.picFill) showFilePickerFor(data.picRep || data.picFill);
    else if (data.picDl) saveFile(new Blob([getDataUrlBytes(state.assets[data.picDl])]), data.picDl.replace(/^.*\//, ''));
    else if (data.picDel) removePicture(data.picDel);
}

/**
 * Shows the first place where the code uses a picture.
 * @param {string} name - the picture's name.
 * @returns {void}
 */
function showPictureUse(name) {
    const reference = getPictureReferences(state.code).find(item => isReferenceTo(item.name, name));
    if (!reference) return;
    if (NARROW_SCREEN.matches) showPane('code');
    showCodePosition(reference.nameAt, true, reference.nameAt + reference.name.length);
}

/**
 * Asks for one file to store under a name (replacing that picture, or filling a missing one).
 * @param {string} name - the name to store it under.
 * @returns {void}
 */
function showFilePickerFor(name) {
    pictureInput.dataset.into = name;
    pictureInput.multiple = false;
    pictureInput.click();
}

/**
 * Puts a field in place of a picture's name to rename it: Enter or leaving the field renames,
 * Escape keeps the old name.
 * @param {HTMLElement} button - the Rename button of the card.
 * @param {string} name - the picture's name.
 * @returns {void}
 */
function startPictureRename(button, name) {
    const title = button.closest('.picture-card').querySelector('.picture-title');
    const input = Object.assign(document.createElement('input'), { value: name.replace(/^.*\//, ''), className: 'picture-rename', spellcheck: false });
    input.setAttribute('aria-label', 'New name');
    title.replaceWith(input);
    input.focus();
    input.setSelectionRange(0, input.value.replace(/\.[a-z0-9]+$/i, '').length);
    let done = false;
    /**
     * Ends the rename once: renames with keep and a typed name, else draws the tab again.
     * @param {boolean} keep - true to rename.
     * @returns {void}
     */
    const stopRename = keep => {
        if (done) return;
        done = true;
        if (keep && input.value.trim()) renamePicture(name, input.value); else renderPictures();
    };
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); stopRename(true); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopRename(false); }
    });
    input.addEventListener('blur', () => stopRename(true));
}

/**
 * Stores the chosen files: one under the name it was chosen for, or each as a new picture
 * (inserted at the cursor when it is only one) (a change handler).
 * @returns {Promise<void>} settles when the pictures are stored.
 */
async function importChosenPictures() {
    const into = pictureInput.dataset.into;
    delete pictureInput.dataset.into;
    pictureInput.multiple = true;
    if (into && pictureInput.files[0]) await addPicture(pictureInput.files[0], false, into);
    else for (const file of pictureInput.files) await addPicture(file, pictureInput.files.length === 1);
    pictureInput.value = '';
}
