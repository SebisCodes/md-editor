/**
 * Highlighting of the Markdown code: headings, list and quote markers, code blocks and code in
 * the text, math, links and pictures, footnotes, HTML tags and comments, emphasis marks and
 * table pipes, as <span> elements with the classes of the code view (style.css). Every test
 * runs on one line at a time, so a long line stays fast (the stability test).
 */

import { escapeHtml } from './util.js?v=3';

/** The end of an HTML comment. */
const COMMENT_END = '-->';
/** The most spaces a rule or setext underline may be indented by and stay one (CommonMark). */
const MAX_BLOCK_INDENT = 3;
/** The pieces of a line that get a color, in the order they are tried. */
const INLINE = new RegExp([
    '(`+)[^`\\n]*?\\1',                                       // code
    '\\\\[\\\\`*_{}\\[\\]()#+\\-.!|$<>~&]',                   // escape
    '\\$\\$[^$\\n]+\\$\\$|\\$(?!\\s)[^$\\n]*?[^\\s\\\\]\\$|\\$[^\\s$]\\$',   // math
    '!?\\[[^\\]\\n]*\\]\\([^)\\s]*(?:\\s+"[^"\\n]*")?\\)',   // link / picture
    '\\[\\^[^\\]\\n]+\\]:?',                                   // footnote
    '<https?:\\/\\/[^>\\s]+>|https?:\\/\\/[^\\s<>()]+',       // autolink
    '<!--.*?-->',                                             // comment on one line
    '<\\/?[A-Za-z][^>\\n]*>',                                 // html tag
    '\\*\\*|__|~~|\\*|(?<![\\p{L}\\p{N}])_|_(?![\\p{L}\\p{N}])', // emphasis
    '\\|',                                                    // table
].join('|'), 'gu');

/**
 * The state of the highlighting between lines.
 * @typedef {object} HighlightState
 * @property {string|null} fence - the marker of the open code block, null outside one.
 * @property {boolean} math - true inside a $$ block.
 * @property {boolean} comment - true inside an HTML comment over several lines.
 */

/**
 * Returns a span with a class around escaped text.
 * @param {string} className - the class.
 * @param {string} text - the text.
 * @returns {string} the HTML.
 */
function formatSpan(className, text) {
    return `<span class="${className}">${escapeHtml(text)}</span>`;
}

/**
 * Returns a link or picture with its marks, text and address colored.
 * @param {string} value - "[text](address)" or "![text](address)".
 * @returns {string} the HTML.
 */
function highlightLink(value) {
    const i = value.indexOf('](');
    const open = value[0] === '!' ? 2 : 1;
    return formatSpan('p', value.slice(0, open)) + formatSpan('d', value.slice(open, i)) + formatSpan('p', '](') + formatSpan('a', value.slice(i + 2, -1)) + formatSpan('p', ')');
}

/**
 * Returns one piece found by INLINE with its color.
 * @param {string} value - the piece.
 * @returns {string} the HTML.
 */
