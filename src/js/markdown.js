/**
 * Markdown -> HTML for the preview, with the places in the code and the problems.
 *
 * render() runs these steps:
 *   1. parse the code with markdown-it (markdown-parser.js), which writes the places in the
 *      code and collects the outline, math, #links, pictures, code blocks and tables;
 *   2. put the HTML into the inert content of a <template> and clean its raw HTML
 *      (html-clean.js): nothing loads or runs before it is clean;
 *   3. typeset the math with KaTeX; a formula KaTeX cannot read is listed and shown in red;
 *   4. show the document's own pictures by their relative names and frame the missing ones;
 *   5. list links to #anchors that are not there, code blocks that are never closed and table
 *      rows with another number of cells than the header;
 *   6. return the page, the outline, the problems in code order and the number of words.
 *
 * highlight() (markdown-highlight.js) colors the code; the stability test imports it
 * from this file.
 */

import { createParser } from './markdown-parser.js?v=3';
import { removeUnsafeHtml } from './html-clean.js?v=3';
import { getLineOffset, ID_PREFIX } from './markdown-places.js?v=2';

export { highlight } from './markdown-highlight.js?v=3';

let parser = null;

/**
 * The environment markdown-it fills while it parses (markdown-parser.js).
 * @typedef {object} RenderEnvironment
 * @property {string} code - the code.
 * @property {number[]} starts - the offsets of the line starts.
 * @property {Array<{tex: string, display: boolean, pos: number}>} math - the formulas in order.
 * @property {import('./state.js').OutlineEntry[]} outline - the headings.
 * @property {Array<{href: string, pos: number}>} links - the links to #anchors.
 * @property {Array<{src: string, pos: number}>} images - the pictures written as ![…](…).
 * @property {object[]} fences - the fenced code blocks.
 * @property {object[]} tables - the tables.
 * @property {number[]} [unclosedMath] - the lines of $$ that are never closed.
 */

/**
 * Returns the offsets of the line starts of a text.
 * @param {string} code - the text.
 * @returns {number[]} 0 and the offset after each line break.
 */
export function getLineStarts(code) {
    const starts = [0];
    for (let i = code.indexOf('\n'); i >= 0; i = code.indexOf('\n', i + 1)) starts.push(i + 1);
    return starts;
}

/**
 * Tells whether an address points outside the document (a scheme or //).
 * @param {string} source - the address.
 * @returns {boolean} true for an outside address.
 */
export function isOutsideAddress(source) {
    return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(source);
}

/**
 * Returns the file name of an address in lower case, without folder, query and anchor.
 * @param {string} source - the address.
 * @returns {string} the file name.
 */
