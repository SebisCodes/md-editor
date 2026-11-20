/**
 * Opening files: with the Open button, by dropping them on the page and by pasting a picture.
 * .md files become new documents; pictures go into the open document; a ZIP with a .md and
 * pictures (stored or deflated) becomes one document whose pictures keep their paths relative
 * to the .md file. A picture dropped onto the code goes where it was dropped.
 */

import { state, ui, TYPING_FIELDS, DEFAULT_NAME, getElement, showToast } from './state.js?v=2';
import { readAsDataUrl } from './assets.js?v=6';
import { renderPreview } from './preview.js?v=3';
import { createDocument } from './documents.js?v=3';
import { addPicture } from './pictures.js?v=3';
import { readZipEntries, createUnpacker } from './zip-read.js?v=2';

/** The largest text file that is opened, in bytes. */
const MAX_TEXT_SIZE = 8 * 1024 * 1024;
const MARKDOWN_FILE = /\.(md|markdown|mdown|mkd|txt)$/i;
/** Files a ZIP holds that are not the user's: hidden files and macOS folders. */
const HIDDEN_ENTRY = /(^|\/)(\.|__MACOSX)/;
/** The .md file a ZIP opens when it has several: a README or index, else the one least deep. */
const MAIN_ENTRY = /(^|\/)(readme|index)\.md$/i;
/** The media types of the pictures a ZIP can hold, by extension. */
const PICTURE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf' };
/** The name a browser gives a pasted picture without a name of its own. */
const PASTED_NAME = 'image.png';

const fileInput = getElement('#file');
let dragDepth = 0;

/**
 * Asks for files to open.
 * @returns {void}
 */
export function showFilePicker() {
    fileInput.click();
}

/**
 * Connects the Open button, dropping files on the page and pasting pictures.
 * @returns {void}
 */
export function startFileImport() {
    getElement('#btn-open').addEventListener('click', showFilePicker);
    fileInput.addEventListener('change', async () => { await importFiles([...fileInput.files]); fileInput.value = ''; });
    window.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { dragDepth++; document.body.classList.add('drop'); event.preventDefault(); } });
    window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop'); } });
    window.addEventListener('drop', importDroppedFiles);
    window.addEventListener('paste', importPastedPicture);
}

/**
 * Opens dropped files; a picture dropped onto the code goes where it was dropped (a drop handler).
 * @param {DragEvent} event - the drop.
 * @returns {void}
 */
function importDroppedFiles(event) {
    dragDepth = 0;
    document.body.classList.remove('drop');
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    event.preventDefault();
    if (event.target === ui.ta && document.caretPositionFromPoint) {
        const caret = document.caretPositionFromPoint(event.clientX, event.clientY);
        if (caret && caret.offsetNode === ui.ta) ui.ta.setSelectionRange(caret.offset, caret.offset);
        ui.ta.focus({ preventScroll: true });
    }
    importFiles(files);
}

/**
 * Makes a pasted picture a picture of the document, inserted at the cursor when the code has
 * the focus; a paste into another field is left alone (a paste handler).
 * @param {ClipboardEvent} event - the paste.
 * @returns {void}
 */
function importPastedPicture(event) {
    const active = document.activeElement;
    const file = [...(event.clipboardData?.files || [])].find(item => /^image\//.test(item.type));
    if (!file || (active !== ui.ta && active && active.matches(TYPING_FIELDS))) return;
    event.preventDefault();
    const extension = file.type.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    addPicture(new File([file], file.name && file.name !== PASTED_NAME ? file.name : `picture.${extension}`, { type: file.type }), active === ui.ta);
}

/**
 * Opens files: text files as new documents, then ZIPs, then pictures into the open document
 * (a single picture without text files is inserted at the cursor).
 * @param {File[]} files - the files.
 * @returns {Promise<void>} settles when every file is opened.
 */
async function importFiles(files) {
    const pictures = files.filter(file => /^image\//.test(file.type) || file.type === 'application/pdf');
    const zips = files.filter(file => /\.zip$/i.test(file.name));
    const texts = files.filter(file => !pictures.includes(file) && !zips.includes(file));
    for (const file of texts) await importTextFile(file);
    for (const zip of zips) await importZip(zip);
    for (const picture of pictures) await addPicture(picture, pictures.length === 1 && !texts.length);
}

/**
 * Opens a Markdown or text file as a new document.
 * @param {File} file - the file, at most 8 MB.
 * @returns {Promise<void>} settles when it is opened or refused.
 */
async function importTextFile(file) {
    if (!MARKDOWN_FILE.test(file.name) && !/text/.test(file.type)) { showToast(`"${file.name}" is not a Markdown file`); return; }
    if (file.size > MAX_TEXT_SIZE) { showToast('The file is larger than 8 MB'); return; }
    const text = await file.text();
    if (createDocument(file.name.replace(/\.[^.]+$/, '') || DEFAULT_NAME, text)) showToast(`Opened "${file.name}" - it is now in "My documents"`);
}

/**
 * Opens a ZIP with a .md file and pictures as one document; the pictures keep their paths
 * relative to the .md file.
 * @param {File} file - the ZIP file.
 * @returns {Promise<void>} settles when it is opened or refused with a message.
 */
async function importZip(file) {
    try {
        const entries = await readZipEntries(file);
        const unpack = createUnpacker();
        const markdownEntries = entries.filter(entry => /\.(md|markdown)$/i.test(entry.name) && !HIDDEN_ENTRY.test(entry.name)).sort((a, b) => a.name.split('/').length - b.name.split('/').length);
        if (!markdownEntries.length) throw new Error('there is no .md file in it');
        const main = markdownEntries.find(entry => MAIN_ENTRY.test(entry.name)) || markdownEntries[0];
        const folder = main.name.includes('/') ? main.name.slice(0, main.name.lastIndexOf('/') + 1) : '';
        const code = new TextDecoder().decode(await unpack(main));
        const pictures = await getZipPictures(entries, folder, unpack);
        const count = Object.keys(pictures).length;
        if (createDocument(main.name.replace(/^.*\//, '').replace(/\.(md|markdown)$/i, '') || file.name.replace(/\.zip$/i, ''), code, pictures)) {
            state.assets = pictures;
            renderPreview();
            showToast(`Opened "${file.name}" with ${count} ${count === 1 ? 'picture' : 'pictures'}`);
        }
    } catch (e) { showToast(`"${file.name}" could not be opened: ${e.message}`); }
}

/**
 * Returns the pictures of a ZIP as data URIs, by their path relative to the folder of the .md
 * file (by their file name when they are outside it).
 * @param {import('./zip-read.js').ZipEntry[]} entries - the entries of the ZIP.
 * @param {string} folder - the folder of the .md file, "" at the top.
 * @param {function(import('./zip-read.js').ZipEntry): Promise<Uint8Array>} unpack - the unpacker of the ZIP.
 * @returns {Promise<Object<string, string>>} name -> data URI.
 * @throws {Error} when the ZIP unpacks to too much (the Promise rejects).
 */
async function getZipPictures(entries, folder, unpack) {
    const pictures = {};
    for (const entry of entries) {
        const extension = (/\.(png|jpe?g|gif|webp|svg|pdf)$/i.exec(entry.name) || [])[1];
        if (!extension || HIDDEN_ENTRY.test(entry.name)) continue;
        const name = entry.name.startsWith(folder) ? entry.name.slice(folder.length) : entry.name.replace(/^.*\//, '');
        pictures[name] = await readAsDataUrl(new Blob([await unpack(entry)], { type: PICTURE_TYPES[extension.toLowerCase()] }));
    }
    return pictures;
}
