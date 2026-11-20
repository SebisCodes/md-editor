/**
 * The drop place of a picture moved on the page (picture-move.js): the place under the pointer
 * (beside another picture, in its place, before or after a block, after a list item) and the
 * line or frame that shows it.
 */

import { ui, getClamped } from './state.js?v=2';
import { getPictureLine } from './picture-code.js?v=2';

/** The pictures of the page that can be moved and dropped on. */
export const PICTURES = 'img[data-md-p], .md-picture-missing[data-md-p], .md-file[data-md-p]';
/** The width of the drop line and the gaps around it, in pixels. */
const LINE_WIDTH = 3;
const LINE_GAP = 2;
const FRAME_GAP = 3;
/** How far two pictures may overlap and still stand one above the other, in pixels. */
const ROW_OVERLAP = 2;
/** The gap of a drop line before the first or after the last block, in pixels. */
const BLOCK_GAP = 6;
/** Half the width of a picture's middle zone, as a share of its width: a drop there swaps two pictures. */
const SWAP_ZONE_HALF_WIDTH = 0.25;

const dropLine = document.createElement('div');

/**
 * Puts the hidden drop line on the page.
 * @returns {void}
 */
export function startDropLine() {
    dropLine.className = 'picture-target';
    dropLine.hidden = true;
    dropLine.setAttribute('aria-hidden', 'true');
    document.body.append(dropLine);
}

/**
 * Hides the drop line.
 * @returns {void}
 */
export function hideDropLine() {
    dropLine.hidden = true;
}

/**
 * Returns the drop place under the pointer: over another picture, beside it (or in its place
 * when both are alone in a table cell, the middle of the target); else before or after the
 * nearest top-level block, or after a list item (inside that item).
 * @param {number} x - the pointer's x in the viewport.
 * @param {number} y - the pointer's y in the viewport.
 * @param {HTMLElement} movingPicture - the picture being moved.
 * @returns {import('./picture-code.js').DropTarget|null} the drop place, null when the page has no block.
 */
export function findDropTarget(x, y, movingPicture) {
    for (const picture of ui.doc.querySelectorAll(PICTURES)) {
        if (picture === movingPicture) continue;
        const box = picture.getBoundingClientRect();
        if (x < box.left || x > box.right || y < box.top || y > box.bottom || !box.width) continue;
        const swap = isAloneInCell(movingPicture) && isAloneInCell(picture) && Math.abs(x - (box.left + box.width / 2)) < box.width * SWAP_ZONE_HALF_WIDTH;
        const below = !swap && isStacked(picture, movingPicture);
        return { pic: picture, swap, below, after: below ? y > box.top + box.height / 2 : x > box.left + box.width / 2 };
    }
    const { block, distance } = findNearestBlock(y);
    if (!block) return null;
    const items = /^[ou]l$/.test(block.localName) && !distance ? [...block.children].filter(item => item.matches('li[data-md-e]')) : [];
    if (items.length) return findItemTarget(block, items, y);
    const box = block.getBoundingClientRect();
    return { el: block, after: y > box.top + box.height / 2 };
}

/**
 * Returns the top-level block of the page nearest to a height.
 * @param {number} y - the height in the viewport.
 * @returns {{block: HTMLElement|null, distance: number}} the block (null when there is none) and its distance, 0 over it.
 */
function findNearestBlock(y) {
    let block = null, distance = Infinity;
    for (const element of ui.doc.children) {
        if (element.dataset.mdE == null || element.dataset.mdP === '' || element.hidden) continue;
        const box = element.getBoundingClientRect();
        const d = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
        if (d < distance) { distance = d; block = element; }
    }
    return { block, distance };
}

/**
 * Returns the drop place in a list under the pointer: after the item over whose lower half it
 * is, else after the item before (before the list for the first item).
 * @param {HTMLElement} list - the list.
 * @param {HTMLElement[]} items - its items with their lines in the code.
 * @param {number} y - the pointer's y in the viewport.
 * @returns {import('./picture-code.js').DropTarget} the drop place.
 */
