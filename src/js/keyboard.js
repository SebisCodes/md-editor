/**
 * The shortcuts of the page: Ctrl+S saves, Ctrl+E exports, Ctrl+O opens "My documents", Ctrl+P
 * prints, Escape closes the New menu; outside fields and dialogs Ctrl+Z / Ctrl+Y undo and redo
 * and ? opens the help. Shortcuts pause only while typing into a field.
 */

import { TYPING_FIELDS, areas, getElement } from './state.js?v=2';
import { openDialog } from './dialogs.js?v=5';
import { undo, redo } from './history.js?v=3';
import { isNewMenuOpen, setNewMenuOpen } from './documents.js?v=3';
import { saveDocument, showExportDialog, openPrintDialog } from './export-dialog.js?v=3';

/**
 * Connects the shortcuts of the page.
 * @returns {void}
 */
export function startKeyboard() {
    window.addEventListener('keydown', handlePageKey);
}

/**
 * Runs a shortcut of the page (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handlePageKey(event) {
    const active = document.activeElement;
    const isTyping = active && active.matches(TYPING_FIELDS);
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key === 's') { event.preventDefault(); saveDocument(); return; }
    if (modifier && event.key === 'e') { event.preventDefault(); showExportDialog(); return; }
    if (modifier && event.key === 'o') { event.preventDefault(); areas.files.open(); return; }
    if (modifier && event.key === 'p') { event.preventDefault(); openPrintDialog(); return; }
    if (event.key === 'Escape' && isNewMenuOpen()) { setNewMenuOpen(false); return; }
    if (isTyping || getElement('dialog[open]')) return;
    if (modifier && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (modifier && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (modifier) return;
    if (event.key === '?') openDialog(getElement('#help'));
}
