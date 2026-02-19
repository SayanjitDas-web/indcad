/**
 * IndCAD Application Controller
 * Wires together Canvas engine, Tools, Panels, and Python API bridge.
 */

class IndCADApp {
    constructor() {
        this.engine = null;
        this.tools = null;
        this.panels = null;
        this.ui = null;
        this.api = null;

        this.projectData = null;
        this._hiddenLayers = new Set();
        this._autoSaveTimer = null;
    }

    async init() {
        // Wait for pywebview API
        this.api = await this._waitForApi();

        // Init modules
        this.engine = new CanvasEngine('cad-canvas');
        this.engine.api = this.api;
        this.tools = new ToolManager(this.engine);
        this.panels = new PanelsManager();
        this.ui = new UIController(this);

        // Wire up callbacks
        this._connectEngineCallbacks();
        this._connectToolCallbacks();
        this._connectPanelCallbacks();
        this._connectMenuCallbacks();
        this._connectKeyboard();
        this._connectStatusBar();
        this._initAI();
        this._initUnitsSettings();

        // Load initial project
        await this._loadProjectData();
        this._syncToEngine();
        await this._fetchLibraryBlocks();

        // Check for updates

        // Center the view
        this.engine.pan = { x: this.engine.width / 2, y: this.engine.height / 2 };
        this._updateZoomDisplay();

        // Auto-save every 30 seconds
        this._autoSaveTimer = setInterval(() => this._autoSave(), 30000);

        console.log('IndCAD initialized');
    }

    // ──────────────────────── API Wait ────────────────────────

    _waitForApi() {
        return new Promise((resolve) => {
            if (window.pywebview && window.pywebview.api) {
                resolve(window.pywebview.api);
                return;
            }
            window.addEventListener('pywebviewready', () => {
                resolve(window.pywebview.api);
            });
        });
    }

    // ──────────────────────── Project Data Sync ────────────────────────

    async _loadProjectData() {
        try {
            const result = await this.api.get_project_data();
            this.projectData = JSON.parse(result);
            this._syncToEngine();
            this._syncPanels();
        } catch (e) {
            console.error('Failed to load project:', e);
        }
    }

    _syncToEngine() {
        if (!this.projectData) return;

        const settings = this.projectData.settings || {};
        const shapes = this.projectData.shapes || [];

        // Update unit settings
        if (settings.unitType) {
            Units.updateSettings({
                unitType: settings.unitType,
                unitPrecision: settings.unitPrecision,
                angleType: settings.angleType,
                anglePrecision: settings.anglePrecision
            });
        }

        this.engine.setShapes(shapes);
        this.engine.setBlocks(this.projectData.blocks || {});
        this.panels.updateBlocks(this.projectData.blocks || {});
        this._fetchLibraryBlocks();
        this.engine.render();
    }

    _syncPanels() {
        if (!this.projectData) return;
        this.panels.updateLayers(
            this.projectData.layers || [],
            this.projectData.activeLayer || 'layer-0'
        );
    }

    _updateProjectTitle() {
        const titleEl = document.getElementById('project-title');
        if (titleEl && this.projectData) {
            titleEl.textContent = this.projectData.name || 'Untitled';
        }
    }

    async _goHome() {
        // Save thumbnail before leaving
        await this._captureThumbnail();
        await this._autoSave();
        // Navigate to home
        window.location.href = 'home.html?noautoload=true';
    }

