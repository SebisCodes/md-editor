/**
 * Moving pictures on the page. A picture is grabbed with the pointer and dropped between blocks
 * (paragraphs, headings, list items, quotes, tables …); a line shows where it lands. Its code
 * moves there in one undo step (picture-code.js). Dropped on another picture it goes right
 * beside that picture; two pictures each alone in a table cell change places (a frame shows
 * it, picture-drop.js).
 *
 * The flow of a move:
 *   1. pointerdown on a picture notes it; a mouse moves it once the pointer has gone a few
 *      pixels (a press without movement stays a click), a finger first rests on the picture for
 *      a moment (a swipe scrolls the page as ever), then the picture dims and follows;
 *   2. while it moves, the drop place under the pointer is shown, and near the top or bottom
 *      edge the page scrolls along;
 *   3. pointerup drops it, Escape or a cancelled pointer ends the move without a change; the
 *      click that follows a move is no click on the page.
 * Blocks carry data-md-p … data-md-e, their lines in the code (markdown-parser.js).
 */

import { state, ui, CHANGED_MEANWHILE, showToast } from './state.js?v=2';
import { setCode, addPendingHistoryStep } from './history.js?v=3';
import { showCodePosition } from './code-view.js?v=3';
import { isTextEditing, stopTextEdit } from './inplace.js?v=3';
import { getPictureRange, isLinkedPicture, getCutRange, getMovedCode } from './picture-code.js?v=2';
import { PICTURES, startDropLine, hideDropLine, showDropLine, findDropTarget } from './picture-drop.js?v=3';

/** How far a mouse moves before the picture follows, in pixels. */
const MOVE_MIN = 4;
/** How long a finger rests on a picture before it follows, in milliseconds. */
const HOLD_MS = 400;
/** How far a finger may move while it rests, in pixels. */
const HOLD_MAX = 8;
/** How long a click after a move is ignored, in milliseconds. */
const CLICK_PAUSE = 400;
/** The zone at the top and bottom edge where the page scrolls along, in pixels at most. */
const SCROLL_EDGE = 48;
/** The page scrolls by a third of the distance into the edge zone per frame. */
const SCROLL_SPEED = 3;
/** The edge zone is at most a fifth of the visible height. */
const EDGE_SHARE = 5;
const CHANGED_IN_CODE = 'This picture changed in the code - wait for the preview, then try again';

/**
 * A picture being moved.
 * @typedef {object} Move
 * @property {HTMLElement} el - the picture on the page.
 * @property {number} id - the pointer's id.
 * @property {boolean} touch - true for a finger.
 * @property {number} x0 - where the pointer went down, x.
 * @property {number} y0 - where the pointer went down, y.
 * @property {number} x - where the pointer is, x.
 * @property {number} y - where the pointer is, y.
 * @property {boolean} started - true once the picture follows the pointer.
 * @property {number} [hold] - the timer of a resting finger.
 * @property {number} [raf] - the animation frame of the scrolling at the edges.
 * @property {string} [code] - the code when the move started.
 * @property {number[]} [pic] - [from, to] of the picture's code.
 * @property {number[]} [cut] - [from, to] of what leaves the code with it.
 * @property {import('./picture-code.js').DropTarget|null} [target] - the drop place.
 */

/** @type {Move|null} */
let moving = null;
let noClickUntil = 0;

/**
 * Connects the pointer, touch and click events of the page for moving pictures.
 * @returns {void}
 */
export function startPictureMove() {
    startDropLine();
    ui.doc.addEventListener('dragstart', event => { if (event.target.closest?.(PICTURES)) event.preventDefault(); });
    ui.doc.addEventListener('pointerdown', startPointerOnPicture);
    ui.doc.addEventListener('pointermove', movePicture);
    // Capture phase: the end of a move is no click and no edit on the page.
    ui.doc.addEventListener('pointerup', stopMoveOnPage, true);
    addEventListener('pointercancel', event => { if (moving && event.pointerId === moving.id) stopMove(false); });
    // While a finger moves a picture, the page does not scroll, and the long press opens no menu.
    addEventListener('touchmove', event => { if (moving?.started) event.preventDefault(); }, { passive: false });
    ui.doc.addEventListener('contextmenu', event => { if (moving?.touch) event.preventDefault(); });
    addEventListener('pointerup', event => { if (moving && event.pointerId === moving.id) stopMove(true); });
    addEventListener('click', stopClickAfterMove, true);
}

/**
 * Notes a picture pressed with the main button (a pointerdown handler); a finger starts the
 * move after resting a moment.
 * @param {PointerEvent} event - the press.
 * @returns {void}
 */
function startPointerOnPicture(event) {
    const picture = event.button === 0 && !event.ctrlKey && !event.metaKey && !moving && event.target.closest(PICTURES);
    if (!picture || picture.isContentEditable) return;
    const touch = event.pointerType === 'touch';
    if (!touch) event.preventDefault();
    const move = moving = { el: picture, id: event.pointerId, touch, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, started: false };
    if (touch) move.hold = setTimeout(() => { if (moving === move && startMove(move)) updateDropTarget(); }, HOLD_MS);
}

