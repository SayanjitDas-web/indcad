
// ═══════════════════════════════════════════════════
// TrimTool
// ═══════════════════════════════════════════════════

class TrimTool extends BaseTool {
    activate() {
        this.engine.canvas.style.cursor = 'crosshair';
    }

    onMouseMove(world) {
        const hit = this.engine.hitTest(world);
        this.engine.hoveredId = hit ? hit.id : null;
    }

    async onMouseDown(world) {
        const hit = this.engine.hitTest(world);
        if (hit) {
            try {
                await this.manager.onShapeCreated({}); // Hack to force save state before op
                await this.manager.engine.api.trim_shape(hit.id, world.x, world.y);
                if (this.manager.onShapeCreated) this.manager.onShapeCreated({}); // Force reload
            } catch (e) {
                console.error(e);
            }
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
            }
        } else {
            try {
                await this.manager.engine.api.offset_shape(this._selectedId, this._distance, world.x, world.y);
                if (this.manager.onShapeCreated) this.manager.onShapeCreated({}); // Force reload
                this._selectedId = null;
                this.engine.selectedIds.clear();
            } catch (e) {
                console.error(e);
            }
        }
    }

    onKeyDown(key) {
        if (key === 'Escape') {
            this._selectedId = null;
            this.engine.selectedIds.clear();
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
        }
    }

    async _copy(dx, dy) {
        try {
            const ids = Array.from(this.engine.selectedIds);
            await this.manager.engine.api.copy_shapes(JSON.stringify(ids), dx, dy);
            if (this.manager.onShapeCreated) this.manager.onShapeCreated({}); // Force reload
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