    async _captureThumbnail() {
        try {
            // Create a smaller canvas for the thumbnail
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = 400;
            thumbCanvas.height = 240;
            const thumbCtx = thumbCanvas.getContext('2d');
            thumbCtx.drawImage(this.engine.canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
            const dataUrl = thumbCanvas.toDataURL('image/png', 0.7);
            await this.api.save_thumbnail(dataUrl);
        } catch (e) {
            console.error('Failed to capture thumbnail:', e);
        }
    }

    async _autoSave() {
        try {
            await this.api.sync_project_to_db();
        } catch (e) {
            // Silent fail for auto-save
        }
    }

    // ──────────────────────── Engine Callbacks ────────────────────────

    _connectEngineCallbacks() {
        this.engine.onToolMouseDown = (world, screen, e) => this.tools.onMouseDown(world, screen, e);
        this.engine.onToolMouseMove = (world, screen, e) => this.tools.onMouseMove(world, screen, e);
        this.engine.onToolMouseUp = (world, screen, e) => this.tools.onMouseUp(world, screen, e);
        this.engine.onToolDoubleClick = (world, screen, e) => this.tools.onDoubleClick(world, screen, e);

        this.engine.onCoordsChange = (world) => {
            const el = document.getElementById('status-coords');
            const x = Units.formatLinear(world.x);
            const y = Units.formatLinear(world.y);
            el.textContent = `X: ${x}  Y: ${y}`;
        };

        this.engine.onZoomChange = (zoom) => this._updateZoomDisplay();
    }

    // ──────────────────────── Tool Callbacks ────────────────────────

    _connectToolCallbacks() {
        this.tools.onShapeCreated = async (shapeData) => {
            try {
                // Get active layer color
                const activeLayer = (this.projectData.layers || []).find(
                    l => l.id === this.projectData.activeLayer
                );
                if (activeLayer) {
                    shapeData.color = activeLayer.color;
                }

                const result = await this.api.add_shape(JSON.stringify(shapeData));
                const { id } = JSON.parse(result);
                shapeData.id = id;
                await this._loadProjectData();
            } catch (e) {
                console.error('Failed to add shape:', e);
            }
        };

        this.tools.onShapeDeleted = async (shapeId) => {
            try {
                await this.api.delete_shape(shapeId);
                await this._loadProjectData();
            } catch (e) {
                console.error('Failed to delete shape:', e);
            }
        };

        this.tools.onShapeMoved = async (shape) => {
            try {
                const data = { ...shape };
                delete data.id;
                delete data._hidden;
                await this.api.modify_shape(shape.id, JSON.stringify(data));
                await this._loadProjectData();
            } catch (e) {
                console.error('Failed to modify shape:', e);
            }
        };

        this.tools.onSelectionChanged = (selectedIds) => {
            this.engine.setSelection(selectedIds);
            const shapes = this.engine.shapes.filter(s => selectedIds.includes(s.id));
            this.panels.updateProperties(shapes);
            // Track selection for AI context
            this._selectedShapeIds = selectedIds;
            this._updateAiSelectionBadge();
        };

        this.tools.onToolChanged = (name) => {
            // Update toolbar UI
            document.querySelectorAll('.tool-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === name);
            });
            // Update status
            const names = {
                select: '🔧 Select', line: '📏 Line', rectangle: '⬜ Rectangle',
                circle: '⭕ Circle', arc: '◠ Arc', ellipse: '⬮ Ellipse',
                polyline: '📐 Polyline', text: '🅰️ Text', dimension: '↔️ Dimension',
                measure: '📐 Measure', erase: '🗑️ Erase',
                transform: '🔧 Move+',
                createBlock: '📦 Create Block', insertBlock: '📥 Insert Block'
            };
            document.getElementById('status-tool').textContent = names[name] || name;
        };

        this.tools.onProjectUpdated = async () => {
            await this._loadProjectData();
        };
    }

    // ──────────────────────── Panel Callbacks ────────────────────────

    _connectPanelCallbacks() {
        this.panels.onAddLayer = async () => {
            try {
                const result = await this.api.add_layer();
                await this._loadProjectData();
            } catch (e) {
                console.error('Failed to add layer:', e);
            }
        };

        this.panels.onDeleteLayer = async (layerId) => {
            try {
                await this.api.delete_layer(layerId);
                await this._loadProjectData();
            } catch (e) {
                console.error('Failed to delete layer:', e);
            }
        };

        this.panels.onSetActiveLayer = async (layerId) => {
            try {
                await this.api.set_active_layer(layerId);
                this.projectData.activeLayer = layerId;
                this._syncPanels();
            } catch (e) {
                console.error('Failed to set active layer:', e);
            }
        };

        this.panels.onToggleVisibility = async (layerId) => {
            try {
                await this.api.toggle_layer_visibility(layerId);
                await this._loadProjectData();
            } catch (e) {
                console.error('Failed to toggle visibility:', e);
            }
        };

        this.panels.onToggleLock = async (layerId) => {
            try {
                await this.api.toggle_layer_lock(layerId);
                await this._loadProjectData();
            } catch (e) {
                console.error('Failed to toggle lock:', e);
            }
        };

        this.panels.onRenameLayer = async (layerId, newName) => {
            try {
                await this.api.rename_layer(layerId, newName);
                await this._loadProjectData();
            } catch (e) {
                console.error('Failed to rename layer:', e);
            }
        };

        this.panels.onPropertyChanged = async (shapeId, changes) => {
            try {
                await this.api.modify_shape(shapeId, JSON.stringify(changes));
                await this._loadProjectData();
                // Re-update properties panel
                const selected = Array.from(this.engine.selectedIds);
                const shapes = this.engine.shapes.filter(s => selected.includes(s.id));
                this.panels.updateProperties(shapes);
            } catch (e) {
                console.error('Failed to update property:', e);
            }
        };

        this.panels.onInsertBlock = (name) => {
            this.tools.setTool('insertBlock');
            const tool = this.tools.tools.insertBlock;
            if (tool) {
                tool.blockName = name;
                document.getElementById('status-tool').textContent = `📥 Insert: ${name}`;
            }
        };

        this.panels.onPublishToLibrary = async (name) => {
            const res = await this.engine.api.publish_block_to_library(name);
            const data = JSON.parse(res);
            if (data.success) {
                await this._fetchLibraryBlocks();
                alert(`Block "${name}" published to global library.`);
            } else {
                alert(`Failed to publish: ${data.error}`);
            }
        };

        this.panels.onImportFromLibrary = async (name) => {
            const res = await this.engine.api.import_block_from_library(name);
            const data = JSON.parse(res);
            if (data.success) {
                await this._loadProjectData(); // Refresh project data to get new block definition
                this._syncToEngine();
                // After import, trigger insertion
                this.panels.onInsertBlock(name);
            } else {
                alert(`Failed to import: ${data.error}`);
            }
        };

        this.panels.onDeleteFromLibrary = async (name) => {
            if (confirm(`Delete block "${name}" from global library?`)) {
                await this.engine.api.delete_library_block(name);
                await this._fetchLibraryBlocks();
            }
        };
    }

