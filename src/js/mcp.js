/**
 * WebMCP: the editor offers its functions as tools to an AI agent that runs in the browser
 * (document.modelContext, in Chrome as an early preview). The tools run in this page only -
 * no server, no connector. Browsers without WebMCP skip this. Every change is a normal undo
 * step.
 *
 * The text tools work on the open document; list_files, open_file and new_file reach the
 * user's other documents ("My documents"). The tool names, descriptions and parameters are the
 * contract with the agents and stay as they are.
 *
 * createMcp() runs these steps:
 *   1. find WebMCP; without it, return null;
 *   2. wrap every tool so a call notes its time and tells the editor;
 *   3. register the tools;
 *   4. return { last() }, when an agent last used a tool (for the AI status in aistatus.js).
 */

/** The length of a time as YYYY-MM-DDTHH:MM in list_files. */
const TIME_LENGTH = 16;
/** The indentation of one heading level in list_sections. */
const SECTION_INDENT = '  ';

/**
 * What the editor hands to createMcp(); a function that cannot do its work returns false,
 * 0 or null, which the tool reports to the agent as an error.
 * @typedef {object} McpEditor
 * @property {function(): void} [onUse] - a tool was called.
 * @property {function(): object} getState - what the agent sees: name, code, selection and pictures.
 * @property {function(): Array<{line: number, kind: string, msg: string}>} getProblems - the problems.
 * @property {function(): Array<{level: number, title: string, line: number, id: string}>} getOutline - the headings.
 * @property {function(): Array<{name: string, updated: number, open: boolean}>} getFiles - the documents.
 * @property {function(string): boolean} openFileByName - opens a document by name; false when there is none.
 * @property {function(string, string): (string|null)} createFile - makes and opens a document; its name, null when the storage is full.
 * @property {function(string, string, object): Promise<void>} receiveDocument - takes a whole document.
 * @property {function(string, string): boolean} addMarkdown - inserts Markdown; false when the heading is not there.
 * @property {function(string, string, boolean): number} updateText - replaces text; the number of places, 0 when the text is not there.
 * @property {function(number): void} showLine - shows a line of the code.
 * @property {function(): void} undo - undoes the last change.
 */

/**
 * What createMcp() returns, read by the AI status.
 * @typedef {object} McpStatus
 * @property {function(): number} last - when an agent last used a tool (milliseconds since 1970), 0 for never.
 */

/**
 * Registers the editor's WebMCP tools (an initializeX: it returns the status object).
 * @param {McpEditor} editor - what the tools need of the editor.
 * @returns {McpStatus|null} the status, null without WebMCP.
 */
export function createMcp(editor) {
    const modelContext = document.modelContext || navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') return null;
    let lastCall = 0;
    for (const tool of createTools(editor)) {
        const run = tool.execute;
        /**
         * Runs the tool after noting the time of the call and telling the editor.
         * @param {...*} args - the arguments WebMCP passes to the tool.
         * @returns {Promise<*>} the tool's answer for the agent.
         */
        tool.execute = async (...args) => { lastCall = Date.now(); editor.onUse?.(); return run(...args); };
        addTool(modelContext, tool);
    }
    return {
        /**
         * Returns when an agent last used a tool.
         * @returns {number} milliseconds since 1970, 0 for never.
         */
        last: () => lastCall,
    };
}

/**
 * Registers one tool; a tool the browser refuses is left out.
 * @param {object} modelContext - the browser's WebMCP object.
 * @param {object} tool - the tool.
 * @returns {void}
 */
function addTool(modelContext, tool) {
    try {
        const result = modelContext.registerTool(tool);
        if (result && typeof result.catch === 'function') result.catch(() => { /* not available on this page */ });
    } catch (e) { /* the browser refused this tool */ }
}

/**
 * Creates the tools with their descriptions, input schemas and functions. Each tool function
 * returns the text for the agent, as WebMCP asks (an API-dictated shape).
 * @param {McpEditor} editor - what the tools need of the editor.
 * @returns {object[]} the tools in the order they are registered.
 */
