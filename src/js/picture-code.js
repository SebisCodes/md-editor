/**
 * The code of a picture that is moved on the page (picture-move.js): where its ![…](…) (or
 * ![…][ref], with a link around it) stands, what leaves the code with it, and the code with
 * the picture at its new place.
 *
 * What leaves the code: the whole paragraph or list item when the picture was all of it, the
 * whole line when it stood alone on one, else the picture with a space beside it. At the drop
 * place it stands as a paragraph of its own; beside another picture it goes right beside that
 * picture's code; two pictures each alone in a table cell change places.
 */

import { state, ui } from './state.js?v=2';

/** A list item that holds nothing but its marker (and task box) once the picture is cut. */
const EMPTY_ITEM = /^[\s>]*(?:(?:[-+*]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?)?\s*$/;
/** A block that holds nothing but quote marks once the picture is cut. */
const EMPTY_BLOCK = /^[\s>]*$/;
/** The marker of a list item and the space after it. */
const ITEM_MARKER = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]{1,4}(?=\S)|[ \t]?)/;
/** How far a blank line after a line break is looked for. */
const BLANK_LOOKAHEAD = 200;
const DEFAULT_ITEM_INDENT = 2;

/**
 * A picture being moved.
 * @typedef {object} PictureMove
 * @property {HTMLElement} el - the picture on the page.
 * @property {number[]} pic - [from, to] of its code.
 * @property {number[]} cut - [from, to] of what leaves the code with it.
 */

/**
 * Where a moved picture is dropped (picture-move.js findDropTarget()).
 * @typedef {object} DropTarget
 * @property {HTMLElement} [el] - the block (or list item) before or after which it lands.
 * @property {HTMLElement} [pic] - the picture beside which it lands.
 * @property {boolean} after - true after the block or picture.
 * @property {boolean} [item] - true after a list item, inside that item.
 * @property {boolean} [below] - true below or above the picture rather than beside it.
 * @property {boolean} [swap] - true when the two pictures change places.
 */

/**
 * Tells whether the line after a line break is blank.
 * @param {string} code - the code.
 * @param {number} lineBreak - the position of the line break.
 * @returns {boolean} true for an empty line or the end of the code.
 */
function isBlankLineAfter(code, lineBreak) {
    return /^[ \t]*(\n|$)/.test(code.slice(lineBreak + 1, lineBreak + BLANK_LOOKAHEAD));
}

/**
 * Returns the end of the […] or (…) starting at a position, with nesting, escapes, <…> and
 * quoted titles.
 * @param {string} code - the code.
 * @param {number} start - the position of [ or (.
 * @returns {number} the position after the closing mark, -1 when it is not closed in the paragraph.
 */
function getClosingEnd(code, start) {
    const open = code[start], close = open === '[' ? ']' : ')';
    let depth = 0, quote = '';
    for (let j = start; j < code.length; j++) {
        const character = code[j];
        if (character === '\\') { j++; continue; }
        if (character === '\n' && isBlankLineAfter(code, j)) return -1;
        if (quote) { if (character === quote) quote = ''; continue; }
        if (open === '(' && (character === '"' || character === "'") && /\s/.test(code[j - 1])) quote = character;
        else if (open === '(' && character === '<' && j === start + 1) quote = '>';
        else if (character === open) depth++;
        else if (character === close && --depth === 0) return j + 1;
    }
    return -1;
}

/**
 * Returns where a picture's Markdown stands in the code, with the link around it when it is one.
 * @param {number} position - the place of the "!" of "![".
 * @param {boolean} linked - true when the picture is all of a link on the page.
 * @returns {number[]|null} [from, to], null when the code there is no picture.
 */
export function getPictureRange(position, linked) {
    const code = state.code;
    if (code[position] !== '!' || code[position + 1] !== '[') return null;
    let end = getClosingEnd(code, position + 1);
    if (end > 0 && (code[end] === '(' || code[end] === '[')) end = getClosingEnd(code, end);
    if (end < 0) return null;
    let start = position;
    if (linked && code[start - 1] === '[' && code[end] === ']') {
        const linkEnd = code[end + 1] === '(' || code[end + 1] === '[' ? getClosingEnd(code, end + 1) : end + 1;
        if (linkEnd > 0) { start--; end = linkEnd; }
    }
    return [start, end];
}

/**
 * Tells whether a picture is all of the link around it.
 * @param {HTMLElement} picture - the picture on the page.
 * @returns {boolean} true when its parent is a link with no other text.
 */
