/**
 * The core rules of the markdown-it parser (markdown-parser.js) that map tokens to the code:
 * check boxes for task lists, and the places in the code of blocks, table cells, editable text,
 * links, code, pictures and math, with the ids of headings for #anchors and the outline. The
 * inline content of each block is mapped back to the lines of the code (paragraphs, headings,
 * list items, quotes, table cells); every mapped run is checked against the code.
 */

/** The prefix of the ids of headings and of ids in raw HTML. */
export const ID_PREFIX = 'md-';
/** The anchor of a heading without letters or digits. */
const DEFAULT_SLUG = 'section';

/**
 * Where the reading of a table stands.
 * @typedef {object} TableCursor
 * @property {number} row - the line of the row being read, -1 when it is not known.
 * @property {number} cellCursor - where the next cell starts in the row's line.
 */

/**
 * Returns GitHub's anchor of a heading: lower case, punctuation removed, spaces as "-".
 * @param {string} text - the heading's text.
 * @returns {string} the anchor without "#".
 */
export function getSlug(text) {
    return String(text).trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}


/**
 * Turns "- [ ]" and "- [x]" at the start of a list item into check boxes (a core rule).
 * @param {object} state - markdown-it's core state.
 * @returns {void}
 */
export function addTaskBoxes(state) {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
        const first = token.children[0];
        if (!first || first.type !== 'text') continue;
        const match = /^\[([ xX])\](?:[ \t]+|$)/.exec(first.content);
        if (!match) continue;
        const box = new state.Token('task_box', 'input', 0);
        box.checked = match[1] !== ' ';
        box.boxAt = first._ps;                       // the [ in the inline content
        box._src = first._src;
        first.content = first.content.slice(match[0].length);
        if (first._ps != null) first._ps += match[0].length;
        token.children.unshift(box);
        tokens[i - 2].attrJoin('class', 'task-item');
        setTaskListClass(tokens, i - 2);
    }
}

/**
 * Gives the list around a task item the class task-list.
 * @param {object[]} tokens - the block tokens.
 * @param {number} itemIndex - the index of the item's list_item_open.
 * @returns {void}
 */
function setTaskListClass(tokens, itemIndex) {
    for (let k = itemIndex - 1; k >= 0; k--) {
        if ((tokens[k].type === 'bullet_list_open' || tokens[k].type === 'ordered_list_open') && tokens[k].level === tokens[itemIndex].level - 1) {
            if (!/\btask-list\b/.test(tokens[k].attrGet('class') || '')) tokens[k].attrJoin('class', 'task-list');
            return;
        }
    }
}

/**
 * Returns a function that maps a position in the inline content of a block to the offset in
 * the code, line by line.
 * @param {string} content - the inline content.
 * @param {number} from - the block's first line.
 * @param {number} to - the line after the block.
 * @param {string} code - the whole code.
 * @param {number[]} starts - the offsets of the line starts.
 * @param {number|null} cellFrom - in a table cell: where to look for the cell in its row; null elsewhere.
 * @returns {function(number): (number|null)} the offset in the code, null when the line is not found.
 */
function createOffsetMap(content, from, to, code, starts, cellFrom) {
    const lines = content.split('\n');
    const local = [], absolute = [];
    let at = 0;
    for (let i = 0; i < lines.length; i++) {
        const contentLine = lines[i], lineIndex = from + i;
        local.push(at);
        at += contentLine.length + 1;
        if (lineIndex >= to || lineIndex >= starts.length) { absolute.push(-1); continue; }
        const lineStart = starts[lineIndex], lineEnd = lineIndex + 1 < starts.length ? starts[lineIndex + 1] - 1 : code.length;
        const k = findContentInLine(code.slice(lineStart, lineEnd), contentLine, cellFrom);
        absolute.push(k < 0 ? -1 : lineStart + k);
    }
    return position => {
        let i = local.length - 1;
        while (i > 0 && local[i] > position) i--;
        return absolute[i] < 0 ? null : absolute[i] + (position - local[i]);
    };
}

/**
 * Returns where a line of inline content stands in its line of code: after the markers of
 * lists and quotes, so at the line's end.
 * @param {string} codeLine - the line of code.
 * @param {string} contentLine - the line of inline content.
 * @param {number|null} cellFrom - in a table cell: where to start looking; null elsewhere.
 * @returns {number} the offset in the line, -1 when it is not there.
 */
function findContentInLine(codeLine, contentLine, cellFrom) {
    if (cellFrom != null) return codeLine.indexOf(contentLine, cellFrom);
    if (codeLine.endsWith(contentLine)) return codeLine.length - contentLine.length;
    const trimmedCode = codeLine.trimEnd(), trimmedContent = contentLine.trimEnd();
    return trimmedContent && trimmedCode.endsWith(trimmedContent) ? trimmedCode.length - trimmedContent.length : codeLine.indexOf(contentLine);
}

/**
 * Sets the places in the code on blocks, editable text, links and math; collects fences,
 * tables, #links and pictures for the problems, and gives headings their ids for the outline
 * (a core rule).
 * @param {object} state - markdown-it's core state; env holds code, starts and the lists.
 * @returns {void}
 */
export function addCodePlaces(state) {
    const env = state.env, tokens = state.tokens;
    const usedSlugs = new Map();
    const table = { row: -1, cellCursor: 0 };
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        addBlockPlace(token, env);
        if (token.type === 'tr_open') { table.row = token.map ? token.map[0] : -1; table.cellCursor = 0; }
        if (token.type === 'fence') env.fences.push(token);
        if (token.type === 'table_open') env.tables.push(token);
        if (token.type !== 'inline') continue;
        const isCell = /^t[dh]_open$/.test(tokens[i - 1]?.type || '');
        const offsetOf = createInlineOffsetMap(token, isCell, env, table);
        if (!offsetOf) continue;
        if (isCell) setCellPlace(tokens[i - 1], token, offsetOf, env, table);
        for (const child of token.children) addInlinePlace(child, token, offsetOf, env);
        if (tokens[i - 1] && tokens[i - 1].type === 'heading_open') addHeading(tokens[i - 1], token, env, usedSlugs);
    }
}

