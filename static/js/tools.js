
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
    onKeyDown(key, e) { return false; }
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
            // Don't allow selecting shapes on locked layers
            if (this.engine.isShapeLocked(hit)) {
                if (!e.ctrlKey) this.engine.selectedIds.clear();
                this.mode = 'box';
                this.isDragging = true;
                this._updateSelection();
                return;
            }

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
            if (hit && this.engine.isShapeLocked(hit)) {
                this.engine.canvas.style.cursor = 'not-allowed';
            } else {
                this.engine.canvas.style.cursor = hit ? 'move' : 'default';
            }
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
// ScaleTool (AutoCAD Style)
// ═══════════════════════════════════════════════════

class ScaleTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this._state = 'pick_base'; // pick_base, pick_factor/ref_1, ref_2, ref_new
        this._basePoint = null;
        this._refPoint1 = null;
        this._refPoint2 = null;
        this._ids = [];
        this._baseShapes = []; // Original shapes for preview
        this._scaleFactor = 1.0;
        this._mode = 'normal'; // normal, reference
        this._isCopy = false;
    }

    activate() {
        this._ids = [...this.engine.selectedIds];
        if (this._ids.length === 0) {
            alert('Select objects first!');
            this.manager.setTool('select');
            return;
        }
        // Cache base shapes for fast preview
        this._baseShapes = this.engine.shapes.filter(s => this._ids.includes(s.id));
        this._reset();
        this.engine.canvas.style.cursor = 'crosshair';
        document.getElementById('status-tool').textContent = '📏 Scale: Specify base point';
    }

    _reset() {
        this._state = 'pick_base';
        this._basePoint = null;
        this._refPoint1 = null;
        this._refPoint2 = null;
        this._mode = 'normal';
        this.engine.preview = null;
    }

    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);

        if (this._state === 'pick_base') {
            this._basePoint = snapped;
            this._state = 'pick_factor';
            document.getElementById('status-tool').textContent = '📏 Scale: Specify scale factor or [R] for Reference';
        }
        else if (this._state === 'pick_factor') {
            // Interactive scale finish
            this._finishScale(this._scaleFactor);
        }
        else if (this._state === 'ref_1') {
            this._refPoint1 = snapped;
            this._state = 'ref_2';
            document.getElementById('status-tool').textContent = '📏 Scale: Specify second reference point';
        }
        else if (this._state === 'ref_2') {
            this._refPoint2 = snapped;
            this._state = 'ref_new';
            document.getElementById('status-tool').textContent = '📏 Scale: Specify new length';
        }
        else if (this._state === 'ref_new') {
            const refDist = this._dist(this._refPoint1, this._refPoint2);
            const newDist = this._dist(this._basePoint, snapped);
            if (refDist > 0) {
                this._finishScale(newDist / refDist);
            }
        }
    }

    onMouseMove(world) {
        const snapped = this.manager.applySnap(world);

        if (this._state === 'pick_base') {
            this.manager.applySnap(world); // visualization ONLY
        }
        else if (this._state === 'pick_factor' && this._mode === 'normal') {
            const dLine = this._dist(this._basePoint, snapped);

            // Power Scale Logic:
            // Reference distance is relative to zoom. 100px on screen = 1.0 factor
            const refDist = 100 / this.engine.zoom;
            this._scaleFactor = dLine / refDist || 1.0;

            if (this._scaleFactor < 0.001) this._scaleFactor = 0.001;

            // Generate Preview
            const previewShapes = this._baseShapes.map(s => {
                const scaled = this.engine._getScaledShape(s, this._basePoint, this._scaleFactor);
                scaled.color = this._isCopy ? '#00ff00' : '#ffff00';
                scaled.lineStyle = 'dashed';
                return scaled;
            });

            // Add rubber-band line
            previewShapes.push({
                type: 'line',
                x1: this._basePoint.x, y1: this._basePoint.y,
                x2: snapped.x, y2: snapped.y,
                color: '#888', lineStyle: 'dashed'
            });

            this.engine.preview = previewShapes;

            const copyHint = this._isCopy ? '[COPY MODE]' : '';
            document.getElementById('status-tool').textContent =
                `📏 Scale: factor ${this._scaleFactor.toFixed(3)} ${copyHint} [R: Ref] [C: Copy] [Enter: Input]`;
            this.engine.render();
        }
        else if (this._state === 'ref_new') {
            const refDist = this._dist(this._refPoint1, this._refPoint2);
            const newDist = this._dist(this._basePoint, snapped);
            const factor = refDist > 0 ? newDist / refDist : 1.0;

            const previewShapes = this._baseShapes.map(s => {
                const scaled = this.engine._getScaledShape(s, this._basePoint, factor);
                scaled.color = '#ffff00';
                scaled.lineStyle = 'dashed';
                return scaled;
            });

            previewShapes.push({
                type: 'line',
                x1: this._basePoint.x, y1: this._basePoint.y,
                x2: snapped.x, y2: snapped.y,
                color: '#aaa', lineStyle: 'dashed'
            });

            this.engine.preview = previewShapes;
            document.getElementById('status-tool').textContent = `📏 Scale: factor ${(factor).toFixed(3)} (Reference Mode)`;
            this.engine.render();
        }
    }

    onKeyDown(key, e) {
        if (key === 'Escape') {
            this.manager.setTool('select');
            return true;
        }
        if (key.toLowerCase() === 'r' && this._state === 'pick_factor') {
            this._mode = 'reference';
            this._state = 'ref_1';
            document.getElementById('status-tool').textContent = '📏 Scale: Specify reference length (point 1)';
            return true;
        }
        if (key.toLowerCase() === 'c' && this._state === 'pick_factor') {
            this._isCopy = !this._isCopy;
            // Update status text immediately
            this.onMouseMove(this.engine.screenToWorld(this.engine._lastMouse.x, this.engine._lastMouse.y));
            return true;
        }
        if (key === 'Enter' && this._state === 'pick_factor') {
            const factor = prompt('Enter scale factor:', this._scaleFactor.toFixed(3));
            if (factor) this._finishScale(parseFloat(factor));
            return true;
        }
        return false;
    }

    async _finishScale(factor) {
        try {
            if (this._isCopy) {
                // For copy mode: first copy then scale the new ones
                const result = await this.engine.api.copy_shapes(
                    JSON.stringify(this._ids),
                    0, 0
                );
                const data = JSON.parse(result);
                if (data.success && data.ids) {
                    await this.engine.api.scale_shapes(
                        JSON.stringify(data.ids),
                        JSON.stringify([this._basePoint.x, this._basePoint.y]),
                        factor
                    );
                }
            } else {
                await this.engine.api.scale_shapes(
                    JSON.stringify(this._ids),
                    JSON.stringify([this._basePoint.x, this._basePoint.y]),
                    factor
                );
            }
            if (this.manager.onProjectUpdated) this.manager.onProjectUpdated();
            this.engine.preview = null;
            this.manager.setTool('select');
        } catch (e) {
            console.error('Scale failed:', e);
        }
    }

    _dist(p1, p2) {
        return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    }
}

class TransformTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this._state = 'pick_base'; // pick_base, transforming
        this._mode = 'move'; // move, rotate
        this._isCopy = false;
        this._basePoint = null;
        this._ids = [];
        this._baseShapes = [];

        // Results
        this._dx = 0;
        this._dy = 0;
        this._angle = 0;
    }

    activate() {
        this._ids = [...this.engine.selectedIds];
        if (this._ids.length === 0) {
            alert('Select objects first!');
            this.manager.setTool('select');
            return;
        }
        this._baseShapes = this.engine.shapes.filter(s => this._ids.includes(s.id));
        this._reset();
        this.engine.canvas.style.cursor = 'crosshair';
        document.getElementById('status-tool').textContent = '🔧 Transform: Specify base point';
    }

    _reset() {
        this._state = 'pick_base';
        this._mode = 'move';
        this._isCopy = false;
        this._basePoint = null;
        this._dx = 0; this._dy = 0; this._angle = 0;
        this.engine.preview = null;
    }

    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);

        if (this._state === 'pick_base') {
            this._basePoint = snapped;
            this._state = 'transforming';
            this._dx = 0; this._dy = 0; this._angle = 0;
            this._updateStatus();
        } else if (this._state === 'transforming') {
            this._finish();
        }
    }

    onMouseMove(world) {
        const snapped = this.manager.applySnap(world);

        if (this._state === 'transforming') {
            if (this._mode === 'move') {
                this._dx = snapped.x - this._basePoint.x;
                this._dy = snapped.y - this._basePoint.y;

                const previewShapes = this._baseShapes.map(s => {
                    const moved = this.engine._getTranslatedShape(s, this._dx, this._dy);
                    moved.color = this._isCopy ? '#00ff00' : '#ffff00';
                    moved.lineStyle = 'dashed';
                    return moved;
                });

                previewShapes.push({
                    type: 'line', x1: this._basePoint.x, y1: this._basePoint.y,
                    x2: snapped.x, y2: snapped.y, color: '#888', lineStyle: 'dashed'
                });

                this.engine.preview = previewShapes;
            } else if (this._mode === 'rotate') {
                const angle = Math.atan2(snapped.y - this._basePoint.y, snapped.x - this._basePoint.x);
                this._angle = angle * 180 / Math.PI; // In degrees

                const previewShapes = this._baseShapes.map(s => {
                    const rotated = this.engine._getRotatedShape(s, this._basePoint, this._angle);
                    rotated.color = this._isCopy ? '#00ff00' : '#ffff00';
                    rotated.lineStyle = 'dashed';
                    return rotated;
                });

                // Rotation visualization line
                previewShapes.push({
                    type: 'line', x1: this._basePoint.x, y1: this._basePoint.y,
                    x2: snapped.x, y2: snapped.y, color: '#888', lineStyle: 'dashed'
                });

                this.engine.preview = previewShapes;
            }
            this._updateStatus();
            this.engine.render();
        }
    }

    onKeyDown(key, e) {
        if (key === 'Escape') {
            this.manager.setTool('select');
            return true;
        }

        if (this._state === 'transforming') {
            if (key.toLowerCase() === 'r') {
                this._mode = (this._mode === 'move') ? 'rotate' : 'move';
                this.onMouseMove(this.engine.screenToWorld(this.engine._lastMouse.x, this.engine._lastMouse.y));
                return true;
            }
            if (key.toLowerCase() === 'c') {
                this._isCopy = !this._isCopy;
                this.onMouseMove(this.engine.screenToWorld(this.engine._lastMouse.x, this.engine._lastMouse.y));
                return true;
            }
        }
        return false;
    }

    _updateStatus() {
        const copyHint = this._isCopy ? '[COPY]' : '';
        if (this._mode === 'move') {
            document.getElementById('status-tool').textContent =
                `🔧 Move+: DX:${this._dx.toFixed(2)} DY:${this._dy.toFixed(2)} ${copyHint} [R:Rotate] [C:Copy] [Enter:Finish]`;
        } else {
            document.getElementById('status-tool').textContent =
                `🔧 Move+: Angle:${this._angle.toFixed(1)}° ${copyHint} [R:Move] [C:Copy] [Enter:Finish]`;
        }
    }

    async _finish() {
        try {
            let targetIds = this._ids;

            if (this._isCopy) {
                const result = await this.engine.api.copy_shapes(JSON.stringify(this._ids), 0, 0);
                const data = JSON.parse(result);
                if (data.success && data.ids) {
                    targetIds = data.ids;
                } else {
                    throw new Error("Copy failed");
                }
            }

            if (this._mode === 'move') {
                await this.engine.api.translate_shapes(JSON.stringify(targetIds), this._dx, this._dy);
            } else {
                await this.engine.api.rotate_shapes(JSON.stringify(targetIds), JSON.stringify([this._basePoint.x, this._basePoint.y]), this._angle);
            }

            if (this.manager.onProjectUpdated) this.manager.onProjectUpdated();
            this._reset();
            this.manager.setTool('select');
        } catch (e) {
            console.error('Transform failed:', e);
        }
    }
}

