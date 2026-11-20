/**
 * Text typed on the page as Markdown: the places of a run's characters in the code, Markdown's
 * special characters escaped, line breaks written as Markdown, and numbered lists numbered on
 * after new items. Used by the edits on the page (inplace.js).
 */

/** A list item with a number at the start of a line (quote markers and indentation first). */
const NUMBERED_ITEM = /^([ \t]*(?:>[ \t]?)*[ \t]*)(\d+)([.)])(?=[ \t])/;

/**
 * Where typed text goes and what stands around it.
 * @typedef {object} TypedPlace
 * @property {string} code - the whole code.
 * @property {number} from - the code position of the typed text.
 * @property {boolean} lineStart - true when the text starts a line (after quote markers).
 * @property {boolean} cell - true inside a table cell.
 * @property {boolean} first - true when the text starts at the start of the run.
 * @property {string} rest - the run's text after it.
 */

/**
 * How line breaks are written on a line of the code.
 * @typedef {object} BreakMarkup
 * @property {string} paragraph - the Markdown of a new paragraph (or list item).
 * @property {string} lineBreak - the Markdown of a hard line break.
 * @property {boolean} heading - true when the line is a heading.
 */

/**
 * Tells whether a character is ASCII punctuation (what a backslash may escape).
 * @param {string} character - one character.
 * @returns {boolean} true for punctuation.
 */