/**
 * Follows the pointer: starts the move once a mouse has gone far enough (a finger that moves
 * before resting ends it), then shows the drop place (a pointermove handler).
 * @param {PointerEvent} event - the movement.
 * @returns {void}
 */
function movePicture(event) {
    const move = moving;
    if (!move || event.pointerId !== move.id) return;
    move.x = event.clientX; move.y = event.clientY;
    if (!move.started) {
        const distance = Math.hypot(move.x - move.x0, move.y - move.y0);
        if (move.touch) { if (distance >= HOLD_MAX) stopMove(false); return; }
        if (distance < MOVE_MIN || !startMove(move)) return;
        try { move.el.setPointerCapture(move.id); } catch (e) { /* the pointer is gone */ }
    }
    updateDropTarget();
}

/**
 * Drops the picture where the pointer is released on the page (a pointerup handler in the
 * capture phase: a started move stops the event).
 * @param {PointerEvent} event - the release.
 * @returns {void}
 */
function stopMoveOnPage(event) {
    const move = moving;
    if (!move || event.pointerId !== move.id) return;
    if (move.started) { event.stopPropagation(); move.x = event.clientX; move.y = event.clientY; updateDropTarget(); }
    stopMove(true);
}

/**
 * Stops the click that follows a move (a click handler in the capture phase).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function stopClickAfterMove(event) {
    if (performance.now() >= noClickUntil) return;
    noClickUntil = 0;
    event.stopPropagation();
    event.preventDefault();
}

/**
 * Starts moving a picture whose code matches the page: dims it, ends an edit on the page and
 * scrolls along at the edges. Returns whether the move started (the caller goes
 * on only then).
 * @param {Move} move - the noted picture.
 * @returns {boolean} true when the picture follows the pointer.
 */
function startMove(move) {
    const range = state.code === state.shownCode ? getPictureRange(+move.el.dataset.mdP, isLinkedPicture(move.el)) : null;
    if (!range) { moving = null; showToast(CHANGED_IN_CODE); return false; }
    if (isTextEditing()) stopTextEdit(true);
    Object.assign(move, { started: true, code: state.code, pic: range, cut: getCutRange(move.el, range[0], range[1]) });
    if (move.cut[0] > range[0] || move.cut[1] < range[1]) move.cut = range;
    getSelection().removeAllRanges();
    document.body.classList.add('picture-drag');
    move.el.classList.add('dragging');
    addEventListener('keydown', stopMoveOnEscape, true);
    move.raf = requestAnimationFrame(() => moveViewAtEdges(move));
    return true;
}

/**
 * Ends a started move without a change on Escape (a keydown handler in the capture phase).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function stopMoveOnEscape(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    stopMove(false);
}

/**
 * Scrolls the page while the pointer is near its top or bottom edge, every frame of the move.
 * @param {Move} move - the picture being moved.
 * @returns {void}
 */
function moveViewAtEdges(move) {
    const view = ui.scroller.getBoundingClientRect(), top = Math.max(view.top, 0), bottom = Math.min(view.bottom, innerHeight);
    const edge = Math.min(SCROLL_EDGE, (bottom - top) / EDGE_SHARE);
    const distance = move.y < top + edge ? move.y - top - edge : move.y > bottom - edge ? move.y - bottom + edge : 0;
    if (distance) { ui.scroller.scrollTop += Math.round(distance / SCROLL_SPEED); updateDropTarget(); }
    move.raf = requestAnimationFrame(() => moveViewAtEdges(move));
}

/**
 * Finds and shows the drop place under the pointer of a started move.
 * @returns {void}
 */
function updateDropTarget() {
    if (!moving?.started) return;
    moving.target = findDropTarget(moving.x, moving.y, moving.el);
    showDropLine(moving.target);
}

/**
 * Ends the move: drops the picture with drop (one undo step) when its code is still the code
 * the move started on, or ends it without a change.
 * @param {boolean} drop - true to move the picture's code to the drop place.
 * @returns {void}
 */
function stopMove(drop) {
    const move = moving;
    if (!move) return;
    moving = null;
    clearTimeout(move.hold);
    cancelAnimationFrame(move.raf);
    removeEventListener('keydown', stopMoveOnEscape, true);
    hideDropLine();
    document.body.classList.remove('picture-drag');
    move.el.classList.remove('dragging');
    if (!move.started) return;
    noClickUntil = performance.now() + CLICK_PAUSE;
    if (!drop || !move.target) return;
    if (state.code !== state.shownCode || state.code !== move.code) { showToast(CHANGED_MEANWHILE); return; }
    const moved = getMovedCode(move, move.target);
    if (!moved) return;
    addPendingHistoryStep();
    setCode(moved.code);
    showCodePosition(moved.from, true, moved.to);
}
