/**
 * The Export dialog and the buttons that save the document: Markdown, one HTML file (styles,
 * math fonts and pictures inside), PDF through the print dialog, plain text, the .md with its
 * pictures as ZIP, or all of it as one ZIP; copy, download and Ctrl+S. Whether a PDF and the HTML
 * file apply page breaks is remembered in this browser (on at first).
 */

import { state, areas, ui, PREFIX, getElement, showToast } from './state.js?v=2';
import { openDialog } from './dialogs.js?v=5';
import { createZip } from './zip.js?v=4';
import { saveFile, getSafeName } from './util.js?v=3';
import { getDataUrlBytes } from './assets.js?v=6';
import { getPlainText } from './markdown.js?v=8';
import { getStandaloneHtml, showPrintDialog } from './export.js?v=5';
import { renderPreview } from './preview.js?v=3';
import { stopTextEdit } from './inplace.js?v=3';

/** The localStorage key of the page-break choice: "0" for off. */
const BREAKS_KEY = PREFIX + '.pagebreaks';
const dialog = getElement('#export');
const nameField = getElement('#ex-name'), formatField = getElement('#ex-format'), textField = getElement('#ex-text'), infoField = getElement('#ex-info');
const breaksBox = getElement('#ex-breaks');

/**
 * Tells whether a PDF and the HTML file apply page breaks.
 * @returns {boolean} true unless the user turned them off (also without storage).
 */
function isBreaksOn() {
    try { return localStorage.getItem(BREAKS_KEY) !== '0'; } catch (e) { return true; }
}

/**
 * Opens the Export dialog: text being edited on the page goes into the code first, the preview
 * is rendered anew.
 * @returns {void}
 */
export function showExportDialog() {
    stopTextEdit(true);
    renderPreview();
    nameField.value = state.name;
    updateExportPreview();
    openDialog(dialog);
}

/**
 * Returns the file name of the export: the name in the dialog, else the document's.
 * @returns {string} the safe file name without extension.
 */
function getExportName() {
    return getSafeName(nameField.value || state.name);
}

/**
 * Shows what the chosen format exports and its size, and the buttons that fit it.
 * @returns {void}
 */
function updateExportPreview() {
    const format = formatField.value;
    if (format === 'convert') return;
    breaksBox.closest('label').hidden = !(format === 'pdf' || format === 'html');
    dialog.dataset.raster = format === 'pdf' ? 'pdf' : 'false';
    getElement('#ex-download').textContent = format === 'pdf' ? 'Print / Save as PDF' : 'Download';
    getElement('#ex-copy').hidden = format === 'pdf' || format === 'mdzip';
    if (format === 'pdf') { infoField.textContent = ''; return; }
    if (format === 'mdzip') { showZipContents(); return; }
    if (format === 'html') { showHtmlExport(); return; }
    const text = format === 'md' ? state.code : getPlainText(ui.doc);
    textField.value = text;
    infoField.textContent = `${new Blob([text]).size.toLocaleString('en')} bytes`;
}

/**
 * Lists the files of the .md ZIP: the .md and its pictures.
 * @returns {void}
 */
function showZipContents() {
    const count = Object.keys(state.assets).length;
    textField.value = [`${getExportName()}.md`, ...Object.keys(state.assets)].join('\n');
    infoField.textContent = `.md and ${count} ${count === 1 ? 'picture' : 'pictures'}`;
}

/**
 * Shows the HTML file and its size once it is made, if HTML is still the chosen format.
 * @returns {void}
 */
function showHtmlExport() {
    textField.value = '';
    infoField.textContent = '';
    getHtmlFile().then(page => { if (formatField.value === 'html') { textField.value = page; infoField.textContent = `${new Blob([page]).size.toLocaleString('en')} bytes`; } });
}

/**
 * Returns the document as one HTML file, with or without page breaks as chosen.
 * @returns {Promise<string>} the HTML file.
 */
function getHtmlFile() {
    return getStandaloneHtml(ui.doc, state.name, isBreaksOn());
}

/**
 * Returns the .md with its pictures as a ZIP.
 * @returns {Promise<Blob>} the ZIP.
 */
function createMarkdownZip() {
    return createZip([{ name: `${getExportName()}.md`, data: state.code }, ...Object.entries(state.assets).map(([name, dataUrl]) => ({ name, data: getDataUrlBytes(dataUrl) }))]);
}

/**
 * Opens the print dialog with the document (for a PDF): text being edited on the page goes into
 * the code first, the preview is rendered anew.
 * @returns {void}
 */
export function openPrintDialog() {
    stopTextEdit(true);
    renderPreview();
    showPrintDialog(ui.doc, state.name, isBreaksOn());
}

