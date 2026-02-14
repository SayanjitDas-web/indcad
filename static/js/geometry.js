/**
 * IndCAD Geometry Utilities
 * Functional geometry for snapping, intersections, and measurements.
 */

const Geometry = {
    dist(p1, p2) {
        return Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
    },

    distPt(p1, p2) {
        return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    },

    angleBetween(center, pt) {
        return Math.atan2(pt[1] - center[1], pt[0] - center[0]) * 180 / Math.PI;
    },

    isAngleBetween(angle, start, end) {
        angle = (angle % 360 + 360) % 360;
        start = (start % 360 + 360) % 360;
        end = (end % 360 + 360) % 360;

        if (start <= end) {
            return angle >= start && angle <= end;
        } else {
            return angle >= start || angle <= end;
        }
    },

    lineLineIntersection(p1, p2, p3, p4) {
        const x1 = p1[0], y1 = p1[1];
        const x2 = p2[0], y2 = p2[1];
        const x3 = p3[0], y3 = p3[1];
        const x4 = p4[0], y4 = p4[1];

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return null;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
        }
        return null;
    },

    lineCircleIntersection(p1, p2, center, radius) {
        const cx = center[0], cy = center[1];
        const x1 = p1[0] - cx, y1 = p1[1] - cy;
        const x2 = p2[0] - cx, y2 = p2[1] - cy;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const a = dx * dx + dy * dy;
        const b = 2 * (x1 * dx + y1 * dy);
        const c = x1 * x1 + y1 * y1 - radius * radius;

        const disc = b * b - 4 * a * c;
        if (disc < 0 || Math.abs(a) < 1e-10) return [];

        const results = [];
        const sqrtDisc = Math.sqrt(disc);
        [1, -1].forEach(sign => {
            const t = (-b + sign * sqrtDisc) / (2 * a);
            if (t >= 0 && t <= 1) {
                results.push([p1[0] + t * dx, p1[1] + t * dy]);
            }
        });
        return results;
    },

    closestPointOnSegment(p, a, b) {
        const px = p[0], py = p[1];
        const x1 = a[0], y1 = a[1];
        const x2 = b[0], y2 = b[1];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-10) return [x1, y1];
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        return [x1 + t * dx, y1 + t * dy];
    },

    perpendicularPoint(point, p1, p2) {
        const px = point[0], py = point[1];
        const x1 = p1[0], y1 = p1[1];
        const x2 = p2[0], y2 = p2[1];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-10) return [x1, y1];
        const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        return [x1 + t * dx, y1 + t * dy];
    },

    calculateTangentPoints(point, center, radius) {
        const dx = center[0] - point[0];
        const dy = center[1] - point[1];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < radius) return [];
        if (Math.abs(d - radius) < 1e-10) return [point];
        const angle = Math.atan2(dy, dx);
        const offset = Math.acos(radius / d);
        return [
            [center[0] - radius * Math.cos(angle + offset), center[1] - radius * Math.sin(angle + offset)],
            [center[0] - radius * Math.cos(angle - offset), center[1] - radius * Math.sin(angle - offset)]
        ];
    },

    getSegments(shape) {
        const segments = [];
        if (shape.type === 'line') {
            segments.push([[shape.x1, shape.y1], [shape.x2, shape.y2]]);
        } else if (shape.type === 'polyline') {
            const pts = shape.points || [];
            for (let i = 0; i < pts.length - 1; i++) {
                segments.push([pts[i], pts[i + 1]]);
            }
            if (shape.closed) segments.push([pts[pts.length - 1], pts[0]]);
        } else if (shape.type === 'rectangle') {
            const x = shape.x, y = shape.y, w = shape.width, h = shape.height;
            const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
            for (let i = 0; i < 4; i++) {
                segments.push([corners[i], corners[(i + 1) % 4]]);
            }
        }
        return segments;
    },

    pointInRect(pt, x1, y1, x2, y2) {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        return pt[0] >= minX && pt[0] <= maxX && pt[1] >= minY && pt[1] <= maxY;
    },

    segmentIntersectsRect(p1, p2, x1, y1, x2, y2) {
        // 1. One or both endpoints inside
        if (this.pointInRect(p1, x1, y1, x2, y2) || this.pointInRect(p2, x1, y1, x2, y2)) return true;

        // 2. Intersection with any of the 4 rectangle sides
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

        const sides = [
            [[minX, minY], [maxX, minY]],
            [[maxX, minY], [maxX, maxY]],
            [[maxX, maxY], [minX, maxY]],
            [[minX, maxY], [minX, minY]]
        ];

        for (const side of sides) {
            if (this.lineLineIntersection(p1, p2, side[0], side[1])) return true;
        }

        return false;
    }
};