function isPunctuation(character) {
    return /^[!-/:-@[-`{-~]$/.test(character);
}

/**
 * Returns the places in the code of each character of a run (and of its end); a character may
 * stand there as a backslash escape.
 * @param {string} code - the whole code.
 * @param {string} text - the run's text.
 * @param {number} at - where the run starts in the code.
 * @returns {number[]|null} the offsets, one more than the characters; null when the run does not match the code.
 */
export function getRunOffsets(code, text, at) {
    const offsets = [];
    let j = at;
    for (let i = 0; i < text.length; i++) {
        const character = text[i];
        if (code[j] === '\\' && isPunctuation(code[j + 1] || '') && code[j + 1] === character) { offsets.push(j); j += 2; }
        else if (code[j] === character) { offsets.push(j); j++; }
        else return null;
    }
    offsets.push(j);
    return offsets;
}

/**
 * Returns typed text as Markdown: characters that would start formatting are escaped.
 * @param {string} text - the typed text (one line).
 * @param {boolean} lineStart - true when it starts a line: list, heading and quote markers are escaped too.
 * @param {boolean} cell - true inside a table cell: | is escaped too.
 * @returns {string} the Markdown.
 */
export function escapeMarkdown(text, lineStart, cell) {
    let markdown = text.replace(/[\r\n]+/g, ' ')
        .replace(/[\\`*_[\]~$]/g, character => '\\' + character)
        .replace(/<(?=[A-Za-z/!?])/g, '\\<')
        .replace(/&(?=#?[A-Za-z0-9]+;)/g, '\\&');
    if (cell) markdown = markdown.replace(/\|/g, '\\|');
    if (lineStart) markdown = markdown.replace(/^(\s*)(\d+)([.)])/, '$1$2\\$3').replace(/^(\s*)([#>+=-])/, '$1\\$2');
    return markdown;
}

/**
 * Returns the line of the code that starts at a position.
 * @param {string} code - the code.
 * @param {number} position - the line's start.
 * @returns {string} the line without its line break.
 */
function getLineAt(code, position) {
    const end = code.indexOf('\n', position);
    return code.slice(position, end < 0 ? code.length : end);
}

/**
 * Returns the code with the items after new items of a numbered list numbered on (the last new
 * item starts at position), at the same level, until the list ends or an item already has a
 * higher number. A list that numbers every item alike (1. 1. 1.) stays so.
 * @param {string} code - the code with the new items.
 * @param {number} position - where the last new item starts.
 * @returns {string} the code, renumbered.
 */
export function getRenumberedCode(code, position) {
    const item = NUMBERED_ITEM.exec(getLineAt(code, position));
    if (!item || hasEqualNumbers(code, position, item)) return code;
    const prefix = item[1], marker = item[3];
    let number = +item[2], at = code.indexOf('\n', position);
    if (at < 0) return code;
    at++;
    let out = code.slice(0, at);
    while (at < code.length) {
        let end = code.indexOf('\n', at);
        if (end < 0) end = code.length;
        const line = code.slice(at, end);
        const next = NUMBERED_ITEM.exec(line);
        if (next && next[1] === prefix && next[3] === marker) {
            if (+next[2] > number) break;
            number++;
            out += prefix + number + marker + line.slice(next[0].length) + code.slice(end, end + 1);
        } else if (!line.trim() || (line.startsWith(prefix) && /^[ \t]/.test(line.slice(prefix.length)))) out += code.slice(at, end + 1);
        else break;
        at = end + 1;
    }
    return out + code.slice(at);
}

/**
 * Tells whether the item before the new ones has the same number as the last new item: then
 * the list numbers every item alike.
 * @param {string} code - the code.
 * @param {number} position - where the last new item starts.
 * @param {RegExpExecArray} item - the match of NUMBERED_ITEM on that line.
 * @returns {boolean} true when the list numbers every item alike.
 */
function hasEqualNumbers(code, position, item) {
    for (let p = code.lastIndexOf('\n', position - 2) + 1, q = position; q > 0; q = p, p = code.lastIndexOf('\n', p - 2) + 1) {
        const previous = NUMBERED_ITEM.exec(getLineAt(code, p));
        if (previous && previous[1] === item[1] && previous[3] === item[3]) return previous[2] === item[2];
        if (p === 0) return false;
    }
    return false;
}

/**
 * Returns the typed text as Markdown with its line breaks: two or more are a new paragraph (a
 * blank line; in a list item a new item with the same marker, the next number), one a hard line
 * break (\ at the end of the line); in a table cell both are <br>, in a heading both a new
 * paragraph. Quote markers (>) and the indentation of the line go on. Breaks at the start or end
 * of the block's text make no empty paragraph and are left out.
 * @param {HTMLElement} run - the edited run of the page.
 * @param {string} text - the typed text.
 * @param {TypedPlace} place - where it goes and what stands around it.
 * @returns {string} the Markdown.
 */
export function formatTypedText(run, text, place) {
    if (!text.includes('\n')) return escapeMarkdown(text, place.lineStart, place.cell);
    const breaks = getBreakMarkup(run, place.code, place.from);
    const typed = removeOuterBreaks(run, text, place.first, place.rest);
    return typed.split(/(\n+)/).map((part, i) => formatTypedPart(part, i, place, breaks)).join('');
}

/**
 * Returns one part of typed text split at its line breaks: a line of text (escaped; every line
 * after the first starts a line of code), or a run of breaks as <br>, a new paragraph or a hard
 * line break.
 * @param {string} part - the part.
 * @param {number} index - its index: even for text, odd for line breaks.
 * @param {TypedPlace} place - where the text goes.
 * @param {BreakMarkup} breaks - how breaks are written on the line.
 * @returns {string} the Markdown.
 */
function formatTypedPart(part, index, place, breaks) {
    if (!(index % 2)) return escapeMarkdown(index ? part.replace(/^[ \t]+/, '') : part, index ? true : place.lineStart, place.cell);
    if (place.cell) return '<br>';
    return part.length > 1 || breaks.heading ? breaks.paragraph : breaks.lineBreak;
}

/**
 * Returns how a new paragraph and a new line are written on the line of a position.
 * @param {HTMLElement} run - the edited run of the page.
 * @param {string} code - the whole code.
 * @param {number} from - the code position of the typed text.
 * @returns {BreakMarkup} the Markdown of a new paragraph (or list item) and of a hard line
 *   break, and whether the line is a heading.
 */
function getBreakMarkup(run, code, from) {
    const lineStart = code.lastIndexOf('\n', from - 1) + 1;
    const lineEnd = code.indexOf('\n', lineStart);
    const line = code.slice(lineStart, lineEnd < 0 ? code.length : lineEnd);
    const quote = /^[ \t]*(?:>[ \t]?)*/.exec(line)[0];
    const content = line.slice(quote.length);
    const item = /^([ \t]*)([-*+]|(\d+)([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/.exec(content);
    const heading = /^#{1,6}[ \t]/.test(content.trimStart()) || !!run.closest('h1, h2, h3, h4, h5, h6');
    const indent = item ? item[1] : /^[ \t]*/.exec(content)[0];
    const continuation = quote + (item ? ' '.repeat(item[1].length + item[2].length + item[5].length) : indent);
    // A list that numbers every item alike (the next item has the same number) gets the same number again.
    const nextLine = code.slice(lineEnd < 0 ? code.length : lineEnd + 1).split('\n')[0];
    const sameNumber = item && item[3] && (NUMBERED_ITEM.exec(nextLine) || [])[2] === item[3];
    const paragraph = item && run.closest('li')
        ? '\n' + quote + item[1] + (item[3] ? (sameNumber ? item[3] : +item[3] + 1) + item[4] : item[2]) + item[5] + (item[6] ? '[ ] ' : '')
        : '\n' + quote.trimEnd() + '\n' + quote + indent;
    return { paragraph, lineBreak: '\\\n' + continuation, heading };
}

/**
 * Returns the typed text without the breaks at the start or end of the block's text (they
 * would make an empty paragraph); three or more breaks count as two.
 * @param {HTMLElement} run - the edited run of the page.
 * @param {string} text - the typed text.
 * @param {boolean} first - true when the text starts at the start of the run.
 * @param {string} rest - the run's text after it.
 * @returns {string} the text.
 */
function removeOuterBreaks(run, text, first, rest) {
    const block = run.closest('[data-md-p]') || run.parentElement;
    const range = document.createRange();
    range.selectNodeContents(block);
    range.setEndBefore(run);
    const before = range.toString().trim();
    range.selectNodeContents(block);
    range.setStartAfter(run);
    const after = range.toString().trim() + rest.trim();
    let typed = text.replace(/\n{3,}/g, '\n\n');
    if (first && !before) typed = typed.replace(/^\n+/, '');
    if (!after) typed = typed.replace(/\n+$/, '');
    return typed;
}

/**
 * Tells whether a run stands inside bold, italic, a link or code: a new paragraph there would
 * break their markers in two.
 * @param {HTMLElement} run - the run of the page.
 * @returns {boolean} true inside such markup.
 */
export function isInsideMarkup(run) {
    const block = run.closest('[data-md-p]');
    for (let element = run.parentElement; element && element !== block; element = element.parentElement) {
        if (/^(strong|em|b|i|a|code|del|s|mark|sub|sup)$/.test(element.localName)) return true;
    }
    return false;
}
