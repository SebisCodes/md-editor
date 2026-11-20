/**
 * Math in Markdown for the markdown-it parser (markdown-parser.js): $…$ and $$…$$ in the text,
 * $$ blocks on lines of their own, and the empty holders the renderer writes for them. KaTeX
 * fills the holders after the raw HTML is cleaned (markdown.js), so math never passes the
 * cleaning as HTML.
 *
 * The rules follow markdown-it's API: they get its state, return whether they matched and push
 * tokens only when silent is false (API-dictated shapes).
 */

const DOLLAR = 0x24;
/** Code blocks start at this indentation; a $$ there is code. */
const CODE_INDENT = 4;

/**
 * Reads $…$ or $$…$$ in the text (a markdown-it inline rule). A $ that opens is not followed by
 * a space, one that closes is not after a space and not before a digit ("costs $5 or $6").
 * @param {object} state - markdown-it's inline state.
 * @param {boolean} silent - true to test only, without pushing a token.
 * @returns {boolean} true when math starts here.
 */
export function parseInlineMath(state, silent) {
    const source = state.src, start = state.pos, max = state.posMax;
    if (source.charCodeAt(start) !== DOLLAR) return false;
    if (source.charCodeAt(start + 1) === DOLLAR) return parseDoubleDollarMath(state, silent);
    if (start + 1 >= max || /\s/.test(source[start + 1])) return false;
    const end = findClosingDollar(source, start + 1, max);
    if (end < 0) return false;
    const tex = source.slice(start + 1, end);
    if (/\n\s*\n/.test(tex)) return false;
    if (!silent) addInlineMath(state, tex, '$');
    state.pos = end + 1;
    return true;
}

/**
 * Reads $$…$$ inside a line of text (a part of the inline rule).
 * @param {object} state - markdown-it's inline state, at the first $.
 * @param {boolean} silent - true to test only.
 * @returns {boolean} true when the math is closed and not empty.
 */
function parseDoubleDollarMath(state, silent) {
    const source = state.src, start = state.pos;
    const end = source.indexOf('$$', start + 2);
    if (end < 0 || end + 2 > state.posMax || !source.slice(start + 2, end).trim()) return false;
    if (!silent) addInlineMath(state, source.slice(start + 2, end), '$$');
    state.pos = end + 2;
    return true;
}

/**
 * Returns where a $ closes the inline math: not escaped, not after a space, not before a digit.
 * @param {string} source - the inline content.
 * @param {number} from - the position after the opening $.
 * @param {number} max - the end of the inline content.
 * @returns {number} the position of the closing $, -1 when there is none.
 */
function findClosingDollar(source, from, max) {
    let end = from;
    for (;;) {
        end = source.indexOf('$', end);
        if (end < 0 || end >= max) return -1;
        if (source[end - 1] === '\\') { end++; continue; }
        if (/\s/.test(source[end - 1]) || /\d/.test(source[end + 1] || '')) { end++; continue; }
        return end;
    }
}

/**
 * Pushes a math_inline token.
 * @param {object} state - markdown-it's inline state.
 * @param {string} tex - the formula.
 * @param {string} markup - "$" or "$$".
 * @returns {void}
 */
function addInlineMath(state, tex, markup) {
    const token = state.push('math_inline', 'math', 0);
    token.content = tex;
    token.markup = markup;
}

/**
 * Reads $$ on a line of its own (or $$ … $$ on one line) up to the line that ends with $$ (a
 * markdown-it block rule). A $$ that is never closed is noted in env.unclosedMath.
 * @param {object} state - markdown-it's block state.
 * @param {number} startLine - the line where the block would start.
 * @param {number} endLine - the line after the last one to look at.
 * @param {boolean} silent - true to test only, without pushing a token.
 * @returns {boolean} true when a math block starts here.
 */
export function parseMathBlock(state, startLine, endLine, silent) {
    const start = state.bMarks[startLine] + state.tShift[startLine], max = state.eMarks[startLine];
    if (state.sCount[startLine] - state.blkIndent >= CODE_INDENT) return false;
    if (state.src.slice(start, start + 2) !== '$$') return false;
    const first = state.src.slice(start + 2, max);
    let line = startLine, tex;
    if (first.trim().endsWith('$$') && first.trim().length >= 2) {
        tex = first.trim().slice(0, -2);
    } else {
        const block = findMathBlockEnd(state, startLine, endLine, first);
        if (!block) {
            if (!silent) (state.env.unclosedMath ||= []).push(startLine);
            return false;
        }
        ({ line, tex } = block);
    }
    if (silent) return true;
    state.line = line + 1;
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = tex.trim();
    token.markup = '$$';
    token.map = [startLine, state.line];
    return true;
}

/**
 * Returns the lines of a math block up to the line that ends with $$.
 * @param {object} state - markdown-it's block state.
 * @param {number} startLine - the line with the opening $$.
 * @param {number} endLine - the line after the last one to look at.
 * @param {string} first - the text after the opening $$.
 * @returns {{line: number, tex: string}|null} the closing line and the formula, null when the block is not closed.
 */
function findMathBlockEnd(state, startLine, endLine, first) {
    const parts = [first];
    for (let line = startLine + 1; line < endLine; line++) {
        const lineStart = state.bMarks[line] + state.tShift[line], lineEnd = state.eMarks[line];
        if (lineStart < lineEnd && state.sCount[line] < state.blkIndent) return null;
        const text = state.src.slice(lineStart, lineEnd);
        if (text.trim().endsWith('$$')) { parts.push(text.trim().slice(0, -2)); return { line, tex: parts.join('\n') }; }
        parts.push(state.src.slice(state.bMarks[line], lineEnd));
    }
    return null;
}

/**
 * Returns the empty holder of a formula and notes the formula in env.math; render() puts the
 * typeset formula in after the cleaning.
 * @param {object} env - the render environment (markdown.js render()).
 * @param {object} token - the math token, with its place in the code (absP, absE).
 * @param {boolean} display - true for a math block.
 * @returns {string} the holder's HTML.
 */
export function renderMathHolder(env, token, display) {
    env.math.push({ tex: token.content, display, pos: token.absP ?? 0 });
    const tag = display ? 'div' : 'span';
    return `<${tag} class="${display ? 'md-math-block' : 'md-math'}" data-md-math="${env.math.length - 1}"${token.absP != null ? ` data-md-p="${token.absP}"` : ''}${display && token.absE != null ? ` data-md-e="${token.absE}"` : ''}></${tag}>`;
}