export function isLinkedPicture(picture) {
    return picture.parentElement.localName === 'a' && picture.parentElement.textContent.trim() === picture.textContent.trim();
}

/**
 * Returns what leaves the code when a picture is moved.
 * @param {HTMLElement} picture - the picture on the page.
 * @param {number} start - where its code starts.
 * @param {number} end - where its code ends.
 * @returns {number[]} [from, to] of the cut.
 */
export function getCutRange(picture, start, end) {
    const code = state.code;
    const block = picture.parentElement.closest('[data-md-e]');
    if (block && ui.doc.contains(block)) {
        const blockStart = +block.dataset.mdP, blockEnd = +block.dataset.mdE;
        const rest = code.slice(blockStart, start) + code.slice(end, blockEnd);
        const empty = block.localName === 'li' ? EMPTY_ITEM : EMPTY_BLOCK;
        if (blockStart <= start && end <= blockEnd && empty.test(rest)) return [blockStart, getBlankLinesEnd(code, block, blockEnd)];
    }
    const lineStart = code.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = code.indexOf('\n', end);
    if (lineEnd < 0) lineEnd = code.length;
    if (/^[ \t>]*$/.test(code.slice(lineStart, start)) && /^[ \t]*$/.test(code.slice(end, lineEnd)) && lineEnd < code.length) return [lineStart, lineEnd + 1];
    if (code[start - 1] === ' ' && /[ \n]|^$/.test(code[end] || '')) return [start - 1, end];
    if (code[end] === ' ') return [start, end + 1];
    return [start, end];
}

/**
 * Returns the end of a top-level block with the blank lines after it.
 * @param {string} code - the code.
 * @param {HTMLElement} block - the block on the page.
 * @param {number} blockEnd - where the line after the block starts.
 * @returns {number} the end of the cut.
 */
function getBlankLinesEnd(code, block, blockEnd) {
    let end = blockEnd;
    if (block.parentElement !== ui.doc) return end;
    while (end < code.length && code[end - 1] === '\n' && isBlankLineAfter(code, end - 1)) {
        const lineBreak = code.indexOf('\n', end);
        end = lineBreak < 0 ? code.length : lineBreak + 1;
    }
    return end;
}

/**
 * The code of a picture on its line.
 * @typedef {object} PictureLine
 * @property {number[]} pic - [from, to] of the picture's code.
 * @property {number} lineStart - where its line starts.
 * @property {number} lineEnd - where its line ends.
 * @property {boolean} own - true when the picture stands on a line of its own (beside the marks of a quote).
 */

/**
 * Returns the code of a picture with its line.
 * @param {HTMLElement} picture - the picture on the page.
 * @returns {PictureLine|null} the picture's code and line, null when the code there is no picture.
 */
export function getPictureLine(picture) {
    const range = getPictureRange(+picture.dataset.mdP, isLinkedPicture(picture));
    if (!range) return null;
    const code = state.code, lineStart = code.lastIndexOf('\n', range[0] - 1) + 1;
    let lineEnd = code.indexOf('\n', range[1]);
    if (lineEnd < 0) lineEnd = code.length;
    return { pic: range, lineStart, lineEnd, own: /^[ \t>]*$/.test(code.slice(lineStart, range[0])) && /^[ \t]*$/.test(code.slice(range[1], lineEnd)) };
}

/**
 * The code after a move and where the picture stands in it.
 * @typedef {object} MovedCode
 * @property {string} code - the new code.
 * @property {number} from - where the picture's code starts.
 * @property {number} to - where it ends.
 */

/**
 * Returns the code with the picture moved to the drop place.
 * @param {PictureMove} move - the picture being moved.
 * @param {DropTarget} target - the drop place.
 * @returns {MovedCode|null} the new code, null when nothing would change.
 */
export function getMovedCode(move, target) {
    if (!target.pic) return getCodeAtBlock(move, target);
    const targetLine = getPictureLine(target.pic);
    if (!targetLine) return null;
    const [targetStart, targetEnd] = targetLine.pic;
    if (targetStart < move.pic[1] && move.pic[0] < targetEnd) return null;
    return target.swap ? getSwappedCode(move, targetLine) : getCodeBesidePicture(move, target, targetLine);
}

/**
 * Returns the code with two pictures in each other's place; the cells around them stay as they are.
 * @param {PictureMove} move - the picture being moved.
 * @param {PictureLine} targetLine - the code of the other picture.
 * @returns {MovedCode} the new code.
 */
