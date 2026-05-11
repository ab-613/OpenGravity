/* ==========================================================================
   VS CODE CLONE - FULLY INTERACTIVE LOGIC
   ========================================================================== */

/* --- 1. GLOBAL STATE --- */
const appState = {
    activeTab: null,
    openTabs: [],
    files: {},
    expandedFolders: new Set(),
    isRootExpanded: true,       // NEW: Tracks if the main workspace tree is visible
    selectedPath: null,       // NEW: Tracks clicked item in sidebar
    isExplorerFocused: false, // NEW: Tracks if sidebar is active
    creatingItem: null,       // NEW: { type: 'file'|'folder', parentPath: string }
    directories: new Set(),   // NEW: Tracks all known directories for better creation logic
    layout: { sidebarWidth: 250, aiPanelWidth: 350, terminalHeight: 300 },
    aiMessages: [],
    activePort: null,          // NEW: Tracks running dev servers
    activePreviewUrl: null,    // NEW: Tracks the WebContainer preview URL
    aiChangeFiles: new Set(),  // NEW: Tracks files that have unaccepted AI changes
    isSettingsModalOpen: false // NEW: Tracks settings modal visibility
};

/* --- AI PANEL CONSTANTS --- */


let monacoEditorInstance = null;
let isMonacoInitialized = false;
let isInternalChange = false;


/* --- 2. ENHANCED DOM HELPER (Now supports events!) --- */
function el(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'class' || key === 'className') element.className = value;
        else if (key === 'style') element.style.cssText = value;
        // NEW: Properly attach event listeners (onclick, oninput, etc.)
        else if (key.startsWith('on') && typeof value === 'function') element[key.toLowerCase()] = value;
        else element.setAttribute(key, value);
    }
    if (!Array.isArray(children)) children = [children];
    children.forEach(child => {
        if (typeof child === 'string') element.appendChild(document.createTextNode(child));
        else if (child instanceof HTMLElement) element.appendChild(child);
    });
    return element;
}

// Expanded Seti Icons Helper
// Enhanced File Icons Helper - Supports names and extensions
function getFileIcon(filename) {
    if (!filename) return el('span', { class: 'file-icon txt-ext-file-icon ext-file-icon' });

    if (filename === 'Live Preview') return el('i', { class: 'codicon codicon-browser', style: 'margin-right: 6px; font-size: 14px; color: #4fc1ff;' });

    // Normalize path to just filename
    const name = filename.split('/').pop();
    const parts = name.split('.');
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : name.toLowerCase();
    const nameLower = name.toLowerCase();

    // Specific filename mapping
    const nameMap = {
        'dockerfile': 'dockerfile-lang-file-icon',
        'makefile': 'makefile-lang-file-icon',
        'package.json': 'json-lang-file-icon',
        'gitconfig': 'gitconfig-ext-file-icon ext-file-icon',
        'gitignore': 'ignore-lang-file-icon',
        'gitattributes': 'gitattributes-ext-file-icon ext-file-icon',
        'license': 'license-name-file-icon name-file-icon'
    };

    if (nameMap[nameLower]) return el('span', { class: `file-icon ${nameMap[nameLower]}` });

    // Extension mapping
    const extMap = {
        'js': 'javascript-lang-file-icon',
        'mjs': 'javascript-lang-file-icon',
        'cjs': 'javascript-lang-file-icon',
        'jsx': 'javascriptreact-lang-file-icon',
        'ts': 'typescript-lang-file-icon',
        'tsx': 'typescriptreact-lang-file-icon',
        'html': 'html-lang-file-icon',
        'htm': 'html-lang-file-icon',
        'css': 'css-lang-file-icon',
        'json': 'json-lang-file-icon',
        'jsonc': 'json-lang-file-icon',
        'py': 'python-lang-file-icon',
        'cpp': 'cpp-lang-file-icon',
        'cc': 'cpp-lang-file-icon',
        'cxx': 'cpp-lang-file-icon',
        'c': 'c-lang-file-icon',
        'h': 'h-ext-file-icon ext-file-icon',
        'hpp': 'hpp-ext-file-icon ext-file-icon',
        'cs': 'csharp-lang-file-icon',
        'java': 'java-lang-file-icon',
        'class': 'class-ext-file-icon ext-file-icon',
        'md': 'markdown-lang-file-icon',
        'php': 'php-lang-file-icon',
        'rb': 'ruby-lang-file-icon',
        'go': 'go-lang-file-icon',
        'rs': 'rust-lang-file-icon',
        'sql': 'sql-lang-file-icon',
        'yaml': 'yaml-lang-file-icon',
        'yml': 'yaml-lang-file-icon',
        'xml': 'xml-lang-file-icon',
        'sh': 'shellscript-lang-file-icon',
        'bat': 'bat-lang-file-icon',
        'ps1': 'powershell-lang-file-icon',
        'less': 'less-lang-file-icon',
        'scss': 'scss-lang-file-icon',
        'sass': 'sass-lang-file-icon',
        'vue': 'vue-lang-file-icon',
        'lua': 'lua-lang-file-icon',
        'png': 'png-ext-file-icon ext-file-icon',
        'jpg': 'jpg-ext-file-icon ext-file-icon',
        'jpeg': 'jpeg-ext-file-icon ext-file-icon',
        'gif': 'gif-ext-file-icon ext-file-icon',
        'svg': 'svg-ext-file-icon ext-file-icon',
        'pdf': 'pdf-ext-file-icon ext-file-icon',
        'zip': 'zip-ext-file-icon ext-file-icon',
        'txt': 'txt-ext-file-icon ext-file-icon',
        'ico': 'ico-ext-file-icon ext-file-icon'
    };

    const iconClass = extMap[ext] || 'txt-ext-file-icon ext-file-icon';
    return el('span', { class: `file-icon ${iconClass}` });
}

/* --- FILE SYSTEM & TERMINAL MANAGERS --- */
let webcontainerInstance = null;
let terminalProcess = null;

