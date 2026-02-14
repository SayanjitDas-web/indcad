
// ═══════════════════════════════════════════════════
// BaseTool
// ═══════════════════════════════════════════════════

class BaseTool {
    constructor(manager) {
        this.manager = manager;
        this.engine = manager.engine;
    }

    activate() { }
    deactivate() {
        this.engine.preview = null;
        this.engine.snapBasePoint = null;
        this.engine.render();
    }

    onMouseDown(world, screen, e) { }
    onMouseMove(world, screen, e) { }
    onMouseUp(world, screen, e) { }
    onDoubleClick(world, screen, e) { }
    onKeyDown(key, e) { }
}

// ═══════════════════════════════════════════════════
// Standard Tools
// ═══════════════════════════════════════════════════

class SelectTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.isDragging = false;
        this.startPos = null;
        this.mode = 'click';
    }

    activate() {
        this.engine.canvas.style.cursor = 'default';
        this._updateSelection();
    }

    onMouseDown(world, screen, e) {
        const hit = this.engine.hitTest(world);
        this.startPos = world;

        if (hit) {
            if (e.ctrlKey) {
                if (this.engine.selectedIds.has(hit.id)) {
                    this.engine.selectedIds.delete(hit.id);
                } else {
                    this.engine.selectedIds.add(hit.id);
                }
            } else {
                if (!this.engine.selectedIds.has(hit.id)) {
                    this.engine.selectedIds.clear();
                    this.engine.selectedIds.add(hit.id);
                }
            }
            this.mode = 'click';
        } else {
            if (!e.ctrlKey) this.engine.selectedIds.clear();
            this.mode = 'box';
        }
        this.isDragging = true;
        this._updateSelection();
    }

    onMouseMove(world, screen, e) {
        if (this.isDragging && this.mode === 'box') {
            this.engine.setSelectionBox({ x1: this.startPos.x, y1: this.startPos.y, x2: world.x, y2: world.y });
            this.engine.render();
        } else {
            const hit = this.engine.hitTest(world);
            this.engine.hoveredId = hit ? hit.id : null;
            this.engine.canvas.style.cursor = hit ? 'move' : 'default';
            this.engine.render();
        }
    }

    onMouseUp(world, screen, e) {
        this.isDragging = false;
        if (this.mode === 'box') {
            const box = this.engine._selectionBox;
            if (box) {
                const crossing = box.x2 < box.x1;
                const shapes = this.engine.getShapesInBox(box.x1, box.y1, box.x2, box.y2, crossing);
                shapes.forEach(s => this.engine.selectedIds.add(s.id));
                this.engine.clearSelectionBox();
            }
        }
        this._updateSelection();
        this.engine.render();
    }

    onKeyDown(key) {
        if (key === 'Escape') {
            this.engine.selectedIds.clear();
            this._updateSelection();
            this.engine.render();
        }
    }

    _updateSelection() {
        if (this.manager.onSelectionChanged) {
            this.manager.onSelectionChanged(Array.from(this.engine.selectedIds));
        }
    }
}

class LineTool extends BaseTool {
    constructor(manager) { super(manager); this.p1 = null; }
    activate() { this.engine.canvas.style.cursor = 'crosshair'; this.engine.snapBasePoint = null; }
    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        if (!this.p1) {
            this.p1 = snapped;
            this.engine.snapBasePoint = snapped;
        } else {
            const shape = { type: 'line', x1: this.p1.x, y1: this.p1.y, x2: snapped.x, y2: snapped.y };
            if (this.manager.onShapeCreated) this.manager.onShapeCreated(shape);
            this.p1 = null; this.engine.preview = null; this.engine.snapBasePoint = null;
        }
    }
    onMouseMove(world) {
        if (this.p1) {
            const snapped = this.manager.applySnap(world, this.p1);
            this.engine.preview = { type: 'line', x1: this.p1.x, y1: this.p1.y, x2: snapped.x, y2: snapped.y, color: '#aaa' };
            this.engine.render();
        } else {
            this.manager.applySnap(world);
        }
    }
    onKeyDown(key) { if (key === 'Escape') { this.p1 = null; this.engine.preview = null; this.engine.snapBasePoint = null; this.engine.render(); } }
}

