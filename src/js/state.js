/**
 * The editor's state and the parts every module shares: what makes this the Markdown editor,
 * the open document with its rendered page and undo history, the page elements, the areas set
 * up at start (line wrap, sync, AI …) and a few small helpers.
 *
 * The code is the single source of truth: the preview is rendered from it (markdown.js), and
 * the insert buttons and the edits on the page change the code. The field names of the state
 * are read and set by the tests through window.mdEditor.state (code, name, fileId, assets,
 * result).
 */

/** The prefix of the storage keys, the messages and the language settings. */
export const PREFIX = 'mdeditor';
/** The editor's short name in messages and conversions. */
export const EDITOR = 'md';
/** The localStorage key of the settings and the open document's id. */
export const SETTINGS_KEY = PREFIX + '.v1';
/** The height of one line of code, in pixels. */
export const LINE_HEIGHT = 20;
/** The width below which the editor shows one view at a time. */
export const NARROW_SCREEN = matchMedia('(max-width: 860px)');
/** The name of a document without one. */
export const DEFAULT_NAME = 'Document';
/** The name of a document from an AI without a name of its own. */
export const AI_DOCUMENT = 'AI document';
/** The message shown when the browser storage is full. */
export const STORAGE_FULL = 'The browser storage is full';
/** The message shown when the browser storage is full while a document is made. */
export const STORAGE_FULL_FIRST = 'The browser storage is full - delete or download documents under "My documents" first';
/** The message shown when the code changed while an edit on the page was open. */
export const CHANGED_MEANWHILE = 'The code changed meanwhile - the edit was not used';
/** The fields that take typing: shortcuts and pasted pictures leave them alone. */
export const TYPING_FIELDS = 'textarea, select, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button])';
/** How long a toast stays, in milliseconds. */
const TOAST_TIME = 2600;

/**
 * A problem the preview found (markdown.js render()).
 * @typedef {object} Problem
 * @property {number} pos - the position in the code.
 * @property {string} kind - "error" or "warn".
 * @property {string} msg - the message.
 */

/**
 * A heading of the document (markdown.js render()).
 * @typedef {object} OutlineEntry
 * @property {number} level - 1 to 6.
 * @property {string} title - the heading's text.
 * @property {number} pos - where it starts in the code.
 * @property {string} id - its anchor id ("md-<slug>").
 */

/**
 * What markdown.js render() returns.
 * @typedef {object} RenderResult
 * @property {HTMLDivElement} root - the page.
 * @property {OutlineEntry[]} outline - the headings.
 * @property {Problem[]} problems - the problems, sorted by position.
 * @property {number} words - the number of words on the page.
 */

/**
 * A step of the undo history.
 * @typedef {object} HistoryStep
 * @property {string} code - the code.
 * @property {number} sel - the cursor in the code.
 * @property {string[]} [rename] - a picture renamed in this step: [old name, new name].
 */

/**
 * The editor's state.
 * @typedef {object} EditorState
 * @property {string} code - the document's code.
 * @property {RenderResult|null} result - the rendered page of the code shown.
 * @property {Array<Array>} srcEls - the blocks of the preview with their place in the code: [offset, element], sorted.
 * @property {number} split - the share of the width the code takes.
 * @property {number} size - the text size of the preview (1 = 100%).
 * @property {string} name - the document's name.
 * @property {string} fileId - the document's id in "My documents", "" for none.
 * @property {Object<string, string>} assets - the document's pictures: name -> data URI.
 * @property {HistoryStep[]} history - the undo steps; the last one is the current code.
 * @property {HistoryStep[]} future - the redo steps.
 * @property {number} histTimer - the timer that makes an undo step of typing.
 * @property {boolean} showProblems - true when the list of problems is open.
 * @property {HTMLElement|null} lastMark - the block of the preview framed for the cursor.
 * @property {string|null} savedCode - the code as last stored or read from storage.
 * @property {number} saveTimer - the timer that stores the code after typing; 0 until the first typing.
 * @property {string|null} shownCode - the code the preview shows.
 * @property {number} renderTimer - the timer that renders the preview after typing.
 */

/** @type {EditorState} */
export const state = {
    code: '', result: null, srcEls: [],
    split: 0.5, size: 1,
    name: DEFAULT_NAME, fileId: '', assets: {},
    history: [], future: [], histTimer: 0,
    showProblems: true, lastMark: null,
    savedCode: null, saveTimer: 0, shownCode: null, renderTimer: 0,
};

/**
 * The areas set up at start by app.js; null until then.
 * @typedef {object} EditorAreas
 * @property {object|null} i18n - the interface language (i18n.js).
 * @property {object|null} lineWrap - the line wrap of the code view (wrap.js).
 * @property {object|null} files - the "My documents" dialog (files-dialog.js).
 * @property {object|null} sync - webhook and embedding (sync.js).
 * @property {{updateRemote: function(): void}|null} ai - the AI Assistant.
 * @property {object|null} aiStatus - the AI status at the button (aistatus.js).
 */

/** @type {EditorAreas} */
export const areas = { i18n: null, lineWrap: null, files: null, sync: null, ai: null, aiStatus: null };

/** The undo history of each document opened while the page is open, by id. */
export const historyByDocument = new Map();

/**
 * Returns the first element that matches a selector.
 * @param {string} selector - the CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {HTMLElement|null} the element.
 */
export function getElement(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * Returns every element that matches a selector.
 * @param {string} selector - the CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {HTMLElement[]} the elements.
 */
export function getElements(selector, root = document) {
    return [...root.querySelectorAll(selector)];
}

/** The elements the modules use. */
export const ui = {
    ta: getElement('#code'), hl: getElement('#hl'), marks: getElement('#marks'), gutter: getElement('#gutter'),
    status: getElement('#code-status'), error: getElement('#code-error'),
    stage: getElement('#stage'), scroller: getElement('#scroller'), doc: getElement('#doc'), hint: getElement('#hint'),
    insert: getElement('#insert-wrap'), pictures: getElement('#pics-wrap'), tree: getElement('#tree'),
    work: getElement('#work'), toast: getElement('#toast'),
};

let toastTimer = 0;

/**
 * Translates an interface text into the page's language.
 * @param {string} text - the English text.
 * @returns {string} the translation, or the text as it is.
 */
export function translate(text) {
    return areas.i18n.translate(text);
}

/**
 * Shows a short message at the bottom of the page.
 * @param {string} message - the message.
 * @returns {void}
 */
export function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('shown'), TOAST_TIME);
}

/**
 * Returns a number kept between two limits.
 * @param {number} value - the number.
 * @param {number} min - the lower limit.
 * @param {number} max - the upper limit.
 * @returns {number} the number inside the limits.
 */
export function getClamped(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
