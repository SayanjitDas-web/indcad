/**
 * IndCAD Panels
 * Layers panel and Properties panel UI management.
 */

class PanelsManager {
    constructor() {
        this.layersContainer = document.getElementById('layers-list');
        this.propsContainer = document.getElementById('properties-content');
        this.addLayerBtn = document.getElementById('add-layer-btn');
        this.blocksContainer = document.getElementById('blocks-list');

        // Callbacks
        this.onAddLayer = null;
        this.onDeleteLayer = null;
        this.onSetActiveLayer = null;
        this.onToggleVisibility = null;
        this.onToggleLock = null;
        this.onRenameLayer = null;
        this.onChangeLayerColor = null;
        this.onPropertyChanged = null;
        this.onChangeShapeLayer = null;
        this.onInsertBlock = null;
        this.onPublishToLibrary = null;
        this.onImportFromLibrary = null;
        this.onDeleteFromLibrary = null;

        this.layers = [];
        this.blocks = {}; // Project blocks
        this.libraryBlocks = []; // Array of {name, updated_at}
        this.blockTab = 'project';
        this.activeLayerId = null;
        this.selectedShapes = [];
        this.allShapes = []; // All shapes in project for counting

        this._bindEvents();
    }

    _bindEvents() {
        if (this.addLayerBtn) {
            this.addLayerBtn.addEventListener('click', () => {
                if (this.onAddLayer) this.onAddLayer();
            });
        }

        // Block tabs
        const tabBtns = document.querySelectorAll('[data-block-tab]');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.blockTab = btn.dataset.blockTab;
                tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                this._renderBlocks();
            });
        });
    }

    // ──────────────────────── Layers ────────────────────────

    updateLayers(layers, activeLayerId, allShapes) {
        this.layers = layers;
        this.activeLayerId = activeLayerId;
        if (allShapes !== undefined) this.allShapes = allShapes;
        this._renderLayers();
    }

    _renderLayers() {
        if (!this.layersContainer) return;
        this.layersContainer.innerHTML = '';

        this.layers.forEach(layer => {
            const item = document.createElement('div');
            item.className = 'layer-item' + (layer.id === this.activeLayerId ? ' active' : '');
            if (!layer.visible) item.classList.add('hidden-layer');
            if (layer.locked) item.classList.add('locked-layer');

            // Color swatch — clickable for color picker
            const colorSwatch = document.createElement('div');
            colorSwatch.className = 'layer-color';
            colorSwatch.style.backgroundColor = layer.color;
            colorSwatch.title = 'Click to change color';
            colorSwatch.addEventListener('click', (e) => {
                e.stopPropagation();
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.value = layer.color || '#ffffff';
                picker.style.position = 'absolute';
                picker.style.opacity = '0';
                picker.style.width = '0';
                picker.style.height = '0';
                document.body.appendChild(picker);
                picker.addEventListener('input', () => {
                    colorSwatch.style.backgroundColor = picker.value;
                });
                picker.addEventListener('change', () => {
                    if (this.onChangeLayerColor) this.onChangeLayerColor(layer.id, picker.value);
                    picker.remove();
                });
                picker.addEventListener('blur', () => {
                    setTimeout(() => picker.remove(), 100);
                });
                picker.click();
            });

            const nameSpan = document.createElement('span');
            nameSpan.className = 'layer-name';
            nameSpan.textContent = layer.name;
            nameSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this._startRename(layer, nameSpan);
            });

            // Shape count badge
            const count = (this.allShapes || []).filter(s => s.layer === layer.id).length;
            const badge = document.createElement('span');
            badge.className = 'layer-badge';
            badge.textContent = count;
            badge.title = `${count} shape${count !== 1 ? 's' : ''}`;

            const visBtn = document.createElement('button');
            visBtn.className = 'layer-toggle' + (layer.visible ? '' : ' off');
            visBtn.textContent = layer.visible ? '👁' : '👁‍🗨';
            visBtn.title = 'Toggle Visibility';
            visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onToggleVisibility) this.onToggleVisibility(layer.id);
            });

            const lockBtn = document.createElement('button');
            lockBtn.className = 'layer-toggle' + (layer.locked ? '' : ' off');
            lockBtn.textContent = layer.locked ? '🔒' : '🔓';
            lockBtn.title = 'Toggle Lock';
            lockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onToggleLock) this.onToggleLock(layer.id);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'layer-toggle';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete Layer';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onDeleteLayer) this.onDeleteLayer(layer.id);
            });

            item.appendChild(colorSwatch);
            item.appendChild(nameSpan);
            item.appendChild(badge);
            item.appendChild(visBtn);
            item.appendChild(lockBtn);
            item.appendChild(delBtn);

            item.addEventListener('click', () => {
                if (this.onSetActiveLayer) this.onSetActiveLayer(layer.id);
            });

            this.layersContainer.appendChild(item);
        });
    }

    _startRename(layer, nameSpan) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'prop-input';
        input.value = layer.name;
        input.style.width = '100%';
        input.style.height = '20px';
        input.style.fontSize = '12px';

        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        const finish = () => {
            const newName = input.value.trim();
            if (newName && newName !== layer.name && this.onRenameLayer) {
                this.onRenameLayer(layer.id, newName);
            }
            this._renderLayers();
        };

        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finish();
            if (e.key === 'Escape') this._renderLayers();
        });
    }

    // ──────────────────────── Blocks ────────────────────────

    updateBlocks(blocks) {
        this.blocks = blocks;
        if (this.blockTab === 'project') this._renderBlocks();
    }

    updateLibraryBlocks(libraryBlocks) {
        this.libraryBlocks = libraryBlocks;
        if (this.blockTab === 'library') this._renderBlocks();
    }

    _renderBlocks() {
        if (!this.blocksContainer) return;
        this.blocksContainer.innerHTML = '';

        if (this.blockTab === 'project') {
            this._renderProjectBlocks();
        } else {
            this._renderLibraryBlocks();
        }
    }

    _renderProjectBlocks() {
        const blockNames = Object.keys(this.blocks).sort();
        if (blockNames.length === 0) {
            this.blocksContainer.innerHTML = '<div class="prop-empty">No blocks in project</div>';
            return;
        }

        blockNames.forEach(name => {
            const item = document.createElement('div');
            item.className = 'layer-item block-item';

            const icon = document.createElement('span');
            icon.textContent = '📦';
            icon.style.marginRight = '8px';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'layer-name';
            nameSpan.textContent = name;

            const actions = document.createElement('div');
            actions.className = 'layer-actions';

            const pubBtn = document.createElement('button');
            pubBtn.className = 'layer-toggle';
            pubBtn.textContent = '📤';
            pubBtn.title = 'Publish to Global Library';
            pubBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onPublishToLibrary) this.onPublishToLibrary(name);
            });

            const insBtn = document.createElement('button');
            insBtn.className = 'layer-toggle';
            insBtn.textContent = '📥';
            insBtn.title = 'Insert Block';
            insBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onInsertBlock) this.onInsertBlock(name);
            });

            actions.appendChild(pubBtn);
            actions.appendChild(insBtn);

            item.appendChild(icon);
            item.appendChild(nameSpan);
            item.appendChild(actions);

            item.addEventListener('click', () => {
                if (this.onInsertBlock) this.onInsertBlock(name);
            });

            this.blocksContainer.appendChild(item);
        });
    }

    _renderLibraryBlocks() {
        if (this.libraryBlocks.length === 0) {
            this.blocksContainer.innerHTML = '<div class="prop-empty">Global library is empty</div>';
            return;
        }

        this.libraryBlocks.forEach(block => {
            const item = document.createElement('div');
            item.className = 'layer-item block-item';

            const icon = document.createElement('span');
            icon.textContent = '🌐';
            icon.style.marginRight = '8px';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'layer-name';
            nameSpan.textContent = block.name;

            const actions = document.createElement('div');
            actions.className = 'layer-actions';

            const impBtn = document.createElement('button');
            impBtn.className = 'layer-toggle';
            impBtn.textContent = '📥';
            impBtn.title = 'Import & Insert';
            impBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onImportFromLibrary) this.onImportFromLibrary(block.name);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'layer-toggle';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete from Library';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onDeleteFromLibrary) this.onDeleteFromLibrary(block.name);
            });

            actions.appendChild(impBtn);
            actions.appendChild(delBtn);

            item.appendChild(icon);
            item.appendChild(nameSpan);
            item.appendChild(actions);

            item.addEventListener('click', () => {
                if (this.onImportFromLibrary) this.onImportFromLibrary(block.name);
            });

            this.blocksContainer.appendChild(item);
        });
    }

    // ──────────────────────── Properties ────────────────────────

    updateProperties(shapes) {
        this.selectedShapes = shapes;
        this._renderProperties();
    }

    _renderProperties() {
        const container = this.propsContainer;
        if (!container) return;

        if (this.selectedShapes.length === 0) {
            container.innerHTML = '<div class="prop-empty">No selection</div>';
            return;
        }

        if (this.selectedShapes.length > 1) {
            container.innerHTML = `<div class="prop-empty">${this.selectedShapes.length} objects selected</div>`;
            return;
        }

        const shape = this.selectedShapes[0];
        container.innerHTML = '';

        // Type header
        const typeGroup = this._createGroup('Shape');
        typeGroup.innerHTML += `<div class="prop-row"><span class="prop-label">Type</span><span class="prop-input" style="background:transparent;border:none;color:var(--text-accent)">${shape.type.toUpperCase()}</span></div>`;
        container.appendChild(typeGroup);

        // Geometry
        const geoGroup = this._createGroup('Geometry');
        const fields = this._getGeometryFields(shape);
        fields.forEach(f => {
            geoGroup.appendChild(this._createPropRow(f.label, f.value, f.key, shape.id, f.type || 'number'));
        });
        container.appendChild(geoGroup);

        // Style
        const styleGroup = this._createGroup('Style');

        // Color
        const colorRow = document.createElement('div');
        colorRow.className = 'prop-row';
        colorRow.innerHTML = `<span class="prop-label">Col</span>`;
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'prop-input';
        colorInput.value = shape.color || '#ffffff';
        colorInput.addEventListener('change', () => {
            if (this.onPropertyChanged) this.onPropertyChanged(shape.id, { color: colorInput.value });
        });
        colorRow.appendChild(colorInput);
        styleGroup.appendChild(colorRow);

        // Line Width
        styleGroup.appendChild(this._createPropRow('W', shape.lineWidth || 1, 'lineWidth', shape.id, 'number'));

        // Line Style
        const styleRow = document.createElement('div');
        styleRow.className = 'prop-row';
        styleRow.innerHTML = `<span class="prop-label">Sty</span>`;
        const styleSelect = document.createElement('select');
        styleSelect.className = 'prop-select';
        ['solid', 'dashed', 'dotted', 'dashdot'].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            if ((shape.lineStyle || 'solid') === s) opt.selected = true;
            styleSelect.appendChild(opt);
        });
        styleSelect.addEventListener('change', () => {
            if (this.onPropertyChanged) this.onPropertyChanged(shape.id, { lineStyle: styleSelect.value });
        });
        styleRow.appendChild(styleSelect);
        styleGroup.appendChild(styleRow);

        container.appendChild(styleGroup);

        // Layer assignment
        if (this.layers && this.layers.length > 0) {
            const layerGroup = this._createGroup('Layer');
            const layerRow = document.createElement('div');
            layerRow.className = 'prop-row';
            layerRow.innerHTML = `<span class="prop-label">Layer</span>`;
            const layerSelect = document.createElement('select');
            layerSelect.className = 'prop-select';
            this.layers.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = l.name;
                if (shape.layer === l.id) opt.selected = true;
                layerSelect.appendChild(opt);
            });
            layerSelect.addEventListener('change', () => {
                if (this.onChangeShapeLayer) this.onChangeShapeLayer(shape.id, layerSelect.value);
            });
            layerRow.appendChild(layerSelect);
            layerGroup.appendChild(layerRow);
            container.appendChild(layerGroup);
        }
    }

    _createGroup(title) {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const titleEl = document.createElement('div');
        titleEl.className = 'prop-group-title';
        titleEl.textContent = title;
        group.appendChild(titleEl);
        return group;
    }

    _createPropRow(label, value, key, shapeId, type = 'number') {
        const row = document.createElement('div');
        row.className = 'prop-row';

        const lbl = document.createElement('span');
        lbl.className = 'prop-label';
        lbl.textContent = label;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'prop-input';

        // Use Units for numeric formatting
        input.value = (typeof value === 'number') ? Units.formatLinear(value) : value;

        input.addEventListener('change', () => {
            let val = type === 'number' ? Units.parseLinear(input.value) : input.value;
            if (type === 'number' && isNaN(val)) return;
            if (this.onPropertyChanged) this.onPropertyChanged(shapeId, { [key]: val });
        });

        row.appendChild(lbl);
        row.appendChild(input);
        return row;
    }

    _getGeometryFields(shape) {
        switch (shape.type) {
            case 'line':
                return [
                    { label: 'X1', value: shape.x1, key: 'x1' },
                    { label: 'Y1', value: shape.y1, key: 'y1' },
                    { label: 'X2', value: shape.x2, key: 'x2' },
                    { label: 'Y2', value: shape.y2, key: 'y2' },
                ];
            case 'rectangle':
                return [
                    { label: 'X', value: shape.x, key: 'x' },
                    { label: 'Y', value: shape.y, key: 'y' },
                    { label: 'W', value: shape.width, key: 'width' },
                    { label: 'H', value: shape.height, key: 'height' },
                ];
            case 'circle':
                return [
                    { label: 'CX', value: shape.cx, key: 'cx' },
                    { label: 'CY', value: shape.cy, key: 'cy' },
                    { label: 'R', value: shape.radius, key: 'radius' },
                ];
            case 'arc':
                return [
                    { label: 'CX', value: shape.cx, key: 'cx' },
                    { label: 'CY', value: shape.cy, key: 'cy' },
                    { label: 'R', value: shape.radius, key: 'radius' },
                    { label: 'SA', value: shape.startAngle, key: 'startAngle' },
                    { label: 'EA', value: shape.endAngle, key: 'endAngle' },
                ];
            case 'ellipse':
                return [
                    { label: 'CX', value: shape.cx, key: 'cx' },
                    { label: 'CY', value: shape.cy, key: 'cy' },
                    { label: 'RX', value: shape.rx, key: 'rx' },
                    { label: 'RY', value: shape.ry, key: 'ry' },
                ];
            case 'text':
                return [
                    { label: 'X', value: shape.x, key: 'x' },
                    { label: 'Y', value: shape.y, key: 'y' },
                    { label: 'Txt', value: shape.content || '', key: 'content' },
                    { label: 'Sz', value: shape.fontSize || 14, key: 'fontSize' },
                ];
            case 'dimension':
                return [
                    { label: 'X1', value: shape.x1, key: 'x1' },
                    { label: 'Y1', value: shape.y1, key: 'y1' },
                    { label: 'X2', value: shape.x2, key: 'x2' },
                    { label: 'Y2', value: shape.y2, key: 'y2' },
                ];
            case 'block_reference':
                return [
                    { label: 'Block', value: shape.blockName, key: 'blockName', type: 'text' },
                    { label: 'X', value: shape.x, key: 'x' },
                    { label: 'Y', value: shape.y, key: 'y' },
                    { label: 'Scale', value: shape.scale || 1.0, key: 'scale' },
                    { label: 'Rotation', value: shape.rotation || 0.0, key: 'rotation' },
                ];
            default:
                return [];
        }
    }
}

window.PanelsManager = PanelsManager;
