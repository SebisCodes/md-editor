/**
 * The snippets of the toolbar, the Insert tab and the shortcuts: Markdown for structure, text
 * and math. "‸" marks where the cursor goes, "§" stands for the selected text; a block
 * snippet stands on its own lines (code-edit.js addSnippet()).
 */

import { state, ui } from './state.js?v=2';
import { addSnippet, addFootnote } from './code-edit.js?v=3';
import { getAltText } from './picture-refs.js?v=3';

/** Each snippet by key: [text, true for a block snippet]. */
const SNIPPETS = {
    h1: ['# ‸§', true], h2: ['## ‸§', true], h3: ['### ‸§', true],
    ul: ['- ‸§\n- ', true], ol: ['1. ‸§\n2. ', true], task: ['- [ ] ‸§\n- [ ] ', true],
    table: ['| ‸Column | Column |\n|--------|--------|\n| Cell   | Cell   |\n| Cell   | Cell   |', true],
    quote: ['> ‸§', true], code: ['```\n‸§\n```', true], hr: ['---\n‸', true], newpage: ['<div style="page-break-after: always"></div>\n\n‸', true],
    details: ['<details>\n<summary>‸Summary</summary>\n\n§\n\n</details>', true],
    bold: ['**‸§**', false], italic: ['*‸§*', false], strike: ['~~‸§~~', false], inlinecode: ['`‸§`', false],
    link: ['[§](‸https://)', false], anchor: ['[§](#‸)', false], picture: ['![‸Description](picture.png)', false],
    kbd: ['<kbd>‸§</kbd>', false], br: ['<br>\n‸', false],
    'inline-math': ['$‸§$', false], display: ['$$\n‸§\n$$', true],
    frac: ['\\frac{‸§}{}', false], sqrt: ['\\sqrt{‸§}', false], sup: ['^{‸§}', false], sub: ['_{‸§}', false],
    sum: ['\\sum_{i=1}^{n} ‸', false], int: ['\\int_{a}^{b} ‸ \\, dx', false], lim: ['\\lim_{x \\to \\infty} ‸', false],
    matrix: ['\\begin{pmatrix} ‸a & b \\\\ c & d \\end{pmatrix}', false],
    cases: ['f(x) = \\begin{cases} ‸1 & x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}', false],
};

/** The Greek letters of the Insert tab, as TeX names and as characters (in the same order). */
export const GREEK = 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega'.split(' ');
export const GREEK_CHARACTERS = 'αβγδϵεζηθϑικλμνξπρστυϕφχψωΓΔΘΛΞΠΣΦΨΩ';
/** The math symbols of the Insert tab: [TeX, character]. */
export const SYMBOLS = [['\\leq', '≤'], ['\\geq', '≥'], ['\\neq', '≠'], ['\\approx', '≈'], ['\\equiv', '≡'], ['\\sim', '∼'], ['\\pm', '±'], ['\\times', '×'], ['\\cdot', '·'], ['\\div', '÷'],
    ['\\infty', '∞'], ['\\partial', '∂'], ['\\nabla', '∇'], ['\\in', '∈'], ['\\notin', '∉'], ['\\subset', '⊂'], ['\\subseteq', '⊆'], ['\\cup', '∪'], ['\\cap', '∩'], ['\\emptyset', '∅'],
    ['\\forall', '∀'], ['\\exists', '∃'], ['\\neg', '¬'], ['\\land', '∧'], ['\\lor', '∨'], ['\\to', '→'], ['\\Rightarrow', '⇒'], ['\\Leftrightarrow', '⇔'], ['\\mapsto', '↦'], ['\\leftarrow', '←'],
    ['\\mathbb{R}', 'ℝ'], ['\\mathbb{N}', 'ℕ'], ['\\mathbb{Z}', 'ℤ'], ['\\mathbb{Q}', 'ℚ'], ['\\mathbb{C}', 'ℂ'], ['\\ldots', '…'], ['\\cdots', '⋯'], ['\\circ', '∘'], ['\\angle', '∠'], ['\\perp', '⊥']];

/**
 * Inserts the snippet of a key at the cursor; a footnote has its own way.
 * @param {string} key - the snippet's key (data-snippet, data-ins).
 * @returns {void}
 */
export function addNamedSnippet(key) {
    if (key === 'footnote') { addFootnote(); return; }
    const [snippet, isBlock] = SNIPPETS[key];
    addSnippet(getSnippetText(key, snippet), isBlock);
}

/**
 * Returns the text of a snippet for the open document: a link without a selection gets a
 * placeholder text, a link to a heading the first heading, a picture the first picture of the document.
 * @param {string} key - the snippet's key.
 * @param {string} snippet - the snippet as listed.
 * @returns {string} the snippet to insert.
 */
function getSnippetText(key, snippet) {
    const selection = state.code.slice(ui.ta.selectionStart, ui.ta.selectionEnd);
    if (key === 'link' && !selection) return '[‸Link text](https://)';
    if (key === 'anchor') {
        const first = state.result?.outline[0];
        const anchor = first ? first.id.replace(/^md-/, '') : '';
        return selection ? `[§](#‸${anchor})` : `[‸${first ? first.title : 'Link text'}](#${anchor})`;
    }
    const pictures = Object.keys(state.assets);
    if (key === 'picture' && pictures.length) return `![‸${getAltText(pictures[0])}](${pictures[0]})`;
    return snippet;
}
