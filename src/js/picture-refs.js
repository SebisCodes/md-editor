/**
 * The pictures the code asks for: ![alt](name) and <img src="name"> with their places, outside
 * code blocks, code in the text and HTML comments; and the alt text a picture gets by default.
 */

import { getAssetName } from './markdown.js?v=8';

/** Markdown pictures: the name (with or without <…>) and an optional title. */
const MARKDOWN_PICTURE = /!\[[^\]\n]*\]\(\s*(<?)([^)\s>]+)>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
/** HTML pictures: the src attribute, quoted or not. */
const HTML_PICTURE = /<img\b[^>]*?\ssrc\s*=\s*(["']?)([^"'\s>]+)\1/gi;

/**
 * A picture reference in the code.
 * @typedef {object} PictureReference
 * @property {string} name - the name as written.
 * @property {string} shown - the name decoded (%20 as a space).
 * @property {number} at - where the reference starts.
 * @property {number} nameAt - where the name starts.
 */

/**
 * Returns the code with code blocks, code in the text and HTML comments blanked out (same
 * length), so their content is not taken for pictures.
 * @param {string} code - the code.
 * @returns {string} the code with those parts as spaces (line breaks kept).
 */
function getCodeWithoutCodeParts(code) {
    /**
     * Returns a part as spaces, its line breaks kept.
     * @param {string} part - the part.
     * @returns {string} the blank part.
     */
    const getBlank = part => part.replace(/[^\n]/g, ' ');
    return code.replace(/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[`~]*[ \t]*(?=\n|$)|$)/gm, getBlank).replace(/(`+)[^`\n]+?\1/g, getBlank).replace(/<!--[\s\S]*?-->/g, getBlank);
}

/**
 * Returns the pictures the code asks for, in code order.
 * @param {string} code - the code.
 * @returns {PictureReference[]} the references.
 */
export function getPictureReferences(code) {
    const references = [];
    const visible = getCodeWithoutCodeParts(code);
    let match;
    const markdown = new RegExp(MARKDOWN_PICTURE.source, 'g');
    while ((match = markdown.exec(visible))) {
        const open = match[0].indexOf('(');
        references.push({ name: match[2], at: match.index, nameAt: match.index + open + 1 + match[0].slice(open + 1).search(/[^\s<]/) });
    }
    const html = new RegExp(HTML_PICTURE.source, 'gi');
    while ((match = html.exec(visible))) references.push({ name: match[2], at: match.index, nameAt: match.index + match[0].length - match[2].length - match[1].length });
    for (const reference of references) { try { reference.shown = decodeURIComponent(reference.name); } catch (e) { reference.shown = reference.name; } }
    return references.sort((a, b) => a.at - b.at);
}

/**
 * Tells whether a reference in the code means a picture, as the preview finds it.
 * @param {string} name - the name in the code.
 * @param {string} key - the picture's name in the document.
 * @returns {boolean} true when the reference shows this picture.
 */
export function isReferenceTo(name, key) {
    return getAssetName({ [key]: '' }, name) === key;
}

/**
 * Returns the alt text a picture gets by default: its file name without folder and extension,
 * dashes and underscores as spaces.
 * @param {string} name - the picture's name.
 * @returns {string} the alt text.
 */
export function getAltText(name) {
    return name.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}
