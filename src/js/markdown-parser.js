/**
 * The markdown-it parser of the preview, told where each piece of text stands in the code.
 *
 * The parser is markdown-it (CommonMark) with tables, strikethrough, autolinks (linkify),
 * footnotes (markdown-it-footnote), task lists and math (markdown-math.js). Both libraries are
 * loaded as plain scripts from src/vendor before the modules run.
 *
 * Places in the code (read by the preview, the edits on the page and the moving of pictures):
 *   data-md-p="offset"   on blocks, table cells, links, math and code: a click there puts the
 *                        code's cursor at that offset;
 *   data-md-e="offset"   on blocks: where the line after the block starts;
 *   <span class="t" data-md-s="offset">   text that stands in the code exactly as shown
 *                        (backslash escapes allowed): it can be edited on the page.
 * The inline parser is told to remember where each piece of text starts in the inline content
 * (_ps … _pe for pending text, _s for every pushed token, _src the content it refers to); core
 * rules then map that content back to the lines of the code (paragraphs, headings, list items,
 * quotes, table cells). Every mapped run is checked against the code before it is offered.
 *
 * The core rules that map the tokens to the code are in markdown-places.js.
 */

import { escapeHtml } from './util.js?v=3';
import { parseInlineMath, parseMathBlock, renderMathHolder } from './markdown-math.js?v=2';
import { addTaskBoxes, addCodePlaces } from './markdown-places.js?v=2';

/** How many characters newlines and autolinks may take off the end of pending text. */
const PENDING_TRIM_LIMIT = 12;

/**
 * Creates the parser with the patches and rules described in the header.
 * @returns {object} the markdown-it instance.
 */