/**
 * Returns the offset of a line start, or the code's end past the last line.
 * @param {object} env - the render environment with code and starts.
 * @param {number} line - the line, 0-based.
 * @returns {number} the offset.
 */
export function getLineOffset(env, line) {
    return line < env.starts.length ? env.starts[line] : env.code.length;
}

/**
 * Notes a block's lines in the code (absP, absE) and writes them as data-md-p and data-md-e,
 * except on blocks whose renderer writes them itself.
 * @param {object} token - a block token.
 * @param {object} env - the render environment.
 * @returns {void}
 */
function addBlockPlace(token, env) {
    if (!token.map || token.nesting < 0 || token.type === 'inline') return;
    token.absP = getLineOffset(env, token.map[0]);
    token.absE = getLineOffset(env, token.map[1]);
    if (!/^(html_block|fence|code_block|math_block)$/.test(token.type)) { token.attrSet('data-md-p', String(token.absP)); token.attrSet('data-md-e', String(token.absE)); }
}

/**
 * Returns the offset map of an inline token: a table cell is looked for in its row, other
 * blocks by their lines.
 * @param {object} token - the inline token.
 * @param {boolean} isCell - true when the token is the content of a table cell.
 * @param {object} env - the render environment.
 * @param {TableCursor} table - the table row being read and where its next cell starts.
 * @returns {(function(number): (number|null))|null} the offset map; null for a block without
 *   lines or a cell of a row whose line is not known.
 */
function createInlineOffsetMap(token, isCell, env, table) {
    if (!isCell) return token.map ? createOffsetMap(token.content, token.map[0], token.map[1], env.code, env.starts, null) : null;
    if (table.row < 0) return null;
    return createOffsetMap(token.content, table.row, table.row + 1, env.code, env.starts, table.cellCursor);
}

/**
 * Gives a table cell its place in the code (data-md-p; the row's start when the cell is not
 * found) and moves the table cursor after it.
 * @param {object} open - the cell's td_open or th_open token.
 * @param {object} token - the cell's inline token.
 * @param {function(number): (number|null)} offsetOf - the offset map of the cell.
 * @param {object} env - the render environment.
 * @param {TableCursor} table - the table row being read; its cellCursor is updated.
 * @returns {void}
 */
function setCellPlace(open, token, offsetOf, env, table) {
    const cellStart = offsetOf(0);
    if (cellStart != null) { table.cellCursor = cellStart - getLineOffset(env, table.row) + token.content.length; open.attrSet('data-md-p', String(cellStart)); }
    else open.attrSet('data-md-p', String(getLineOffset(env, table.row)));
}

/**
 * Sets the place of an inline token: the start of editable text (abs), the place of links,
 * code, pictures and math (absP, data-md-p), the code of a task box; notes #links and pictures.
 * @param {object} child - the inline token.
 * @param {object} token - the inline block token that holds it.
 * @param {function(number): (number|null)} offsetOf - the offset map of the block.
 * @param {object} env - the render environment.
 * @returns {void}
 */
function addInlinePlace(child, token, offsetOf, env) {
    const code = env.code;
    if (child._src !== token.content) return;
    if (child.type === 'text' && child._ps != null) {
        const at = offsetOf(child._ps);
        if (at != null && code.slice(at, at + child.content.length) === child.content) child.abs = at;
    } else if (child.type === 'text_special' && child.info === 'escape' && child._s != null) {
        const at = offsetOf(child._s);
        if (at != null && code.slice(at, at + child.markup.length) === child.markup) child.abs = at;
    }
    if (child._s != null && child.type !== 'text') {
        const at = offsetOf(child._s);
        if (at != null) {
            child.absP = at;
            if (/^(link_open|code_inline|image)$/.test(child.type)) child.attrSet('data-md-p', String(child.type === 'link_open' && at > 0 ? at - 1 : at));
        }
    }
    const blockStart = getLineOffset(env, token.map ? token.map[0] : 0);
    if (child.type === 'task_box' && child.boxAt != null) { const at = offsetOf(child.boxAt); child.box = at != null && code[at] === '[' ? at + 1 : ''; }
    if (child.type === 'link_open') { const href = child.attrGet('href') || ''; if (href.startsWith('#')) env.links.push({ href, pos: child.absP ?? blockStart }); }
    if (child.type === 'image') env.images.push({ src: child.attrGet('src') || '', pos: child.absP ?? blockStart });
}

/**
 * Gives a heading its id for #anchors (GitHub's slug, numbered when taken) and an entry in the outline.
 * @param {object} open - the heading_open token.
 * @param {object} token - the heading's inline token.
 * @param {object} env - the render environment.
 * @param {Map<string, number>} usedSlugs - how often each slug is taken; updated.
 * @returns {void}
 */
function addHeading(open, token, env, usedSlugs) {
    const title = token.children.filter(child => child.type === 'text' || child.type === 'code_inline' || child.type === 'text_special').map(child => child.content).join('').trim();
    let slug = getSlug(title) || DEFAULT_SLUG;
    const count = usedSlugs.get(slug) || 0;
    usedSlugs.set(slug, count + 1);
    if (count) slug += '-' + count;
    open.attrSet('id', ID_PREFIX + slug);
    env.outline.push({ level: +open.tag.slice(1), title, pos: open.absP ?? 0, id: ID_PREFIX + slug });
}

