/**
 * Text positions on the page of the preview: the character under a point, a range at a point
 * and the cursor's offset inside a run of text. Used by the edits on the page (inplace.js).
 */

/**
 * A place in a text node.
 * @typedef {object} TextPlace
 * @property {Text} node - the text node.
 * @property {number} offset - the offset in it.
 */

/**
 * Returns the text position under a point inside an element, from the boxes of its characters.
 * Unlike caretPositionFromPoint this also holds in pages shown with CSS zoom. Beside the
 * characters (right of a line's end, in the space between lines) the nearest character within
 * about a line counts, so a click right of a line's end lands at its end.
 * @param {Element} element - the element.
 * @param {number} x - the point's x in the viewport.
 * @param {number} y - the point's y in the viewport.
 * @returns {TextPlace|null} the place before the character under the point, or after it when
 *   the point is on its right half; null when no character of the element is that near.
 */
export function findCharacterAt(element, x, y) {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = element.ownerDocument.createRange();
    let best = null, bestDy = Infinity, bestDx = Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let i = 0; i < node.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            for (const box of range.getClientRects()) {
                const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
                if (dy > box.height) continue;                                       // another line
                const offset = x < box.left + box.width / 2 ? i : i + 1;
                if (!dy && x >= box.left && x <= box.right) return { node, offset };
                const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
                if (dy < bestDy || (dy === bestDy && dx < bestDx)) { bestDy = dy; bestDx = dx; best = { node, offset }; }
            }
        }
    }
    return best;
}

/**
 * Returns a collapsed range at the text position under a point: inside the run when it is
 * given, else from the browser's caret functions.
 * @param {number} x - the point's x in the viewport.
 * @param {number} y - the point's y in the viewport.
 * @param {Element} [run] - the run of text the point belongs to.
 * @returns {Range|null} the range, null when the browser finds no position.
 */
export function getRangeAtPoint(x, y, run) {
    const character = run && findCharacterAt(run, x, y);
    if (character) { const range = document.createRange(); range.setStart(character.node, character.offset); return range; }
    if (document.caretPositionFromPoint) {
        const caret = document.caretPositionFromPoint(x, y);
        if (!caret) return null;
        const range = document.createRange(); range.setStart(caret.offsetNode, caret.offset); return range;
    }
    return document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
}

/**
 * Returns how many characters stand before the cursor inside a run.
 * @param {Element} run - the run of text.
 * @returns {number} the characters before the cursor, 0 when the cursor is not in the run.
 */
export function getCaretOffset(run) {
    const selection = getSelection();
    if (!selection.rangeCount || !run.contains(selection.anchorNode)) return 0;
    const range = document.createRange();
    range.selectNodeContents(run);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
}