export function createParser() {
    const parser = window.markdownit({ html: true, linkify: true, typographer: false });
    if (window.markdownitFootnote) parser.use(window.markdownitFootnote);
    // Escapes stay separate tokens, so text can be mapped back to the code.
    parser.core.ruler.disable('text_join');
    addInlinePositions(parser);
    addLinkifyPositions(parser);
    parser.inline.ruler2.at('fragments_join', joinTextFragments);
    parser.inline.ruler.after('escape', 'math_inline', parseInlineMath);
    parser.block.ruler.before('fence', 'math_block', parseMathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
    parser.core.ruler.push('md_tasks', addTaskBoxes);
    parser.core.ruler.push('md_places', addCodePlaces);
    addRendererRules(parser);
    return parser;
}

/**
 * Makes the inline parser remember where each token's text starts in the inline content.
 * @param {object} parser - the markdown-it instance.
 * @returns {void}
 */
function addInlinePositions(parser) {
    const inlineState = parser.inline.State.prototype;
    const pushPending = inlineState.pushPending, push = inlineState.push;
    /**
     * Pushes the pending text and notes its range (_ps … _pe). Newlines and autolinks take a
     * few characters off the end of the pending text.
     * @returns {object} the text token.
     */
    inlineState.pushPending = function () {
        const end = this.pos, source = this.src;
        const token = pushPending.call(this);
        const content = token.content;
        for (let k = 0; k <= PENDING_TRIM_LIMIT && end - k - content.length >= 0; k++) {
            if (source.slice(end - k - content.length, end - k) === content) { token._ps = end - k - content.length; token._pe = end - k; token._src = source; break; }
        }
        return token;
    };
    /**
     * Pushes a token and notes where it starts (_s).
     * @param {string} type - the token type.
     * @param {string} tag - the HTML tag.
     * @param {number} nesting - 1 opens, -1 closes, 0 neither.
     * @returns {object} the token.
     */
    inlineState.push = function (type, tag, nesting) {
        const at = this.pos, source = this.src;
        const token = push.call(this, type, tag, nesting);
        token._s = at;
        token._src = source;
        return token;
    };
}

/**
 * An address written without markup (claude.ai, www.example.com) is made a link by a core rule
 * that builds the text around it anew, without the places of its pieces: they are taken from
 * the text it replaced, so that text stays editable on the page.
 * @param {object} parser - the markdown-it instance.
 * @returns {void}
 */
function addLinkifyPositions(parser) {
    const linkify = parser.core.ruler.__rules__.find(rule => rule.name === 'linkify');
    if (!linkify) return;
    const linkifyRule = linkify.fn;
    parser.core.ruler.at('linkify', state => {
        const before = state.tokens.map(token => (token.type === 'inline' ? token.children.slice() : null));
        linkifyRule(state);
        state.tokens.forEach((token, i) => { if (before[i]) setLinkifiedPositions(before[i], token.children); });
    });
}

/**
 * Sets the places of the tokens that took the place of a text token. The pieces stand in the
 * order of the replaced text; a piece whose text is not found there (an address shown other
 * than written) keeps no place.
 * @param {object[]} formerTokens - the children before the linkify rule.
 * @param {object[]} tokens - the children after it.
 * @returns {void}
 */
function setLinkifiedPositions(formerTokens, tokens) {
    let j = 0;
    for (let o = 0; o < formerTokens.length; o++) {
        const former = formerTokens[o];
        if (tokens[j] === former) { j++; continue; }
        let k = j;
        while (k < tokens.length && tokens[k] !== formerTokens[o + 1]) k++;
        if (former.type === 'text' && former._ps != null && former._src != null) setPiecePositions(former, tokens.slice(j, k));
        j = k;
    }
}

/**
 * Sets the places of the text pieces that replaced one text token.
 * @param {object} former - the replaced text token, with its range.
 * @param {object[]} pieces - the tokens that took its place.
 * @returns {void}
 */
function setPiecePositions(former, pieces) {
    const source = former._src;
    let position = former._ps, inLink = false;
    for (const piece of pieces) {
        if (piece.type === 'link_open') inLink = true;
        if (piece.type === 'link_close') inLink = false;
        if (piece.type !== 'text') continue;
        // Text after a link shown other than written is looked for further on.
        let at = source.startsWith(piece.content, position) ? position : inLink ? -1 : source.indexOf(piece.content, position);
        if (at >= 0 && at + piece.content.length > former._pe) at = -1;
        if (at < 0) continue;
        piece._ps = at;
        piece._pe = at + piece.content.length;
        piece._src = source;
        position = piece._pe;
    }
}

/**
 * Joins adjacent text tokens as markdown-it does, keeping the range when it is contiguous
 * (replaces markdown-it's fragments_join rule).
 * @param {object} state - markdown-it's inline state.
 * @returns {void}
 */
function joinTextFragments(state) {
    const tokens = state.tokens;
    let level = 0, last = 0, current;
    for (current = 0; current < tokens.length; current++) {
        if (tokens[current].nesting < 0) level--;
        tokens[current].level = level;
        if (tokens[current].nesting > 0) level++;
        if (tokens[current].type === 'text' && current + 1 < tokens.length && tokens[current + 1].type === 'text') {
            joinTextPair(tokens[current], tokens[current + 1]);
        } else {
            if (current !== last) tokens[last] = tokens[current];
            last++;
        }
    }
    if (current !== last) tokens.length = last;
}

/**
 * Joins a text token into the one after it; the joined token keeps a range only when both
 * ranges are known and touch.
 * @param {object} first - the first text token.
 * @param {object} second - the text token after it, which takes the joined text.
 * @returns {void}
 */
function joinTextPair(first, second) {
    if (first._ps == null && first._s != null && first._src.slice(first._s, first._s + first.content.length) === first.content) { first._ps = first._s; first._pe = first._s + first.content.length; }
    let secondStart = second._ps ?? (first._pe != null && first._src === second._src ? first._pe : second._s);
    let secondEnd = second._pe ?? (secondStart != null ? secondStart + second.content.length : null);
    if (secondStart == null || second._src == null || second._src.slice(secondStart, secondEnd) !== second.content) secondStart = secondEnd = null;
    const contiguous = first._ps != null && secondStart != null && first._src === second._src && first._pe === secondStart;
    second.content = first.content + second.content;
    second._ps = contiguous ? first._ps : null;
    second._pe = contiguous ? secondEnd : null;
    second._src = first._src;
}

/**
 * A markdown-it renderer rule (the shape markdown-it dictates).
 * @callback RendererRule
 * @param {object[]} tokens - the tokens of the block or line.
 * @param {number} i - the index of the token to render.
 * @param {object} options - markdown-it's options.
 * @param {object} env - the render environment (the math holders of the document).
 * @param {object} renderer - the renderer.
 * @returns {string} the HTML of the token.
 */

/**
 * Sets the renderer's rules: math holders, task boxes, escapes, raw HTML without data-md-*
 * (they belong to the renderer), the places of code blocks, and editable runs of text.
 * @param {object} parser - the markdown-it instance.
 * @returns {void}
 */
function addRendererRules(parser) {
    const rules = parser.renderer.rules;
    /** Renders an inline formula as its holder. @type {RendererRule} */
    rules.math_inline = (tokens, i, options, env) => renderMathHolder(env, tokens[i], false);
    /** Renders a formula block as its holder. @type {RendererRule} */
    rules.math_block = (tokens, i, options, env) => renderMathHolder(env, tokens[i], true) + '\n';
    /** Renders the box of a task list item. @type {RendererRule} */
    rules.task_box = (tokens, i) => `<input type="checkbox" class="md-task" data-md-box="${tokens[i].box}"${tokens[i].checked ? ' checked' : ''}> `;
    /** Renders an escaped character as text. @type {RendererRule} */
    rules.text_special = (tokens, i) => escapeHtml(tokens[i].content);
    /** Renders raw inline HTML without data-md-* attributes. @type {RendererRule} */
    rules.html_inline = (tokens, i) => getNeutralHtml(tokens[i].content);
    /** Renders a raw HTML block without data-md-* attributes. @type {RendererRule} */
    rules.html_block = (tokens, i) => getNeutralHtml(tokens[i].content);
    const fence = rules.fence;
    /** Renders a fenced code block with its place in the code. @type {RendererRule} */
    rules.fence = (tokens, i, options, env, renderer) => fence(tokens, i, options, env, renderer).replace('<pre>', `<pre data-md-p="${tokens[i].absP ?? ''}" data-md-e="${tokens[i].absE ?? ''}">`);
    const codeBlock = rules.code_block;
    /** Renders an indented code block with its place in the code. @type {RendererRule} */
    rules.code_block = (tokens, i, options, env, renderer) => codeBlock(tokens, i, options, env, renderer).replace('<pre', `<pre data-md-p="${tokens[i].absP ?? ''}" data-md-e="${tokens[i].absE ?? ''}"`);
    parser.renderer.renderInline = renderInlineWithRuns;
}

/**
 * Returns raw HTML with its data-md-* attributes renamed: they belong to the renderer.
 * @param {string} html - the raw HTML.
 * @returns {string} the HTML with data-x-* in their place.
 */
function getNeutralHtml(html) {
    return html.replace(/data-md-/gi, 'data-x-');
}

/**
 * Tells whether an inline token is text that stands in the code as shown.
 * @param {object} token - the inline token.
 * @returns {boolean} true for text and escapes with a place in the code.
 */
function isRunToken(token) {
    return token.abs != null && (token.type === 'text' || (token.type === 'text_special' && token.info === 'escape'));
}

/**
 * Renders inline tokens; text that stands in the code as shown becomes an editable run (the
 * shape of markdown-it's renderInline, called on its renderer).
 * @param {object[]} tokens - the inline tokens.
 * @param {object} options - markdown-it's options.
 * @param {object} env - the render environment.
 * @returns {string} the HTML.
 */
function renderInlineWithRuns(tokens, options, env) {
    let out = '';
    const rules = this.rules;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (isRunToken(token)) {
            let j = i, text = '', end = token.abs;
            while (j < tokens.length && isRunToken(tokens[j]) && tokens[j].abs === end) { text += tokens[j].content; end += tokens[j].type === 'text' ? tokens[j].content.length : tokens[j].markup.length; j++; }
            out += `<span class="t" data-md-s="${token.abs}">${escapeHtml(text)}</span>`;
            i = j - 1;
            continue;
        }
        out += rules[token.type] ? rules[token.type](tokens, i, options, env, this) : this.renderToken(tokens, i, options);
    }
    return out;
}
