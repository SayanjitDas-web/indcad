/**
 * IndCAD Panels
 * Layers panel and Properties panel UI management.
 */

class PanelsManager {
    constructor() {
        this.layersContainer = document.getElementById('layers-list');
        this.propsContainer = document.getElementById('properties-content');
        this.addLayerBtn = document.getElementById('add-layer-btn');

        // Callbacks
        this.onAddLayer = null;
        this.onDeleteLayer = null;
        this.onSetActiveLayer = null;
        this.onToggleVisibility = null;
        this.onToggleLock = null;
        this.onRenameLayer = null;
        this.onPropertyChanged = null;

        this.layers = [];
        this.activeLayerId = null;
        this.selectedShapes = [];

        this._bindEvents();
    }

    _bindEvents() {
        this.addLayerBtn.addEventListener('click', () => {
            if (this.onAddLayer) this.onAddLayer();
        });
    }

    // ──────────────────────── Layers ────────────────────────

    updateLayers(layers, activeLayerId) {
        this.layers = layers;
        this.activeLayerId = activeLayerId;
        this._renderLayers();
    }

    _renderLayers() {
        this.layersContainer.innerHTML = '';

        this.layers.forEach(layer => {
            const item = document.createElement('div');
            item.className = 'layer-item' + (layer.id === this.activeLayerId ? ' active' : '');

            const colorSwatch = document.createElement('div');
            colorSwatch.className = 'layer-color';
            colorSwatch.style.backgroundColor = layer.color;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'layer-name';
            nameSpan.textContent = layer.name;
            nameSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this._startRename(layer, nameSpan);
            });

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

    // ──────────────────────── Properties ────────────────────────

    updateProperties(shapes) {
        this.selectedShapes = shapes;
        this._renderProperties();
    }

    _renderProperties() {
        const container = this.propsContainer;

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
            geoGroup.appendChild(this._createPropRow(f.label, f.value, f.key, shape.id));
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
        input.value = typeof value === 'number' ? value.toFixed(2) : value;

        input.addEventListener('change', () => {
            let val = type === 'number' ? parseFloat(input.value) : input.value;
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
            default:
                return [];
        }
    }
}
