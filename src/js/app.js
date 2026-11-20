/**
 * Markdown editor: the code on the left, the document as a readable page in the middle, insert,
 * pictures and the outline beside them. This file starts the editor and wires its areas
 * together; each area has its own module (state.js describes the shared state).
 *
 * The code is the single source of truth: the preview is rendered from it (markdown.js), and
 * the insert buttons and the edits on the page change the code. Blocks of the preview carry
 * data-md-p, their place in the code, so a click on the page leads to the code and the cursor
 * in the code to the page; text that stands in the code as shown can be edited on the page.
 *
 * Start-up steps:
 *   1. the interface language (the AI prompt stays English) and the line wrap of the code;
 *   2. connect the areas: code view, storage, preview, editing and moving pictures on the
 *      page, problems, typing, insert, pictures, outline, documents, opening files, keyboard,
 *      layout, Export and the dialogs;
 *   3. take the stored settings and open the last document (or the welcome example);
 *   4. read its pictures, render it and make the first undo step;
 *   5. start the AI Assistant, the WebMCP tools, the AI status, "Open in another editor" and
 *      sync.js (webhook, embedding, ?src=);
 *   6. offer the test hook window.mdEditor.
 *
 * The review test reads the imports of files.js and assets.js below to load
 * the same module instances: every module imports them with the same ?v=.
 */

import { createI18n } from './i18n.js?v=24';
import { createWrap } from './wrap.js?v=5';
import { store } from './files.js?v=10';
import { assets } from './assets.js?v=6';
import { createSync, VIEWER } from './sync.js?v=23';
import { createAiStatus } from './aistatus.js?v=8';
import './export-menu.js?v=6';
import { startConvert } from './convert-to.js?v=14';
import { START } from './samples.js?v=3';
import { createAi } from './ai.js?v=9';
import { createMcp } from './mcp.js?v=4';
import { state, areas, ui, PREFIX, EDITOR, STORAGE_FULL, showToast, translate } from './state.js?v=2';
import { getSettings, startStorageSync } from './storage.js?v=3';
import { setCode, addHistoryStep, undo, redo } from './history.js?v=3';
import { renderCode, syncScroll, showCodePosition, startCodeView } from './code-view.js?v=3';
import { renderPreview, showTextSize, startPreview } from './preview.js?v=3';
import { startInplaceEditing } from './inplace.js?v=3';
import { startPictureMove } from './picture-move.js?v=3';
import { startProblems } from './problems.js?v=3';
import { startCodeInput } from './code-input.js?v=3';
import { renderInsert, startInsertPanel } from './insert-panel.js?v=3';
import { startPicturesPanel } from './pictures-panel.js?v=3';
import { startPictureStorage } from './pictures.js?v=3';
import { startOutline } from './outline.js?v=3';
import { showFileName, openDocument, createDocumentsDialog, startDocumentButtons } from './documents.js?v=3';
import { startFileImport } from './file-import.js?v=3';
import { startKeyboard } from './keyboard.js?v=3';
import { showSplit, startLayout, startPanelTabs, startDialogs } from './layout.js?v=3';
import { startExportDialog } from './export-dialog.js?v=3';
import { receiveDocument, importExternalDocument } from './incoming.js?v=3';
import {
    getPromptState, getProblemList, getOutlineList, getFileList, openFileByName, createFile, addMarkdown, updateText, showAgentLine,
} from './agent-api.js?v=3';

startEditor();

/**
 * Starts the editor (the flow of the steps in the header).
 * @returns {void}
 */
function startEditor() {
    startLanguageAndWrap();
    connectAreas();
    openStartDocument();
    startDocumentAndAi();
    window.mdEditor = createTestHook();
}

/**
 * Starts the interface language (translated at run time, see i18n.js) and the line wrap of the
 * code view (wrap.js).
 * @returns {void}
 */
function startLanguageAndWrap() {
    // The build of the language pages runs this call as written, so it holds literals only.
    areas.i18n = createI18n({
        prefix: 'mdeditor',
        roots: '.header, .views, #work, #ai-receive, #toast, .storage-hint, dialog',
        skip: '',
    });
    areas.lineWrap = createWrap({ prefix: PREFIX, ta: ui.ta, layers: [ui.hl, ui.marks], gutter: ui.gutter, button: document.getElementById('btn-wrap'), onChange: () => { renderCode(); syncScroll(); } });
}

/**
 * Connects the areas of the page, in the order their listeners take events.
 * @returns {void}
 */
