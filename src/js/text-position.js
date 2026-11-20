/**
 * Lines and positions in the open document's code.
 */

import { state } from './state.js?v=2';

/**
 * Returns the line of a position in the code.
 * @param {number} position - the character offset, 0-based.
 * @returns {number} the line, 0-based.
 */
export function getLineIndex(position) {
    let line = 0;
    for (let i = state.code.indexOf('\n'); i >= 0 && i < position; i = state.code.indexOf('\n', i + 1)) line++;
    return line;
}

/**
 * Returns where a line starts in the code; past the last line the end of the code (also for a
 * huge or endless number).
 * @param {number} line - the line, 1-based.
 * @returns {number} the character offset of the line's start.
 */
export function getLinePosition(line) {
    let position = 0;
    for (let l = 1; l < line; l++) {
        const lineBreak = state.code.indexOf('\n', position);
        if (lineBreak < 0) return state.code.length;
        position = lineBreak + 1;
    }
    return position;
}

/**
 * Returns where the line of a position starts in a text.
 * @param {string} text - the text.
 * @param {number} position - the character offset.
 * @returns {number} the offset after the line break before the position, 0 on the first line.
 */
export function getLineStartOf(text, position) {
    return text.lastIndexOf('\n', position - 1) + 1;
}