function getBaseName(source) {
    return source.replace(/[?#].*$/, '').replace(/^.*\//, '').toLowerCase();
}

/**
 * Returns the document's picture a relative name means: "logo.png", "./img/logo.png" … The
 * exact name wins (ignoring case), then the same file name in another folder.
 * @param {Object<string, string>} assets - the document's pictures by name.
 * @param {string} source - the name in the code.
 * @returns {string|null} the picture's name, null for an outside address or no match.
 */
export function getAssetName(assets, source) {
    let name = String(source || '').trim();
    try { name = decodeURIComponent(name); } catch (e) { /* keep it as it is */ }
    name = name.replace(/^\.\//, '').replace(/[?#].*$/, '');
    if (!name || isOutsideAddress(name)) return null;
    const keys = Object.keys(assets || {});
    const exact = keys.find(key => key.toLowerCase() === name.toLowerCase());
    if (exact) return exact;
    return keys.find(key => getBaseName(key) === getBaseName(name)) || null;
}

/**
 * Returns the number of cells in a table row.
 * @param {string} line - the row's line of code.
 * @returns {number} the cells, split at pipes that are not escaped.
 */
function getCellCount(line) {
    const row = line.replace(/^\s*(>\s?)*/, '').trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
    return row.split(/(?<!\\)\|/).length;
}

/**
 * Renders the code as a page (see the steps in the header).
 * @param {string} code - the Markdown.
 * @param {object} [options] - assets: the document's pictures by name.
 * @returns {import('./state.js').RenderResult} the page, outline, problems and number of words.
 */
export function render(code, { assets = {} } = {}) {
    parser ||= createParser();
    const env = { code, starts: getLineStarts(code), math: [], outline: [], links: [], images: [], fences: [], tables: [] };
    const html = parser.render(code, env);
    const template = document.createElement('template');
    template.innerHTML = html;
    const root = template.content;
    removeUnsafeHtml(root);
    const problems = [];
    renderMath(root, env, problems);
    showPictures(root, env, assets, problems);
    addAnchorProblems(root, env, problems);
    addFenceProblems(env, problems);
    addTableProblems(env, problems);
    problems.sort((a, b) => a.pos - b.pos);
    const words = (root.textContent.match(/[\p{L}\p{N}]+/gu) || []).length;
    const page = document.createElement('div');
    page.append(root);
    return { root: page, outline: env.outline, problems, words };
}

/**
 * Typesets the math holders with KaTeX (as text between $ without KaTeX); a formula KaTeX
 * cannot read is listed and shown in red. Lists every $$ that is never closed.
 * @param {DocumentFragment} root - the cleaned page.
 * @param {RenderEnvironment} env - the render environment.
 * @param {import('./state.js').Problem[]} problems - the problems; added to.
 * @returns {void}
 */
function renderMath(root, env, problems) {
    for (const holder of root.querySelectorAll('[data-md-math]')) {
        const math = env.math[+holder.dataset.mdMath];
        holder.removeAttribute('data-md-math');
        if (!math) continue;
        holder.dataset.tex = math.tex;
        if (!window.katex) { holder.textContent = math.display ? `$$${math.tex}$$` : `$${math.tex}$`; continue; }
        try { holder.innerHTML = window.katex.renderToString(math.tex, { displayMode: math.display, throwOnError: true, strict: 'ignore' }); } catch (e) {
            problems.push({ pos: math.pos, kind: 'warn', msg: 'Math: ' + String(e.message || e).replace(/^KaTeX parse error:\s*/, '') });
            holder.innerHTML = window.katex.renderToString(math.tex, { displayMode: math.display, throwOnError: false, strict: 'ignore' });
        }
    }
    for (const line of env.unclosedMath || []) problems.push({ pos: getLineOffset(env, line), kind: 'error', msg: '$$ is never closed - add a line with $$ after the formula' });
}

/**
 * Shows the pictures that a relative name finds among the document's pictures (the code keeps
 * the name); a PDF shows as a framed name, a missing picture as its name in a frame and once in
 * the problems.
 * @param {DocumentFragment} root - the cleaned page.
 * @param {RenderEnvironment} env - the render environment.
 * @param {Object<string, string>} assets - the document's pictures by name.
 * @param {import('./state.js').Problem[]} problems - the problems; added to.
 * @returns {void}
 */
function showPictures(root, env, assets, problems) {
    const missing = new Set();
    for (const picture of root.querySelectorAll('img')) {
        const source = picture.getAttribute('src') || '';
        if (!source || isOutsideAddress(source)) continue;
        const key = getAssetName(assets, source);
        if (key && /^data:image\//.test(assets[key])) { picture.src = assets[key]; picture.dataset.mdName = key; continue; }
        const isPdf = key && /^data:application\/pdf/.test(assets[key]);
        setFrameInPlace(picture, isPdf ? 'md-file' : 'md-picture-missing', isPdf ? key : source);
        if (isPdf || missing.has(source)) continue;
        missing.add(source);
        problems.push({ pos: getPicturePosition(env, source), kind: 'warn', msg: `Picture "${source}" not found - drag the picture into the editor (or add it in the Pictures tab)` });
    }
}

/**
 * Replaces a picture by a framed name that keeps its place in the code.
 * @param {HTMLImageElement} picture - the picture.
 * @param {string} className - "md-file" or "md-picture-missing".
 * @param {string} text - the name shown.
 * @returns {void}
 */
function setFrameInPlace(picture, className, text) {
    const frame = document.createElement('span');
    frame.className = className;
    frame.textContent = text;
    if (picture.dataset.mdP) frame.dataset.mdP = picture.dataset.mdP;
    picture.replaceWith(frame);
}

/**
 * Returns where a picture stands in the code: its ![…](…), else its name in an HTML attribute.
 * @param {RenderEnvironment} env - the render environment.
 * @param {string} source - the picture's address.
 * @returns {number} the offset, 0 when it is not found.
 */
function getPicturePosition(env, source) {
    const reference = env.images.find(image => image.src === source);
    const inHtml = [`"${source}"`, `'${source}'`, `=${source}`].map(quoted => env.code.indexOf(quoted)).find(k => k >= 0);
    return reference ? reference.pos : inHtml ?? 0;
}

/**
 * Lists the links to #anchors that no heading or anchor of the page has.
 * @param {DocumentFragment} root - the cleaned page.
 * @param {RenderEnvironment} env - the render environment.
 * @param {import('./state.js').Problem[]} problems - the problems; added to.
 * @returns {void}
 */
function addAnchorProblems(root, env, problems) {
    const ids = new Set([...root.querySelectorAll('[id]')].map(element => element.id));
    for (const link of env.links) {
        let target = link.href.slice(1);
        try { target = decodeURIComponent(target); } catch (e) { /* keep it */ }
        if (target && !ids.has(target.startsWith(ID_PREFIX) ? target : ID_PREFIX + target)) problems.push({ pos: link.pos, kind: 'warn', msg: `The link to "#${target}" has no heading or anchor of that name` });
    }
}

/**
 * Lists the code blocks that are never closed: they run to the end of their block.
 * @param {RenderEnvironment} env - the render environment.
 * @param {import('./state.js').Problem[]} problems - the problems; added to.
 * @returns {void}
 */
function addFenceProblems(env, problems) {
    for (const fence of env.fences) {
        const last = fence.map[1] - 1;
        const text = last > fence.map[0] && last < env.starts.length ? env.code.slice(getLineOffset(env, last), getLineOffset(env, last + 1)).replace(/^[\s>]*/, '').trim() : '';
        const marker = fence.markup[0];
        const closed = text.length >= fence.markup.length && text.split('').every(character => character === marker);
        if (!closed) problems.push({ pos: getLineOffset(env, fence.map[0]), kind: 'error', msg: `This code block (${fence.markup}) is never closed - add a line with ${fence.markup} after the code` });
    }
}

/**
 * Lists the table rows with another number of cells than the header.
 * @param {RenderEnvironment} env - the render environment.
 * @param {import('./state.js').Problem[]} problems - the problems; added to.
 * @returns {void}
 */
function addTableProblems(env, problems) {
    /**
     * Returns the text of a line of the code.
     * @param {number} line - the line, 0-based.
     * @returns {string} the line without its line break.
     */
    const getLineText = line => env.code.slice(getLineOffset(env, line), line + 1 < env.starts.length ? getLineOffset(env, line + 1) - 1 : env.code.length);
    for (const table of env.tables) {
        const [first, end] = table.map;
        const headerCells = getCellCount(getLineText(first));
        for (let line = first + 2; line < end; line++) {
            const cells = getCellCount(getLineText(line));
            if (cells !== headerCells) problems.push({ pos: getLineOffset(env, line), kind: 'warn', msg: `This table row has ${cells} ${cells === 1 ? 'cell' : 'cells'}, the header has ${headerCells}` });
        }
    }
}

/**
 * Returns the text of the page as plain text: math as its TeX, pictures as their alt text,
 * task boxes as [x] and [ ]. The text is laid out off screen once to read it as shown.
 * @param {HTMLElement} page - the preview's page.
 * @returns {string} the text, ending with a line break.
 */
export function getPlainText(page) {
    const copy = page.cloneNode(true);
    copy.querySelectorAll('.md-math, .md-math-block').forEach(math => math.replaceWith(math.classList.contains('md-math') ? `$${math.dataset.tex || ''}$` : `\n$$${math.dataset.tex || ''}$$\n`));
    copy.querySelectorAll('img').forEach(picture => picture.replaceWith(picture.alt ? `[${picture.alt}]` : ''));
    copy.querySelectorAll('input.md-task').forEach(box => box.replaceWith(box.checked ? '[x] ' : '[ ] '));
    const box = document.createElement('div');
    box.className = 'md-doc';
    box.style.cssText = 'position:fixed;left:-100000px;top:0;width:800px';
    box.append(...copy.childNodes);
    document.body.append(box);
    const text = box.innerText.replace(/\n{3,}/g, '\n\n').trim() + '\n';
    box.remove();
    return text;
}