class RectangleTool extends BaseTool {
    constructor(manager) { super(manager); this.p1 = null; }
    activate() { this.engine.canvas.style.cursor = 'crosshair'; }
    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        if (!this.p1) { this.p1 = snapped; } else {
            const x = Math.min(this.p1.x, snapped.x);
            const y = Math.min(this.p1.y, snapped.y);
            const w = Math.abs(snapped.x - this.p1.x);
            const h = Math.abs(snapped.y - this.p1.y);
            const shape = { type: 'rectangle', x, y, width: w, height: h };
            if (this.manager.onShapeCreated) this.manager.onShapeCreated(shape);
            this.p1 = null; this.engine.preview = null;
        }
    }
    onMouseMove(world) {
        if (this.p1) {
            const snapped = this.manager.applySnap(world, this.p1);
            const x = Math.min(this.p1.x, snapped.x);
            const y = Math.min(this.p1.y, snapped.y);
            this.engine.preview = { type: 'rectangle', x, y, width: Math.abs(snapped.x - this.p1.x), height: Math.abs(snapped.y - this.p1.y), color: '#aaa' };
            this.engine.render();
        } else {
            this.manager.applySnap(world);
        }
    }
    onKeyDown(key) { if (key === 'Escape') { this.p1 = null; this.engine.preview = null; this.engine.render(); } }
}

class CircleTool extends BaseTool {
    constructor(manager) { super(manager); this.center = null; }
    activate() { this.engine.canvas.style.cursor = 'crosshair'; this.engine.snapBasePoint = null; }
    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        if (!this.center) {
            this.center = snapped;
            this.engine.snapBasePoint = snapped;
        } else {
            const r = Math.sqrt(Math.pow(snapped.x - this.center.x, 2) + Math.pow(snapped.y - this.center.y, 2));
            const shape = { type: 'circle', cx: this.center.x, cy: this.center.y, radius: r };
            if (this.manager.onShapeCreated) this.manager.onShapeCreated(shape);
            this.center = null; this.engine.preview = null; this.engine.snapBasePoint = null;
        }
    }
    onMouseMove(world) {
        if (this.center) {
            const snapped = this.manager.applySnap(world, this.center);
            const r = Math.sqrt(Math.pow(snapped.x - this.center.x, 2) + Math.pow(snapped.y - this.center.y, 2));
            this.engine.preview = { type: 'circle', cx: this.center.x, cy: this.center.y, radius: r, color: '#aaa' };
            this.engine.render();
        } else {
            this.manager.applySnap(world);
        }
    }
    onKeyDown(key) { if (key === 'Escape') { this.center = null; this.engine.preview = null; this.engine.snapBasePoint = null; this.engine.render(); } }
}

class PolylineTool extends BaseTool {
    constructor(manager) { super(manager); this.points = []; }
    activate() { this.engine.canvas.style.cursor = 'crosshair'; this.points = []; this.engine.snapBasePoint = null; }
    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        this.points.push([snapped.x, snapped.y]);
        this.engine.snapBasePoint = snapped;
        // Double click finishes, handled by ToolManager calling onDoubleClick
    }
    onMouseMove(world) {
        if (this.points.length > 0) {
            const lastPt = this.points[this.points.length - 1];
            const lastPtObj = { x: lastPt[0], y: lastPt[1] };
            const snapped = this.manager.applySnap(world, lastPtObj);

            const previewPoints = [...this.points, [snapped.x, snapped.y]];
            this.engine.preview = { type: 'polyline', points: previewPoints, color: '#aaa', closed: false };
            this.engine.render();
        } else {
            this.manager.applySnap(world);
        }
    }
    onDoubleClick(world) {
        if (this.points.length >= 2) {
            const shape = { type: 'polyline', points: this.points, closed: false };
            if (this.manager.onShapeCreated) this.manager.onShapeCreated(shape);
        }
        this.points = []; this.engine.preview = null; this.engine.snapBasePoint = null;
    }
    onKeyDown(key) {
        if (key === 'Enter') {
            if (this.points.length >= 2) {
                const shape = { type: 'polyline', points: this.points, closed: false };
                if (this.manager.onShapeCreated) this.manager.onShapeCreated(shape);
            }
            this.points = []; this.engine.preview = null; this.engine.snapBasePoint = null; this.engine.render();
        }
        if (key === 'Escape') { this.points = []; this.engine.preview = null; this.engine.snapBasePoint = null; this.engine.render(); }
    }
}

