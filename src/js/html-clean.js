/**
 * Cleaning of the raw HTML in a Markdown document before it reaches the page: no scripts,
 * styles, frames, forms, objects, SVG or MathML, no on… attributes and no javascript: or data:
 * links. Unknown elements are unwrapped, only known attributes stay, inline styles lose
 * positioning and outside resources other than https pictures. Ids get the prefix "md-", so
 * they never clash with the editor's own. The attributes data-md-* belong to the renderer
 * (markdown-parser.js renames them in raw HTML before the cleaning).
 */

import { ID_PREFIX } from './markdown-places.js?v=2';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const COMMENT_NODE = 8;
const PROCESSING_INSTRUCTION_NODE = 7;
const ELEMENT_NODE = 1;
/** Elements removed with their content. */
const DROP = new Set(['script', 'style', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'noembed',
    'noframes', 'textarea', 'select', 'button', 'option', 'optgroup', 'datalist', 'svg', 'math', 'link', 'meta', 'base', 'title', 'head',
    'xmp', 'plaintext', 'portal', 'param', 'source', 'track', 'audio', 'video', 'canvas', 'map', 'area', 'dialog', 'slot']);
/** Elements kept; the others are unwrapped (their content stays). */
const ALLOW = new Set(['a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption', 'center', 'cite', 'code',
    'col', 'colgroup', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4',
    'h5', 'h6', 'header', 'hgroup', 'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt',
    'ruby', 's', 'samp', 'section', 'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
    'thead', 'time', 'tr', 'tt', 'u', 'ul', 'var', 'wbr']);
/** Attributes kept, besides aria-* and the renderer's data-md-*. */
const ATTRIBUTES = new Set(['id', 'class', 'title', 'lang', 'dir', 'style', 'role', 'href', 'name', 'src', 'alt', 'width', 'height', 'align',
    'valign', 'colspan', 'rowspan', 'scope', 'start', 'type', 'reversed', 'value', 'open', 'checked', 'disabled', 'cite', 'datetime', 'span',
    'loading', 'abbr', 'headers']);

/**
 * Tells whether an address is safe to follow: http(s), relative, an #anchor, mailto: and tel:
 * for links; pictures may also be data: pictures and blob: addresses.
 * @param {string} url - the address.
 * @param {boolean} isPicture - true for the source of a picture.
 * @returns {boolean} true when the address may stay.
 */
function isSafeUrl(url, isPicture) {
    const value = String(url).replace(/[\u0000- \u007f-\u009f]+/g, '');
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
    if (!scheme) return true;                                     // relative, #anchor, /path
    const name = scheme[1].toLowerCase();
    if (name === 'https' || name === 'http') return true;
    if (!isPicture) return name === 'mailto' || name === 'tel';
    return name === 'blob' || (name === 'data' && /^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp)[;,]/i.test(value));
}

/**
 * Returns an inline style without positioning (nothing may cover the editor) and without
 * outside resources other than https pictures.
 * @param {string} style - the style attribute.
 * @returns {string} the declarations that may stay, joined with ";".
 */
function getSafeStyle(style) {
    return String(style).split(';').filter(isSafeDeclaration).join(';');
}

/**
 * Returns whether one declaration of an inline style may stay: it has a property, does not
 * position or bind anything, runs no script and loads no outside resource other than https pictures.
 * @param {string} declaration - one "property: value" declaration.
 * @returns {boolean} true when it may stay.
 */
function isSafeDeclaration(declaration) {
    const property = declaration.split(':')[0].trim().toLowerCase();
    if (!property) return false;
    if (/^(position|behavior|-moz-binding|z-index)$/.test(property)) return false;
    if (/expression\s*\(|javascript:|@import/i.test(declaration)) return false;
    for (const match of declaration.matchAll(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) if (!/^(https:|data:image\/)/i.test(match[2].trim())) return false;
    return true;
}

/**
 * Removes everything unsafe from the content of a node, recursively (see the header).
 * @param {Node} root - the node whose content is cleaned (a template's content).
 * @returns {void}
 */
export function removeUnsafeHtml(root) {
    for (const node of [...root.childNodes]) {
        if (node.nodeType === COMMENT_NODE || node.nodeType === PROCESSING_INSTRUCTION_NODE) { node.remove(); continue; }
        if (node.nodeType !== ELEMENT_NODE) continue;
        const tag = node.localName.toLowerCase();
        if (node.namespaceURI !== HTML_NAMESPACE || DROP.has(tag) || (tag === 'input' && (node.getAttribute('type') || '').toLowerCase() !== 'checkbox')) { node.remove(); continue; }
        removeUnsafeHtml(node);
        if (!ALLOW.has(tag)) { node.replaceWith(...node.childNodes); continue; }
        for (const attribute of [...node.attributes]) removeUnsafeAttribute(node, tag, attribute);
        if (tag === 'a') {
            const href = node.getAttribute('href');
            if (href && href.startsWith('#') && href.length > 1 && !href.startsWith('#' + ID_PREFIX)) node.setAttribute('href', '#' + ID_PREFIX + href.slice(1));
        }
        if (tag === 'input' && !node.hasAttribute('data-md-box')) node.setAttribute('disabled', '');
    }
}

/**
 * Removes or cleans one attribute of a kept element: unknown ones go, unsafe addresses go,
 * styles are cleaned, ids (and names of anchors) get the prefix "md-".
 * @param {Element} element - the element.
 * @param {string} tag - its tag name in lower case.
 * @param {Attr} attribute - the attribute.
 * @returns {void}
 */
function removeUnsafeAttribute(element, tag, attribute) {
    const name = attribute.name.toLowerCase();
    const isRendererPlace = name.startsWith('data-md-');
    if (!isRendererPlace && !ATTRIBUTES.has(name) && !/^aria-[a-z]+$/.test(name)) { element.removeAttribute(attribute.name); return; }
    if ((name === 'href' || name === 'cite') && !isSafeUrl(attribute.value, false)) element.removeAttribute(attribute.name);
    else if (name === 'src' && (tag !== 'img' || !isSafeUrl(attribute.value, true))) element.removeAttribute(attribute.name);
    else if (name === 'style') { const style = getSafeStyle(attribute.value); if (style) element.setAttribute('style', style); else element.removeAttribute('style'); }
    else if (name === 'id' || (name === 'name' && tag === 'a')) {
        const value = attribute.value.trim();
        element.removeAttribute(attribute.name);
        if (value && !element.hasAttribute('id')) element.setAttribute('id', value.startsWith(ID_PREFIX) ? value : ID_PREFIX + value);
    }
}
