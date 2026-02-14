
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