const FSManager = {
    localDirHandle: null,

    async init() {
        if (typeof idbKeyval === 'undefined') {
            console.error("idbKeyval is not defined. Script might have failed to load.");
            return;
        }
        // 1. Try to load previously saved folder handle
        try {
            const savedHandle = await idbKeyval.get('workspace_handle');
            if (savedHandle) {
                // Verify permission
                const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
                if (permission === 'granted') {
                    await this.loadWorkspace(savedHandle);
                }
            }
        } catch (e) { console.log("No previous workspace found."); }
    },

    async requestWorkspace() {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await idbKeyval.set('workspace_handle', handle);
            await this.loadWorkspace(handle);
        } catch (err) { console.error("Folder selection cancelled.", err); }
    },

    async loadWorkspace(dirHandle) {
        try {
            this.localDirHandle = dirHandle;
            appState.files = {};
            appState.directories = new Set();
            appState.openTabs = [];
            appState.activeTab = null;
            appState.isLoading = true;
            updateUI();

            console.log("🔍 Scanning directory...");
            const wcTree = {};
            await this.readDirectory(dirHandle, '', wcTree);
            console.log(`✅ Scan complete. Found ${Object.keys(appState.files).length} files.`);

            // Mount to WebContainer
            if (webcontainerInstance) {
                console.log("🚀 Mounting to WebContainer...");
                try {
                    await webcontainerInstance.mount(wcTree);
                    console.log("✨ WebContainer mount successful.");
                } catch (mountErr) {
                    console.error("❌ WebContainer mount failed:", mountErr);
                }
            }

            // NEW: Auto-expand top level folders
            for (const key of Object.keys(appState.files)) {
                const parts = key.split('/');
                if (parts.length > 1) {
                    appState.expandedFolders.add(parts[0]); // Expand first level
                }
            }

            appState.isLoading = false;
            console.log("🔄 Refreshing UI...");
            updateUI();
        } catch (err) {
            console.error("❌ Workspace load failed:", err);
            appState.isLoading = false;
            updateUI();
        }
    },

    async readDirectory(dirHandle, pathPrefix, wcTree) {
        for await (const entry of dirHandle.values()) {
            const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;

            // Optimization: Skip known large/unnecessary folders
            if (entry.kind === 'directory') {
                if (/^(node_modules|\.git|\.next|dist|build)$/.test(entry.name)) continue;
                appState.directories.add(fullPath);
                wcTree[entry.name] = { directory: {} };
                await this.readDirectory(entry, fullPath, wcTree[entry.name].directory);
            } else if (entry.kind === 'file') {
                try {
                    const file = await entry.getFile();

                    // Skip very large files or binary blobs to prevent hanging
                    if (file.size > 1024 * 1024) { // 1MB limit
                        console.warn(`Skipping large file: ${fullPath} (${(file.size / 1024).toFixed(1)}KB)`);
                        continue;
                    }

                    const content = await file.text();
                    wcTree[entry.name] = { file: { contents: content } };

                    const ext = entry.name.split('.').pop().toLowerCase();
                    appState.files[fullPath] = {
                        type: ext,
                        language: this.getLang(ext),
                        content: content,
                        baselineContent: content, // Initial content is the baseline
                        dirty: false,
                        handle: entry
                    };
                } catch (fileErr) {
                    console.warn(`Could not read file ${fullPath}:`, fileErr);
                }
            }
        }
    },

    async writeFile(filename, content, source = 'ui') {
        let fileHandle = appState.files[filename] ? appState.files[filename].handle : null;
        const oldFile = appState.files[filename];

        // 1. If the AI is creating a brand new file, create it in the OS first
        if (!fileHandle && this.localDirHandle) {
            const parts = filename.split('/');
            let currentHandle = this.localDirHandle;
            for (let i = 0; i < parts.length - 1; i++) {
                currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
            }
            fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1], { create: true });
        }

        // 2. Update UI State
        appState.files[filename] = {
            type: filename.split('.').pop(),
            language: this.getLang(filename.split('.').pop()),
            content: content,
            baselineContent: oldFile ? oldFile.baselineContent : content,
            dirty: false,
            handle: fileHandle
        };

        // NEW: Track if AI made the change
        if (source === 'ai') {
            appState.aiChangeFiles.add(filename);
        } else if (source === 'ui') {
            // If user manually edits, we might want to keep the AI diff or clear it.
            // Requirement says "it saves what the model does straight away, but still shows up... as green/red lines"
            // If the user then edits it, we probably want to keep showing the diff against the last baseline.
        }

        // 3. Update WebContainer (Create parent directories if AI made them up)
        if (webcontainerInstance) {
            const parts = filename.split('/');
            const dirPath = parts.slice(0, -1).join('/');
            if (dirPath) await webcontainerInstance.fs.mkdir(`/${dirPath}`, { recursive: true });
            await webcontainerInstance.fs.writeFile(`/${filename}`, content);
        }

        // 4. Save to actual Hard Drive
        if (fileHandle) {
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
        }

        // 5. Live update Editor if user is watching it
        if (appState.activeTab === filename && monacoEditorInstance) {
            const currentVal = monacoEditorInstance.getValue();
            if (currentVal !== content) monacoEditorInstance.setValue(content);
        }
        updateUI();
    },

    // Start Inline Creation Process
    startCreation(type) {
        if (!this.localDirHandle) return alert("Please open a folder first.");

        let parentPath = '';
        if (appState.selectedPath) {
            // Check if selected item is a folder
            // Better check: is it in expandedFolders OR does it have children in files OR is it known to be a folder?
            // Actually, we can check the DOM or just assume if it doesn't have an extension it's a folder (weak)
            // Or better: check if it's the root header
            const isFolder = appState.selectedPath === 'ROOT' ||
                appState.directories.has(appState.selectedPath) ||
                appState.expandedFolders.has(appState.selectedPath) ||
                Object.keys(appState.files).some(f => f.startsWith(appState.selectedPath + '/'));

            if (isFolder) {
                if (appState.selectedPath === 'ROOT') {
                    parentPath = '';
                } else {
                    parentPath = appState.selectedPath;
                }
            } else {
                // If it's a file, get its parent folder
                const parts = appState.selectedPath.split('/');
                parts.pop();
                parentPath = parts.join('/');
            }

            // CRITICAL: Ensure the parent folder is expanded so we can see the input!
            if (parentPath) {
                appState.expandedFolders.add(parentPath);
                appState.isRootExpanded = true;
            }
        }

        appState.creatingItem = { type, parentPath };
        updateUI();

        // Auto-focus the input box
        setTimeout(() => {
            const input = document.getElementById('explorer-creation-input');
            if (input) input.focus();
        }, 10);
    },

    // Handle typing in the input box
    async handleCreationInput(e) {
        if (!appState.creatingItem) return;

        if (e.key === 'Escape') {
            this.cancelCreation();
        } else if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (!val) {
                this.cancelCreation();
                return;
            }

            const item = { ...appState.creatingItem };
            appState.creatingItem = null; // Clear creation state immediately to prevent double-submit

            const fullPath = item.parentPath ? `${item.parentPath}/${val}` : val;

            try {
                if (item.type === 'file') {
                    await this.executeCreateFile(fullPath);
                } else {
                    await this.executeCreateFolder(fullPath);
                }
            } catch (err) {
                console.error(`Failed to create ${item.type}:`, err);
                alert(`Error: ${err.message}`);
                updateUI(); // Refresh to remove the stuck input box
            }
        }
    },

    cancelCreation() {
        if (!appState.creatingItem) return;
        appState.creatingItem = null;
        updateUI();
    },

    // Execute File Creation
    async executeCreateFile(path) {
        const parts = path.split('/').filter(p => p !== '');
        let currentHandle = this.localDirHandle;
        for (let i = 0; i < parts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
        }
        const fileName = parts[parts.length - 1];
        const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });

        const writable = await fileHandle.createWritable();
        await writable.write('');
        await writable.close();

        if (webcontainerInstance) {
            const dirPath = parts.slice(0, -1).join('/');
            if (dirPath) await webcontainerInstance.fs.mkdir(dirPath, { recursive: true });
            await webcontainerInstance.fs.writeFile(path, ''); // Removed leading slash!
        }

        appState.files[path] = {
            type: path.split('.').pop(),
            language: this.getLang(path.split('.').pop()),
            content: '',
            dirty: false,
            handle: fileHandle
        };

        appState.selectedPath = path; // Select the new file
        if (!appState.openTabs.includes(path)) appState.openTabs.push(path);
        appState.activeTab = path;

        updateUI();
        if (monacoEditorInstance) {
            isInternalChange = true;
            monacoEditorInstance.setValue('');
            isInternalChange = false;
        }
    },

    // Execute Folder Creation
    async executeCreateFolder(path) {
        const parts = path.split('/').filter(p => p !== '');
        let currentHandle = this.localDirHandle;
        for (let i = 0; i < parts.length; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
        }

        if (webcontainerInstance) {
            await webcontainerInstance.fs.mkdir(path, { recursive: true }); // Removed leading slash!
        }

        appState.directories.add(path); // Update known directories
        appState.expandedFolders.add(path); // Auto-expand new folder
        appState.selectedPath = path;       // Select the new folder
        await this.refreshWorkspace();      // Re-read tree to display properly
    },

    async refreshWorkspace() {
        if (!this.localDirHandle) return;
        // Manually trigger the two-way sync
        await this.syncWebContainerToOS();
    },

    async syncWebContainerToOS() {
        if (!webcontainerInstance || !this.localDirHandle) return;

        // Recursive function to read WebContainer and write to UI & OS
        const scanWc = async (dirPath, localHandle) => {
            const entries = await webcontainerInstance.fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                // IMPORTANT: Never sync node_modules or .git back to the OS!
                if (entry.name === 'node_modules' || entry.name === '.git') continue;

                const fullWcPath = dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`;

                if (entry.isFile()) {
                    const content = await webcontainerInstance.fs.readFile(fullWcPath, 'utf-8');

                    // If file is NEW or has been MODIFIED by the terminal
                    if (!appState.files[fullWcPath] || appState.files[fullWcPath].content !== content) {

                        // 1. Save to OS Disk
                        const fileHandle = await localHandle.getFileHandle(entry.name, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(content);
                        await writable.close();

                        // 2. Save to UI State
                        appState.files[fullWcPath] = {
                            type: entry.name.split('.').pop(),
                            language: this.getLang(entry.name.split('.').pop()),
                            content: content,
                            dirty: false,
                            handle: fileHandle
                        };
                    }
                } else if (entry.isDirectory()) {
                    // Ensure folder exists in OS and scan inside it
                    const newLocalHandle = await localHandle.getDirectoryHandle(entry.name, { create: true });
                    appState.expandedFolders.add(fullWcPath); // Auto expand new folders in UI
                    await scanWc(fullWcPath, newLocalHandle);
                }
            }
        };

        await scanWc('.', this.localDirHandle);
        updateUI();
    },

    // Helper to build the WebContainer tree structure from our current appState.files
    generateWCTree() {
        const tree = {};
        for (const [path, fileObj] of Object.entries(appState.files)) {
            const parts = path.split('/');
            let current = tree;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    current[part] = { file: { contents: fileObj.content } };
                } else {
                    current[part] = current[part] || { directory: {} };
                    current = current[part].directory;
                }
            }
        }
        return tree;
    },

    getLang(ext) {
        const map = { js: 'javascript', html: 'html', css: 'css', py: 'python', json: 'json', md: 'markdown' };
        return map[ext] || 'plaintext';
    }
};

const TerminalManager = {
    xterm: null,
    fitAddon: null,

    async init() {
        // Wait up to 2 seconds for the module script to attach WebContainer to window
        let retries = 0;
        while (typeof window.WebContainer === 'undefined' && retries < 40) {
            await new Promise(resolve => setTimeout(resolve, 50));
            retries++;
        }

        if (typeof window.WebContainer === 'undefined') {
            console.error("WebContainer API is not loaded. Check COEP headers and network connection.");
            return;
        }
        // Boot WebContainer and explicitly name the folder to remove the ugly random string
        webcontainerInstance = await window.WebContainer.boot({ workdirName: 'workspace' });

        // NEW: Listen for when the AI or User starts a Web Server
        webcontainerInstance.on('server-ready', (port, url) => {
            console.log(`Server started on port ${port}: ${url}`);
            appState.activePort = port;
            appState.activePreviewUrl = url;
            updateUI(); // This will trigger the Status Bar to show the Preview button
        });

        // MOUNT ON RELOAD: If files were already loaded from indexedDB, mount them now
        if (Object.keys(appState.files).length > 0) {
            console.log("📦 Restoring files into WebContainer...");
            const tree = FSManager.generateWCTree();
            await webcontainerInstance.mount(tree);
        }

        // GLOBAL: Handle explorer unfocusing when clicking elsewhere
        window.addEventListener('mousedown', (e) => {
            // If click is NOT in sidebar and NOT in a dialog/alert
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && !sidebar.contains(e.target)) {
                if (appState.isExplorerFocused) {
                    appState.isExplorerFocused = false;
                    updateUI();
                }
            }
        });

        // Setup Xterm UI
        const termContainer = document.querySelector('.panel-body');
        termContainer.innerHTML = ''; // Clear hardcoded HTML

        this.xterm = new window.Terminal({
            fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
            fontSize: 14,          // Slightly larger to match your screenshot
            lineHeight: 1.2,       // Tighter line height, like real VS Code
            fontWeight: '400',
            cursorStyle: 'block',  // Solid block cursor
            cursorBlink: true,
            theme: {
                background: '#181818',
                foreground: '#cccccc',
                cursor: '#ffffff',           // Crisp white cursor
                selectionBackground: '#264f78', // Authentic VS Code selection blue

                // VS Code Default Dark ANSI Colors
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#e5e5e5'
            }
        });
        this.fitAddon = new window.FitAddon.FitAddon();
        this.xterm.loadAddon(this.fitAddon);
        this.xterm.open(termContainer);
        this.fitAddon.fit();

        // Start Bash Shell (jsh)
        terminalProcess = await webcontainerInstance.spawn('jsh', {
            terminal: { cols: this.xterm.cols, rows: this.xterm.rows }
        });

        if (!terminalProcess) {
            console.error("Failed to spawn terminal process.");
            return;
        }

        // Pipe Shell Output -> UI Terminal
        terminalProcess.output.pipeTo(new WritableStream({
            write: (data) => this.xterm.write(data)
        }));

        // Pipe UI Terminal Input -> Shell
        const terminalWriter = terminalProcess.input.getWriter();
        this.xterm.onData((data) => {
            terminalWriter.write(data);

            // MAGIC: Every time you press "Enter" in the terminal, check for new files!
            if (data === '\r') {
                // Check 1.5 seconds later (for fast commands like touch, mkdir)
                setTimeout(() => FSManager.syncWebContainerToOS(), 1500);
                // Check 5 seconds later (for slower commands like npm install)
                setTimeout(() => FSManager.syncWebContainerToOS(), 5000);
            }
        });

        // Handle Resizing (Window AND Panel resize)
        const resizeObserver = new ResizeObserver(() => {
            this.fitAddon.fit();
            if (terminalProcess) {
                terminalProcess.resize({ cols: this.xterm.cols, rows: this.xterm.rows });
            }
        });
        resizeObserver.observe(termContainer);
    },

    activeAgentProcess: null,
    agentProcessOutput: "",

    // Helper to strip Matrix/Spinner characters so the AI can actually read the text
    stripAnsi(str) {
        return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').replace(/\r/g, '\n');
    },

    async executeAgentCommand(command) {
        if (!webcontainerInstance) return "Error: WebContainer not booted.";

        return new Promise(async (resolve) => {
            try {
                this.agentProcessOutput = "";
                const process = await webcontainerInstance.spawn('jsh', ['-c', command]);
                this.activeAgentProcess = process;

                let isDone = false;
                let hasResolved = false;

                process.output.pipeTo(new WritableStream({
                    write: (data) => {
                        this.agentProcessOutput += data;
                        if (this.xterm) this.xterm.write(data); // User sees colors

                        const cleanOutput = this.stripAnsi(this.agentProcessOutput);

                        // MAGIC 1: Detect Dev Server Success
                        if (!hasResolved && (cleanOutput.includes('Local: http') || cleanOutput.includes('ready in') || cleanOutput.includes('Accepts connections'))) {
                            hasResolved = true;
                            resolve(`Exit Code: 0 (Background Process)\nOutput:\n${cleanOutput}\n\n[SUCCESS: Server is running!]`);
                        }

                        // MAGIC 2: Detect Interactive Prompt (y/N)
                        if (!hasResolved && (cleanOutput.endsWith('(y) ') || cleanOutput.endsWith('(y/N) '))) {
                            hasResolved = true;
                            resolve(`[Process paused waiting for input]\nOutput:\n${cleanOutput}`);
                        }
                    }
                }));

                process.exit.then(code => {
                    isDone = true;
                    this.activeAgentProcess = null;
                    if (!hasResolved) {
                        hasResolved = true;
                        resolve(`Exit Code: ${code}\nOutput:\n${this.stripAnsi(this.agentProcessOutput)}`);
                    }
                });

                // MAGIC: Dynamic timeout. Give 'install' commands 25s before returning to AI.
                const timeoutMs = (command.includes('install') || command.includes('create')) ? 5000 : 2000;

                setTimeout(() => {
                    if (!isDone && !hasResolved) {
                        hasResolved = true;
                        resolve(`[Process running in background]\nOutput so far:\n${this.stripAnsi(this.agentProcessOutput)}`);
                    }
                }, timeoutMs);

            } catch (e) {
                resolve(`Error: ${e.message}`);
            }
        });
    },

    async sendAgentInput(text) {
        if (!this.activeAgentProcess) return "Error: No active process.";
        try {
            const writer = this.activeAgentProcess.input.getWriter();
            await writer.write(text);
            writer.releaseLock();
            this.agentProcessOutput = "";
            await new Promise(r => setTimeout(r, 2000));
            return `Input sent successfully. New output:\n${this.stripAnsi(this.agentProcessOutput)}`;
        } catch (e) {
            return `Input Error: ${e.message}`;
        }
    },

    async waitAgent(ms) {
        this.agentProcessOutput = "";
        await new Promise(r => setTimeout(r, ms));
        if (this.activeAgentProcess) {
            return `Waited ${ms}ms. New output:\n${this.stripAnsi(this.agentProcessOutput)}`;
        }
        return `Waited ${ms}ms. Process finished.`;
    }
};

/* --- 3. ACTIONS (TAB & FILE MANAGEMENT) --- */

function switchFile(filename) {
    if (appState.activeTab === filename) return;

    // Save current Monaco content to state before switching (ignore if it's the preview)
    if (monacoEditorInstance && appState.activeTab && appState.files[appState.activeTab]) {
        appState.files[appState.activeTab].content = monacoEditorInstance.getValue();
    }

    appState.activeTab = filename;

    const monacoContainer = document.getElementById('monaco-container');
    let previewFrame = document.getElementById('preview-iframe');

    if (filename === 'Live Preview') {
        // Hide Monaco, Show/Create Iframe
        if (monacoContainer) monacoContainer.style.display = 'none';

        if (!previewFrame) {
            previewFrame = el('iframe', {
                id: 'preview-iframe',
                src: appState.activePreviewUrl,
                style: 'width: 100%; height: 100%; border: none; background: white;'
            });
            document.querySelector('.editor-body').appendChild(previewFrame);
        } else {
            previewFrame.style.display = 'block';
            // Update URL if the server restarted on a new port
            if (previewFrame.src !== appState.activePreviewUrl) {
                previewFrame.src = appState.activePreviewUrl;
            }
        }
    } else {
        // Show Monaco, Hide Iframe
        if (monacoContainer) monacoContainer.style.display = 'block';
        if (previewFrame) previewFrame.style.display = 'none';

        // Update Monaco with the selected file's content
        if (monacoEditorInstance && appState.files[filename]) {
            const file = appState.files[filename];
            monaco.editor.setModelLanguage(monacoEditorInstance.getModel(), file.language);
            isInternalChange = true;
            monacoEditorInstance.setValue(file.content);
            isInternalChange = false;
            updateDiffDecorations();
        }
    }

    updateUI();
}

function closeTab(event, filename) {
    event.stopPropagation(); // Prevent the tab click event from firing

    // Remove from openTabs array
    appState.openTabs = appState.openTabs.filter(tab => tab !== filename);

    // NEW: Destroy the iframe if we closed the preview
    if (filename === 'Live Preview') {
        const previewFrame = document.getElementById('preview-iframe');
        if (previewFrame) previewFrame.remove();
    }

    // If we closed the active tab, we need to pick a new one
    if (appState.activeTab === filename) {
        if (appState.openTabs.length > 0) {
            const nextTab = appState.openTabs[appState.openTabs.length - 1];
            appState.activeTab = null;
            switchFile(nextTab);
        } else {
            appState.activeTab = null;

            // Show monaco again but empty it
            const monacoContainer = document.getElementById('monaco-container');
            if (monacoContainer) monacoContainer.style.display = 'block';

            if (monacoEditorInstance) {
                isInternalChange = true;
                monacoEditorInstance.setValue('');
                isInternalChange = false;
            }
            updateUI();
        }
    } else {
        updateUI();
    }
}

function openFileFromSidebar(filename) {
    // Add to open tabs if it isn't already there
    if (!appState.openTabs.includes(filename)) {
        appState.openTabs.push(filename);
    }
    switchFile(filename);
}

function updateUI() {
    try {
        const tabsContainer = document.getElementById('tabs-container');
        if (tabsContainer) tabsContainer.replaceWith(renderTabs());

        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.replaceWith(renderSidebar());

        const titleCenter = document.querySelector('.titlebar-center');
        if (titleCenter) {
            titleCenter.innerHTML = '';
            if (appState.activeTab) {
                titleCenter.appendChild(document.createTextNode(`vscode clone - Antigravity - ${appState.activeTab}`));
                if (appState.files[appState.activeTab].dirty) {
                    titleCenter.appendChild(el('span', { class: 'title-dirty-dot' }, '•'));
                }
            } else {
                titleCenter.appendChild(document.createTextNode('vscode clone - Antigravity'));
            }
        }

        const statusbar = document.querySelector('.statusbar');
        if (statusbar) statusbar.replaceWith(renderStatusBar());

        // Handle Settings Modal
        const existingModal = document.querySelector('.modal-overlay');
        if (appState.isSettingsModalOpen) {
            if (!existingModal) {
                document.getElementById('root').appendChild(renderSettingsModal());
            }
        } else {
            if (existingModal) existingModal.remove();
        }
    } catch (uiErr) {
        console.error("Fatal UI update error:", uiErr);
    }
}


/* --- 4. UI COMPONENTS --- */

function renderTabs() {
    const tabs = appState.openTabs.map(filename => {
        const isPreview = filename === 'Live Preview';
        const file = isPreview ? null : appState.files[filename];
        const isActive = filename === appState.activeTab;
        const isDirty = file ? file.dirty : false;

        // Tab Content
        const icon = getFileIcon(filename);
        const name = el('span', { class: 'tab-name' }, filename);

        // Close Button & Dirty Dot
        const actions = el('div', { class: 'tab-actions' }, [
            el('i', {
                class: 'codicon codicon-close',
                onclick: (e) => closeTab(e, filename)
            })
        ]);

        if (isDirty) {
            actions.appendChild(el('div', { class: 'tab-dirty-dot' }));
        }

        return el('div', {
            class: `tab ${isActive ? 'active' : ''} ${isDirty ? 'dirty' : ''}`,
            onclick: () => switchFile(filename)
        }, [icon, name, actions]);
    });

    return el('div', { class: 'tabs-container', id: 'tabs-container' }, tabs);
}

// NEW: Toggles folder open/closed state
function toggleFolder(event, folderPath) {
    if (event) event.stopPropagation();
    appState.isExplorerFocused = true; // Focus explorer on click
    appState.selectedPath = folderPath; // Select it
    if (folderPath === 'ROOT') {
        appState.isRootExpanded = !appState.isRootExpanded;
    } else {
        if (appState.expandedFolders.has(folderPath)) {
            appState.expandedFolders.delete(folderPath);
        } else {
            appState.expandedFolders.add(folderPath);
        }
    }
    updateUI();
}

function openFileFromSidebar(event, filename) {
    if (event) event.stopPropagation();
    appState.isExplorerFocused = true; // Focus explorer on click
    appState.selectedPath = filename; // Select it
    if (!appState.openTabs.includes(filename)) appState.openTabs.push(filename);
    switchFile(filename);
    updateUI(); // Ensure UI refreshes to show selection/focus
}

// UPDATED: Recursive File Tree Renderer
function renderFileTree() {
    const tree = {};

    // 1. Add directories to the tree structure
    for (const path of appState.directories) {
        const parts = path.split('/').filter(p => p !== '');
        let current = tree;
        for (const part of parts) {
            if (!(part in current)) {
                current[part] = {};
            }
            current = current[part];
        }
    }

    // 2. Add files to the tree structure
    for (const path of Object.keys(appState.files)) {
        const parts = path.split('/').filter(p => p !== '');
        let current = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                current[part] = path; // string indicates file
            } else {
                current[part] = current[part] || {};
                current = current[part];
            }
        }
    }

    function renderNode(node, currentPath = '', depth = 0) {
        const elements = [];
        const paddingLeft = 12 + (depth * 12);

        const entries = Object.entries(node).sort((a, b) => {
            const aIsFolder = typeof a[1] === 'object';
            const bIsFolder = typeof b[1] === 'object';
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;
            return a[0].localeCompare(b[0]);
        });

        for (const [name, value] of entries) {
            const fullFolderPath = currentPath ? `${currentPath}/${name}` : name;
            const isSelected = appState.selectedPath === fullFolderPath;

            if (typeof value === 'string') {
                const file = appState.files[value];
                elements.push(el('div', {
                    class: `file-item ${isSelected ? 'selected' : ''}`,
                    style: `padding-left: ${paddingLeft}px;`,
                    onmousedown: (e) => openFileFromSidebar(e, value)
                }, [getFileIcon(name), el('span', { class: 'file-name' }, name)]));
            } else {
                const isExpanded = appState.expandedFolders.has(fullFolderPath);
                elements.push(el('div', {
                    class: `file-item folder-item ${isSelected ? 'selected' : ''}`,
                    style: `padding-left: ${paddingLeft - 6}px;`,
                    onmousedown: (e) => toggleFolder(e, fullFolderPath)
                }, [
                    el('i', { class: `codicon codicon-chevron-${isExpanded ? 'down' : 'right'}`, style: 'margin-right: 2px; font-size: 14px;' }),
                    el('span', { class: 'file-name' }, name)
                ]));

                if (isExpanded) {
                    elements.push(...renderNode(value, fullFolderPath, depth + 1));
                }
            }
        }

        // INJECT INPUT BOX IF CREATING ITEM HERE
        if (appState.creatingItem && appState.creatingItem.parentPath === currentPath) {

            // 1. Setup the initial icon
            let iconElement;
            if (appState.creatingItem.type === 'file') {
                iconElement = getFileIcon('txt'); // Default to txt icon
            } else {
                iconElement = el('i', { class: 'codicon codicon-chevron-right', style: 'margin-right:6px; font-size:14px; color:var(--text-muted);' });
            }
            iconElement.id = 'creation-live-icon'; // ID needed for fast swapping

            // 2. Inject the input container
            elements.push(el('div', {
                class: 'file-item explorer-input-container',
                style: `padding-left: ${paddingLeft}px;`
            }, [
                iconElement,
                el('input', {
                    id: 'explorer-creation-input',
                    class: 'explorer-input',
                    type: 'text',
                    onkeydown: (e) => FSManager.handleCreationInput(e),
                    oninput: (e) => {
                        // LIVE ICON UPDATING LOGIC
                        if (appState.creatingItem.type === 'file') {
                            const val = e.target.value;
                            // Swap the icon instantly without re-rendering the whole tree
                            const newIcon = getFileIcon(val);
                            newIcon.id = 'creation-live-icon';
                            const oldIcon = document.getElementById('creation-live-icon');
                            if (oldIcon) oldIcon.replaceWith(newIcon);
                        }
                    },
                    onblur: () => FSManager.cancelCreation()
                })
            ]));
        }

        return elements;
    }

    const rootFolderName = FSManager.localDirHandle ? FSManager.localDirHandle.name : 'WORKSPACE';

    // Header setup with Action Icons triggering Inline Creation
    const folderHeader = el('div', { class: 'tree-section-header' }, [
        el('div', { class: 'tree-section-title', onmousedown: () => { appState.selectedPath = 'ROOT'; toggleFolder(null, 'ROOT'); } }, [
            el('i', { class: `codicon codicon-chevron-${appState.isRootExpanded ? 'down' : 'right'}` }),
            el('span', {}, rootFolderName.toUpperCase())
        ]),
        el('div', { class: 'tree-section-actions' }, [
            el('i', { class: 'codicon codicon-new-file', title: 'New File', onclick: (e) => { e.stopPropagation(); FSManager.startCreation('file'); } }),
            el('i', { class: 'codicon codicon-new-folder', title: 'New Folder', onclick: (e) => { e.stopPropagation(); FSManager.startCreation('folder'); } }),
            el('i', { class: 'codicon codicon-refresh', title: 'Refresh', onclick: (e) => { e.stopPropagation(); FSManager.refreshWorkspace(); } }),
            el('i', { class: 'codicon codicon-collapse-all', title: 'Collapse', onclick: (e) => { e.stopPropagation(); appState.expandedFolders.clear(); updateUI(); } })
        ])
    ]);

    const treeContent = appState.isRootExpanded ? renderNode(tree, '', 0) : [];
    return el('div', { class: `file-tree ${appState.isExplorerFocused ? 'focused' : ''}`, id: 'file-tree' }, [folderHeader, ...treeContent]);
}

function renderSidebar() {
    const header = el('div', { class: 'sidebar-header' }, [
        el('span', { class: 'sidebar-title' }, 'Explorer'),
        el('div', { class: 'sidebar-actions' }, [el('i', { class: 'codicon codicon-ellipsis' })])
    ]);

    let body;
    if (appState.isLoading) {
        body = el('div', { style: 'padding: 20px; text-align: center; color: var(--text-muted);' }, [
            el('i', { class: 'codicon codicon-loading codicon-modifier-spin', style: 'font-size: 20px; display: block; margin-bottom: 10px;' }),
            'Loading Workspace...'
        ]);
    } else if (!FSManager.localDirHandle) {
        // Show Open Folder Button
        body = el('div', { style: 'padding: 20px; text-align: center;' }, [
            el('button', {
                onclick: () => FSManager.requestWorkspace(),
                style: 'background: #007acc; color: white; border: none; padding: 6px 12px; cursor: pointer; border-radius: 2px;'
            }, 'Open Folder')
        ]);
    } else {
        body = renderFileTree();
    }

    return el('div', {
        class: 'sidebar',
        style: `width: ${appState.layout.sidebarWidth}px;`,
        onmousedown: (e) => {
            e.stopPropagation(); // Prevent global window listener from immediately unfocusing
            if (!appState.isExplorerFocused) {
                appState.isExplorerFocused = true;
                updateUI();
            }
        }
    }, [header, body]);
}

function renderEditor() {
    return el('div', { class: 'editor-group' }, [
        renderTabs(),
        el('div', { class: 'editor-body' }, [el('div', { id: 'monaco-container' })])
    ]);
}

// MINIMIZED STATIC COMPONENTS (Activity Bar, Terminal, AI Panel, Headers)
function renderActivityBar() { 
    const topIcons = [{ icon: 'files', active: true, badge: 2 }, { icon: 'search' }, { icon: 'source-control' }, { icon: 'debug-alt' }, { icon: 'remote-explorer' }, { icon: 'extensions' }, { icon: 'github-copilot' }]; 
    const bottomIcons = [
        { icon: 'account', onclick: () => { appState.isSettingsModalOpen = true; updateUI(); } }, 
        { icon: 'settings-gear', onclick: () => { appState.isSettingsModalOpen = true; updateUI(); } }
    ]; 
    const createIconElement = (data) => { 
        const containerClasses = `activity-icon-container ${data.active ? 'active' : ''}`; 
        const children = [el('i', { class: `activity-icon codicon codicon-${data.icon}` })]; 
        if (data.badge) children.push(el('div', { class: 'activity-badge' }, data.badge.toString())); 
        return el('div', { class: containerClasses, onclick: data.onclick }, children); 
    }; 
    return el('div', { class: 'activitybar' }, [el('div', { class: 'activity-group' }, topIcons.map(createIconElement)), el('div', { class: 'activity-group' }, bottomIcons.map(createIconElement))]); 
}

function renderSettingsModal() {
    const config = {
        apiKey: localStorage.getItem('gemini_api_key') || '',
        projectId: localStorage.getItem('gcp_project_id') || '',
        region: localStorage.getItem('gcp_region') || 'us-central1'
    };

    const apiKeyInput = el('input', { class: 'settings-input', type: 'password', value: config.apiKey, placeholder: 'Enter Gemini API Key' });
    const projectIdInput = el('input', { class: 'settings-input', value: config.projectId, placeholder: 'your-project-id' });
    const regionInput = el('input', { class: 'settings-input', value: config.region, placeholder: 'us-central1' });

    const modal = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target.className === 'modal-overlay') { appState.isSettingsModalOpen = false; updateUI(); } } }, [
        el('div', { class: 'modal-container' }, [
            el('div', { class: 'modal-header' }, [
                el('h3', {}, 'Vertex AI Settings'),
                el('i', { class: 'codicon codicon-close modal-close', onclick: () => { appState.isSettingsModalOpen = false; updateUI(); } })
            ]),
            el('div', { class: 'modal-body' }, [
                el('div', { class: 'settings-group' }, [
                    el('label', {}, 'Vertex AI / Google Cloud API Key'),
                    apiKeyInput,
                    el('div', { style: 'font-size: 10px; color: var(--text-muted); margin-top: 4px;' }, 'Using the global aiplatform.googleapis.com endpoint.')
                ]),
                el('div', { class: 'settings-group' }, [
                    el('label', {}, 'GCP Project ID (Required for specific models/regions)'),
                    projectIdInput,
                    el('div', { style: 'font-size: 10px; color: var(--text-muted); margin-top: 4px;' }, 'Used only if you switch to region-specific models.')
                ])
            ]),
            el('div', { class: 'modal-footer' }, [
                el('button', { class: 'secondary-btn', onclick: () => { appState.isSettingsModalOpen = false; updateUI(); } }, 'Cancel'),
                el('button', { class: 'accept-btn', onclick: () => {
                    const nk = apiKeyInput.value.trim();
                    const np = projectIdInput.value.trim();
                    const nr = regionInput.value.trim();
                    localStorage.setItem('gemini_api_key', nk);
                    localStorage.setItem('gcp_project_id', np);
                    localStorage.setItem('gcp_region', nr);
                    
                    if (window.AgentManager) {
                        AgentManager.apiKey = nk;
                        AgentManager.projectId = np;
                        AgentManager.region = nr;
                    }

                    appState.isSettingsModalOpen = false;
                    updateUI();
                }}, 'Save Settings')
            ])
        ])
    ]);
    return modal;
}
function renderTerminal() { const tabs = ['Problems', 'Output', 'Debug Console', 'Terminal', 'Ports'].map(t => el('div', { class: `panel-tab ${t === 'Terminal' ? 'active' : ''}` }, t)); const actions = el('div', { class: 'panel-actions' }, [el('div', { class: 'terminal-dropdown' }, [el('i', { class: 'codicon codicon-terminal-bash' }), el('span', {}, 'python3'), el('i', { class: 'codicon codicon-chevron-down' })]), el('i', { class: 'codicon codicon-plus' }), el('i', { class: 'codicon codicon-chevron-down' }), el('i', { class: 'codicon codicon-mention' }), el('i', { class: 'codicon codicon-trash' }), el('i', { class: 'codicon codicon-ellipsis' }), el('i', { class: 'codicon codicon-close' })]); return el('div', { class: 'panel', style: `height: ${appState.layout.terminalHeight}px;` }, [el('div', { class: 'panel-header' }, [el('div', { class: 'panel-tabs' }, tabs), actions]), el('div', { class: 'panel-body' })]); }

/* --- AI PANEL HELPERS & TOOL RENDERING --- */


function renderAIEditedFile(f) {
    return el('div', { class: 'ai-edited-file' }, [
        el('i', { class: 'codicon codicon-file' }),
        el('span', {}, 'Edited '),
        getFileIcon(f.name || f.type),
        el('strong', {}, f.name),
        el('span', { class: 'diff-add' }, f.add),
        el('span', { class: 'diff-remove' }, f.rem),
        el('div', { class: 'spacer' }),
        el('i', { class: 'codicon codicon-go-to-file', onclick: () => openFileFromSidebar(null, f.name) })
    ], { onclick: () => openFileFromSidebar(null, f.name), style: 'cursor: pointer;' });
}

function renderAICommandBlock(command, output) {
    const lines = output ? output.split('\n') : [];
    const formattedLines = lines.map(line => {
        if (line.includes('PS C:\\')) {
            const pathMatch = line.match(/PS C:.*?> /);
            if (!pathMatch) return el('div', { class: 'term-text' }, line);
            const path = pathMatch[0];
            const rest = line.substring(path.length);
            const children = [el('span', { class: 'term-path' }, path)];
            if (rest.startsWith('^C')) children.push(el('span', { class: 'term-err' }, '^C'));
            else if (rest.startsWith('cd ')) {
                children.push(el('span', { class: 'term-cmd' }, 'cd '));
                children.push(el('span', { class: 'term-string' }, rest.substring(3)));
            } else if (rest.startsWith('echo ')) {
                children.push(el('span', { class: 'term-cmd' }, 'echo '));
                children.push(el('span', { class: 'term-string' }, rest.substring(5)));
            } else children.push(el('span', {}, rest));
            return el('div', {}, children);
        }
        return el('div', { class: 'term-text' }, line);
    });

    return el('div', { class: 'ai-cmd-block' }, [
        el('div', { class: 'ai-cmd-header' }, [
            el('span', {}, 'Ran background command'),
            el('span', {}, ['Relocate', el('i', { class: 'codicon codicon-link-external' })])
        ]),
        el('div', { class: 'ai-cmd-body' }, [
            el('div', { class: 'ai-cmd-line' }, [
                el('span', {}, command),
                el('i', { class: 'codicon codicon-copy' })
            ]),
            ...formattedLines,
            el('div', { class: 'term-scroll-track' }, [
                el('div', { class: 'scroll-mark red' }),
                el('div', { class: 'scroll-mark blue' }),
                el('div', { class: 'scroll-mark blue', style: 'margin-top: 15px;' }),
                el('div', { class: 'scroll-mark blue' }),
                el('div', { class: 'scroll-mark blue', style: 'margin-top: 15px;' })
            ])
        ]),
        el('div', { class: 'ai-cmd-footer' }, [
            el('span', {}, ['Always run ', el('i', { class: 'codicon codicon-chevron-up', style: 'font-size:10px; margin-left:2px;' })]),
            el('span', {}, 'Exit code 0')
        ])
    ]);
}

// Upgraded Status Renderer (Matches the screenshot's 'Analyzed' text)
function renderAIStatus(text) {
    let icon = 'info';
    let content = el('span', {}, text);

    if (text.includes('Thinking')) {
        icon = 'sync spin'; // Space instead of ~ to use two classes
    } else if (text.includes('Analyzed')) {
        icon = 'search';
        // Try to parse: "Analyzed script.js #L1065-1085"
        const match = text.match(/Analyzed\s+([\w\.-]+)(\s+#L\d+-\d+)?/);
        if (match) {
            const fileName = match[1];
            const lineRange = match[2] || "";
            content = el('span', { 
                style: 'cursor: pointer;', 
                onclick: () => openFileFromSidebar(null, fileName) 
            }, [
                'Analyzed ',
                getFileIcon(fileName),
                el('span', { style: 'font-weight: bold; margin: 0 4px;' }, fileName),
                el('span', { style: 'color: var(--text-muted);' }, lineRange)
            ]);
        }
    } else if (text.includes('Scanned')) {
        icon = 'folder';
    } else if (text.includes('Executing') || text.includes('starting')) {
        icon = 'sync~spin';
    }

    return el('div', { class: 'ai-status-text' }, [
        el('i', { class: `codicon codicon-${icon}` }),
        content
    ]);
}

function renderAIMarkdown(text) {
    const container = el('div', { class: 'ai-markdown' });
    // 1. Try using the external marked library if available
    let renderedHTML = '';
    let isParsed = false;

    if (typeof marked !== 'undefined') {
        try {
            renderedHTML = (typeof marked.parse === 'function') ? marked.parse(text) : marked(text);
            isParsed = true;
        } catch (e) {
            console.error('Marked parsing error:', e);
        }
    }

    // 2. Fallback: If marked didn't work, use a tiny built-in basic parser 
    if (!isParsed) {
        renderedHTML = text
            // Fenced code blocks (triple backticks) - do this before inline code!
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            // Headers
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            // Blockquotes (multiline support)
            .replace(/^\> (.*$)/gm, '<blockquote>$1</blockquote>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Line breaks
            .replace(/\n/g, '<br>');

        // Cleanup: remove line breaks inside pre/code blocks created by the fallback
        renderedHTML = renderedHTML.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (match, content) => {
            return `<pre><code>${content.replace(/<br>/g, '\n')}</code></pre>`;
        });
    }

    container.innerHTML = renderedHTML;

    // Post-process: Add file icons
    // We do this by finding all text nodes and checking for filenames
    const walk = (node) => {
        let child = node.firstChild;
        while (child) {
            const next = child.nextSibling;
            if (child.nodeType === 3) {
                const text = child.textContent;
                // Broader regex to capture modern filenames and multiple occurrences
                const fileRegex = /([\w\.-]+\.(html|css|js|txt|cs|png|py|json|md))/g;

                let lastIdx = 0;
                let match;
                const fragment = document.createDocumentFragment();
                let hasMatches = false;

                while ((match = fileRegex.exec(text)) !== null) {
                    hasMatches = true;
                    // Add text before match
                    fragment.appendChild(document.createTextNode(text.substring(lastIdx, match.index)));

                    // Add icon
                    const icon = getFileIcon(match[1]);
                    // Slightly smaller font size inside raw chat text to feel natural
                    icon.style.fontSize = '14px';
                    icon.style.width = '14px';
                    icon.style.height = '14px';
                    fragment.appendChild(icon);

                    // Add the bolded filename
                    const strong = document.createElement('strong');
                    strong.textContent = match[1];
                    strong.style.cursor = 'pointer';
                    strong.style.textDecoration = 'underline';
                    strong.onclick = () => openFileFromSidebar(null, match[1]);
                    fragment.appendChild(strong);

                    lastIdx = fileRegex.lastIndex;
                }

                if (hasMatches) {
                    // Add remaining text
                    fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
                    child.parentNode.replaceChild(fragment, child);
                }
            } else if (child.nodeType === 1) {
                walk(child);
            }
            child = next;
        }
    };
    walk(container);

    return container;
}



async function handleAIQuery(query) {
    const history = document.querySelector('.ai-chat-history');
    if (!history) return;

    // 1. Add User Message directly to the DOM
    history.appendChild(el('div', { class: 'user-message' }, query));

    // 2. Create the container for this specific AI response turn
    const aiMessageContainer = el('div', { class: 'ai-message' });
    history.appendChild(aiMessageContainer);
    history.scrollTop = history.scrollHeight;

    // State trackers for this specific turn
    let currentMarkdownBlock = null;
    let currentThoughtBlock = null;
    let currentCommandBlock = null;
    let currentStatusBlock = null;
    let thinkingTimerId = null;
    let thinkingStartTime = null;

    await AgentManager.processUserQuery(query, (msg, isTool, isPending) => {
        if (!isTool) {
            // Streaming normal Markdown text
            if (!currentMarkdownBlock) {
                currentMarkdownBlock = el('div', { class: 'ai-markdown' });
                aiMessageContainer.appendChild(currentMarkdownBlock);
            }
            // Overwrite the specific markdown block's content
            currentMarkdownBlock.innerHTML = '';
            currentMarkdownBlock.appendChild(renderAIMarkdown(msg));
        } else {
            currentMarkdownBlock = null;

            // Failsafe: If any new tool/result starts, stop the thinking timer
            if (thinkingTimerId && !msg.startsWith('[tool_use: thinking {}]')) {
                clearInterval(thinkingTimerId);
                thinkingTimerId = null;
            }

            if (msg.startsWith('[tool_use: thinking {}]')) {
                // START THINKING TIMER
                if (thinkingTimerId) clearInterval(thinkingTimerId);
                thinkingStartTime = Date.now();
                const timerSpan = el('span', { style: 'font-weight: bold; color: var(--text-active);' }, 'Thinking...');
                const header = el('div', { class: 'thought-header' }, [
                    el('i', { class: 'codicon codicon-chevron-right' }),
                    timerSpan
                ]);
                const body = el('div', { class: 'thought-body', style: 'display: none;' }, [
                    el('div', { class: 'thought-content' })
                ]);

                header.onclick = () => {
                    const isHidden = body.style.display === 'none';
                    body.style.display = isHidden ? 'block' : 'none';
                    header.querySelector('.codicon').className = isHidden ? 'codicon codicon-chevron-down' : 'codicon codicon-chevron-right';
                };

                currentThoughtBlock = el('div', { class: 'thought-process' }, [header, body]);
                aiMessageContainer.appendChild(currentThoughtBlock);

                thinkingTimerId = setInterval(() => {
                    const delta = Math.floor((Date.now() - thinkingStartTime) / 1000);
                    timerSpan.textContent = `Thinking for ${delta}s...`;
                }, 1000);
            } 
            else if (msg.startsWith('[tool_use: thinking {')) {
                // END THINKING TIMER (Finalized thoughts received)
                let finalDelta = 0;
                if (thinkingStartTime) {
                    finalDelta = Math.floor((Date.now() - thinkingStartTime) / 1000);
                }

                if (thinkingTimerId) { clearInterval(thinkingTimerId); thinkingTimerId = null; }
                if (currentThoughtBlock) {
                    try {
                        const jsonStr = msg.substring(msg.indexOf('{'), msg.lastIndexOf('}') + 1);
                        const data = JSON.parse(jsonStr);

                        const timerSpan = currentThoughtBlock.querySelector('.thought-header span');
                        if (timerSpan) {
                            timerSpan.textContent = `Thought for ${finalDelta}s`;
                            timerSpan.style.color = 'var(--text-muted)';
                            timerSpan.style.fontWeight = 'normal';
                        }

                        const contentDiv = currentThoughtBlock.querySelector('.thought-content');
                        if (contentDiv) {
                            contentDiv.innerHTML = '';
                            contentDiv.appendChild(renderAIMarkdown(data.text));
                        }
                    } catch (e) { console.error("Parse error on thought:", e); }
                }
            }
            else if (msg.startsWith('[tool_use: run_command')) {
                // CREATE TERMINAL BLOCK
                try {
                    const jsonStr = msg.substring(msg.indexOf('{'), msg.lastIndexOf('}') + 1);
                    const data = JSON.parse(jsonStr);
                    currentCommandBlock = renderAICommandBlock(data.command, "Executing...");
                    currentCommandBlock.dataset.command = data.command; // Save command text
                    aiMessageContainer.appendChild(currentCommandBlock);
                } catch (e) { }
            }
            else if (msg.startsWith('[tool_result:')) {
                // UPDATE TERMINAL BLOCK WITH RESULTS
                if (currentCommandBlock) {
                    // Extract exactly what's inside [tool_result: "..."]
                    let resultStr = msg.substring(15, msg.length - 2);
                    // Unescape string formatting
                    resultStr = resultStr.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

                    const newBlock = renderAICommandBlock(currentCommandBlock.dataset.command, resultStr);
                    currentCommandBlock.replaceWith(newBlock);
                    currentCommandBlock = null;
                }
            }
            else if (msg.startsWith('[tool_use: command_status')) {
                // SHOW TEMPORARY STATUS SPINNER
                try {
                    const jsonStr = msg.substring(msg.indexOf('{'), msg.lastIndexOf('}') + 1);
                    const data = JSON.parse(jsonStr);
                    if (currentStatusBlock) currentStatusBlock.remove();
                    currentStatusBlock = renderAIStatus(data.text);
                    aiMessageContainer.appendChild(currentStatusBlock);
                } catch (e) { }
            }
            else if (msg === '') {
                // CLEAR TEMPORARY STATUS SPINNER
                if (currentStatusBlock) {
                    currentStatusBlock.remove();
                    currentStatusBlock = null;
                }
            }
            else if (msg.startsWith('[tool_use: write_to_file')) {
                // RENDER EDITED FILE PILL
                try {
                    const jsonStr = msg.substring(msg.indexOf('{'), msg.lastIndexOf('}') + 1);
                    const data = JSON.parse(jsonStr);
                    aiMessageContainer.appendChild(renderAIEditedFile(data));
                } catch (e) { }
            }
        }

        // Auto-scroll dynamically as new blocks are appended
        history.scrollTop = history.scrollHeight;
    });

    // Failsafe cleanup when the turn finishes completely
    if (thinkingTimerId) clearInterval(thinkingTimerId);
    if (currentStatusBlock) currentStatusBlock.remove();
}

/* --- PIXEL PERFECT AI PANEL --- */
function renderAIPanel() {
    const header = el('div', { class: 'ai-header' }, [
        el('span', {}, 'Antigravity Chat'),
        el('div', { class: 'ai-header-actions' }, [
            el('i', { class: 'codicon codicon-add' }),
            el('i', { class: 'codicon codicon-history' }),
            el('i', { class: 'codicon codicon-ellipsis' })
        ])
    ]);

    const chatHistory = el('div', { class: 'ai-chat-history' });

    const aiFileCount = appState.aiChangeFiles.size;

    const actionBar = el('div', { class: 'ai-action-bar' }, [
        el('div', { class: 'ai-action-left' }, [
            el('i', { class: 'codicon codicon-arrow-left' }),
            el('i', { class: 'codicon codicon-file' }),
            el('span', {}, `${aiFileCount} Files With Changes`)
        ]),
        el('div', { class: 'ai-action-right' }, [
            el('span', { class: 'reject-text', onclick: () => {
                // Reject all logic
                appState.aiChangeFiles.forEach(filename => {
                    const file = appState.files[filename];
                    if (file) {
                        file.content = file.baselineContent;
                        FSManager.writeFile(filename, file.content, 'ui');
                    }
                });
                appState.aiChangeFiles.clear();
                updateUI();
                updateDiffDecorations();
            }}, 'Reject all'),
            el('button', { class: 'accept-btn', onclick: () => {
                // Accept all logic
                appState.aiChangeFiles.forEach(filename => {
                    const file = appState.files[filename];
                    if (file) {
                        file.baselineContent = file.content;
                    }
                });
                appState.aiChangeFiles.clear();
                updateUI();
                updateDiffDecorations();
            }}, 'Accept all'),
            el('i', { class: 'codicon codicon-chevron-up' })
        ])
    ]);

    const inputBox = el('div', { class: 'input-box' }, [
        el('textarea', {
            class: 'input-text',
            placeholder: 'Ask anything...',
            onkeydown: (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (e.target.value.trim()) {
                        handleAIQuery(e.target.value);
                        e.target.value = '';
                    }
                }
            }
        }),
        el('div', { class: 'toolbar-bottom' }, [
            el('div', { class: 'toolbar-left' }, [
                el('i', { class: 'codicon codicon-add' }),
                el('span', {}, [el('i', { class: 'codicon codicon-chevron-up' }), 'Fast']),
                el('span', {}, [el('i', { class: 'codicon codicon-chevron-up' }), 'Gemini 3 Flash'])
            ]),
            el('div', { class: 'toolbar-right' }, [
                el('i', { class: 'codicon codicon-mic' }),
                el('i', { class: 'codicon codicon-arrow-right' })
            ])
        ])
    ]);

    const inputArea = el('div', { class: 'ai-input-area' }, [actionBar, inputBox]);

    return el('div', { class: 'ai-panel', style: `width: ${appState.layout.aiPanelWidth}px;` }, [header, chatHistory, inputArea]);
}
function renderTitleBar() { const menus = ['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help']; const menuItems = menus.map(m => el('div', { class: 'menubar-item' }, m)); const leftSection = el('div', { class: 'titlebar-left' }, [el('div', { class: 'app-icon' }, 'A'), ...menuItems]); const centerSection = el('div', { class: 'titlebar-center' }, ['vscode clone - Antigravity']); const rightSection = el('div', { class: 'titlebar-right' }, [el('div', { class: 'layout-controls' }, [el('span', { class: 'agent-manager-text' }, 'Open Agent Manager'), el('i', { class: 'codicon codicon-layout-sidebar-left' }), el('i', { class: 'codicon codicon-layout-panel' }), el('i', { class: 'codicon codicon-layout-sidebar-right' }), el('i', { class: 'codicon codicon-layout-centered' }), el('i', { class: 'codicon codicon-search' })]), el('div', { style: 'color: var(--border-divider);' }, '|'), el('div', { class: 'layout-controls' }, [el('i', { class: 'codicon codicon-chrome-maximize' }), el('i', { class: 'codicon codicon-settings-gear' }), el('div', { class: 'layout-controls', style: 'gap:2px; cursor: pointer;', onclick: () => { appState.isSettingsModalOpen = true; updateUI(); } }, [el('div', { class: 'avatar-circle' }, 'A'), el('i', { class: 'codicon codicon-chevron-down', style: 'font-size: 12px;' })])]), el('div', { class: 'system-controls' }, [el('i', { class: 'codicon codicon-chrome-minimize' }), el('i', { class: 'codicon codicon-chrome-restore' }), el('i', { class: 'codicon codicon-chrome-close' })])]); return el('div', { class: 'titlebar' }, [leftSection, centerSection, rightSection]); }
function renderStatusBar() {
    // Left side items
    const leftItems = [
        el('div', { class: 'statusbar-remote' }, [el('i', { class: 'codicon codicon-remote' })]),
        el('div', { class: 'statusbar-item' }, [
            el('span', { class: 'status-error' }, [el('i', { class: 'codicon codicon-error' }), '0']),
            el('span', { class: 'status-warning' }, [el('i', { class: 'codicon codicon-warning' }), '0'])
        ])
    ];

    // NEW: Inject the Live Preview Button if a server is running!
    if (appState.activePort && appState.activePreviewUrl) {
        leftItems.push(
            el('div', {
                class: 'statusbar-item',
                style: 'background-color: #16825d; color: white; font-weight: bold; padding: 0 10px;',
                title: 'Open Live Preview',
                onclick: () => {
                    if (!appState.openTabs.includes('Live Preview')) {
                        appState.openTabs.push('Live Preview');
                    }
                    switchFile('Live Preview');
                }
            }, [
                el('i', { class: 'codicon codicon-browser', style: 'margin-right: 4px;' }),
                `Port: ${appState.activePort} (Click to View)`
            ])
        );
    }

    const leftSection = el('div', { class: 'statusbar-left' }, leftItems);

    // Right side items
    const rightSection = el('div', { class: 'statusbar-right' }, [
        el('div', { class: 'statusbar-item' }, 'Ln 1, Col 1'),
        el('div', { class: 'statusbar-item' }, 'Spaces: 4'),
        el('div', { class: 'statusbar-item' }, 'UTF-8'),
        el('div', { class: 'statusbar-item' }, 'Antigravity Workspace'),
        el('div', { class: 'statusbar-item' }, [el('i', { class: 'codicon codicon-bell' })])
    ]);

    return el('div', { class: 'statusbar' }, [leftSection, rightSection]);
}


/* --- 5. INITIALIZATION & MONACO --- */

function renderApp() {
    const root = document.getElementById('root');
    root.innerHTML = '';

    root.appendChild(renderTitleBar());
    root.appendChild(el('div', { class: 'main-workspace' }, [
        renderActivityBar(),
        renderSidebar(),
        el('div', { class: 'resizer resizer-v', onmousedown: (e) => startResizing(e, 'sidebar') }),
        el('div', { class: 'editor-terminal-container' }, [
            renderEditor(),
            el('div', { class: 'resizer resizer-h', onmousedown: (e) => startResizing(e, 'terminal') }),
            renderTerminal()
        ]),
        el('div', { class: 'resizer resizer-v', onmousedown: (e) => startResizing(e, 'ai') }),
        renderAIPanel()
    ]));
    root.appendChild(renderStatusBar());

    updateUI(); // Set initial text highlights
}

/* --- 6. RESIZING LOGIC --- */
let isResizing = false;
let currentResizerType = null;

function startResizing(e, type) {
    isResizing = true;
    currentResizerType = type;
    document.body.style.cursor = type === 'terminal' ? 'row-resize' : 'col-resize';
    e.target.classList.add('dragging');

    const onMouseMove = (moveEvent) => {
        if (!isResizing) return;

        switch (currentResizerType) {
            case 'sidebar': {
                const sidebarWidth = moveEvent.clientX - 50; // 50px is ActivityBar width
                if (sidebarWidth > 100 && sidebarWidth < 600) {
                    appState.layout.sidebarWidth = sidebarWidth;
                    document.querySelector('.sidebar').style.width = `${sidebarWidth}px`;
                }
                break;
            }
            case 'ai': {
                const aiPanelWidth = window.innerWidth - moveEvent.clientX;
                if (aiPanelWidth > 150 && aiPanelWidth < 800) {
                    appState.layout.aiPanelWidth = aiPanelWidth;
                    document.querySelector('.ai-panel').style.width = `${aiPanelWidth}px`;
                }
                break;
            }
            case 'terminal': {
                const mainWorkspaceHeight = document.querySelector('.main-workspace').offsetHeight;
                const terminalHeight = mainWorkspaceHeight - (moveEvent.clientY - 35); // 35px is TitleBar height
                if (terminalHeight > 50 && terminalHeight < mainWorkspaceHeight - 100) {
                    appState.layout.terminalHeight = terminalHeight;
                    document.querySelector('.panel').style.height = `${terminalHeight}px`;
                }
                break;
            }
        }
    };

    const onMouseUp = () => {
        isResizing = false;
        currentResizerType = null;
        document.body.style.cursor = 'default';
        document.querySelectorAll('.resizer').forEach(r => r.classList.remove('dragging'));
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        // Notify Monaco to resize
        if (monacoEditorInstance) {
            monacoEditorInstance.layout();
        }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

function initMonaco() {
    if (isMonacoInitialized) return;
    isMonacoInitialized = true;

    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

    require(['vs/editor/editor.main'], function () {
        const container = document.getElementById('monaco-container');
        const activeFile = appState.files[appState.activeTab];

        monacoEditorInstance = monaco.editor.create(container, {
            value: activeFile ? activeFile.content : '',
            language: activeFile ? activeFile.language : 'plaintext',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: 'Consolas, "Fira Code", monospace',
            scrollBeyondLastLine: false,
            padding: { top: 10 }
        });

        // Event Listener: When user types in Monaco
        monacoEditorInstance.onDidChangeModelContent(() => {
            if (isInternalChange) return;
            if (appState.activeTab && !appState.files[appState.activeTab].dirty) {
                appState.files[appState.activeTab].dirty = true;
                updateUI(); // Re-render tabs to show the white dot
            }
            // Update diffs live as user types
            updateDiffDecorations();
        });

        // Initial diff markings
        updateDiffDecorations();
    });
}

let activeDecorations = [];

function updateDiffDecorations() {
    if (!monacoEditorInstance || !appState.activeTab) return;
    const file = appState.files[appState.activeTab];
    if (!file || file.baselineContent === undefined) return;

    const currentLines = monacoEditorInstance.getValue().split('\n');
    const baselineLines = file.baselineContent.split('\n');

    const newDecorations = [];
    
    // Simple line-by-line comparison for visual diffing
    // (Note: A real diff algorithm like Myers would be better, but this is a start)
    // We'll mark added lines and removed lines if possible.
    
    // For simplicity, let's just mark lines that are different from the baseline
    // If current is longer, lines at the end are "added"
    // If current is shorter, we can't easily show "removed" lines without more complex UI
    // So let's mark modified lines as "added" for now if they don't match baseline at same index.
    
    const maxLines = Math.max(currentLines.length, baselineLines.length);
    
    for (let i = 0; i < maxLines; i++) {
        if (i >= baselineLines.length) {
            // Added lines at the end
            newDecorations.push({
                range: new monaco.Range(i + 1, 1, i + 1, 1),
                options: {
                    isWholeLine: true,
                    className: 'diff-added-line-bg',
                    linesDecorationsClassName: 'diff-added-line-gutter'
                }
            });
        } else if (i >= currentLines.length) {
            // Removed lines at the end - can only mark the last line of current file
            newDecorations.push({
                range: new monaco.Range(currentLines.length, 1, currentLines.length, 1),
                options: {
                    isWholeLine: true,
                    className: 'diff-removed-line-bg',
                    linesDecorationsClassName: 'diff-removed-line-gutter'
                }
            });
        } else if (currentLines[i] !== baselineLines[i]) {
            // Modified or shifted line
            newDecorations.push({
                range: new monaco.Range(i + 1, 1, i + 1, 1),
                options: {
                    isWholeLine: true,
                    className: 'diff-added-line-bg',
                    linesDecorationsClassName: 'diff-added-line-gutter'
                }
            });
        }
    }

    activeDecorations = monacoEditorInstance.deltaDecorations(activeDecorations, newDecorations);
}

/* --- 6. UTILITY ACTIONS --- */
function saveActiveFile() {
    if (appState.activeTab && appState.files[appState.activeTab].dirty) {
        const content = monacoEditorInstance.getValue();
        FSManager.writeFile(appState.activeTab, content); // This saves to State, WC, and Disk!
        updateDiffDecorations();
    }
}


document.addEventListener('keydown', (e) => {
    // Ctrl+S or Meta+S (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveActiveFile();
    }
});

// Listen for clicks to handle Explorer focus state
document.addEventListener('mousedown', (e) => {
    const sidebar = document.querySelector('.sidebar');
    const isInsideSidebar = sidebar && sidebar.contains(e.target);

    if (appState.isExplorerFocused !== isInsideSidebar) {
        appState.isExplorerFocused = isInsideSidebar;

        // Use a tiny timeout to let any specific item handlers fire first
        // This prevents the focus swap from "eating" the click event.
        setTimeout(() => {
            updateUI();
        }, 10);
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    renderApp();
    initMonaco();

    // Load local files if permission was granted previously
    await FSManager.init();

    // Boot the Terminal and WebContainer in the background
    await TerminalManager.init();
});