/**
 * Connects the dialog: the format, the name, the page-break choice and the buttons; and the
 * Export, Copy and Download buttons of the bar.
 * @returns {void}
 */
export function startExportDialog() {
    formatField.addEventListener('change', updateExportPreview);
    nameField.addEventListener('input', updateExportPreview);
    breaksBox.checked = isBreaksOn();
    breaksBox.addEventListener('change', event => { try { localStorage.setItem(BREAKS_KEY, event.target.checked ? '1' : '0'); } catch (err) { /* without storage it holds for this print only */ } updateExportPreview(); });
    getElement('#ex-download').addEventListener('click', saveExport);
    getElement('#ex-zip').addEventListener('click', saveAllFormatsAsZip);
    getElement('#ex-copy').addEventListener('click', copyExport);
    getElement('#btn-export').addEventListener('click', showExportDialog);
    getElement('#btn-copy').addEventListener('click', copyCode);
    getElement('#btn-download').addEventListener('click', () => saveMarkdownFile());
}

/**
 * Downloads the chosen format, or opens the print dialog for a PDF (a click handler).
 * @returns {Promise<void>} settles when the download starts.
 */
async function saveExport() {
    const format = formatField.value;
    const button = getElement('#ex-download');
    button.disabled = true;
    try {
        if (format === 'pdf') { dialog.close(); openPrintDialog(); return; }
        if (format === 'html') saveFile(await getHtmlFile(), `${getExportName()}.html`, 'text/html');
        else if (format === 'txt') saveFile(textField.value, `${getExportName()}.txt`, 'text/plain');
        else if (format === 'mdzip') saveFile(await createMarkdownZip(), `${getExportName()}.zip`);
        else saveFile(state.code, `${getExportName()}.md`, 'text/markdown');
        showToast('Downloaded');
    } catch (err) { console.error(err); showToast(err.message); } finally { button.disabled = false; }
}

/**
 * Downloads everything at once: .md, pictures, HTML and text in one ZIP (a click handler).
 * @returns {Promise<void>} settles when the download starts.
 */
async function saveAllFormatsAsZip() {
    const button = getElement('#ex-zip');
    button.disabled = true;
    try {
        const name = getExportName();
        const zip = await createZip([
            { name: `${name}.md`, data: state.code },
            ...Object.entries(state.assets).map(([pictureName, dataUrl]) => ({ name: pictureName, data: getDataUrlBytes(dataUrl) })),
            { name: `${name}.html`, data: await getHtmlFile() },
            { name: `${name}.txt`, data: getPlainText(ui.doc) },
        ]);
        saveFile(zip, `${name}-all.zip`);
        showToast('ZIP downloaded: .md, pictures, HTML and text');
    } catch (err) { console.error(err); showToast(err.message); } finally { button.disabled = false; }
}

/**
 * Copies the export to the clipboard; text formats fall back to the copy command (a click handler).
 * @returns {Promise<void>} settles when it is copied or refused.
 */
async function copyExport() {
    const format = formatField.value;
    try {
        if (format === 'html') await navigator.clipboard.writeText(await getHtmlFile());
        else await navigator.clipboard.writeText(textField.value);
        showToast('Copied to the clipboard');
    } catch (err) {
        if (format !== 'html') { textField.select(); document.execCommand('copy'); showToast('Copied to the clipboard'); }
        else showToast('This browser does not allow copying this');
    }
}

/**
 * Copies the code to the clipboard, with the copy command as fallback (a click handler).
 * @returns {Promise<void>} settles when it is copied.
 */
async function copyCode() {
    try { await navigator.clipboard.writeText(state.code); } catch (e) { ui.ta.select(); document.execCommand('copy'); }
    showToast('Code copied');
}

/**
 * Downloads the .md, or a ZIP with the .md and its pictures when the document has pictures.
 * @returns {void}
 */
function saveMarkdownFile() {
    nameField.value = state.name;
    if (Object.keys(state.assets).length) createMarkdownZip().then(zip => { saveFile(zip, `${getSafeName(state.name)}.zip`); showToast('.md with its pictures downloaded (ZIP)'); });
    else { saveFile(state.code, `${getSafeName(state.name)}.md`, 'text/markdown'); showToast('.md downloaded'); }
}

/**
 * Ctrl+S: to the server or the page around the editor when one is set up, otherwise a
 * download. Text being edited on the page goes into the code first.
 * @returns {void}
 */
export function saveDocument() {
    stopTextEdit(true);
    if (areas.sync && areas.sync.isActive()) { areas.sync.save(); return; }
    saveMarkdownFile();
}