function findItemTarget(list, items, y) {
    let item = items[0];
    for (const candidate of items) if (candidate.getBoundingClientRect().top <= y) item = candidate;
    const box = item.getBoundingClientRect();
    if (y > box.top + box.height / 2) return { el: item, after: true, item: true };
    if (item === items[0]) return { el: list, after: false };
    return { el: items[items.indexOf(item) - 1], after: true, item: true };
}

/**
 * Tells whether a picture stands alone in its table cell.
 * @param {HTMLElement} picture - the picture on the page.
 * @returns {boolean} true when the cell holds this picture and no other text.
 */
function isAloneInCell(picture) {
    const cell = picture.closest('td, th');
    return !!cell && ui.doc.contains(cell) && cell.querySelectorAll(PICTURES).length === 1 && cell.textContent.trim() === picture.textContent.trim();
}

/**
 * Tells whether pictures stand one above the other: the target stands on a line of its own, in
 * the code and on the page.
 * @param {HTMLElement} picture - the target picture.
 * @param {HTMLElement} movingPicture - the picture being moved, which does not count.
 * @returns {boolean} true when no other picture shares its row on the page.
 */
function isStacked(picture, movingPicture) {
    if (!getPictureLine(picture)?.own) return false;
    const box = picture.getBoundingClientRect(), container = picture.parentElement.closest('[data-md-e], td, th') || ui.doc;
    return ![...container.querySelectorAll(PICTURES)].some(other => {
        if (other === picture || other === movingPicture) return false;
        const otherBox = other.getBoundingClientRect();
        return otherBox.top < box.bottom - ROW_OVERLAP && otherBox.bottom > box.top + ROW_OVERLAP;
    });
}

/**
 * Shows the drop place: a line between the block and its neighbor on that side; beside a
 * picture a line at its edge, or a frame around it when the two change places.
 * @param {import('./picture-code.js').DropTarget|null} target - the drop place, null to hide the line.
 * @returns {void}
 */
export function showDropLine(target) {
    dropLine.classList.toggle('swap', !!target?.swap);
    if (!target) { dropLine.hidden = true; return; }
    if (target.pic) showDropAtPicture(target);
    else showDropAtBlock(target);
    dropLine.hidden = false;
}

/**
 * Puts the drop line at the edge of a picture, or the frame around it.
 * @param {import('./picture-code.js').DropTarget} target - the drop place at a picture.
 * @returns {void}
 */
function showDropAtPicture(target) {
    const box = target.pic.getBoundingClientRect();
    const half = LINE_WIDTH / 2;
    const place = target.swap ? [box.left - FRAME_GAP, box.top - FRAME_GAP, box.width + FRAME_GAP * 2, box.height + FRAME_GAP * 2]
        : target.below ? [box.left, (target.after ? box.bottom + LINE_GAP : box.top - LINE_GAP) - half, box.width, LINE_WIDTH]
        : [(target.after ? box.right + LINE_GAP : box.left - LINE_GAP) - half, box.top, LINE_WIDTH, box.height];
    [dropLine.style.left, dropLine.style.top, dropLine.style.width, dropLine.style.height] = place.map(value => value + 'px');
}

/**
 * Puts the drop line between a block and its neighbor, inside the visible part of the preview.
 * @param {import('./picture-code.js').DropTarget} target - the drop place at a block.
 * @returns {void}
 */
function showDropAtBlock(target) {
    dropLine.style.height = '';
    const box = target.el.getBoundingClientRect();
    const neighbor = target.after ? target.el.nextElementSibling : target.el.previousElementSibling;
    const neighborBox = neighbor && neighbor.getBoundingClientRect();
    const y = target.after ? (neighborBox && neighborBox.height ? (box.bottom + neighborBox.top) / 2 : box.bottom + BLOCK_GAP)
        : (neighborBox && neighborBox.height ? (neighborBox.bottom + box.top) / 2 : box.top - BLOCK_GAP);
    const view = ui.scroller.getBoundingClientRect();
    dropLine.style.left = box.left + 'px';
    dropLine.style.width = box.width + 'px';
    dropLine.style.top = getClamped(y, Math.max(view.top, 0), Math.min(view.bottom, innerHeight)) - LINE_WIDTH / 2 + 'px';
}
