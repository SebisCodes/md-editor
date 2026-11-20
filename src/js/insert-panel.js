/**
 * The Insert tab and the toolbar: ready-made pieces for structure, text and math, Greek letters
 * and symbols (inside $…$ when the cursor is outside math), and a link to the Pictures tab. The
 * buttons keep the cursor in the code.
 */

import { state, ui, getElement, getElements } from './state.js?v=2';
import { escapeHtml } from './util.js?v=3';
import { addSnippet, applyMarkSwitch } from './code-edit.js?v=3';
import { addNamedSnippet, GREEK, GREEK_CHARACTERS, SYMBOLS } from './snippets.js?v=3';

/**
 * Returns a button of the Insert tab.
 * @param {string} key - the snippet's key.
 * @param {string} label - the button's text.
 * @param {string} [title] - its tooltip; the label when left out.
 * @returns {string} the HTML.
 */
function renderInsertButton(key, label, title) {
    return `<button type="button" class="button" data-ins="${key}" title="${escapeHtml(title || label)}">${label}</button>`;
}

/**
 * Draws the Insert tab.
 * @returns {void}
 */
export function renderInsert() {
    const button = renderInsertButton;
    ui.insert.innerHTML = `
        <div class="insert-group"><h3>Structure</h3><div class="insert-grid">
            ${button('h1', 'Heading 1', '# Heading')}${button('h2', 'Heading 2', '## Heading')}${button('h3', 'Heading 3', '### Heading')}${button('hr', 'Horizontal rule', '---')}${button('newpage', 'New page')}
            ${button('ul', '• Bulleted list')}${button('ol', '1. Numbered list')}${button('task', '☐ Task list')}${button('table', 'Table')}
            ${button('quote', 'Quote')}${button('code', 'Code block')}${button('details', 'Fold-out section')}${button('br', 'Line break')}
        </div></div>
        <div class="insert-group"><h3>Text</h3><div class="insert-grid">
            ${button('bold', 'Bold', '**bold** (Ctrl+B)')}${button('italic', 'Italic', '*italic* (Ctrl+I)')}${button('strike', 'Strikethrough', '~~struck through~~')}${button('inlinecode', 'Code in the text', '`code` between backticks')}
            ${button('link', 'Link', '[text](https://…) (Ctrl+K)')}${button('anchor', 'Link to a heading', '[text](#heading)')}${button('picture', 'Insert picture', '![description](name.png)')}${button('footnote', 'Footnote', '[^1] at the cursor, the note at the end')}
            ${button('kbd', 'Key', 'A key as on the keyboard: <kbd>Ctrl</kbd>')}
        </div></div>
        <div class="insert-group"><h3>Math</h3><div class="insert-grid">
            ${button('inline-math', '$x$ in the text')}${button('display', 'Displayed', '$$ … $$ on its own lines')}
            ${button('frac', 'Fraction')}${button('sqrt', 'Root')}${button('sup', 'x² Power')}${button('sub', 'x₁ Index')}
            ${button('sum', '∑ Sum')}${button('int', '∫ Integral')}${button('lim', 'lim Limit')}${button('matrix', '2×2 matrix')}
            ${button('cases', 'Cases')}
        </div>
        <h3>Greek letters</h3><div class="symbol-grid" data-no-i18n>${GREEK.map((name, i) => `<button type="button" data-sym="\\${name}" title="\\${name}">${GREEK_CHARACTERS[i]}</button>`).join('')}</div>
        <h3>Symbols</h3><div class="symbol-grid" data-no-i18n>${SYMBOLS.map(([tex, character]) => `<button type="button" data-sym="${escapeHtml(tex)}" title="${escapeHtml(tex)}">${character}</button>`).join('')}</div></div>
        <div class="insert-group"><h3>Pictures</h3>
            <p class="hint">Pictures have their own tab: <button type="button" class="link-button" data-goto-pics>Pictures</button>.</p>
        </div>`;
}

/**
 * Tells whether a position of the code is inside $…$ or $$…$$.
 * @param {number} position - the position.
 * @returns {boolean} true inside math.
 */
function isInMath(position) {
    const before = state.code.slice(0, position).replace(/\\\$/g, '');
    const blocks = (before.match(/^\s*\$\$/gm) || []).length;
    if (blocks % 2 === 1) return true;
    const line = before.slice(before.lastIndexOf('\n') + 1);
    return (line.match(/\$/g) || []).length % 2 === 1;
}

/**
 * Connects the toolbar's marks and snippets and the buttons of the Insert tab.
 * @returns {void}
 */
export function startInsertPanel() {
    // Toolbar buttons keep the cursor in the code (mousedown would move the focus).
    getElements('[data-wrap], [data-snippet]').forEach(button => button.addEventListener('mousedown', event => event.preventDefault()));
    getElements('[data-wrap]').forEach(button => button.addEventListener('click', () => applyMarkSwitch(button.dataset.wrap)));
    getElements('[data-snippet]').forEach(button => button.addEventListener('click', () => addNamedSnippet(button.dataset.snippet)));
    ui.insert.addEventListener('mousedown', event => { if (event.target.closest('[data-ins], [data-sym]')) event.preventDefault(); });
    ui.insert.addEventListener('click', handleInsertClick);
}

/**
 * Runs a button of the Insert tab: a snippet, a symbol (inside $…$ when the cursor is outside
 * math), or the switch to the Pictures tab (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handleInsertClick(event) {
    const snippetButton = event.target.closest('[data-ins]');
    if (snippetButton) { addNamedSnippet(snippetButton.dataset.ins); return; }
    const symbolButton = event.target.closest('[data-sym]');
    if (symbolButton) {
        const tex = symbolButton.dataset.sym;
        addSnippet(isInMath(ui.ta.selectionStart) ? tex + (/[a-z]$/i.test(tex) ? ' ' : '') : `$${tex}$`, false);
        return;
    }
    if (event.target.closest('[data-goto-pics]')) getElement('[data-itab=pictures]').click();
}