function highlightPiece(value) {
    if (value[0] === '`') return formatSpan('s', value);
    if (value[0] === '\\' || value[0] === '$') return formatSpan('e', value);
    if (/^!?\[\^?/.test(value) && value.includes('^')) return formatSpan('d', value);
    if (/^!?\[/.test(value)) return highlightLink(value);
    if (/^<!--/.test(value)) return formatSpan('c', value);
    if (/^<?https?:/.test(value)) return formatSpan('a', value);
    if (value[0] === '<') return formatSpan('k', value);
    return formatSpan('p', value);
}

/**
 * Returns the text of a line with its inline pieces colored.
 * @param {string} text - the text.
 * @returns {string} the HTML.
 */
function highlightInline(text) {
    let out = '', last = 0, match;
    INLINE.lastIndex = 0;
    while ((match = INLINE.exec(text))) {
        const value = match[0];
        if (!value) { INLINE.lastIndex++; continue; }
        out += escapeHtml(text.slice(last, match.index)) + highlightPiece(value);
        last = match.index + value.length;
    }
    return out + escapeHtml(text.slice(last));
}

/**
 * Returns the code with its highlighting, line by line.
 * @param {string} code - the Markdown.
 * @returns {string} the HTML, one line of it per line of code.
 */
export function highlight(code) {
    const highlightState = { fence: null, math: false, comment: false };
    return code.split('\n').map(line => highlightLine(line, highlightState)).join('\n');
}

/**
 * Returns one line with its highlighting: inside a code block, an HTML comment or a math block,
 * or as a line of its own.
 * @param {string} line - the line.
 * @param {HighlightState} highlightState - the state from the lines before; updated.
 * @returns {string} the HTML of the line.
 */
function highlightLine(line, highlightState) {
    if (highlightState.fence) {
        const text = line.replace(/^[\s>]*/, '');
        if (text.startsWith(highlightState.fence) && /^[`~]+\s*$/.test(text)) { highlightState.fence = null; return formatSpan('p', line); }
        return formatSpan('s', line);
    }
    if (highlightState.comment) {
        const i = line.indexOf(COMMENT_END);
        if (i < 0) return formatSpan('c', line);
        highlightState.comment = false;
        return formatSpan('c', line.slice(0, i + COMMENT_END.length)) + highlightInline(line.slice(i + COMMENT_END.length));
    }
    if (highlightState.math) {
        if (line.trim().endsWith('$$')) highlightState.math = false;
        return formatSpan('e', line);
    }
    return highlightBlockStart(line, highlightState) ?? highlightTextLine(line);
}

/**
 * Returns a line that starts a block or is one: a code fence, a $$ line, the start of a
 * comment, a heading, a rule, a setext underline or a table separator.
 * @param {string} line - the line.
 * @param {HighlightState} highlightState - the state; a fence, $$ or comment opens there.
 * @returns {string|null} the HTML, null for a line of text.
 */
function highlightBlockStart(line, highlightState) {
    let match;
    if ((match = /^(\s*(?:>\s?)*)(`{3,}|~{3,})(.*)$/.exec(line)) && !(match[2][0] === '`' && match[3].includes('`'))) {
        highlightState.fence = match[2];
        return formatSpan('p', match[1] + match[2]) + formatSpan('a', match[3]);
    }
    if (/^\s{0,3}\$\$/.test(line)) {
        const rest = line.trim().slice(2);
        if (!rest.trim().endsWith('$$') || rest.trim().length < 2) highlightState.math = true;
        return formatSpan('e', line);
    }
    if (/^\s*<!--/.test(line) && !line.includes(COMMENT_END)) { highlightState.comment = true; return formatSpan('c', line); }
    if ((match = /^(\s{0,3}(?:>\s?)*\s{0,3})(#{1,6})(\s.*|)$/.exec(line))) return formatSpan('p', match[1]) + formatSpan('k h', match[2] + match[3]);
    // Rules, setext underlines and table separators, tested on the trimmed line (a long run of spaces stays linear).
    const text = line.trim(), lead = line.length - line.trimStart().length;
    if (lead <= MAX_BLOCK_INDENT && (/^([-*_])(\s*\1){2,}$/.test(text) || /^=+$/.test(text)) || text.includes('-') && text.includes('|') && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(text)) return formatSpan('p', line);
    return null;
}

/**
 * Returns a line of text: its quote and list markers (with a task box), then the inline pieces.
 * @param {string} line - the line.
 * @returns {string} the HTML.
 */
function highlightTextLine(line) {
    let head = '';
    const quote = /^(\s*(?:>\s?)+)/.exec(line);
    if (quote) head += formatSpan('p', quote[1]);
    let rest = line.slice(quote ? quote[1].length : 0);
    const item = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\](?=\s|$))?/.exec(rest);
    if (item) {
        head += escapeHtml(item[1]) + formatSpan('p', item[2]) + escapeHtml(item[3]) + (item[4] ? formatSpan('d', item[4]) : '');
        rest = rest.slice(item[0].length);
    }
    return head + highlightInline(rest);
}
