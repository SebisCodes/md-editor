/**
 * The list of problems above the code: errors and notes the preview found, each with its line;
 * a click (or Enter) on one shows its place in the code and in the preview. The list can be
 * hidden and shown again.
 */

import { state, ui, NARROW_SCREEN } from './state.js?v=2';
import { escapeHtml } from './util.js?v=3';
import { getLineIndex } from './text-position.js?v=2';
import { showCodePosition } from './code-view.js?v=3';
import { showSourceMark } from './preview.js?v=3';
import { showPane } from './layout.js?v=3';

/** The most problems the list shows. */
const MAX_LISTED_PROBLEMS = 60;

/**
 * Draws the list of problems with the number of errors and notes; hidden when there are none.
 * @returns {void}
 */
export function renderProblems() {
    const problems = state.result ? state.result.problems : [];
    const box = ui.error;
    if (!problems.length) { box.hidden = true; return; }
    const errors = problems.filter(problem => problem.kind === 'error').length, notes = problems.length - errors;
    const counts = [];
    if (errors) counts.push(`<b>${errors} ${errors === 1 ? 'error' : 'errors'}</b>`);
    if (notes) counts.push(`${notes} ${notes === 1 ? 'note' : 'notes'}`);
    const items = problems.slice(0, MAX_LISTED_PROBLEMS).map(renderProblemItem).join('');
    box.innerHTML = `<div class="pr-header"><span>${counts.join(' · ')}</span><button type="button" class="button small" data-toggle-probs>${state.showProblems ? 'Hide' : 'Show'}</button></div>${state.showProblems ? `<ul>${items}</ul>` : ''}`;
    box.classList.toggle('only-warnings', !errors);
    box.hidden = false;
}

/**
 * Returns the list item of a problem.
 * @param {import('./state.js').Problem} problem - the problem.
 * @param {number} index - its index in the problems.
 * @returns {string} the HTML.
 */
function renderProblemItem(problem, index) {
    const isError = problem.kind === 'error';
    return `<li class="${isError ? 'err' : 'warn'}"><div class="pr-row" role="button" tabindex="0" data-prob="${index}"><span class="kind">${isError ? '✕' : '!'}</span><span class="line-number">Line ${getLineIndex(problem.pos) + 1}</span><span>${escapeHtml(problem.msg)}</span></div></li>`;
}

/**
 * Connects the list: Enter and Space on a problem, clicks on a problem and on Hide / Show.
 * @returns {void}
 */
export function startProblems() {
    ui.error.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-prob]')) { event.preventDefault(); event.target.click(); }
    });
    ui.error.addEventListener('click', showClickedProblem);
}

/**
 * Shows the clicked problem in the code and the preview, or hides or shows the list; text being
 * selected to copy it keeps the click (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function showClickedProblem(event) {
    if (event.target.closest('[data-prob]') && String(getSelection())) return;
    if (event.target.closest('[data-toggle-probs]')) { state.showProblems = !state.showProblems; renderProblems(); return; }
    const row = event.target.closest('[data-prob]');
    if (!row) return;
    const problem = state.result.problems[+row.dataset.prob];
    if (NARROW_SCREEN.matches) showPane('code');
    showCodePosition(problem.pos);
    showSourceMark();
}