function createTools(editor) {
    return [
        {
            name: 'get_document',
            description: 'Returns the name and the Markdown of the document open in the editor, the selected text and the pictures it can use.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getDocument,
        },
        {
            name: 'get_problems',
            description: 'Lists the problems the preview finds in the document (missing pictures, broken #anchors, unclosed code blocks, table rows with another number of cells), with line numbers.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true },
            execute: getProblems,
        },
        {
            name: 'list_sections',
            description: 'Lists the headings of the document (level by indentation, title, line, #anchor).',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getSections,
        },
        {
            name: 'set_document',
            description: 'Replaces the whole open document with new Markdown. Keep the user\'s existing work unless asked otherwise.',
            inputSchema: { type: 'object', properties: { markdown: { type: 'string', description: 'The complete Markdown.' } }, required: ['markdown'] },
            execute: setDocument,
        },
        {
            name: 'insert_text',
            description: 'Inserts Markdown into the open document: at the end, at the cursor, or right after the heading with the given title.',
            inputSchema: {
                type: 'object',
                properties: {
                    markdown: { type: 'string', description: 'The Markdown to insert.' },
                    where: { type: 'string', description: '"end" (default), "cursor", or the title of a heading to insert after it.' },
                },
                required: ['markdown'],
            },
            execute: addText,
        },
        {
            name: 'replace_text',
            description: 'Replaces an exact piece of the Markdown with new text (the first match, or every match with all=true).',
            inputSchema: {
                type: 'object',
                properties: {
                    find: { type: 'string', description: 'The exact text to find in the Markdown.' },
                    replace: { type: 'string', description: 'The new text.' },
                    all: { type: 'boolean', description: 'Replace every match.' },
                },
                required: ['find', 'replace'],
            },
            execute: updateCodeText,
        },
        {
            name: 'show_line',
            description: 'Moves the cursor to a line of the code and shows that place in the preview, so the user sees it.',
            inputSchema: { type: 'object', properties: { line: { type: 'number', description: 'Line number (1 = first line).' } }, required: ['line'] },
            execute: showLine,
        },
        {
            name: 'list_files',
            description: 'Lists the user\'s documents stored in the editor ("My documents"), most recently changed first, and which one is open.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getFileListText,
        },
        {
            name: 'open_file',
            description: 'Opens one of the user\'s documents by name; the other tools then work on it.',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name from list_files.' } }, required: ['name'] },
            execute: openFile,
        },
        {
            name: 'new_file',
            description: 'Creates a new document and opens it; the user\'s other documents stay unchanged. Without markdown it starts empty.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'A short name for the document.' },
                    markdown: { type: 'string', description: 'Optional: the complete Markdown.' },
                },
                required: ['name'],
            },
            execute: createFile,
        },
        {
            name: 'undo',
            description: 'Undoes the last change in the editor.',
            inputSchema: { type: 'object', properties: {} },
            execute: undo,
        },
    ];

    /**
     * get_document: the name and the Markdown of the open document, with the selection and the pictures.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function getDocument() {
        const state = editor.getState();
        return `Document: "${state.name}"\n${state.sel ? `Selected: ${state.sel}\n` : ''}${state.pictures.length ? `Pictures: ${state.pictures.join(', ')}\n` : ''}\n${state.code}`;
    }

    /**
     * get_problems: the problems with line and kind.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function getProblems() {
        const problems = editor.getProblems();
        return problems.length ? problems.map(problem => `line ${problem.line} (${problem.kind}): ${problem.msg}`).join('\n') : 'No problems.';
    }

    /**
     * list_sections: the headings, indented by level, with line and anchor.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function getSections() {
        const outline = editor.getOutline();
        return outline.length ? outline.map(entry => `${SECTION_INDENT.repeat(Math.max(0, entry.level - 1))}${entry.title} (line ${entry.line}, #${entry.id.replace(/^md-/, '')})`).join('\n') : 'The document has no headings.';
    }

    /**
     * set_document: replaces the whole open document.
     * @param {object} input - the Markdown (markdown).
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the document is empty.
     */
    async function setDocument({ markdown }) {
        if (!String(markdown || '').trim()) throw new Error('The document is empty.');
        editor.receiveDocument(markdown, 'replace', { direct: true });
        const problems = editor.getProblems();
        return problems.length ? `Loaded, with ${problems.length} problem(s) - see get_problems.` : 'The document is in the editor.';
    }

    /**
     * insert_text: inserts Markdown at the end, at the cursor or after a heading.
     * @param {object} input - the Markdown (markdown) and the place (where).
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when there is no heading of that title.
     */
    async function addText({ markdown, where }) {
        if (!editor.addMarkdown(String(markdown || ''), String(where || 'end'))) throw new Error(`No heading "${where}" - call list_sections.`);
        return 'Inserted.';
    }

    /**
     * replace_text: replaces an exact piece of the Markdown.
     * @param {object} input - the text to find, its replacement (replace) and whether every match (all).
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the text is not found.
     */
    async function updateCodeText({ find, replace, all }) {
        const count = editor.updateText(String(find || ''), String(replace ?? ''), !!all);
        if (!count) throw new Error('The text was not found - call get_document to see the exact code.');
        return `Replaced ${count} time${count === 1 ? '' : 's'}.`;
    }

    /**
     * show_line: moves the cursor to a line and shows its place in the preview.
     * @param {object} input - the line, 1-based.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function showLine({ line }) {
        editor.showLine(Math.max(1, Math.round(+line || 1)));
        return `Showing line ${line}.`;
    }

    /**
     * list_files: the user's documents, the open one marked.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function getFileListText() {
        return editor.getFiles().map(file => `${file.open ? '* ' : '  '}"${file.name}" (changed ${new Date(file.updated).toISOString().slice(0, TIME_LENGTH).replace('T', ' ')})`).join('\n') + '\n(* = open now)';
    }

    /**
     * open_file: opens a document by name.
     * @param {object} input - the name from list_files.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when there is no document of that name.
     */
    async function openFile({ name }) {
        if (!editor.openFileByName(name)) throw new Error(`No document "${name}" - call list_files.`);
        return `"${name}" is open.`;
    }

    /**
     * new_file: makes a new document and opens it.
     * @param {object} input - the name and the Markdown (markdown).
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the browser storage is full.
     */
    async function createFile({ name, markdown }) {
        const made = editor.createFile(name, markdown);
        if (!made) throw new Error('The browser storage is full.');
        return `New document "${made}" is open.`;
    }

    /**
     * undo: undoes the last change.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function undo() {
        editor.undo();
        return 'Undone.';
    }
}
