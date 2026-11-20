/**
 * The layout of the work area: the splitter between code and preview (dragged or moved with the
 * arrow keys, remembered), the views on narrow screens (code, preview, side panel), the tabs of
 * the side panel (Insert, Pictures, Outline), and the close buttons of the dialogs.
 */

import { state, ui, getElement, getElements, getClamped } from './state.js?v=2';
import { openDialog } from './dialogs.js?v=5';
import { saveToStorage } from './storage.js?v=3';
import { syncScroll } from './code-view.js?v=3';
import { renderPictures } from './pictures-panel.js?v=3';

/** The smallest and largest share of the width the code takes. */
const MIN_SPLIT = 0.15;
const MAX_SPLIT = 0.85;
/** How far an arrow key moves the splitter, as a share of the width. */
const SPLIT_STEP = 0.03;
const FRACTION_DIGITS = 4;

const splitter = getElement('#splitter');

/**
 * Shows the split between code and preview.
 * @returns {void}
 */
export function showSplit() {
    ui.work.style.setProperty('--code-fr', state.split.toFixed(FRACTION_DIGITS) + 'fr');
    ui.work.style.setProperty('--view-fr', (1 - state.split).toFixed(FRACTION_DIGITS) + 'fr');
}

/**
 * Connects the splitter: dragged with the pointer or moved with the arrow keys.
 * @returns {void}
 */
export function startLayout() {
    splitter.addEventListener('pointerdown', startSplitDrag);
    splitter.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        state.split = getClamped(state.split + (event.key === 'ArrowLeft' ? -SPLIT_STEP : SPLIT_STEP), MIN_SPLIT, MAX_SPLIT);
        showSplit(); saveToStorage();
    });
}

/**
 * Moves the splitter with the pointer until it is released, then stores the split (a
 * pointerdown handler).
 * @param {PointerEvent} event - the press on the splitter.
 * @returns {void}
 */
function startSplitDrag(event) {
    splitter.setPointerCapture(event.pointerId);
    const box = ui.work.getBoundingClientRect();
    const available = box.width - getElement('.inspector').offsetWidth - splitter.offsetWidth;
    /**
     * Follows the pointer.
     * @param {PointerEvent} moveEvent - the movement.
     * @returns {void}
     */
    const moveSplit = moveEvent => { state.split = getClamped((moveEvent.clientX - box.left) / available, MIN_SPLIT, MAX_SPLIT); showSplit(); };
    /**
     * Ends the drag and stores the split.
     * @returns {void}
     */
    const stopSplitDrag = () => { splitter.removeEventListener('pointermove', moveSplit); splitter.removeEventListener('pointerup', stopSplitDrag); saveToStorage(); };
    splitter.addEventListener('pointermove', moveSplit);
    splitter.addEventListener('pointerup', stopSplitDrag);
}

/**
 * Shows one view on a narrow screen.
 * @param {string} pane - "code", "draw" (the preview) or "properties" (the side panel).
 * @returns {void}
 */
export function showPane(pane) {
    ui.work.dataset.show = pane;
    getElements('[data-pane]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.pane === pane)));
    requestAnimationFrame(() => { if (pane === 'code') syncScroll(); });
}

/**
 * Connects the view buttons of narrow screens and the tabs of the side panel.
 * @returns {void}
 */
export function startPanelTabs() {
    getElements('[data-pane]').forEach(button => button.addEventListener('click', () => showPane(button.dataset.pane)));
    getElements('[data-itab]').forEach(button => button.addEventListener('click', () => showPanelTab(button)));
}

/**
 * Shows a tab of the side panel; the Pictures tab is drawn when it opens.
 * @param {HTMLElement} tabButton - the tab's button.
 * @returns {void}
 */
function showPanelTab(tabButton) {
    getElements('[data-itab]').forEach(button => button.setAttribute('aria-selected', String(button === tabButton)));
    ui.insert.hidden = tabButton.dataset.itab !== 'insert';
    ui.pictures.hidden = tabButton.dataset.itab !== 'pictures';
    if (!ui.pictures.hidden) renderPictures();
    getElement('#tree-wrap').hidden = tabButton.dataset.itab !== 'structure';
}

/**
 * Connects the close buttons of the dialogs, a click beside a dialog, and the help button.
 * @returns {void}
 */
export function startDialogs() {
    getElements('dialog [data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    getElements('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
    getElement('#btn-help').addEventListener('click', () => openDialog(getElement('#help')));
}
