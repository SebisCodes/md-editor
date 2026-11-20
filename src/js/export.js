/**
 * The document as one HTML file (styles, math fonts and pictures inside) and printing it
 * through the browser's print dialog (for a PDF with selectable text).
 */

import { escapeHtml } from './util.js?v=3';

/** The page style of the document and the folder its addresses are relative to. */
const DOCUMENT_STYLE = ['css/doc.css', 'css/'];
/** KaTeX's style and the folder of its fonts. */
const MATH_STYLE = ['vendor/katex/katex.min.css', 'vendor/katex/'];
/** Attributes the editor puts on the page, besides data-md-*. */
const EDITOR_ATTRIBUTES = ['contenteditable', 'spellcheck'];
/** Fetched files as data URIs and the joined styles, by address or key. */
const cache = new Map();

/**
 * Returns a file as a data URI, fetched once per page. A query that fills a cache.
 * @param {URL|string} url - the file's address.
 * @returns {Promise<string>} the data URI.
 */
function getDataUrl(url) {
    if (cache.has(url)) return cache.get(url);
    const dataUrl = fetch(url).then(response => response.blob()).then(blob => new Promise(resolve => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result));
        reader.readAsDataURL(blob);
    }));
    cache.set(url, dataUrl);
    return dataUrl;
}

/**
 * Returns doc.css, and katex.css with its fonts inside when the document has math. A query that
 * fills a cache.
 * @param {boolean} hasMath - true when the document has math.
 * @returns {Promise<string>} the styles.
 */
function getStyles(hasMath) {
    const key = 'css' + (hasMath ? '+math' : '');
    if (cache.has(key)) return cache.get(key);
    const styles = getJoinedStyles(hasMath ? [DOCUMENT_STYLE, MATH_STYLE] : [DOCUMENT_STYLE]);
    cache.set(key, styles);
    return styles;
}

/**
 * Returns stylesheets one after the other, each with its fonts inside.
 * @param {string[][]} files - [stylesheet, font folder] pairs, relative to src/.
 * @returns {Promise<string>} the stylesheets, each followed by a line break.
 */
async function getJoinedStyles(files) {
    let out = '';
    for (const [file, folder] of files) out += await getStyleWithFonts(file, folder) + '\n';
    return out;
}

/**
 * Returns one stylesheet with its woff2 fonts as data URIs.
 * @param {string} file - the stylesheet's address, relative to src/.
 * @param {string} folder - the folder its font addresses are relative to.
 * @returns {Promise<string>} the stylesheet.
 */
async function getStyleWithFonts(file, folder) {
    const base = new URL('../', import.meta.url);
    let css = await (await fetch(new URL(file, base))).text();
    const fontUrls = [...new Set([...css.matchAll(/url\(([^)'"]+\.woff2)\)/g)].map(match => match[1]))];
    for (const fontUrl of fontUrls) css = css.split(`url(${fontUrl})`).join(`url(${await getDataUrl(new URL(fontUrl, new URL(folder, base)))})`);
    return css;
}

/**
 * Returns a copy of the page without the editor's marks (places in the code, frames, edit state).
 * @param {HTMLElement} page - the preview's page.
 * @returns {HTMLElement} the clean copy.
 */
function getCleanCopy(page) {
    const copy = page.cloneNode(true);
    copy.removeAttribute('id');
    copy.removeAttribute('style');
    copy.removeAttribute('data-no-i18n');
    for (const element of [copy, ...copy.querySelectorAll('*')]) removeEditorMarks(element);
    copy.querySelectorAll('input.md-task').forEach(box => box.setAttribute('disabled', ''));
    copy.querySelectorAll('.empty-hint').forEach(hint => hint.remove());
    return copy;
}

/**
 * Removes the editor's attributes and classes from one element; an editable run of text gives
 * way to its plain text.
 * @param {HTMLElement} element - an element of the copy.
 * @returns {void}
 */
function removeEditorMarks(element) {
    for (const attribute of [...element.attributes]) {
        if (attribute.name.startsWith('data-md-') || EDITOR_ATTRIBUTES.includes(attribute.name)) element.removeAttribute(attribute.name);
    }
    element.classList.remove('source', 'edit');
    if (element.classList.contains('t') && element.localName === 'span') element.replaceWith(...element.childNodes);
    else if (element.getAttribute('class') === '') element.removeAttribute('class');
}

/**
 * Returns the document as one HTML file. Pictures from other servers stay links; the
 * document's own pictures are inside already (data URIs).
 * @param {HTMLElement} page - the preview's page.
 * @param {string} title - the document's name.
 * @param {boolean} [breaks] - false to leave out the page breaks.
 * @returns {Promise<string>} the HTML file.
 */
export async function getStandaloneHtml(page, title, breaks = true) {
    const copy = getCleanCopy(page);
    const css = await getStyles(!!copy.querySelector('.katex'));
    return `<!DOCTYPE html>
<html lang="${document.documentElement.lang === 'de' ? 'de' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Markdown Editor (md.giit.ch)">
<title>${escapeHtml(title)}</title>
<style>
${css}
body { margin: 0; background: var(--d-bg); }
</style>
</head>
<body>
<article class="md-doc${breaks ? '' : ' no-break'}">
${copy.innerHTML}
</article>
</body>
</html>
`;
}

/**
 * Opens the print dialog with only the document (a PDF with selectable text); the page's
 * title is the document's name while the dialog is open.
 * @param {HTMLElement} page - the preview's page.
 * @param {string} title - the document's name.
 * @param {boolean} [breaks] - false to leave out the page breaks.
 * @returns {void}
 */
export function showPrintDialog(page, title, breaks = true) {
    let root = document.getElementById('print');
    if (!root) {
        root = document.createElement('article');
        root.id = 'print';
        root.className = 'md-doc';
        document.body.append(root);
    }
    root.classList.toggle('no-break', !breaks);
    root.replaceChildren(...getCleanCopy(page).childNodes);
    const formerTitle = document.title;
    document.title = title;
    /**
     * Gives the page its title back and empties the print copy once the dialog closes.
     * @returns {void}
     */
    const resetAfterPrint = () => { document.title = formerTitle; root.replaceChildren(); removeEventListener('afterprint', resetAfterPrint); };
    addEventListener('afterprint', resetAfterPrint);
    requestAnimationFrame(() => window.print());
}