class TextTool extends BaseTool {
    activate() { this.engine.canvas.style.cursor = 'text'; }
    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        const text = prompt('Enter text:');
        if (text) {
            const shape = { type: 'text', x: snapped.x, y: snapped.y, content: text, fontSize: 14, color: '#ffffff' };
            if (this.manager.onShapeCreated) this.manager.onShapeCreated(shape);
        }
    }
}

class EraseTool extends BaseTool {
    activate() { this.engine.canvas.style.cursor = 'pointer'; }
    onMouseDown(world) {
        const hit = this.engine.hitTest(world);
        if (hit) {
            if (this.manager.onShapeDeleted) this.manager.onShapeDeleted(hit.id);
        }
    }
    onMouseMove(world) {
        const hit = this.engine.hitTest(world);
        this.engine.hoveredId = hit ? hit.id : null;
        this.engine.render();
    }
}

// ═══════════════════════════════════════════════════
// Placeholder Tools
// ═══════════════════════════════════════════════════
class ArcTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.center = null;
        this.startPoint = null;
        this.radius = 0;
    }

    activate() {
        this.engine.canvas.style.cursor = 'crosshair';
        this.center = null;
        this.startPoint = null;
        document.getElementById('status-tool').textContent = '◠ Arc: Click center point';
    }

    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        if (!this.center) {
            this.center = snapped;
            document.getElementById('status-tool').textContent = '◠ Arc: Click start point';
        } else if (!this.startPoint) {
            this.startPoint = snapped;
            this.engine.snapBasePoint = snapped;
            this.radius = Math.sqrt((snapped.x - this.center.x) ** 2 + (snapped.y - this.center.y) ** 2);
            document.getElementById('status-tool').textContent = '◠ Arc: Click end point';
        } else {
            const startAngle = Math.atan2(this.startPoint.y - this.center.y, this.startPoint.x - this.center.x) * 180 / Math.PI;
            const endAngle = Math.atan2(snapped.y - this.center.y, snapped.x - this.center.x) * 180 / Math.PI;
            const shape = {
                type: 'arc',
                cx: this.center.x, cy: this.center.y,
                radius: this.radius,
                startAngle: startAngle < 0 ? startAngle + 360 : startAngle,
                endAngle: endAngle < 0 ? endAngle + 360 : endAngle
            };
            if (this.manager.onShapeCreated) this.manager.onShapeCreated(shape);
            this.activate(); // reset
        }
    }

    onMouseMove(world) {
        if (!this.center) return;
        const snapped = this.manager.applySnap(world);
        if (!this.startPoint) {
            const r = Math.sqrt((snapped.x - this.center.x) ** 2 + (snapped.y - this.center.y) ** 2);
            this.engine.preview = { type: 'circle', cx: this.center.x, cy: this.center.y, radius: r, color: '#aaa', lineStyle: 'dashed' };
        } else {
            const startAngle = Math.atan2(this.startPoint.y - this.center.y, this.startPoint.x - this.center.x) * 180 / Math.PI;
            const endAngle = Math.atan2(snapped.y - this.center.y, snapped.x - this.center.x) * 180 / Math.PI;
            this.engine.preview = {
                type: 'arc',
                cx: this.center.x, cy: this.center.y,
                radius: this.radius,
                startAngle: startAngle < 0 ? startAngle + 360 : startAngle,
                endAngle: endAngle < 0 ? endAngle + 360 : endAngle,
                color: '#aaa'
            };
        }
        this.engine.render();
    }

    onKeyDown(key) { if (key === 'Escape') this.activate(); }
}

class EllipseTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.center = null;
        this.rx = 0;
    }

    activate() {
        this.engine.canvas.style.cursor = 'crosshair';
        this.center = null;
        document.getElementById('status-tool').textContent = '⬮ Ellipse: Click center point';
    }

    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        if (!this.center) {
            this.center = snapped;
            document.getElementById('status-tool').textContent = '⬮ Ellipse: Click major axis point';
        } else if (this.rx === 0) {
            this.rx = Math.abs(snapped.x - this.center.x) || 1;
            document.getElementById('status-tool').textContent = '⬮ Ellipse: Click minor axis point';
        } else {
            const ry = Math.abs(snapped.y - this.center.y) || 1;
            const shape = { type: 'ellipse', cx: this.center.x, cy: this.center.y, rx: this.rx, ry: ry };
            if (this.manager.onShapeCreated) this.manager.onShapeCreated(shape);
            this.rx = 0;
            this.activate();
        }
    }

    onMouseMove(world) {
        if (!this.center) return;
        const snapped = this.manager.applySnap(world);
        if (this.rx === 0) {
            this.engine.preview = { type: 'line', x1: this.center.x, y1: this.center.y, x2: snapped.x, y2: snapped.y, color: '#aaa', lineStyle: 'dashed' };
        } else {
            this.engine.preview = { type: 'ellipse', cx: this.center.x, cy: this.center.y, rx: this.rx, ry: Math.abs(snapped.y - this.center.y), color: '#aaa' };
        }
        this.engine.render();
    }

    onKeyDown(key) { if (key === 'Escape') this.activate(); }
}

class DimensionTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.p1 = null;
        this.p2 = null;
    }

    activate() {
        this.engine.canvas.style.cursor = 'crosshair';
        this.p1 = null;
        this.p2 = null;
        document.getElementById('status-tool').textContent = '↔️ Dimension: Click first point';
    }

    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        if (!this.p1) {
            this.p1 = snapped;
            document.getElementById('status-tool').textContent = '↔️ Dimension: Click second point';
        } else if (!this.p2) {
            this.p2 = snapped;
            document.getElementById('status-tool').textContent = '↔️ Dimension: Click to set offset';
        } else {
            // Offset is perpendicular distance from line p1-p2
            const dx = this.p2.x - this.p1.x, dy = this.p2.y - this.p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const offset = ((world.x - this.p1.x) * (-dy) + (world.y - this.p1.y) * dx) / len;
            const shape = { type: 'dimension', x1: this.p1.x, y1: this.p1.y, x2: this.p2.x, y2: this.p2.y, offset: offset || 20 };
            if (this.manager.onShapeCreated) this.manager.onShapeCreated(shape);
            this.activate();
        }
    }

    onMouseMove(world) {
        if (!this.p1) return;
        const snapped = this.manager.applySnap(world);
        if (!this.p2) {
            this.engine.preview = { type: 'line', x1: this.p1.x, y1: this.p1.y, x2: snapped.x, y2: snapped.y, color: '#aaa', lineStyle: 'dashed' };
        } else {
            const dx = this.p2.x - this.p1.x, dy = this.p2.y - this.p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const offset = ((world.x - this.p1.x) * (-dy) + (world.y - this.p1.y) * dx) / len;
            this.engine.preview = { type: 'dimension', x1: this.p1.x, y1: this.p1.y, x2: this.p2.x, y2: this.p2.y, offset: offset || 20, color: '#aaa' };
        }
        this.engine.render();
    }

    onKeyDown(key) { if (key === 'Escape') this.activate(); }
}

class MeasureTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.p1 = null;
    }

    activate() {
        this.engine.canvas.style.cursor = 'crosshair';
        this.p1 = null;
        this.engine.measureLine = null;
        document.getElementById('status-tool').textContent = '📐 Measure: Click start point';
    }

    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        if (!this.p1) {
            this.p1 = snapped;
            document.getElementById('status-tool').textContent = '📐 Measure: Click end point';
        } else {
            const dist = Math.sqrt((snapped.x - this.p1.x) ** 2 + (snapped.y - this.p1.y) ** 2);
            // Result is shown on canvas via engine.measureLine
            this.engine.measureLine = { x1: this.p1.x, y1: this.p1.y, x2: snapped.x, y2: snapped.y };
            this.p1 = null; // allow measuring again
            document.getElementById('status-tool').textContent = `📐 Distance: ${dist.toFixed(2)}. Click start for next measurement.`;
        }
    }

    onMouseMove(world) {
        if (this.p1) {
            const snapped = this.manager.applySnap(world);
            this.engine.measureLine = { x1: this.p1.x, y1: this.p1.y, x2: snapped.x, y2: snapped.y };
            this.engine.render();
        }
    }

    onKeyDown(key) { if (key === 'Escape') this.activate(); }
}

// ═══════════════════════════════════════════════════
// TrimTool
// ═══════════════════════════════════════════════════

class TrimTool extends BaseTool {
    activate() {
        this.engine.canvas.style.cursor = 'crosshair';
        document.getElementById('status-tool').textContent = '✂️ Trim: Select shape to trim, then click segment to remove';
    }
    onMouseMove(world) {
        const hit = this.engine.hitTest(world);
        this.engine.hoveredId = hit ? hit.id : null;
        this.engine.render();
    }
    async onMouseDown(world) {
        const hit = this.engine.hitTest(world);
        if (hit) {
            try {
                await this.manager.engine.api.trim_shape(hit.id, world.x, world.y);
                if (this.manager.onProjectUpdated) this.manager.onProjectUpdated();
            } catch (e) { console.error(e); }
        }
    }
}

// ═══════════════════════════════════════════════════
// OffsetTool
// ═══════════════════════════════════════════════════

class OffsetTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this._selectedId = null;
        this._distance = 10;
    }
    activate() {
        this._selectedId = null;
        this.engine.canvas.style.cursor = 'default';
        document.getElementById('status-tool').textContent = '🛤️ Offset: Select shape, then enter offset distance';
        const d = prompt('Enter offset distance:', this._distance);
        if (d) this._distance = parseFloat(d);
    }
    deactivate() {
        super.deactivate();
        this._selectedId = null;
    }
    onMouseMove(world) {
        if (!this._selectedId) {
            const hit = this.engine.hitTest(world);
            this.engine.hoveredId = hit ? hit.id : null;
            this.engine.canvas.style.cursor = hit ? 'pointer' : 'default';
            this.engine.render();
        } else {
            this.engine.canvas.style.cursor = 'crosshair';
        }
    }
    async onMouseDown(world) {
        if (!this._selectedId) {
            const hit = this.engine.hitTest(world);
            if (hit) {
                this._selectedId = hit.id;
                this.engine.selectedIds = new Set([hit.id]);
                if (this.manager.onSelectionChanged) this.manager.onSelectionChanged([hit.id]);
                this.engine.render();
            }
        } else {
            try {
                await this.manager.engine.api.offset_shape(this._selectedId, this._distance, world.x, world.y);
                if (this.manager.onProjectUpdated) this.manager.onProjectUpdated();
                this._selectedId = null;
                this.engine.selectedIds.clear();
            } catch (e) { console.error(e); }
        }
    }
    onKeyDown(key) {
        if (key === 'Escape') {
            this._selectedId = null;
            this.engine.selectedIds.clear();
            this.engine.render();
        }
    }
}

// ═══════════════════════════════════════════════════
// CopyTool
// ═══════════════════════════════════════════════════

class CopyTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this._basePoint = null;
    }
    activate() {
        this._basePoint = null;
        if (this.engine.selectedIds.size === 0) {
            alert('Select shapes to copy first!');
            this.manager.setTool('select');
            return;
        }
        this.engine.canvas.style.cursor = 'crosshair';
        document.getElementById('status-tool').textContent = '📄 Copy: Click base point, then destination';
    }
    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        if (!this._basePoint) {
            this._basePoint = { ...snapped };
        } else {
            const dx = snapped.x - this._basePoint.x;
            const dy = snapped.y - this._basePoint.y;
            this._copy(dx, dy);
        }
    }
    onMouseMove(world) {
        if (this._basePoint) {
            const snapped = this.manager.applySnap(world);
            this.engine.preview = {
                type: 'line',
                x1: this._basePoint.x, y1: this._basePoint.y,
                x2: snapped.x, y2: snapped.y,
                color: '#888', lineStyle: 'dashed'
            };
            this.engine.render();
        }
    }
    async _copy(dx, dy) {
        try {
            const ids = Array.from(this.engine.selectedIds);
            await this.manager.engine.api.copy_shapes(JSON.stringify(ids), dx, dy);
            if (this.manager.onProjectUpdated) this.manager.onProjectUpdated();
            this.manager.setTool('select');
        } catch (e) {
            console.error(e);
        }
    }
    onKeyDown(key) {
        if (key === 'Escape') {
            this._basePoint = null;
            this.manager.setTool('select');
        }
    }
}

// ═══════════════════════════════════════════════════
// ToolManager
// ═══════════════════════════════════════════════════

class ToolManager {
    constructor(engine) {
        this.engine = engine;
        this.currentTool = null;
        this.gridSnap = true;
        this.snapEnabled = true;
        this.orthoMode = false;
        this.snapSettings = {
            endpoint: true,
            midpoint: true,
            center: true,
            intersection: true,
            perpendicular: true,
            nearest: true,
            tangent: true,
            quadrant: true,
            grid: true,
            extension: true
        };

        // Callbacks
        this.onToolChanged = null;
        this.onShapeCreated = null;
        this.onShapeDeleted = null;
        this.onShapeMoved = null;
        this.onProjectUpdated = null;
        this.onSelectionChanged = null;

        this._initTools();
        this.setTool('select');
    }

    _initTools() {
        this.tools = {
            select: new SelectTool(this),
            line: new LineTool(this),
            rectangle: new RectangleTool(this),
            circle: new CircleTool(this),
            arc: new ArcTool(this),
            ellipse: new EllipseTool(this),
            polyline: new PolylineTool(this),
            text: new TextTool(this),
            dimension: new DimensionTool(this),
            measure: new MeasureTool(this),
            trim: new TrimTool(this),
            offset: new OffsetTool(this),
            copy: new CopyTool(this),
            erase: new EraseTool(this),
        };
    }

    setTool(name) {
        if (this.currentTool) this.currentTool.deactivate();
        this.currentTool = this.tools[name] || this.tools['select'];
        this.currentTool.activate();
        if (this.onToolChanged) this.onToolChanged(name);
    }

    onMouseDown(world, screen, e) {
        if (this.currentTool) this.currentTool.onMouseDown(world, screen, e);
    }

    onMouseMove(world, screen, e) {
        if (this.currentTool) this.currentTool.onMouseMove(world, screen, e);
    }

    onMouseUp(world, screen, e) {
        if (this.currentTool) this.currentTool.onMouseUp(world, screen, e);
    }

    onDoubleClick(world, screen, e) {
        if (this.currentTool && this.currentTool.onDoubleClick) {
            this.currentTool.onDoubleClick(world, screen, e);
        }
    }

    onKeyDown(key, e) {
        if (this.currentTool && this.currentTool.onKeyDown) {
            this.currentTool.onKeyDown(key, e);
        }
    }

    applySnap(world, basePoint = null) {
        if (!this.snapEnabled) return world;

        if (basePoint) this.engine.snapBasePoint = basePoint;

        // Priority 1: Object Snap (Endpoints, Midpoints, etc.)
        if (this.engine.snapPoint) {
            return { x: this.engine.snapPoint.point[0], y: this.engine.snapPoint.point[1] };
        }

        // Priority 2: Grid Snap
        let x = world.x;
        let y = world.y;
        if (this.gridSnap && this.engine.gridSize) {
            const gs = this.engine.gridSize;
            x = Math.round(x / gs) * gs;
            y = Math.round(y / gs) * gs;
        }
        return { x, y };
    }
}
