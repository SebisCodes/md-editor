/**
 * The Outline tab: the headings of the document, indented by level; a click on one goes there
 * in the code and in the preview.
 */

import { state, ui, NARROW_SCREEN } from './state.js?v=2';
import { escapeHtml } from './util.js?v=3';
import { showCodePosition } from './code-view.js?v=3';
import { moveToAnchor } from './preview.js?v=3';
import { showPane } from './layout.js?v=3';

/**
 * Draws the headings of the document, or a hint when it has none.
 * @returns {void}
 */
export function renderOutline() {
    const outline = state.result ? state.result.outline : [];
    if (!outline.length) { ui.tree.innerHTML = '<li class="muted" style="padding:8px">No headings yet - start a line with # and a space.</li>'; return; }
    ui.tree.innerHTML = outline.map(entry => `<li class="lv${entry.level}"><button type="button" class="choice" style="--t:${Math.max(0, entry.level - 1)}" data-pos="${entry.pos}" data-id="${escapeHtml(entry.id)}" data-no-i18n><span class="num">${'#'.repeat(entry.level)}</span><span>${escapeHtml(entry.title)}</span></button></li>`).join('');
}

/**
 * Connects the clicks on the headings.
 * @returns {void}
 */
export function startOutline() {
    ui.tree.addEventListener('click', showClickedHeading);
}

/**
 * Shows the clicked heading in the code and scrolls the preview to it (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function showClickedHeading(event) {
    const button = event.target.closest('[data-pos]');
    if (!button) return;
    if (NARROW_SCREEN.matches) showPane('draw');
    showCodePosition(+button.dataset.pos, !NARROW_SCREEN.matches);
    requestAnimationFrame(() => moveToAnchor(button.dataset.id));
}