function getSwappedCode(move, targetLine) {
    const code = state.code;
    const [start, end] = move.pic, [targetStart, targetEnd] = targetLine.pic;
    const picture = code.slice(start, end), other = code.slice(targetStart, targetEnd);
    const out = start < targetStart ? code.slice(0, start) + other + code.slice(end, targetStart) + picture + code.slice(targetEnd)
        : code.slice(0, targetStart) + picture + code.slice(targetEnd, start) + other + code.slice(end);
    const from = start < targetStart ? targetStart + other.length - picture.length : targetStart;
    return { code: out, from, to: from + picture.length };
}

/**
 * Returns the code with the picture beside another one: on a line of its own (with the
 * target's indentation and quote marks) when the target has one, else with a space.
 * @param {PictureMove} move - the picture being moved.
 * @param {DropTarget} target - the drop place beside the other picture.
 * @param {PictureLine} targetLine - the code of the other picture.
 * @returns {MovedCode|null} the new code, null when nothing would change.
 */
function getCodeBesidePicture(move, target, targetLine) {
    const code = state.code;
    const [cutStart, cutEnd] = move.cut, [targetStart, targetEnd] = targetLine.pic;
    const picture = code.slice(move.pic[0], move.pic[1]);
    const prefix = code.slice(targetLine.lineStart, targetStart);
    let at, lead, tail;
    if (targetLine.own) [at, lead, tail] = target.after ? [targetLine.lineEnd, '\n' + prefix, ''] : [targetLine.lineStart, prefix, '\n'];
    else [at, lead, tail] = target.after ? [targetEnd, ' ', ''] : [targetStart, '', ' '];
    if (at > cutStart && at < cutEnd) return null;
    const rest = code.slice(0, cutStart) + code.slice(cutEnd);
    if (at >= cutEnd) at -= cutEnd - cutStart;
    const out = rest.slice(0, at) + lead + picture + tail + rest.slice(at);
    return out === code ? null : { code: out, from: at + lead.length, to: at + lead.length + picture.length };
}

/**
 * Returns the code with the picture as a paragraph of its own before or after a block, or at
 * the end of a list item, indented to the item's text.
 * @param {PictureMove} move - the picture being moved.
 * @param {DropTarget} target - the drop place at a block or list item.
 * @returns {MovedCode|null} the new code, null when nothing would change.
 */
function getCodeAtBlock(move, target) {
    const code = state.code;
    const [cutStart, cutEnd] = move.cut;
    const picture = code.slice(move.pic[0], move.pic[1]);
    let at, lead, tail;
    if (target.item) ({ at, lead, tail } = getItemEndPlace(code, target.el));
    else at = target.after ? +target.el.dataset.mdE : +target.el.dataset.mdP;
    if (at >= cutStart && at <= cutEnd) return null;
    const rest = code.slice(0, cutStart) + code.slice(cutEnd);
    if (at > cutEnd) at -= cutEnd - cutStart;
    const before = rest.slice(0, at), after = rest.slice(at);
    if (!target.item) {
        lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
        tail = !after || after.startsWith('\n') ? '\n' : '\n\n';
    }
    const out = before + lead + picture + tail + after;
    return out === code ? null : { code: out, from: at + lead.length, to: at + lead.length + picture.length };
}

/**
 * Returns where a picture goes at the end of a list item: as its own paragraph, indented to
 * the item's text, before the blank lines at the item's end.
 * @param {string} code - the code.
 * @param {HTMLElement} item - the list item on the page.
 * @returns {{at: number, lead: string, tail: string}} the place and the text before and after the picture.
 */
function getItemEndPlace(code, item) {
    const itemStart = +item.dataset.mdP;
    let at = +item.dataset.mdE;
    while (at > itemStart && /\n[ \t]*\n$/.test(code.slice(0, at))) at = code.lastIndexOf('\n', at - 2) + 1;
    const firstLineEnd = code.indexOf('\n', itemStart);
    const marker = ITEM_MARKER.exec(code.slice(itemStart, firstLineEnd < 0 ? code.length : firstLineEnd));
    const lead = (at && code[at - 1] !== '\n' ? '\n' : '') + '\n' + ' '.repeat(marker ? marker[0].length : DEFAULT_ITEM_INDENT);
    return { at, lead, tail: '\n' };
}