// ═══════════════════════════════════════════════════
// Block Tools
// ═══════════════════════════════════════════════════

class BlockCreateTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.basePoint = null;
    }

    activate() {
        this.basePoint = null;
        if (this.engine.selectedIds.size === 0) {
            alert('Select shapes to include in the block first!');
            this.manager.setTool('select');
            return;
        }
        this.engine.canvas.style.cursor = 'crosshair';
        document.getElementById('status-tool').textContent = '📦 Create Block: Click base point';
    }

    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);
        if (!this.basePoint) {
            this.basePoint = snapped;
            this._showNamePrompt();
        }
    }

    async _showNamePrompt() {
        const name = prompt('Enter Block Name:');
        if (!name) {
            this.manager.setTool('select');
            return;
        }

        try {
            const ids = Array.from(this.engine.selectedIds);
            const res = await this.engine.api.create_block(
                name,
                JSON.stringify([this.basePoint.x, this.basePoint.y]),
                JSON.stringify(ids)
            );
            const data = JSON.parse(res);
            if (data.success) {
                if (this.manager.onProjectUpdated) await this.manager.onProjectUpdated();
                this.manager.setTool('select');
            } else {
                alert('Block creation failed. Name might already exist.');
                this.manager.setTool('select');
            }
        } catch (e) {
            console.error(e);
        }
    }

    onKeyDown(key) {
        if (key === 'Escape') this.manager.setTool('select');
    }
}

class BlockInsertTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.blockName = null;
    }

    async activate() {
        if (this.blockName) {
            this.engine.canvas.style.cursor = 'crosshair';
            document.getElementById('status-tool').textContent = `📦 Insert Block [${this.blockName}]: Click insertion point`;
            return;
        }

        // Get available blocks
        const res = await this.engine.api.get_blocks();
        const data = JSON.parse(res);
        const blocks = data.blocks || [];

        if (blocks.length === 0) {
            alert('No blocks defined in this project.');
            this.manager.setTool('select');
            return;
        }

        const name = prompt('Enter Block Name to Insert (' + blocks.join(', ') + '):', blocks[0]);
        if (!name || !blocks.includes(name)) {
            this.manager.setTool('select');
            return;
        }

        this.blockName = name;
        this.engine.canvas.style.cursor = 'crosshair';
        document.getElementById('status-tool').textContent = `📦 Insert Block [${name}]: Click insertion point`;
    }

    onMouseDown(world) {
        if (!this.blockName) return;
        const snapped = this.manager.applySnap(world);
        this._insert(snapped.x, snapped.y);
    }

    async _insert(x, y) {
        try {
            const res = await this.engine.api.insert_block(this.blockName, x, y);
            const data = JSON.parse(res);
            if (data.success) {
                if (this.manager.onProjectUpdated) await this.manager.onProjectUpdated();
                // Stay in tool for multiple insertions? AutoCAD usually does.
            }
        } catch (e) {
            console.error(e);
        }
    }

    onMouseMove(world) {
        if (this.blockName) {
            const snapped = this.manager.applySnap(world);
            this.engine.preview = {
                type: 'block_reference',
                blockName: this.blockName,
                x: snapped.x,
                y: snapped.y,
                scale: 1.0,
                rotation: 0.0
            };
            this.engine.render();
        }
    }

    onKeyDown(key) {
        if (key === 'Escape') this.manager.setTool('select');
    }
}

// ═══════════════════════════════════════════════════
// ArrayTool (AutoCAD-style Rectangular & Polar Array)
// ═══════════════════════════════════════════════════

class ArrayTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this._ids = [];
        this._baseShapes = [];
        this._mode = 'rectangular'; // 'rectangular' | 'polar'
        this._state = 'configure'; // 'configure' | 'pick_center' | 'preview'

        // Rectangular params
        this._rows = 3;
        this._cols = 3;
        this._rowSpacing = 50;
        this._colSpacing = 50;

        // Polar params
        this._count = 6;
        this._totalAngle = 360; // degrees
        this._rotateItems = true;
        this._center = null;
    }

    activate() {
        this._ids = [...this.engine.selectedIds];
        if (this._ids.length === 0) {
            alert('Select objects to array first!');
            this.manager.setTool('select');
            return;
        }
        this._baseShapes = this.engine.shapes.filter(s => this._ids.includes(s.id));
        this._state = 'configure';
        this._center = null;
        this.engine.canvas.style.cursor = 'crosshair';

        // Ask for mode
        this._showModePrompt();
    }

    _showModePrompt() {
        const mode = prompt(
            'Array Mode:\n' +
            '  R = Rectangular (rows & columns)\n' +
            '  P = Polar (copies around center)\n\n' +
            'Enter R or P:', 'R'
        );
        if (!mode) {
            this.manager.setTool('select');
            return;
        }

        if (mode.toUpperCase() === 'P') {
            this._mode = 'polar';
            this._configurePolar();
        } else {
            this._mode = 'rectangular';
            this._configureRectangular();
        }
    }

    // ─── Rectangular Array ─────────────────────────────
    _configureRectangular() {
        const rows = prompt('Number of Rows (vertical):', this._rows);
        if (!rows) { this.manager.setTool('select'); return; }
        this._rows = Math.max(1, parseInt(rows) || 1);

        const cols = prompt('Number of Columns (horizontal):', this._cols);
        if (!cols) { this.manager.setTool('select'); return; }
        this._cols = Math.max(1, parseInt(cols) || 1);

        const rowSpacing = prompt('Row Spacing (Y distance):', this._rowSpacing);
        if (rowSpacing === null) { this.manager.setTool('select'); return; }
        this._rowSpacing = parseFloat(rowSpacing) || 50;

        const colSpacing = prompt('Column Spacing (X distance):', this._colSpacing);
        if (colSpacing === null) { this.manager.setTool('select'); return; }
        this._colSpacing = parseFloat(colSpacing) || 50;

        // Show preview immediately
        this._state = 'preview';
        this._generateRectPreview();
        const total = this._rows * this._cols - 1;
        document.getElementById('status-tool').textContent =
            `📐 Rect Array: ${this._rows}×${this._cols} = ${total} copies | [Enter: Apply] [N: Edit] [P: Polar] [Esc: Cancel]`;
    }

    _generateRectPreview() {
        const previewShapes = [];
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                if (r === 0 && c === 0) continue; // Skip original position
                const dx = c * this._colSpacing;
                const dy = r * this._rowSpacing;
                for (const s of this._baseShapes) {
                    const moved = this.engine._getTranslatedShape(s, dx, dy);
                    moved.color = '#00ccff';
                    moved.lineStyle = 'dashed';
                    moved.opacity = 0.6;
                    previewShapes.push(moved);
                }
            }
        }
        this.engine.preview = previewShapes;
        this.engine.render();
    }

    async _applyRectangular() {
        try {
            for (let r = 0; r < this._rows; r++) {
                for (let c = 0; c < this._cols; c++) {
                    if (r === 0 && c === 0) continue; // Skip original
                    const dx = c * this._colSpacing;
                    const dy = r * this._rowSpacing;
                    // Copy at offset
                    await this.engine.api.copy_shapes(JSON.stringify(this._ids), dx, dy);
                }
            }
            if (this.manager.onProjectUpdated) this.manager.onProjectUpdated();
            this.engine.preview = null;
            this.manager.setTool('select');
        } catch (e) {
            console.error('Rectangular array failed:', e);
        }
    }

    // ─── Polar Array ───────────────────────────────────
    _configurePolar() {
        const count = prompt('Number of Items (including original):', this._count);
        if (!count) { this.manager.setTool('select'); return; }
        this._count = Math.max(2, parseInt(count) || 6);

        const angle = prompt('Total Angle (degrees, 360 = full circle):', this._totalAngle);
        if (angle === null) { this.manager.setTool('select'); return; }
        this._totalAngle = parseFloat(angle) || 360;

        const rotate = prompt('Rotate items as copied? (Y/N):', 'Y');
        this._rotateItems = !rotate || rotate.toUpperCase() !== 'N';

        // Need center point
        this._state = 'pick_center';
        document.getElementById('status-tool').textContent = '📐 Polar Array: Click center point of rotation';
    }

    _generatePolarPreview() {
        if (!this._center) return;

        const previewShapes = [];
        const angleStep = this._totalAngle / this._count;

        // Compute centroid of selection for rotation origin
        const bbox = this._getSelectionBBox();

        for (let i = 1; i < this._count; i++) {
            const angleDeg = angleStep * i;
            const angleRad = (angleDeg * Math.PI) / 180;

            for (const s of this._baseShapes) {
                // Translate to rotate around center
                let preview;
                if (this._rotateItems) {
                    // Rotate shape AND its position around center
                    preview = this._rotateShapeAroundCenter(s, this._center, angleRad);
                } else {
                    // Only move position in a circle, don't rotate the shape itself
                    preview = this._translateShapeAroundCenter(s, this._center, angleRad, bbox);
                }
                preview.color = '#ff66cc';
                preview.lineStyle = 'dashed';
                preview.opacity = 0.6;
                previewShapes.push(preview);
            }
        }

        // Draw center marker
        previewShapes.push({
            type: 'circle', cx: this._center.x, cy: this._center.y,
            radius: 5 / this.engine.zoom,
            color: '#ffcc00', lineStyle: 'solid'
        });
        // Draw radius line to first shape
        if (bbox) {
            previewShapes.push({
                type: 'line',
                x1: this._center.x, y1: this._center.y,
                x2: bbox.cx, y2: bbox.cy,
                color: '#ffcc00', lineStyle: 'dashed'
            });
        }

        this.engine.preview = previewShapes;
        this.engine.render();
    }

    _getSelectionBBox() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const expand = (x, y) => {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        };
        for (const s of this._baseShapes) {
            switch (s.type) {
                case 'line':
                    expand(s.x1, s.y1); expand(s.x2, s.y2);
                    break;
                case 'rectangle':
                case 'text':
                    expand(s.x, s.y); expand(s.x + (s.width || 0), s.y + (s.height || 0));
                    break;
                case 'circle':
                    expand(s.cx - s.radius, s.cy - s.radius);
                    expand(s.cx + s.radius, s.cy + s.radius);
                    break;
                case 'arc':
                case 'ellipse':
                    const rx = s.rx || s.radius || 0;
                    const ry = s.ry || s.radius || 0;
                    expand(s.cx - rx, s.cy - ry);
                    expand(s.cx + rx, s.cy + ry);
                    break;
                case 'polyline':
                    (s.points || []).forEach(p => { expand(p[0], p[1]); });
                    break;
            }
        }
        if (minX === Infinity) return null;
        return {
            x: minX, y: minY, w: maxX - minX, h: maxY - minY,
            cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
        };
    }

    _rotateShapeAroundCenter(shape, center, angleRad) {
        // Deep clone & rotate all coordinates around center
        const s = JSON.parse(JSON.stringify(shape));
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        const rotPt = (x, y) => {
            const dx = x - center.x;
            const dy = y - center.y;
            return {
                x: center.x + dx * cos - dy * sin,
                y: center.y + dx * sin + dy * cos
            };
        };

        switch (s.type) {
            case 'line': {
                const p1 = rotPt(s.x1, s.y1);
                const p2 = rotPt(s.x2, s.y2);
                s.x1 = p1.x; s.y1 = p1.y;
                s.x2 = p2.x; s.y2 = p2.y;
                break;
            }
            case 'rectangle':
            case 'text': {
                // Rectangles: rotate center, return as-is (approximate for preview)
                const w = s.width || 0, h = s.height || 0;
                const cx = s.x + w / 2, cy = s.y + h / 2;
                const rc = rotPt(cx, cy);
                s.x = rc.x - w / 2;
                s.y = rc.y - h / 2;
                break;
            }
            case 'circle':
            case 'arc':
            case 'ellipse': {
                const rc = rotPt(s.cx, s.cy);
                s.cx = rc.x;
                s.cy = rc.y;
                if (s.type === 'arc') {
                    const aDeg = (angleRad * 180) / Math.PI;
                    s.startAngle = (s.startAngle || 0) + aDeg;
                    s.endAngle = (s.endAngle || 0) + aDeg;
                }
                break;
            }
            case 'polyline': {
                s.points = (s.points || []).map(p => {
                    const rp = rotPt(p[0], p[1]);
                    return [rp.x, rp.y];
                });
                break;
            }
        }
        return s;
    }

    _translateShapeAroundCenter(shape, center, angleRad, bbox) {
        if (!bbox) return JSON.parse(JSON.stringify(shape));
        // Move shape so its bounding-box center orbits around center
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        const dx = bbox.cx - center.x;
        const dy = bbox.cy - center.y;
        const newCx = center.x + dx * cos - dy * sin;
        const newCy = center.y + dx * sin + dy * cos;
        const offsetX = newCx - bbox.cx;
        const offsetY = newCy - bbox.cy;
        return this.engine._getTranslatedShape(shape, offsetX, offsetY);
    }

    async _applyPolar() {
        if (!this._center) return;
        try {
            const angleStep = this._totalAngle / this._count;
            const bbox = this._getSelectionBBox();

            for (let i = 1; i < this._count; i++) {
                const angleDeg = angleStep * i;
                const angleRad = (angleDeg * Math.PI) / 180;

                if (this._rotateItems) {
                    // Copy + rotate around center
                    const res = await this.engine.api.copy_shapes(
                        JSON.stringify(this._ids), 0, 0
                    );
                    const data = JSON.parse(res);
                    if (data.success && data.ids) {
                        await this.engine.api.rotate_shapes(
                            JSON.stringify(data.ids),
                            JSON.stringify([this._center.x, this._center.y]),
                            angleDeg
                        );
                    }
                } else {
                    // Copy + translate to orbital position
                    if (bbox) {
                        const cos = Math.cos(angleRad);
                        const sin = Math.sin(angleRad);
                        const dx = bbox.cx - this._center.x;
                        const dy = bbox.cy - this._center.y;
                        const newCx = this._center.x + dx * cos - dy * sin;
                        const newCy = this._center.y + dx * sin + dy * cos;
                        const offsetX = newCx - bbox.cx;
                        const offsetY = newCy - bbox.cy;
                        await this.engine.api.copy_shapes(
                            JSON.stringify(this._ids), offsetX, offsetY
                        );
                    }
                }
            }

            if (this.manager.onProjectUpdated) this.manager.onProjectUpdated();
            this.engine.preview = null;
            this.manager.setTool('select');
        } catch (e) {
            console.error('Polar array failed:', e);
        }
    }

    // ─── Mouse Handlers ────────────────────────────────
    onMouseDown(world) {
        const snapped = this.manager.applySnap(world);

        if (this._state === 'pick_center') {
            this._center = { ...snapped };
            this._state = 'preview';
            this._generatePolarPreview();
            const total = this._count - 1;
            document.getElementById('status-tool').textContent =
                `📐 Polar Array: ${this._count} items, ${this._totalAngle}° | [Enter: Apply] [N: Edit] [R: Rect] [Esc: Cancel]`;
        } else if (this._state === 'preview') {
            // Click = apply
            this._apply();
        }
    }

    onMouseMove(world) {
        if (this._state === 'pick_center') {
            const snapped = this.manager.applySnap(world);
            // Show live center preview
            const bbox = this._getSelectionBBox();
            const previewShapes = [];
            if (bbox) {
                previewShapes.push({
                    type: 'line',
                    x1: snapped.x, y1: snapped.y,
                    x2: bbox.cx, y2: bbox.cy,
                    color: '#ffcc00', lineStyle: 'dashed'
                });
            }
            previewShapes.push({
                type: 'circle', cx: snapped.x, cy: snapped.y,
                radius: 5 / this.engine.zoom,
                color: '#ffcc00', lineStyle: 'solid'
            });
            this.engine.preview = previewShapes;
            this.engine.render();
        }
    }

    onKeyDown(key, e) {
        if (key === 'Escape') {
            this.engine.preview = null;
            this.manager.setTool('select');
            return true;
        }

        if (this._state === 'preview') {
            if (key === 'Enter') {
                this._apply();
                return true;
            }
            if (key.toLowerCase() === 'n') {
                // Re-edit parameters
                if (this._mode === 'rectangular') {
                    this._configureRectangular();
                } else {
                    this._configurePolar();
                }
                return true;
            }
            if (key.toLowerCase() === 'r' && this._mode === 'polar') {
                this._mode = 'rectangular';
                this._configureRectangular();
                return true;
            }
            if (key.toLowerCase() === 'p' && this._mode === 'rectangular') {
                this._mode = 'polar';
                this._configurePolar();
                return true;
            }
        }
        return false;
    }

    _apply() {
        if (this._mode === 'rectangular') {
            this._applyRectangular();
        } else {
            this._applyPolar();
        }
    }
}