function connectAreas() {
    startCodeView();
    startStorageSync();
    startPreview();
    startInplaceEditing();
    startPictureMove();
    startProblems();
    startCodeInput();
    startInsertPanel();
    startPicturesPanel();
    startOutline();
    areas.files = createDocumentsDialog();
    startDocumentButtons();
    startFileImport();
    startKeyboard();
    startLayout();
    startPanelTabs();
    startExportDialog();
    startDialogs();
    startPictureStorage(VIEWER);
}

/**
 * Takes the stored settings and opens the last document, or the welcome example when "My
 * documents" is empty; with the storage blocked, the example without saving.
 * @returns {void}
 */
function openStartDocument() {
    const settings = getSettings();
    if (settings) {
        if (settings.split) state.split = settings.split;
        if (settings.size) state.size = settings.size;
    }
    showSplit();
    showTextSize();
    let code = null;
    try {
        if (!store.list().length) store.create(START.name, START.code);
        const entry = store.getEntry(settings?.file) || store.getSortedEntries()[0];
        code = store.code(entry.id);
        if (code != null) { state.fileId = entry.id; state.name = entry.name; state.savedCode = code; state.assets = assets.getCached(entry.id); }
    } catch (e) { /* Storage blocked: one document without saving */ }
    if (code == null) { code = START.code; state.name = START.name; }
    state.code = code;
    ui.ta.value = code;
    showFileName();
    renderInsert();
    renderCode();
}

/**
 * Reads the pictures of the start document, renders it and makes the first undo step, then
 * starts the AI and sync.js (steps 4 and 5).
 * @returns {void}
 */
function startDocumentAndAi() {
    (state.fileId ? assets.get(state.fileId).then(pictures => { state.assets = pictures; }) : Promise.resolve()).then(showStartDocument);
}

/**
 * Renders the start document once its pictures are read, makes the first undo step and starts
 * the AI and sync.js.
 * @returns {void}
 */
function showStartDocument() {
    renderPreview();
    addHistoryStep();
    syncScroll();
    startAiAndSync();
}

/**
 * Starts the AI Assistant, the WebMCP tools, the AI status, "Open in another editor" and
 * sync.js. The callbacks reach the areas through `areas`, so each may start after the ones
 * it calls.
 * @returns {void}
 */
function startAiAndSync() {
    areas.ai = createAi({
        getState: getPromptState,
        receiveDocument: async (...args) => { setTimeout(() => areas.aiStatus.addDelivery('link')); await receiveDocument(...args); return state.fileId; },
        tryOpenDocument: id => { if (!store.getEntry(id)) return false; openDocument(id); return true; },
        showToast,
        getRemote: () => areas.sync?.getAiSettings() || null,
        fetchKey: () => (areas.sync ? areas.sync.fetchKey() : Promise.resolve(null)),
        hasValidKey: () => !!areas.sync?.hasValidKey(),
    });
    const agent = createMcp({
        onUse: () => areas.aiStatus.addDelivery('agent'),
        getState: getPromptState,
        getProblems: getProblemList,
        getOutline: getOutlineList,
        getFiles: getFileList,
        openFileByName,
        createFile,
        receiveDocument,
        addMarkdown,
        updateText,
        showLine: showAgentLine,
        undo,
    });
    areas.aiStatus = createAiStatus({
        prefix: PREFIX, btn: document.getElementById('btn-ai'), box: document.getElementById('ai-status'),
        remote: () => areas.sync?.getAiSettings() || null, agent: () => agent,
    });
    startConvert({ editor: EDITOR, code: () => state.code, name: () => state.name, toast: showToast, t: translate, hasFiles: () => Object.keys(state.assets || {}).length > 0 });
    areas.sync = createSync(createSyncEditor());
}

/**
 * Creates what sync.js gets from the editor; the property names are sync.js's contract.
 * @returns {object} the adapter.
 */
function createSyncEditor() {
    return {
        onAiResult: () => areas.aiStatus.addDelivery('page'),
        onAiEnd: () => areas.aiStatus.resetDelivery(),
        prefix: PREFIX, editor: EDITOR, word: 'document', files: true,
        current: () => ({ id: state.fileId, name: state.name, content: state.code, assets: state.assets }),
        load: importExternalDocument,
        toast: showToast,
        hookFor: id => store.getEntry(id)?.hook || null,
        setHookFor: (id, hook) => { try { store.setEntryFields(id, { hook }); } catch (e) { showToast(STORAGE_FULL); } },
        onAi: () => areas.ai?.updateRemote(),
    };
}

/**
 * Creates the hook for automated UI tests (window.mdEditor); its member names are the ones the
 * tests call.
 * @returns {object} the state and the functions the tests call.
 */
function createTestHook() {
    return {
        state, store, assets, setCode, undo, redo, renderPreview, receive: receiveDocument, revealInCode: showCodePosition,
        sync: () => areas.sync,
    };
}