    async _fetchLibraryBlocks() {
        const res = await this.engine.api.get_library_blocks();
        const data = JSON.parse(res);
        this.panels.updateLibraryBlocks(data.blocks || []);
    }

    // ──────────────────────── Menu ────────────────────────

    _connectMenuCallbacks() {
        // Ribbon Tabs
        const tabs = document.querySelectorAll('.tab-btn');
        const panels = document.querySelectorAll('.ribbon-tab-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Deactivate all
                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));

                // Activate clicked
                tab.classList.add('active');
                const panelId = `tab-${tab.dataset.tab}`;
                const panel = document.getElementById(panelId);
                if (panel) panel.classList.add('active');
            });
        });

        // Ribbon Buttons (Tools)
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.tools.setTool(btn.dataset.tool);
            });
        });

        // Quick Access & Ribbon Actions
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // If it's a tool-like action (e.g. toggleGrid), might be handled by tool manager or here
                // For now, route to _handleAction
                this._handleAction(btn.dataset.action);
            });
        });
    }

    async _handleAction(action) {
        switch (action) {
            case 'new':
                // Save current thumbnail and go home to create new project
                await this._captureThumbnail();
                await this._autoSave();
                window.location.href = 'home.html?noautoload=true';
                break;

            case 'open':
                try {
                    const loadResult = await this.api.load_project();
                    const loadData = JSON.parse(loadResult);
                    if (loadData.success) {
                        await this._loadProjectData();
                        this.engine.zoomToFit();
                    }
                } catch (e) { console.error(e); }
                break;

            case 'save':
                try {
                    await this._captureThumbnail();
                    await this.api.save_project();
                } catch (e) { console.error(e); }
                break;

            case 'saveAs':
                try {
                    await this._captureThumbnail();
                    await this.api.save_project_as();
                } catch (e) { console.error(e); }
                break;

            case 'exportSVG':
                this._exportSVG();
                break;

            case 'exportPNG':
                this._exportPNG();
                break;
            case 'exportSVG':
                this._exportSVG();
                break;
            case 'exportDXF':
                this._exportDXF();
                break;
            case 'importHTML':
                this._handleImportHTML();
                break;
            case 'home':
                this._goHome();
                break;

            case 'undo':
                try {
                    const undoResult = await this.api.undo();
                    const undoData = JSON.parse(undoResult);
                    if (undoData.success) {
                        this.projectData = undoData.data;
                        this._syncToEngine();
                        this._syncPanels();
                    }
                } catch (e) { console.error(e); }
                break;

            case 'redo':
                try {
                    const redoResult = await this.api.redo();
                    const redoData = JSON.parse(redoResult);
                    if (redoData.success) {
                        this.projectData = redoData.data;
                        this._syncToEngine();
                        this._syncPanels();
                    }
                } catch (e) { console.error(e); }
                break;

            case 'delete':
                const ids = Array.from(this.engine.selectedIds);
                if (ids.length > 0) {
                    try {
                        await this.api.delete_shapes(JSON.stringify(ids));
                        this.engine.selectedIds.clear();
                        this.panels.updateProperties([]);
                        await this._loadProjectData();
                    } catch (e) { console.error(e); }
                }
                break;

            case 'selectAll':
                this.engine.selectedIds = new Set(this.engine.shapes.map(s => s.id));
                const allShapes = [...this.engine.shapes];
                this.panels.updateProperties(allShapes);
                break;

            case 'zoomIn':
                this.engine.zoomIn();
                break;
            case 'zoomOut':
                this.engine.zoomOut();
                break;
            case 'zoomFit':
                this.engine.zoomToFit();
                break;

            case 'toggleGrid':
                this.engine.gridVisible = !this.engine.gridVisible;
                document.getElementById('status-grid').classList.toggle('active', this.engine.gridVisible);
                break;

            case 'toggleSnap':
                this.tools.snapEnabled = !this.tools.snapEnabled;
                document.getElementById('status-snap').classList.toggle('active', this.tools.snapEnabled);

                // If snap is disabled, grid snap should also be disabled in logic? 
                // Actually, let's just sync the 'grid' checkbox to the gridSnap state if we want.
                // But the user might want grid snap on and object snap off?
                // The menu allows individual control. toggleSnap is the MASTER switch.
                break;

            case 'showUnits':
                this._showUnitsModal();
                break;

            default:
                if (action && action.startsWith('tool-')) {
                    this.tools.setTool(action.replace('tool-', ''));
                }
        }
    }

    // ──────────────────────── Keyboard ────────────────────────

    _connectKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't intercept when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Space for panning
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                this.engine.setSpaceDown(true);
                return;
            }

            // Ctrl shortcuts
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'z': e.preventDefault(); this._handleAction(e.shiftKey ? 'redo' : 'undo'); return;
                    case 'y': e.preventDefault(); this._handleAction('redo'); return;
                    case 's': e.preventDefault(); this._handleAction(e.shiftKey ? 'saveAs' : 'save'); return;
                    case 'o': e.preventDefault(); this._handleAction('open'); return;
                    case 'n': e.preventDefault(); this._handleAction('new'); return;
                    case 'a': e.preventDefault(); this._handleAction('selectAll'); return;
                    case '=': case '+': e.preventDefault(); this.engine.zoomIn(); return;
                    case '-': e.preventDefault(); this.engine.zoomOut(); return;
                    case '0': e.preventDefault(); this.engine.zoomToFit(); return;
                }
                return;
            }

            // Send to active tool first. If handled, skip global shortcuts.
            if (this.tools.onKeyDown(e.key, e)) {
                // e.preventDefault(); // Optional: prevent browser defaults if tool handled it
                return;
            }

            // Tool shortcuts
            switch (e.key.toLowerCase()) {
                case 'v': this.tools.setTool('select'); break;
                case 'l': this.tools.setTool('line'); break;
                case 'r': this.tools.setTool('rectangle'); break;
                case 'c': this.tools.setTool('circle'); break;
                case 'p': this.tools.setTool('polyline'); break;
                case 't': this.tools.setTool('trim'); break;
                case 'o': this.tools.setTool('offset'); break;
                case 'd': this.tools.setTool('copy'); break; // D for Duplicate/Copy
                case 'e': this.tools.setTool('erase'); break;
                case 'm': this.tools.setTool('transform'); break;
                case 'g': this._handleAction('toggleGrid'); break;
                case 's': this._handleAction('toggleSnap'); break;
                case 'k': this.tools.orthoMode = !this.tools.orthoMode; // Changed 'd' to 'k' to avoid duplicate case and keep ortho toggle
                    document.getElementById('status-ortho').classList.toggle('active', this.tools.orthoMode);
                    break;
                default:
                    this.tools.onKeyDown(e.key, e);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.engine.setSpaceDown(false);
            }
        });
    }

    // ──────────────────────── Status Bar ────────────────────────

    _connectStatusBar() {
        document.querySelectorAll('.status-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const action = toggle.dataset.toggle;
                if (action === 'grid') this._handleAction('toggleGrid');
                if (action === 'snap') this._handleAction('toggleSnap');
                if (action === 'ortho') {
                    this.tools.orthoMode = !this.tools.orthoMode;
                    toggle.classList.toggle('active', this.tools.orthoMode);
                }
            });
        });

        // Command input
        const cmdInput = document.getElementById('command-input');
        cmdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._handleCommand(cmdInput.value.trim());
                cmdInput.value = '';
                cmdInput.blur();
            }
            if (e.key === 'Escape') {
                cmdInput.value = '';
                cmdInput.blur();
            }
        });
    }

    _handleCommand(cmd) {
        if (!cmd) return;
        const lower = cmd.toLowerCase();

        const commandMap = {
            'line': 'line', 'l': 'line',
            'rect': 'rectangle', 'rectangle': 'rectangle', 'r': 'rectangle',
            'circle': 'circle', 'c': 'circle',
            'arc': 'arc', 'a': 'arc',
            'ellipse': 'ellipse',
            'polyline': 'polyline', 'pl': 'polyline', 'p': 'polyline',
            'text': 'text',
            'dimension': 'dimension', 'dim': 'dimension',
            'measure': 'measure', 'dist': 'measure',
            'move': 'transform', 'rotate': 'transform', 'm': 'transform',
            'trim': 'trim', 'tr': 'trim',
            'offset': 'offset', 'off': 'offset', 'o': 'offset',
            'copy': 'copy', 'co': 'copy', 'cp': 'copy',
            'erase': 'erase', 'e': 'erase', 'delete': 'erase',
            'select': 'select', 'v': 'select',
            'zoom fit': null, 'zf': null, 'fit': null,
            'undo': null, 'redo': null,
            'grid': null, 'snap': null, 'ortho': null,
            'block': 'createBlock', 'insert': 'insertBlock', 'i': 'insertBlock',
            'b': 'createBlock',
            'array': 'array', 'ar': 'array',
            'scale': 'scale', 'sc': 'scale',
            'fillet': 'fillet', 'f': 'fillet', 'fi': 'fillet',
        };

        if (lower in commandMap) {
            const tool = commandMap[lower];
            if (tool) {
                this.tools.setTool(tool);
            } else {
                if (lower === 'undo') this._handleAction('undo');
                else if (lower === 'redo') this._handleAction('redo');
                else if (['zoom fit', 'zf', 'fit'].includes(lower)) this.engine.zoomToFit();
                else if (lower === 'grid') this._handleAction('toggleGrid');
                else if (lower === 'snap') this._handleAction('toggleSnap');
                else if (lower === 'ortho') {
                    this.tools.orthoMode = !this.tools.orthoMode;
                    document.getElementById('status-ortho').classList.toggle('active', this.tools.orthoMode);
                }
            }
        }
    }

    _updateZoomDisplay() {
        const pct = Math.round(this.engine.zoom * 100);
        document.getElementById('status-zoom').textContent = `🔍 ${pct}%`;
    }

    // ──────────────────────── AI Assistant ────────────────────────

    _initAI() {
        const toggleBtn = document.getElementById('ai-toggle-btn');
        const closeBtn = document.getElementById('ai-close-btn');
        const panel = document.getElementById('ai-panel');
        const sendBtn = document.getElementById('ai-send-btn');
        const input = document.getElementById('ai-input');
        const magicBtn = document.getElementById('ai-magic-start-btn');
        const settingsBtn = document.getElementById('ai-settings-btn');
        const settingsPanel = document.getElementById('ai-settings');
        const saveKeyBtn = document.getElementById('ai-save-key-btn');
        const keyInput = document.getElementById('ai-api-key-input');
        const saveOrKeyBtn = document.getElementById('ai-save-or-key-btn');
        const orKeyInput = document.getElementById('ai-or-key-input');

        if (!toggleBtn || !panel) return;

        // Design mode toggle state
        this._aiDesignMode = false;
        this._pendingImage = null; // {dataUrl, fileName}

        toggleBtn.addEventListener('click', () => panel.classList.toggle('hidden'));
        closeBtn.addEventListener('click', () => {
            panel.classList.add('hidden');
            settingsPanel.classList.add('hidden');
        });

        settingsBtn.addEventListener('click', () => {
            const isHidden = settingsPanel.classList.toggle('hidden');
            if (!isHidden) this._refreshAiConfig();
        });

        // Design mode toggle button — injected dynamically
        const inputRow = sendBtn.parentElement;
        if (inputRow) {
            const designBtn = document.createElement('button');
            designBtn.id = 'ai-design-mode-btn';
            designBtn.className = 'ai-btn';
            designBtn.title = 'Toggle Design Mode (AI generates SVG shapes)';
            designBtn.textContent = '✨ Design';
            designBtn.style.cssText = 'font-size: 11px; padding: 4px 8px; border-radius: 4px; cursor: pointer; background: transparent; color: #888; border: 1px solid #444; margin-right: 4px; transition: all 0.2s;';
            designBtn.addEventListener('click', () => {
                this._aiDesignMode = !this._aiDesignMode;
                if (this._aiDesignMode) {
                    designBtn.style.background = '#7c3aed';
                    designBtn.style.color = '#fff';
                    designBtn.style.borderColor = '#7c3aed';
                    designBtn.textContent = '✨ Design ON';
                    this._addAiMessage('🎨 Design Mode ON — AI will generate advanced SVG shapes.', 'bot');
                } else {
                    designBtn.style.background = 'transparent';
                    designBtn.style.color = '#888';
                    designBtn.style.borderColor = '#444';
                    designBtn.textContent = '✨ Design';
                    this._addAiMessage('💬 Design Mode OFF — Standard chat mode.', 'bot');
                }
            });
            inputRow.insertBefore(designBtn, sendBtn);
        }

        saveKeyBtn.addEventListener('click', async () => {
            const key = keyInput.value.trim();
            if (key) {
                const result = await this.api.update_ai_config(key, 'gemini');
                const data = JSON.parse(result);
                if (data.success) {
                    this._addAiMessage("✅ Gemini API Key updated.", 'bot');
                    this._refreshAiConfig();
                    keyInput.value = '';
                }
            }
        });

        saveOrKeyBtn.addEventListener('click', async () => {
            const key = orKeyInput.value.trim();
            if (key) {
                const result = await this.api.update_ai_config(key, 'openrouter');
                const data = JSON.parse(result);
                if (data.success) {
                    this._addAiMessage("✅ OpenRouter API Key updated.", 'bot');
                    this._refreshAiConfig();
                    orKeyInput.value = '';
                }
            }
        });

        sendBtn.addEventListener('click', () => this._handleAIChat());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._handleAIChat();
        });

        magicBtn.addEventListener('click', () => this._handleAIMagicStart());

        const exportDxfBtn = document.getElementById('ai-export-dxf-btn');
        if (exportDxfBtn) {
            exportDxfBtn.addEventListener('click', async () => {
                const res = await this.api.export_dxf_direct();
                const data = JSON.parse(res);
                if (data.success) {
                    this._addAiMessage(`✅ Exported to machine: ${data.path}`, 'bot');
                } else {
                    this._addAiMessage(`❌ Export failed: ${data.error}`, 'bot error');
                }
            });
        }

        // Selection badge for AI panel — shows when shapes are selected
        this._aiSelectionBadge = document.createElement('div');
        this._aiSelectionBadge.id = 'ai-selection-badge';
        this._aiSelectionBadge.style.cssText = 'display:none; padding:4px 10px; font-size:11px; color:#7c3aed; background:rgba(124,58,237,0.12); border-radius:4px; margin-bottom:4px; text-align:center; font-weight:600;';
        if (inputRow) {
            inputRow.parentElement.insertBefore(this._aiSelectionBadge, inputRow);
        }

        // ── Image Upload Wiring ──
        const uploadBtn = document.getElementById('ai-upload-btn');
        const imageInput = document.getElementById('ai-image-input');
        const previewBox = document.getElementById('ai-image-preview');
        const previewThumb = document.getElementById('ai-preview-thumb');
        const previewName = document.getElementById('ai-preview-name');
        const previewRemove = document.getElementById('ai-preview-remove');
        const msgArea = document.getElementById('ai-messages');

        if (uploadBtn && imageInput) {
            uploadBtn.addEventListener('click', () => imageInput.click());

            imageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this._attachAiImage(file);
                imageInput.value = ''; // Reset so same file can be re-selected
            });

            if (previewRemove) {
                previewRemove.addEventListener('click', () => this._clearAiImage());
            }

            // Drag & drop on messages area
            if (msgArea) {
                msgArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    msgArea.classList.add('dragover');
                });
                msgArea.addEventListener('dragleave', () => {
                    msgArea.classList.remove('dragover');
                });
                msgArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    msgArea.classList.remove('dragover');
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                        this._attachAiImage(file);
                    }
                });
            }
        }
    }

    async _handleAIChat() {
        const input = document.getElementById('ai-input');
        const msgContainer = document.getElementById('ai-messages');
        const loading = document.getElementById('ai-loading');
        const prompt = input.value.trim();
        const hasImage = !!this._pendingImage;
        if (!prompt && !hasImage) return;

        // Check if shapes are selected for context-aware generation
        const selectedIds = this._selectedShapeIds || [];
        const hasSelection = selectedIds.length > 0;

        // Build user message with optional image thumbnail
        let userMsgHtml = '';
        if (hasImage) {
            userMsgHtml += `<img class="ai-msg-image" src="${this._pendingImage.dataUrl}" alt="uploaded"><br>`;
        }
        if (hasSelection) {
            userMsgHtml += `🎯 [${selectedIds.length} shape(s) selected] `;
        }
        if (hasImage && !prompt) {
            userMsgHtml += '📷 Analyze this drawing';
        } else {
            userMsgHtml += this._escapeHtml(prompt);
        }
        this._addAiMessageRaw(userMsgHtml, 'user');
        input.value = '';

        // Capture and clear pending image before async call
        const imageData = hasImage ? this._pendingImage.dataUrl : null;
        if (hasImage) this._clearAiImage();

        // Show loading
        loading.classList.remove('hidden');
        msgContainer.scrollTop = msgContainer.scrollHeight;

        const effectivePrompt = prompt || 'Analyze this drawing and recreate it as CAD shapes.';

        try {
            let result;
            if (hasImage) {
                // Multimodal: text + image
                result = await this.api.ai_chat_with_image(effectivePrompt, imageData);
            } else if (hasSelection) {
                result = await this.api.ai_generate_from_selection(
                    effectivePrompt, JSON.stringify(selectedIds)
                );
            } else if (this._aiDesignMode) {
                result = await this.api.design_with_agent(effectivePrompt);
            } else {
                result = await this.api.ai_chat(effectivePrompt);
            }
            const data = JSON.parse(result);

            // Add bot message
            const botText = data.text || data.response || "";
            if (String(botText).startsWith('Error:')) {
                this._addAiMessage(botText, 'bot error');
            } else {
                this._addAiMessage(botText, 'bot');
            }

            // If drawing, sync engine
            if (data.draw && data.draw.length > 0) {
                this._addAiMessage(`✅ Generated ${data.draw.length} shapes.`, 'bot');
                await this._loadProjectData();
                this.engine.zoomToFit();
            }
        } catch (e) {
            console.error('AI Chat Error:', e);
            this._addAiMessage("Error: Could not connect to AI assistant. " + e.message, 'bot error');
        } finally {
            loading.classList.add('hidden');
        }
    }

    _attachAiImage(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            this._pendingImage = { dataUrl: e.target.result, fileName: file.name };
            // Show preview
            const previewBox = document.getElementById('ai-image-preview');
            const previewThumb = document.getElementById('ai-preview-thumb');
            const previewName = document.getElementById('ai-preview-name');
            const uploadBtn = document.getElementById('ai-upload-btn');
            if (previewBox) {
                previewThumb.src = e.target.result;
                previewName.textContent = file.name;
                previewBox.classList.remove('hidden');
            }
            if (uploadBtn) uploadBtn.classList.add('has-image');
            // Update placeholder
            const input = document.getElementById('ai-input');
            if (input) input.placeholder = 'Describe what to do with this image...';
        };
        reader.readAsDataURL(file);
    }

    _clearAiImage() {
        this._pendingImage = null;
        const previewBox = document.getElementById('ai-image-preview');
        const uploadBtn = document.getElementById('ai-upload-btn');
        if (previewBox) previewBox.classList.add('hidden');
        if (uploadBtn) uploadBtn.classList.remove('has-image');
        const input = document.getElementById('ai-input');
        if (input) input.placeholder = 'Ask about your design...';
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _addAiMessageRaw(htmlContent, type) {
        const msgContainer = document.getElementById('ai-messages');
        const loading = document.getElementById('ai-loading');
        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-msg ${type}`;
        msgDiv.innerHTML = htmlContent;
        msgContainer.insertBefore(msgDiv, loading);
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    async _handleAIMagicStart() {
        const msgContainer = document.getElementById('ai-messages');
        const loading = document.getElementById('ai-loading');
        this._addAiMessage("Generating a starting drawing for you...", 'bot');

        // Show loading
        loading.classList.remove('hidden');
        msgContainer.scrollTop = msgContainer.scrollHeight;

        try {
            const result = await this.api.ai_generate_start(
                this.projectData.name || "New Project",
                "A basic starting drawing for a CAD project."
            );
            const data = JSON.parse(result);
            if (data.success) {
                this._addAiMessage(`Successfully generated ${data.shapes_count} shapes!`, 'bot');
                await this._loadProjectData();
                this.engine.zoomToFit();
            } else {
                this._addAiMessage(data.error || "Generation failed.", 'bot error');
            }
        } catch (e) {
            this._addAiMessage("Error: Could not generate drawing. " + e.message, 'bot error');
        } finally {
            loading.classList.add('hidden');
        }
    }

    async _refreshAiConfig() {
        try {
            const res = await this.api.get_ai_config();
            const data = JSON.parse(res);

            const geminiInput = document.getElementById('ai-api-key-input');
            const orInput = document.getElementById('ai-or-key-input');

            if (data.gemini_key) {
                geminiInput.placeholder = data.gemini_key;
            }
            if (data.openrouter_key) {
                orInput.placeholder = data.openrouter_key;
            }
        } catch (e) {
            console.error('Failed to refresh AI config:', e);
        }
    }

    _updateAiSelectionBadge() {
        if (!this._aiSelectionBadge) return;
        const ids = this._selectedShapeIds || [];
        if (ids.length > 0) {
            this._aiSelectionBadge.textContent = `\ud83c\udfaf ${ids.length} shape(s) selected \u2014 AI will use them as context`;
            this._aiSelectionBadge.style.display = 'block';
        } else {
            this._aiSelectionBadge.style.display = 'none';
        }
    }

    _addAiMessage(text, type) {
        const msgContainer = document.getElementById('ai-messages');
        const loading = document.getElementById('ai-loading');
        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-msg ${type}`;

        // Render markdown as HTML
        msgDiv.innerHTML = this._renderMarkdown(text);

        // Insert BEFORE the loading indicator to keep loading at the bottom
        msgContainer.insertBefore(msgDiv, loading);
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    _renderMarkdown(text) {
        if (!text) return "";

        // Ensure text is a string
        text = String(text);

        // Handle code blocks first
        let html = text.replace(/```(json|svg|html)?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

        // Render SVG generated badges
        html = html.replace(/\[SVG design generated ✓\]/g, '<span style="color:#7c3aed;font-weight:600;">✅ SVG design generated</span>');

        html = html
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italics
            .replace(/^\* (.*)/gm, '<li>$1</li>') // List items
            .replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>') // Wrap lists
            .replace(/\n/g, '<br>'); // Newlines
        return html;
    }

    // ──────────────────────── Export ────────────────────────

    async _exportSVG() {
        const shapes = this.engine.shapes;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -500 1000 1000">`;
        svg += `<rect x="-500" y="-500" width="1000" height="1000" fill="#1a1a2e"/>`;

        shapes.forEach(s => {
            const stroke = s.color || '#ffffff';
            const sw = s.lineWidth || 1;
            switch (s.type) {
                case 'line':
                    svg += `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${stroke}" stroke-width="${sw}"/>`;
                    break;
                case 'rectangle':
                    svg += `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
                    break;
                case 'circle':
                    svg += `<circle cx="${s.cx}" cy="${s.cy}" r="${s.radius}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
                    break;
                case 'ellipse':
                    svg += `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
                    break;
                case 'polyline':
                    const pts = (s.points || []).map(p => `${p[0]},${p[1]}`).join(' ');
                    const tag = s.closed ? 'polygon' : 'polyline';
                    svg += `<${tag} points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
                    break;
                case 'text':
                    svg += `<text x="${s.x}" y="${s.y}" fill="${stroke}" font-size="${s.fontSize || 14}">${s.content || ''}</text>`;
                    break;
            }
        });

        svg += `</svg>`;

        try {
            await this.api.export_svg(svg);
        } catch (e) {
            console.error('Export SVG failed:', e);
        }
    }

    async _exportDXF() {
        try {
            const result = await this.api.export_dxf();
            const data = JSON.parse(result);
            if (data.success) {
                console.log("DXF Exported successfully to:", data.path);
            }
        } catch (e) {
            console.error('Export DXF failed:', e);
        }
    }

    async _exportPNG() {
        const dataUrl = this.engine.canvas.toDataURL('image/png');
        try {
            await this.api.export_png(dataUrl);
        } catch (e) {
            console.error('Export PNG failed:', e);
        }
    }

    // ──────────────────────── Units Settings ────────────────────────

    _initUnitsSettings() {
        const modal = document.getElementById('units-settings-modal');
        if (!modal) return;

        const closeBtns = modal.querySelectorAll('.close-modal');
        const saveBtn = document.getElementById('save-units-btn');

        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => modal.classList.add('hidden'));
        });

        saveBtn.addEventListener('click', async () => {
            const settings = {
                unitType: document.getElementById('unit-type').value,
                unitPrecision: parseInt(document.getElementById('unit-precision').value),
                angleType: document.getElementById('angle-type').value,
                anglePrecision: parseInt(document.getElementById('angle-precision').value),
                units: document.getElementById('units-scale').value
            };

            try {
                // Update local data
                this.projectData.settings = { ...this.projectData.settings, ...settings };

                // Update Units utility
                Units.updateSettings(settings);

                // Sync to backend
                await this.api.update_settings(JSON.stringify(settings));

                // Refresh 
                this._syncToEngine();
                this._syncPanels();
                modal.classList.add('hidden');
            } catch (e) {
                console.error('Failed to save units settings:', e);
            }
        });
    }

    _showUnitsModal() {
        const modal = document.getElementById('units-settings-modal');
        if (!modal || !this.projectData) return;

        const s = this.projectData.settings || {};
        document.getElementById('unit-type').value = s.unitType || 'decimal';
        document.getElementById('unit-precision').value = s.unitPrecision !== undefined ? s.unitPrecision : 2;
        document.getElementById('angle-type').value = s.angleType || 'decimalDegrees';
        document.getElementById('angle-precision').value = s.anglePrecision !== undefined ? s.anglePrecision : 0;
        document.getElementById('units-scale').value = s.units || 'millimeters';

        modal.classList.remove('hidden');
    }

    async _handleImportHTML() {
        const html = prompt("Paste your HTML tag or SVG code here:");
        if (!html) return;

        try {
            // Import at current mouse world position
            const mouse = this.engine._lastMouse || { x: 0, y: 0 };
            const world = this.engine.screenToWorld(mouse.x, mouse.y);

            const result = await this.api.import_html_snippet(html, world.x, world.y);
            const data = JSON.parse(result);
            if (data.success) {
                console.log(`Imported ${data.shapes_count} shapes.`);
                await this._loadProjectData();
                this.engine.render();
            } else {
                alert("Import failed: " + data.error);
            }
        } catch (e) {
            console.error('HTML Import failed:', e);
            alert("Error: " + e.message);
        }
    }
}

// ──────────────────────── Bootstrap ────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const app = new IndCADApp();
    app.init().catch(err => console.error('IndCAD init failed:', err));
});