// ═══════════════════════════════════════════════════
// FilletTool (Round corners between two lines)
// ═══════════════════════════════════════════════════

class FilletTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this._radius = 10;
        this._firstShape = null;
        this._firstClickPt = null;
    }

    activate() {
        this._firstShape = null;
        this._firstClickPt = null;
        this.engine.canvas.style.cursor = 'crosshair';

        // Prompt for radius
        const r = prompt('Fillet radius (0 = sharp corner):', this._radius);
        if (r === null) {
            this.manager.setTool('select');
            return;
        }
        this._radius = Math.max(0, parseFloat(r) || 0);
        document.getElementById('status-tool').textContent =
            `⭕ Fillet (r=${this._radius}): Select first line`;
    }

    onMouseMove(world) {
        // Highlight shapes on hover
        const hit = this.engine.hitTest(world);
        this.engine.hoveredId = hit ? hit.id : null;

        if (this._firstShape && hit && hit.id !== this._firstShape.id) {
            // Show live preview arc between the two lines
            const s2 = this.engine.shapes.find(s => s.id === hit.id);
            if (s2 && s2.type === 'line') {
                this._showPreview(this._firstShape, s2, world);
            } else {
                this.engine.preview = null;
            }
        } else if (!this._firstShape) {
            this.engine.preview = null;
        } else if (this._firstShape && (!hit || hit.id === this._firstShape.id)) {
            this.engine.preview = null;
        }

        this.engine.render();
    }

    async onMouseDown(world) {
        const hit = this.engine.hitTest(world);
        if (!hit) return;

        const shape = this.engine.shapes.find(s => s.id === hit.id);
        if (!shape || shape.type !== 'line') {
            document.getElementById('status-tool').textContent =
                `⭕ Fillet (r=${this._radius}): Please select a LINE`;
            return;
        }

        if (!this._firstShape) {
            // First selection
            this._firstShape = shape;
            this._firstClickPt = { ...world };
            this.engine.selectedIds = new Set([shape.id]);
            if (this.manager.onSelectionChanged) this.manager.onSelectionChanged([shape.id]);
            document.getElementById('status-tool').textContent =
                `⭕ Fillet (r=${this._radius}): Select second line`;
        } else {
            if (shape.id === this._firstShape.id) return;

            // Apply fillet
            try {
                const res = await this.engine.api.fillet_shapes(
                    this._firstShape.id, shape.id,
                    this._radius,
                    world.x, world.y
                );
                const data = JSON.parse(res);
                if (data.success) {
                    if (this.manager.onProjectUpdated) this.manager.onProjectUpdated();
                    this.engine.preview = null;
                    this._firstShape = null;
                    this._firstClickPt = null;
                    this.engine.selectedIds.clear();
                    document.getElementById('status-tool').textContent =
                        `⭕ Fillet (r=${this._radius}): Select first line (or Esc to exit)`;
                } else {
                    document.getElementById('status-tool').textContent =
                        `⭕ Fillet: ${data.message || 'Failed'}`;
                }
            } catch (e) {
                console.error('Fillet failed:', e);
                document.getElementById('status-tool').textContent =
                    `⭕ Fillet: Error - ${e.message || e}`;
            }
        }
    }

    _showPreview(s1, s2, mouseWorld) {
        const p1 = [s1.x1, s1.y1], p2 = [s1.x2, s1.y2];
        const p3 = [s2.x1, s2.y1], p4 = [s2.x2, s2.y2];

        // Step 1: Find infinite line intersection
        const ix = this._lineLineInf(p1[0], p1[1], p2[0], p2[1],
            p3[0], p3[1], p4[0], p4[1]);
        if (!ix) return;

        if (this._radius < 1e-6) {
            this.engine.preview = [{
                type: 'circle', cx: ix[0], cy: ix[1],
                radius: 4 / this.engine.zoom,
                color: '#ffcc00', lineStyle: 'solid'
            }];
            return;
        }

        const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);

        // Step 2: Determine far endpoints (away from IX = segments we keep)
        const far1 = dist(p1, ix) >= dist(p2, ix) ? p1 : p2;
        const far2 = dist(p3, ix) >= dist(p4, ix) ? p3 : p4;

        // Step 3: Direction vectors from IX toward far endpoints
        let v1 = [far1[0] - ix[0], far1[1] - ix[1]];
        let v2 = [far2[0] - ix[0], far2[1] - ix[1]];
        const lenV1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
        const lenV2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);
        if (lenV1 < 1e-10 || lenV2 < 1e-10) return;
        v1 = [v1[0] / lenV1, v1[1] / lenV1];
        v2 = [v2[0] / lenV2, v2[1] / lenV2];

        // Step 4: Perpendicular normals pointing toward INTERIOR angle
        const n1a = [-v1[1], v1[0]];
        const n1b = [v1[1], -v1[0]];
        const n1 = (n1a[0] * v2[0] + n1a[1] * v2[1]) > 0 ? n1a : n1b;

        const n2a = [-v2[1], v2[0]];
        const n2b = [v2[1], -v2[0]];
        const n2 = (n2a[0] * v1[0] + n2a[1] * v1[1]) > 0 ? n2a : n2b;

        // Step 5: Offset lines by radius, find center
        const off1a = [p1[0] + n1[0] * this._radius, p1[1] + n1[1] * this._radius];
        const off1b = [p2[0] + n1[0] * this._radius, p2[1] + n1[1] * this._radius];
        const off2a = [p3[0] + n2[0] * this._radius, p3[1] + n2[1] * this._radius];
        const off2b = [p4[0] + n2[0] * this._radius, p4[1] + n2[1] * this._radius];

        const center = this._lineLineInf(off1a[0], off1a[1], off1b[0], off1b[1],
            off2a[0], off2a[1], off2b[0], off2b[1]);
        if (!center) return;

        // Step 6: Tangent points
        const t1 = this._projectOnLine(center, p1, p2);
        const t2 = this._projectOnLine(center, p3, p4);

        // Step 7: Arc angles
        let sa = Math.atan2(t1[1] - center[1], t1[0] - center[0]) * 180 / Math.PI;
        let ea = Math.atan2(t2[1] - center[1], t2[0] - center[0]) * 180 / Math.PI;

        // Step 8: Arc direction — sweep must NOT pass through intersection
        const saN = ((sa % 360) + 360) % 360;
        const eaN = ((ea % 360) + 360) % 360;
        let sweepCW = ((eaN - saN) % 360 + 360) % 360;
        if (sweepCW === 0) sweepCW = 360;

        const mid1A = saN + sweepCW / 2;
        const mid2A = saN - (360 - sweepCW) / 2;

        const mid1 = [center[0] + this._radius * Math.cos(mid1A * Math.PI / 180),
        center[1] + this._radius * Math.sin(mid1A * Math.PI / 180)];
        const mid2 = [center[0] + this._radius * Math.cos(mid2A * Math.PI / 180),
        center[1] + this._radius * Math.sin(mid2A * Math.PI / 180)];

        if (dist(mid1, ix) > dist(mid2, ix)) {
            [sa, ea] = [ea, sa];
        }

        this.engine.preview = [
            {
                type: 'arc', cx: center[0], cy: center[1],
                radius: this._radius,
                startAngle: sa, endAngle: ea,
                color: '#00ff88', lineStyle: 'solid'
            },
            {
                type: 'circle', cx: center[0], cy: center[1],
                radius: 3 / this.engine.zoom,
                color: '#ffcc00', lineStyle: 'solid'
            },
            {
                type: 'circle', cx: t1[0], cy: t1[1],
                radius: 3 / this.engine.zoom,
                color: '#ff6600', lineStyle: 'solid'
            },
            {
                type: 'circle', cx: t2[0], cy: t2[1],
                radius: 3 / this.engine.zoom,
                color: '#ff6600', lineStyle: 'solid'
            }
        ];
    }

    _lineLineInf(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return null;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    }

    _projectOnLine(pt, a, b) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-10) return [...a];
        const t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq;
        return [a[0] + t * dx, a[1] + t * dy];
    }

    onKeyDown(key) {
        if (key === 'Escape') {
            this.engine.preview = null;
            this.engine.hoveredId = null;
            this._firstShape = null;
            this.engine.selectedIds.clear();
            this.manager.setTool('select');
            return true;
        }
        if (key.toLowerCase() === 'r') {
            const r = prompt('New fillet radius:', this._radius);
            if (r !== null) {
                this._radius = Math.max(0, parseFloat(r) || 0);
                document.getElementById('status-tool').textContent =
                    `⭕ Fillet (r=${this._radius}): Select first line`;
            }
            return true;
        }
        return false;
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
            scale: new ScaleTool(this),
            transform: new TransformTool(this),
            createBlock: new BlockCreateTool(this),
            insertBlock: new BlockInsertTool(this),
            erase: new EraseTool(this),
            array: new ArrayTool(this),
            fillet: new FilletTool(this),
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
            return this.currentTool.onKeyDown(key, e);
        }
        return false;
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
