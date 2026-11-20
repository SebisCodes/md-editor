/**
 * Setting the code and the undo history. Every change of the code goes through setCode(): it
 * renders the preview, makes an undo step, stores the document and tells sync.js. Typing makes
 * its undo step after a pause (code-input.js). A picture renamed with its references is one
 * step: Undo and Redo rename the picture back and forth with the code.
 */

import { state, areas, ui, getElement, showToast } from './state.js?v=2';
import { assets } from './assets.js?v=6';
import { renderPreview } from './preview.js?v=3';
import { renderPictures } from './pictures-panel.js?v=3';
import { saveToStorage } from './storage.js?v=3';

/** The most undo steps a document keeps. */
const MAX_HISTORY_STEPS = 300;

/**
 * Sets the code: renders it, makes one undo step unless history is false, stores it and tells
 * the page around the editor.
 * @param {string} code - the new code.
 * @param {object} [options] - history: false to make no undo step.
 * @returns {void}
 */
export function setCode(code, { history = true } = {}) {
    const ta = ui.ta;
    const scrollTop = ta.scrollTop, scrollLeft = ta.scrollLeft, selectionStart = ta.selectionStart, selectionEnd = ta.selectionEnd;
    // Typing still waiting for its undo step gets it first, so Undo after this change goes back to that text.
    if (history && state.histTimer) { clearTimeout(state.histTimer); state.histTimer = 0; addHistoryStep(); }
    state.code = code;
    if (ta.value !== code) {
        ta.value = code;
        ta.scrollTop = scrollTop; ta.scrollLeft = scrollLeft;
        if (document.activeElement === ta) ta.setSelectionRange(Math.min(selectionStart, code.length), Math.min(selectionEnd, code.length));
    }
    renderPreview();
    if (history) addHistoryStep();
    saveToStorage();
    areas.sync?.handleChange();
}

/**
 * Enables Undo and Redo as far as there is something to undo or redo.
 * @returns {void}
 */
export function updateHistoryButtons() {
    const last = state.history[state.history.length - 1];
    getElement('#btn-undo').disabled = !(state.history.length > 1 || (last && last.code !== state.code));
    getElement('#btn-redo').disabled = !state.future.length;
}

/**
 * Makes an undo step of the current code (or moves the cursor of the last step when the code
 * is the same) and clears the redo steps.
 * @returns {void}
 */
export function addHistoryStep() {
    const last = state.history[state.history.length - 1];
    const selection = ui.ta.selectionStart;
    if (last && last.code === state.code) { last.sel = selection; return; }
    state.history.push({ code: state.code, sel: selection });
    if (state.history.length > MAX_HISTORY_STEPS) state.history.shift();
    state.future = [];
    updateHistoryButtons();
}

/**
 * Makes the undo step that typing still waits for, so a change from a button, a shortcut or
 * the page is a step of its own.
 * @returns {void}
 */
export function addPendingHistoryStep() {
    clearTimeout(state.histTimer);
    if (state.history[state.history.length - 1]?.code !== state.code) addHistoryStep();
}

/**
 * Gives a picture another name while its references change with Undo or Redo; nothing happens
 * when the picture is not there or the new name is taken.
 * @param {string} from - the picture's name.
 * @param {string} to - its new name.
 * @returns {void}
 */
function renameStepPicture(from, to) {
    if (!Object.hasOwn(state.assets, from) || Object.hasOwn(state.assets, to)) return;
    const pictures = {};
    for (const [name, dataUrl] of Object.entries(state.assets)) pictures[name === from ? to : name] = dataUrl;
    state.assets = pictures;
    assets.set(state.fileId, pictures);
    renderPictures();
}

/**
 * Goes back one undo step, with its cursor (and the name of a picture renamed in it).
 * @returns {void}
 */
export function undo() {
    clearTimeout(state.histTimer);
    if (state.history[state.history.length - 1]?.code !== state.code) addHistoryStep();
    if (state.history.length < 2) { showToast('Nothing to undo'); return; }
    const undone = state.history.pop();
    state.future.push(undone);
    if (undone.rename) renameStepPicture(undone.rename[1], undone.rename[0]);
    const step = state.history[state.history.length - 1];
    setCode(step.code, { history: false });
    if (step.sel != null) ui.ta.setSelectionRange(Math.min(step.sel, state.code.length), Math.min(step.sel, state.code.length));
}

/**
 * Goes forward one undo step that Undo took back.
 * @returns {void}
 */
export function redo() {
    const step = state.future.pop();
    if (!step) { showToast('Nothing to redo'); return; }
    state.history.push(step);
    if (step.rename) renameStepPicture(step.rename[0], step.rename[1]);
    setCode(step.code, { history: false });
}
