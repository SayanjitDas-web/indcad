/**
 * IndCAD Canvas Engine
 * Core HTML5 Canvas 2D rendering engine with pan, zoom, grid, and shape rendering.
 */
class CanvasEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // World transform
        this.pan = { x: 0, y: 0 };
        this.zoom = 1;
        this.minZoom = 0.02;
        this.maxZoom = 50;

        // Grid
        this.gridSize = 10;
        this.gridVisible = true;

        // State
        this.shapes = [];
        this.selectedIds = new Set();
        this.hoveredId = null;
        this.preview = null;      // { type, ...data } for rubber-band
        this.snapPoint = null;    // currently active snap point
        this.measureLine = null;  // for measure tool display

        // Interaction
        this._isPanning = false;
        this._panStart = null;
        this._lastMouse = { x: 0, y: 0 };

        // Colors
        this.colors = {
            bg: '#1a1a2e',
            gridMinor: 'rgba(255,255,255,0.04)',
            gridMajor: 'rgba(255,255,255,0.1)',
            gridOrigin: 'rgba(0,120,212,0.35)',
            crosshair: 'rgba(255,255,255,0.4)',
            selection: '#00d4ff',
            selectionWindow: 'rgba(0, 120, 212, 0.25)',
            selectionCrossing: 'rgba(52, 168, 82, 0.25)',
            selectionWindowBorder: '#0078d4',
            selectionCrossingBorder: '#34a852',
            hover: '#58a6ff',
            preview: 'rgba(0,212,255,0.6)',
            snap: '#00ff88',
            measure: '#ff9500',
            dimension: '#ffcc00',
        };

        this.snapBasePoint = null; // Used for Perpendicular/Tangent pick point
        this.snapSettings = {};

        this._setupCanvas();
        this._bindEvents();
        this._startRenderLoop();
    }

    // ──────────────────────── Setup ────────────────────────

    _setupCanvas() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const container = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = container.clientWidth * dpr;
        this.canvas.height = container.clientHeight * dpr;
        this.canvas.style.width = container.clientWidth + 'px';
        this.canvas.style.height = container.clientHeight + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = container.clientWidth;
        this.height = container.clientHeight;
    }

    _bindEvents() {
        this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // ──────────────────────── Coordinate Transforms ────────────────────────

    screenToWorld(sx, sy) {
        const zoom = (isFinite(this.zoom) && this.zoom > 0) ? this.zoom : 1;
        const px = isFinite(this.pan.x) ? this.pan.x : 0;
        const py = isFinite(this.pan.y) ? this.pan.y : 0;
        return {
            x: (sx - px) / zoom,
            y: (sy - py) / zoom
        };
    }

    worldToScreen(wx, wy) {
        return {
            x: wx * this.zoom + this.pan.x,
            y: wy * this.zoom + this.pan.y
        };
    }

    // ──────────────────────── Events ────────────────────────

    _getCanvasPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    _onWheel(e) {
        e.preventDefault();
        const pos = this._getCanvasPos(e);
        const worldBefore = this.screenToWorld(pos.x, pos.y);

        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));

        const worldAfter = this.screenToWorld(pos.x, pos.y);
        this.pan.x += (worldAfter.x - worldBefore.x) * this.zoom;
        this.pan.y += (worldAfter.y - worldBefore.y) * this.zoom;

        if (this.onZoomChange) this.onZoomChange(this.zoom);
    }

    _onMouseDown(e) {
        const pos = this._getCanvasPos(e);
        const world = this.screenToWorld(pos.x, pos.y);

        // Middle mouse or Space + left = pan
        if (e.button === 1 || (e.button === 0 && this._spaceDown)) {
            this._isPanning = true;
            this._panStart = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        if (e.button === 0 && this.onToolMouseDown) {
            this.onToolMouseDown(world, pos, e);
        }
    }

    _onMouseMove(e) {
        const pos = this._getCanvasPos(e);
        const world = this.screenToWorld(pos.x, pos.y);
        this._lastMouse = pos;

        if (this._isPanning) {
            this.pan.x = e.clientX - this._panStart.x;
            this.pan.y = e.clientY - this._panStart.y;
            return;
        }

        if (this.onToolMouseMove) {
            // Priority: Object Snap -> World Crosshair
            this.snapPoint = this.findSnapPoint(world, 15, this.snapSettings);
            const snappedWorld = this.snapPoint ? { x: this.snapPoint.point[0], y: this.snapPoint.point[1] } : world;
            this.onToolMouseMove(snappedWorld, pos, e);
        }

        if (this.onCoordsChange) {
            this.onCoordsChange(world);
        }
    }

    _onMouseUp(e) {
        if (this._isPanning) {
            this._isPanning = false;
            this.canvas.style.cursor = 'crosshair';
            return;
        }

        const pos = this._getCanvasPos(e);
        const world = this.screenToWorld(pos.x, pos.y);

        if (e.button === 0 && this.onToolMouseUp) {
            this.onToolMouseUp(world, pos, e);
        }
    }

    _onDoubleClick(e) {
        const pos = this._getCanvasPos(e);
        const world = this.screenToWorld(pos.x, pos.y);
        if (this.onToolDoubleClick) {
            this.onToolDoubleClick(world, pos, e);
        }
    }

    setSpaceDown(down) {
        this._spaceDown = down;
        this.canvas.style.cursor = down ? 'grab' : 'crosshair';
    }

    // ──────────────────────── Hit Testing ────────────────────────

    hitTest(worldPos, tolerance = 5) {
        const tol = tolerance / this.zoom;
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const shape = this.shapes[i];
            if (this._hitTestShape(shape, worldPos, tol)) {
                return shape;
            }
        }
        return null;
    }

    _hitTestShape(shape, pos, tol) {
        switch (shape.type) {
            case 'line':
                return this._pointToLineDist(pos, shape.x1, shape.y1, shape.x2, shape.y2) < tol;
            case 'rectangle': {
                const x = shape.x, y = shape.y, w = shape.width, h = shape.height;
                // Test all 4 edges
                return this._pointToLineDist(pos, x, y, x + w, y) < tol ||
                    this._pointToLineDist(pos, x + w, y, x + w, y + h) < tol ||
                    this._pointToLineDist(pos, x + w, y + h, x, y + h) < tol ||
                    this._pointToLineDist(pos, x, y + h, x, y) < tol;
            }
            case 'circle': {
                const dist = Math.sqrt((pos.x - shape.cx) ** 2 + (pos.y - shape.cy) ** 2);
                return Math.abs(dist - shape.radius) < tol;
            }
            case 'arc': {
                const dist = Math.sqrt((pos.x - shape.cx) ** 2 + (pos.y - shape.cy) ** 2);
                if (Math.abs(dist - shape.radius) > tol) return false;
                let angle = Math.atan2(pos.y - shape.cy, pos.x - shape.cx) * 180 / Math.PI;
                if (angle < 0) angle += 360;
                let sa = shape.startAngle % 360;
                let ea = shape.endAngle % 360;
                if (sa < 0) sa += 360;
                if (ea < 0) ea += 360;
                if (sa <= ea) return angle >= sa && angle <= ea;
                return angle >= sa || angle <= ea;
            }
            case 'ellipse': {
                const dx = (pos.x - shape.cx) / shape.rx;
                const dy = (pos.y - shape.cy) / shape.ry;
                const d = Math.sqrt(dx * dx + dy * dy);
                return Math.abs(d - 1) < tol / Math.min(shape.rx, shape.ry);
            }
            case 'polyline': {
                const pts = shape.points || [];
                for (let i = 0; i < pts.length - 1; i++) {
                    if (this._pointToLineDist(pos, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < tol) return true;
                }
                if (shape.closed && pts.length > 2) {
                    const last = pts[pts.length - 1], first = pts[0];
                    if (this._pointToLineDist(pos, last[0], last[1], first[0], first[1]) < tol) return true;
                }
                return false;
            }
            case 'text': {
                const fontSize = (shape.fontSize || 14);
                const textW = (shape.content || '').length * fontSize * 0.6;
                return pos.x >= shape.x && pos.x <= shape.x + textW &&
                    pos.y >= shape.y - fontSize && pos.y <= shape.y;
            }
            case 'dimension': {
                return this._pointToLineDist(pos, shape.x1, shape.y1, shape.x2, shape.y2) < tol * 2;
            }
        }
        return false;
    }

    _pointToLineDist(p, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-10) return Math.sqrt((p.x - x1) ** 2 + (p.y - y1) ** 2);
        const t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / lenSq));
        const px = x1 + t * dx, py = y1 + t * dy;
        return Math.sqrt((p.x - px) ** 2 + (p.y - py) ** 2);
    }

    // ──────────────────────── Object Snapping ────────────────────────

    findSnapPoint(worldPos, tolerance = 15, settings = null) {
        const tol = tolerance / this.zoom;
        const isEnabled = (type) => !settings || settings[type] !== false;

        let bestSnap = null;
        let minDist = tol;

        const checkPoint = (p, type) => {
            const d = Math.sqrt((worldPos.x - p[0]) ** 2 + (worldPos.y - p[1]) ** 2);
            if (d < minDist) {
                minDist = d;
                bestSnap = { type, point: p };
            }
        };

        // 1. Static Shape Snaps (Endpoint, Midpoint, Center, Quadrant)
        for (const shape of this.shapes) {
            if (shape._hidden) continue;
            const points = this._getSnapPointsForShape(shape, settings);
            for (const sp of points) {
                checkPoint(sp.point, sp.type);
            }
        }

        // 2. Intersection Snap (Global)
        if (isEnabled('intersection') && (bestSnap === null || minDist > 5 / this.zoom)) {
            const n = this.shapes.length;
            for (let i = 0; i < n; i++) {
                if (this.shapes[i]._hidden) continue;
                for (let j = i + 1; j < n; j++) {
                    if (this.shapes[j]._hidden) continue;
                    const inters = this._getIntersections(this.shapes[i], this.shapes[j]);
                    for (const pt of inters) checkPoint(pt, 'intersection');
                }
            }
        }

        // 3. Dynamic context snaps (Perpendicular, Tangent)
        if (this.snapBasePoint) {
            const bp = [this.snapBasePoint.x, this.snapBasePoint.y];

            if (isEnabled('perpendicular')) {
                for (const shape of this.shapes) {
                    if (shape._hidden) continue;
                    const segs = Geometry.getSegments(shape);
                    for (const seg of segs) {
                        const perp = Geometry.perpendicularPoint(bp, seg[0], seg[1]);
                        checkPoint(perp, 'perpendicular');
                    }
                }
            }

            if (isEnabled('tangent')) {
                for (const shape of this.shapes) {
                    if (shape._hidden || (shape.type !== 'circle' && shape.type !== 'arc')) continue;
                    const center = [shape.cx, shape.cy];
                    const tpts = Geometry.calculateTangentPoints(bp, center, shape.radius);
                    for (const tp of tpts) {
                        if (shape.type === 'arc') {
                            const ang = Geometry.angleBetween(center, tp);
                            if (!Geometry.isAngleBetween(ang, shape.startAngle, shape.endAngle)) continue;
                        }
                        checkPoint(tp, 'tangent');
                    }
                }
            }
        }

        if (isEnabled('extension')) {
            for (const shape of this.shapes) {
                if (shape._hidden || shape.type !== 'line') continue;
                const p1 = [shape.x1, shape.y1], p2 = [shape.x2, shape.y2];
                const perp = Geometry.perpendicularPoint([worldPos.x, worldPos.y], p1, p2);
                const dToLine = Geometry.dist(perp, [worldPos.x, worldPos.y]);

                if (dToLine < tol) {
                    // Check if outside segment
                    const d1 = Geometry.dist(perp, p1), d2 = Geometry.dist(perp, p2), d12 = Geometry.dist(p1, p2);
                    if (d1 > d12 || d2 > d12) {
                        // Close to one of the endpoints?
                        if (d1 < 300 / this.zoom || d2 < 300 / this.zoom) {
                            checkPoint(perp, 'extension');
                        }
                    }
                }
            }
        }

        // 4. Nearest Snap (Lowest Priority)
        if (isEnabled('nearest') && (bestSnap === null || minDist > 8 / this.zoom)) {
            for (const shape of this.shapes) {
                if (shape._hidden) continue;
                this._checkNearestOnShape(shape, [worldPos.x, worldPos.y], checkPoint);
            }
        }

        return bestSnap;
    }

    _getSnapPointsForShape(shape, settings = null) {
        const pts = [];
        const isEnabled = (type) => !settings || settings[type] !== false;

        switch (shape.type) {
            case 'line':
                if (isEnabled('endpoint')) {
                    pts.push({ type: 'endpoint', point: [shape.x1, shape.y1] });
                    pts.push({ type: 'endpoint', point: [shape.x2, shape.y2] });
                }
                if (isEnabled('midpoint')) {
                    pts.push({ type: 'midpoint', point: [(shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2] });
                }
                break;
            case 'polyline':
                const nodes = shape.points || [];
                for (let i = 0; i < nodes.length; i++) {
                    if (isEnabled('endpoint')) {
                        pts.push({ type: 'endpoint', point: [nodes[i][0], nodes[i][1]] });
                    }
                    if (i < nodes.length - 1 && isEnabled('midpoint')) {
                        pts.push({ type: 'midpoint', point: [(nodes[i][0] + nodes[i + 1][0]) / 2, (nodes[i][1] + nodes[i + 1][1]) / 2] });
                    }
                }
                if (shape.closed && nodes.length > 2 && isEnabled('midpoint')) {
                    const last = nodes[nodes.length - 1], first = nodes[0];
                    pts.push({ type: 'midpoint', point: [(last[0] + first[0]) / 2, (last[1] + first[1]) / 2] });
                }
                break;
            case 'rectangle':
                const x = shape.x, y = shape.y, w = shape.width, h = shape.height;
                if (isEnabled('endpoint')) {
                    pts.push({ type: 'endpoint', point: [x, y] });
                    pts.push({ type: 'endpoint', point: [x + w, y] });
                    pts.push({ type: 'endpoint', point: [x + w, y + h] });
                    pts.push({ type: 'endpoint', point: [x, y + h] });
                }
                if (isEnabled('midpoint')) {
                    pts.push({ type: 'midpoint', point: [x + w / 2, y] });
                    pts.push({ type: 'midpoint', point: [x + w, y + h / 2] });
                    pts.push({ type: 'midpoint', point: [x + w / 2, y + h] });
                    pts.push({ type: 'midpoint', point: [x, y + h / 2] });
                }
                if (isEnabled('center')) {
                    pts.push({ type: 'center', point: [x + w / 2, y + h / 2] });
                }
                break;
            case 'circle':
                if (isEnabled('center')) {
                    pts.push({ type: 'center', point: [shape.cx, shape.cy] });
                }
                if (isEnabled('quadrant')) {
                    pts.push({ type: 'quadrant', point: [shape.cx + shape.radius, shape.cy] });
                    pts.push({ type: 'quadrant', point: [shape.cx - shape.radius, shape.cy] });
                    pts.push({ type: 'quadrant', point: [shape.cx, shape.cy + shape.radius] });
                    pts.push({ type: 'quadrant', point: [shape.cx, shape.cy - shape.radius] });
                }
                break;
            case 'arc':
                if (isEnabled('center')) {
                    pts.push({ type: 'center', point: [shape.cx, shape.cy] });
                }
                if (isEnabled('endpoint')) {
                    const angles = [shape.startAngle, shape.endAngle];
                    angles.forEach(a => {
                        const rad = a * Math.PI / 180;
                        pts.push({ type: 'endpoint', point: [shape.cx + Math.cos(rad) * shape.radius, shape.cy + Math.sin(rad) * shape.radius] });
                    });
                }
                if (isEnabled('quadrant')) {
                    [0, 90, 180, 270].forEach(ang => {
                        if (Geometry.isAngleBetween(ang, shape.startAngle, shape.endAngle)) {
                            const rad = ang * Math.PI / 180;
                            pts.push({ type: 'quadrant', point: [shape.cx + Math.cos(rad) * shape.radius, shape.cy + Math.sin(rad) * shape.radius] });
                        }
                    });
                }
                break;
            case 'ellipse':
                if (isEnabled('center')) {
                    pts.push({ type: 'center', point: [shape.cx, shape.cy] });
                }
                if (isEnabled('quadrant')) {
                    [0, 90, 180, 270].forEach(ang => {
                        if (Geometry.isAngleBetween(ang, shape.startAngle, shape.endAngle)) {
                            const rad = ang * Math.PI / 180;
                            pts.push({ type: 'quadrant', point: [shape.cx + Math.cos(rad) * shape.rx, shape.cy + Math.sin(rad) * shape.ry] });
                        }
                    });
                }
                break;
        }
        return pts;
    }

    _getIntersections(s1, s2) {
        const polyTypes = ['line', 'polyline', 'rectangle'];
        if (polyTypes.includes(s1.type) && polyTypes.includes(s2.type)) {
            const segs1 = Geometry.getSegments(s1);
            const segs2 = Geometry.getSegments(s2);
            const inters = [];
            for (const seg1 of segs1) {
                for (const seg2 of segs2) {
                    const res = Geometry.lineLineIntersection(seg1[0], seg1[1], seg2[0], seg2[1]);
                    if (res) inters.push(res);
                }
            }
            return inters;
        }
        if (polyTypes.includes(s1.type) && (s2.type === 'circle' || s2.type === 'arc')) {
            const segs = Geometry.getSegments(s1);
            const inters = [];
            for (const seg of segs) {
                const res = Geometry.lineCircleIntersection(seg[0], seg[1], [s2.cx, s2.cy], s2.radius);
                res.forEach(pt => {
                    if (s2.type === 'arc') {
                        const ang = Geometry.angleBetween([s2.cx, s2.cy], pt);
                        if (!Geometry.isAngleBetween(ang, s2.startAngle, s2.endAngle)) return;
                    }
                    inters.push(pt);
                });
            }
            return inters;
        }
        if (polyTypes.includes(s2.type) && (s1.type === 'circle' || s1.type === 'arc')) return this._getIntersections(s2, s1);
        return [];
    }

    _checkNearestOnShape(shape, p, checkPoint) {
        if (shape.type === 'line' || shape.type === 'polyline' || shape.type === 'rectangle') {
            const segs = Geometry.getSegments(shape);
            for (const seg of segs) {
                checkPoint(Geometry.closestPointOnSegment(p, seg[0], seg[1]), 'nearest');
            }
        } else if (shape.type === 'circle' || shape.type === 'arc') {
            const dx = p[0] - shape.cx, dy = p[1] - shape.cy;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1e-10) return;
            const near = [shape.cx + shape.radius * dx / d, shape.cy + shape.radius * dy / d];
            if (shape.type === 'arc') {
                const ang = Geometry.angleBetween([shape.cx, shape.cy], near);
                if (Geometry.isAngleBetween(ang, shape.startAngle, shape.endAngle)) checkPoint(near, 'nearest');
            } else {
                checkPoint(near, 'nearest');
            }
        }
    }

    // Box selection
    getShapesInBox(x1, y1, x2, y2, crossing = false) {
        return this.shapes.filter(s => {
            if (s._hidden) return false;
            return this._isShapeInBox(s, x1, y1, x2, y2, crossing);
        });
    }

    _isShapeInBox(shape, x1, y1, x2, y2, crossing) {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

        const bb = this._getBoundingBox(shape);
        if (!bb) return false;

        // 1. If bounding box is entirely inside, it's always selected
        const inside = bb.x >= minX && bb.y >= minY && bb.x + bb.w <= maxX && bb.y + bb.h <= maxY;
        if (inside) return true;

        // 2. If it's not a crossing selection, and not entirely inside, it's not selected
        if (!crossing) return false;

        // 3. Crossing selection: Check if any segment or part of the shape intersects the box
        if (shape.type === 'line' || shape.type === 'polyline' || shape.type === 'rectangle') {
            const segs = Geometry.getSegments(shape);
            for (const seg of segs) {
                if (Geometry.segmentIntersectsRect(seg[0], seg[1], x1, y1, x2, y2)) return true;
            }
        } else if (shape.type === 'circle' || shape.type === 'arc') {
            // Simple check: if distance from center to rect is less than or equal to radius
            const cx = shape.cx, cy = shape.cy, r = shape.radius;
            const closestX = Math.max(minX, Math.min(cx, maxX));
            const closestY = Math.max(minY, Math.min(cy, maxY));
            const dx = cx - closestX, dy = cy - closestY;
            const distSq = dx * dx + dy * dy;

            if (distSq <= r * r) {
                // For arc, we'd need more precision, but this is a good professional approximation for CAD cross-selecting
                return true;
            }
        }

        return false;
    }

    _getBoundingBox(shape) {
        if (!shape) return null;
        try {
            switch (shape.type) {
                case 'line': {
                    const x1 = shape.x1 || 0, y1 = shape.y1 || 0, x2 = shape.x2 || 0, y2 = shape.y2 || 0;
                    if (!isFinite(x1 + y1 + x2 + y2)) return null;
                    return {
                        x: Math.min(x1, x2), y: Math.min(y1, y2),
                        w: Math.abs(x2 - x1), h: Math.abs(y2 - y1)
                    };
                }
                case 'rectangle': {
                    const x = shape.x || 0, y = shape.y || 0, w = shape.width || 0, h = shape.height || 0;
                    if (!isFinite(x + y + w + h)) return null;
                    return { x: x, y: y, w: w, h: h };
                }
                case 'circle': {
                    const cx = shape.cx || 0, cy = shape.cy || 0, r = shape.radius || 0;
                    if (!isFinite(cx + cy + r)) return null;
                    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
                }
                case 'ellipse': {
                    const cx = shape.cx || 0, cy = shape.cy || 0, rx = shape.rx || 0, ry = shape.ry || 0;
                    if (!isFinite(cx + cy + rx + ry)) return null;
                    return { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 };
                }
                case 'arc': {
                    const cx = shape.cx || 0, cy = shape.cy || 0, r = shape.radius || 0;
                    if (!isFinite(cx + cy + r)) return null;
                    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
                }
                case 'polyline': {
                    const pts = shape.points || [];
                    if (pts.length === 0) return null;
                    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
                    let validCount = 0;
                    pts.forEach(p => {
                        if (p && isFinite(p[0]) && isFinite(p[1])) {
                            mnx = Math.min(mnx, p[0]); mny = Math.min(mny, p[1]);
                            mxx = Math.max(mxx, p[0]); mxy = Math.max(mxy, p[1]);
                            validCount++;
                        }
                    });
                    if (validCount === 0) return null;
                    return { x: mnx, y: mny, w: mxx - mnx, h: mxy - mny };
                }
                case 'text': {
                    const x = shape.x || 0, y = shape.y || 0, fs = shape.fontSize || 14;
                    if (!isFinite(x + y + fs)) return null;
                    return { x: x, y: y - fs, w: (shape.content || '').length * fs * 0.6, h: fs };
                }
            }
        } catch (e) {
            console.error("Bounds error:", e, shape);
        }
        return null;
    }

    // ──────────────────────── Rendering ────────────────────────

    _startRenderLoop() {
        const render = () => {
            this._render();
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    render() {
        this._render();
    }

    _render() {
        const ctx = this.ctx;
        const w = this.width, h = this.height;

        // Clear
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(0, 0, w, h);

        // Grid
        if (this.gridVisible) this._renderGrid();

        // Origin crosshair (faint)
        this._renderOrigin();

        // Shapes
        ctx.save();
        this.shapes.forEach(shape => {
            if (shape._hidden) return;
            this._renderShape(shape);
        });
        ctx.restore();

        // Selection box
        if (this._selectionBox) {
            this._renderSelectionBox();
        }

        // Preview (rubber-band)
        if (this.preview) {
            this._renderPreview();
        }

        // Snap indicator
        if (this.snapPoint) {
            this._renderSnapIndicator();
        }

        // Measure line
        if (this.measureLine) {
            this._renderMeasureLine();
        }

        // Crosshair at mouse
        this._renderCrosshair();
    }

    _renderGrid() {
        const ctx = this.ctx;
        const gridWorld = this.gridSize;

        // Calculate visible world extent
        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(this.width, this.height);

        // Dynamic grid: choose level based on zoom
        let step = gridWorld;
        const screenStep = step * this.zoom;
        if (screenStep < 5) step *= 10;
        if (screenStep > 200) step /= 5;

        const majorEvery = 5;
        const startX = Math.floor(topLeft.x / step) * step;
        const startY = Math.floor(topLeft.y / step) * step;
        const endX = Math.ceil(bottomRight.x / step) * step;
        const endY = Math.ceil(bottomRight.y / step) * step;

        ctx.lineWidth = 1;

        // Minor grid
        ctx.strokeStyle = this.colors.gridMinor;
        ctx.beginPath();
        for (let x = startX; x <= endX; x += step) {
            if (Math.round(x / step) % majorEvery === 0) continue;
            const sx = this.worldToScreen(x, 0).x;
            ctx.moveTo(Math.round(sx) + 0.5, 0);
            ctx.lineTo(Math.round(sx) + 0.5, this.height);
        }
        for (let y = startY; y <= endY; y += step) {
            if (Math.round(y / step) % majorEvery === 0) continue;
            const sy = this.worldToScreen(0, y).y;
            ctx.moveTo(0, Math.round(sy) + 0.5);
            ctx.lineTo(this.width, Math.round(sy) + 0.5);
        }
        ctx.stroke();

        // Major grid
        ctx.strokeStyle = this.colors.gridMajor;
        ctx.beginPath();
        for (let x = startX; x <= endX; x += step) {
            if (Math.round(x / step) % majorEvery !== 0) continue;
            const sx = this.worldToScreen(x, 0).x;
            ctx.moveTo(Math.round(sx) + 0.5, 0);
            ctx.lineTo(Math.round(sx) + 0.5, this.height);
        }
        for (let y = startY; y <= endY; y += step) {
            if (Math.round(y / step) % majorEvery !== 0) continue;
            const sy = this.worldToScreen(0, y).y;
            ctx.moveTo(0, Math.round(sy) + 0.5);
            ctx.lineTo(this.width, Math.round(sy) + 0.5);
        }
        ctx.stroke();
    }

    _renderOrigin() {
        const ctx = this.ctx;
        const o = this.worldToScreen(0, 0);
        ctx.strokeStyle = this.colors.gridOrigin;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(o.x, 0); ctx.lineTo(o.x, this.height);
        ctx.moveTo(0, o.y); ctx.lineTo(this.width, o.y);
        ctx.stroke();
    }

    _renderShape(shape) {
        const ctx = this.ctx;
        const isSelected = this.selectedIds.has(shape.id);
        const isHovered = this.hoveredId === shape.id;

        const color = isSelected ? this.colors.selection : (isHovered ? this.colors.hover : (shape.color || '#ffffff'));
        const lineWidth = ((shape.lineWidth || 1) * (isSelected ? 1.5 : 1));

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.fillStyle = 'transparent';

        if (shape.lineStyle === 'dashed') {
            ctx.setLineDash([6, 4]);
        } else if (shape.lineStyle === 'dotted') {
            ctx.setLineDash([2, 3]);
        } else if (shape.lineStyle === 'dashdot') {
            ctx.setLineDash([8, 3, 2, 3]);
        } else {
            ctx.setLineDash([]);
        }

        switch (shape.type) {
            case 'line': this._drawLine(shape); break;
            case 'rectangle': this._drawRectangle(shape); break;
            case 'circle': this._drawCircle(shape); break;
            case 'arc': this._drawArc(shape); break;
            case 'ellipse': this._drawEllipse(shape); break;
            case 'polyline': this._drawPolyline(shape); break;
            case 'text': this._drawText(shape, color); break;
            case 'dimension': this._drawDimension(shape); break;
        }

        ctx.setLineDash([]);

        // Selection handles
        if (isSelected) {
            this._drawSelectionHandles(shape);
        }
    }

    _drawLine(s) {
        const ctx = this.ctx;
        const a = this.worldToScreen(s.x1, s.y1);
        const b = this.worldToScreen(s.x2, s.y2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }

    _drawRectangle(s) {
        const ctx = this.ctx;
        const a = this.worldToScreen(s.x, s.y);
        const b = this.worldToScreen(s.x + s.width, s.y + s.height);
        ctx.beginPath();
        ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.stroke();
    }

    _drawCircle(s) {
        const ctx = this.ctx;
        const c = this.worldToScreen(s.cx, s.cy);
        const r = s.radius * this.zoom;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    _drawArc(s) {
        const ctx = this.ctx;
        const c = this.worldToScreen(s.cx, s.cy);
        const r = s.radius * this.zoom;
        const sa = (s.startAngle || 0) * Math.PI / 180;
        const ea = (s.endAngle || 360) * Math.PI / 180;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, sa, ea);
        ctx.stroke();
    }

    _drawEllipse(s) {
        const ctx = this.ctx;
        const c = this.worldToScreen(s.cx, s.cy);
        const rx = s.rx * this.zoom;
        const ry = s.ry * this.zoom;
        const sa = (s.startAngle !== undefined ? s.startAngle : 0) * Math.PI / 180;
        const ea = (s.endAngle !== undefined ? s.endAngle : 360) * Math.PI / 180;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, ry, 0, sa, ea);
        ctx.stroke();
    }

    _drawPolyline(s) {
        const ctx = this.ctx;
        const pts = s.points || [];
        if (pts.length < 2) return;
        ctx.beginPath();
        const first = this.worldToScreen(pts[0][0], pts[0][1]);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) {
            const p = this.worldToScreen(pts[i][0], pts[i][1]);
            ctx.lineTo(p.x, p.y);
        }
        if (s.closed) ctx.closePath();
        ctx.stroke();
    }

    _drawText(s, color) {
        const ctx = this.ctx;
        const p = this.worldToScreen(s.x, s.y);
        const fontSize = (s.fontSize || 14) * this.zoom;
        if (fontSize < 2) return;
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(s.content || 'Text', p.x, p.y);
    }

    _drawDimension(s) {
        const ctx = this.ctx;
        const a = this.worldToScreen(s.x1, s.y1);
        const b = this.worldToScreen(s.x2, s.y2);
        const offset = (s.offset || 20);

        // Get perpendicular direction
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        const nx = -dy / len * offset, ny = dx / len * offset;

        const a2 = { x: a.x + nx, y: a.y + ny };
        const b2 = { x: b.x + nx, y: b.y + ny };

        // Extension lines
        ctx.strokeStyle = this.colors.dimension;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(a2.x, a2.y);
        ctx.moveTo(b.x, b.y); ctx.lineTo(b2.x, b2.y);
        ctx.stroke();

        // Dimension line
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y);
        ctx.stroke();

        // Arrows
        const arrowSize = 8;
        this._drawArrow(ctx, a2, b2, arrowSize);
        this._drawArrow(ctx, b2, a2, arrowSize);

        // Text
        const dist = Math.sqrt((s.x2 - s.x1) ** 2 + (s.y2 - s.y1) ** 2);
        const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
        ctx.font = '12px JetBrains Mono, monospace';
        ctx.fillStyle = this.colors.dimension;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(dist.toFixed(2), mid.x, mid.y - 4);
        ctx.textAlign = 'left';
    }

    _drawArrow(ctx, from, to, size) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(from.x + size * Math.cos(angle - 0.3), from.y + size * Math.sin(angle - 0.3));
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(from.x + size * Math.cos(angle + 0.3), from.y + size * Math.sin(angle + 0.3));
        ctx.stroke();
    }

    _drawSelectionHandles(shape) {
        const ctx = this.ctx;
        const bb = this._getBoundingBox(shape);
        if (!bb) return;

        const handles = [
            { x: bb.x, y: bb.y },
            { x: bb.x + bb.w, y: bb.y },
            { x: bb.x + bb.w, y: bb.y + bb.h },
            { x: bb.x, y: bb.y + bb.h },
        ];

        ctx.fillStyle = this.colors.selection;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        handles.forEach(h => {
            const s = this.worldToScreen(h.x, h.y);
            ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
            ctx.strokeRect(s.x - 3, s.y - 3, 6, 6);
        });
    }

    _renderSelectionBox() {
        const ctx = this.ctx;
        const box = this._selectionBox;
        const a = this.worldToScreen(box.x1, box.y1);
        const b = this.worldToScreen(box.x2, box.y2);

        // AutoCAD logic: Left-to-Right = Blue/Window, Right-to-Left = Green/Crossing
        const crossing = box.x2 < box.x1;

        ctx.fillStyle = crossing ? this.colors.selectionCrossing : this.colors.selectionWindow;
        ctx.strokeStyle = crossing ? this.colors.selectionCrossingBorder : this.colors.selectionWindowBorder;
        ctx.lineWidth = 1.5;

        if (crossing) {
            ctx.setLineDash([6, 4]); // Crossing is dashed in AutoCAD
        } else {
            ctx.setLineDash([]); // Window is solid
        }

        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.setLineDash([]);
    }

    _renderPreview() {
        const ctx = this.ctx;
        ctx.strokeStyle = this.colors.preview;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);

        const p = this.preview;
        switch (p.type) {
            case 'line': {
                const a = this.worldToScreen(p.x1, p.y1);
                const b = this.worldToScreen(p.x2, p.y2);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                ctx.stroke();
                break;
            }
            case 'rectangle': {
                const a = this.worldToScreen(p.x, p.y);
                const b = this.worldToScreen(p.x + p.width, p.y + p.height);
                ctx.beginPath();
                ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
                ctx.stroke();
                break;
            }
            case 'circle': {
                const c = this.worldToScreen(p.cx, p.cy);
                ctx.beginPath();
                ctx.arc(c.x, c.y, p.radius * this.zoom, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'arc': {
                const c = this.worldToScreen(p.cx, p.cy);
                ctx.beginPath();
                ctx.arc(c.x, c.y, p.radius * this.zoom,
                    (p.startAngle || 0) * Math.PI / 180,
                    (p.endAngle || 360) * Math.PI / 180);
                ctx.stroke();
                break;
            }
            case 'ellipse': {
                const c = this.worldToScreen(p.cx, p.cy);
                ctx.beginPath();
                ctx.ellipse(c.x, c.y, p.rx * this.zoom, p.ry * this.zoom, 0, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'polyline': {
                const pts = p.points || [];
                if (pts.length < 1) break;
                ctx.beginPath();
                const first = this.worldToScreen(pts[0][0], pts[0][1]);
                ctx.moveTo(first.x, first.y);
                for (let i = 1; i < pts.length; i++) {
                    const pt = this.worldToScreen(pts[i][0], pts[i][1]);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
                break;
            }
        }
        ctx.setLineDash([]);
    }

    _renderSnapIndicator() {
        const ctx = this.ctx;
        const sp = this.snapPoint;
        if (!sp) return;
        const screen = this.worldToScreen(sp.point[0], sp.point[1]);
        const size = 7;

        ctx.strokeStyle = this.colors.snap;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        switch (sp.type) {
            case 'endpoint':
                // Box
                ctx.strokeRect(screen.x - size, screen.y - size, size * 2, size * 2);
                break;
            case 'midpoint':
                // Triangle
                ctx.beginPath();
                ctx.moveTo(screen.x, screen.y - size);
                ctx.lineTo(screen.x + size + 1, screen.y + size);
                ctx.lineTo(screen.x - size - 1, screen.y + size);
                ctx.closePath();
                ctx.stroke();
                break;
            case 'center':
                // Circle with center dot
                ctx.beginPath();
                ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(screen.x, screen.y, 1.5, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'intersection':
                // X
                ctx.beginPath();
                ctx.moveTo(screen.x - size, screen.y - size);
                ctx.lineTo(screen.x + size, screen.y + size);
                ctx.moveTo(screen.x + size, screen.y - size);
                ctx.lineTo(screen.x - size, screen.y + size);
                ctx.stroke();
                break;
            case 'quadrant':
                // Diamond
                ctx.beginPath();
                ctx.moveTo(screen.x, screen.y - size);
                ctx.lineTo(screen.x + size, screen.y);
                ctx.lineTo(screen.x, screen.y + size);
                ctx.lineTo(screen.x - size, screen.y);
                ctx.closePath();
                ctx.stroke();
                break;
            case 'nearest':
                // Hourglass
                ctx.beginPath();
                ctx.moveTo(screen.x - size, screen.y - size);
                ctx.lineTo(screen.x + size, screen.y - size);
                ctx.lineTo(screen.x - size, screen.y + size);
                ctx.lineTo(screen.x + size, screen.y + size);
                ctx.closePath();
                ctx.stroke();
                break;
            case 'tangent':
                // Circle with line on top
                ctx.beginPath();
                ctx.arc(screen.x, screen.y + 2, size - 2, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(screen.x - size, screen.y - size + 2);
                ctx.lineTo(screen.x + size, screen.y - size + 2);
                ctx.stroke();
                break;
            case 'perpendicular':
                // L shape (Right angle)
                ctx.beginPath();
                ctx.moveTo(screen.x, screen.y - size * 1.5);
                ctx.lineTo(screen.x, screen.y);
                ctx.lineTo(screen.x + size * 1.5, screen.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(screen.x, screen.y - size);
                ctx.lineTo(screen.x + size, screen.y - size);
                ctx.lineTo(screen.x + size, screen.y);
                ctx.lineWidth = 1;
                ctx.stroke();
                break;
            case 'extension':
                // Three dots
                ctx.fillStyle = this.colors.snap;
                [-1, 0, 1].forEach(i => {
                    ctx.beginPath();
                    ctx.arc(screen.x + i * 5, screen.y, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                });
                break;
            default:
                // Small Cross
                ctx.beginPath();
                ctx.moveTo(screen.x - 3, screen.y); ctx.lineTo(screen.x + 3, screen.y);
                ctx.moveTo(screen.x, screen.y - 3); ctx.lineTo(screen.x, screen.y + 3);
                ctx.stroke();
        }
    }

    _renderMeasureLine() {
        const ctx = this.ctx;
        const m = this.measureLine;
        const a = this.worldToScreen(m.x1, m.y1);
        const b = this.worldToScreen(m.x2, m.y2);

        ctx.strokeStyle = this.colors.measure;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const dist = Math.sqrt((m.x2 - m.x1) ** 2 + (m.y2 - m.y1) ** 2);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

        ctx.font = 'bold 12px JetBrains Mono, monospace';
        ctx.fillStyle = this.colors.measure;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // Background
        const text = dist.toFixed(2);
        const tw = ctx.measureText(text).width + 10;
        ctx.fillStyle = 'rgba(13,17,23,0.85)';
        ctx.fillRect(mid.x - tw / 2, mid.y - 20, tw, 18);
        ctx.fillStyle = this.colors.measure;
        ctx.fillText(text, mid.x, mid.y - 6);
        ctx.textAlign = 'left';
    }

    _renderCrosshair() {
        const ctx = this.ctx;
        const m = this._lastMouse;

        ctx.strokeStyle = this.colors.crosshair;
        ctx.lineWidth = 1; // Standard CAD crosshair line width
        ctx.setLineDash([]);

        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(0, m.y); ctx.lineTo(this.width, m.y);
        ctx.stroke();

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(m.x, 0); ctx.lineTo(m.x, this.height);
        ctx.stroke();

        // Pickbox (AutoCAD-style square at center)
        const pbSize = 8;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(m.x - pbSize / 2, m.y - pbSize / 2, pbSize, pbSize);
    }

    // ──────────────────────── Public API ────────────────────────

    setShapes(shapes) {
        this.shapes = shapes;
    }

    setSelection(ids) {
        this.selectedIds = new Set(ids);
    }

    setSelectionBox(box) {
        this._selectionBox = box;
    }

    clearSelectionBox() {
        this._selectionBox = null;
    }

    zoomToFit() {
        if (!this.shapes || this.shapes.length === 0) {
            this.pan = { x: this.width / 2, y: this.height / 2 };
            this.zoom = 1;
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let foundValid = false;
        this.shapes.forEach(s => {
            const bb = this._getBoundingBox(s);
            if (!bb) return;
            minX = Math.min(minX, bb.x);
            minY = Math.min(minY, bb.y);
            maxX = Math.max(maxX, bb.x + bb.w);
            maxY = Math.max(maxY, bb.y + bb.h);
            foundValid = true;
        });

        if (!foundValid || !isFinite(minX + minY + maxX + maxY)) {
            this.pan = { x: this.width / 2, y: this.height / 2 };
            this.zoom = 1;
            return;
        }

        const padding = 50;
        const dw = Math.max(1, maxX - minX);
        const dh = Math.max(1, maxY - minY);

        let targetZoom = Math.min((this.width - padding * 2) / dw, (this.height - padding * 2) / dh);
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        this.pan.x = this.width / 2 - cx * this.zoom;
        this.pan.y = this.height / 2 - cy * this.zoom;

        // Final sanity check
        if (!isFinite(this.pan.x)) this.pan.x = this.width / 2;
        if (!isFinite(this.pan.y)) this.pan.y = this.width / 2;

        if (this.onZoomChange) this.onZoomChange(this.zoom);
    }

    zoomIn() {
        const center = { x: this.width / 2, y: this.height / 2 };
        const worldBefore = this.screenToWorld(center.x, center.y);
        this.zoom = Math.min(this.maxZoom, this.zoom * 1.2);
        const worldAfter = this.screenToWorld(center.x, center.y);
        this.pan.x += (worldAfter.x - worldBefore.x) * this.zoom;
        this.pan.y += (worldAfter.y - worldBefore.y) * this.zoom;
        if (this.onZoomChange) this.onZoomChange(this.zoom);
    }

    zoomOut() {
        const center = { x: this.width / 2, y: this.height / 2 };
        const worldBefore = this.screenToWorld(center.x, center.y);
        this.zoom = Math.max(this.minZoom, this.zoom / 1.2);
        const worldAfter = this.screenToWorld(center.x, center.y);
        this.pan.x += (worldAfter.x - worldBefore.x) * this.zoom;
        this.pan.y += (worldAfter.y - worldBefore.y) * this.zoom;
        if (this.onZoomChange) this.onZoomChange(this.zoom);
    }
}
