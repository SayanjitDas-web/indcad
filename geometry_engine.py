"""
IndCAD Geometry Engine
Computational geometry functions for snapping, intersections, and measurements.
"""
import math


def distance(p1, p2):
    """Euclidean distance between two points."""
    return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)


def lerp(a, b, t):
    """Linear interpolation."""
    return a + (b - a) * t


def midpoint(p1, p2):
    """Midpoint of two points."""
    return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]



def line_line_intersection_infinite(p1, p2, p3, p4):
    """
    Find intersection of two infinite lines defined by (p1, p2) and (p3, p4).
    Returns [x, y] or None if parallel.
    """
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4

    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-10:
        return None

    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    return [px, py]


def line_line_intersection(p1, p2, p3, p4):
    """
    Find intersection of line segment (p1-p2) and (p3-p4).
    Returns intersection point or None.
    """
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4

    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-10:
        return None

    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom

    if 0 <= t <= 1 and 0 <= u <= 1:
        ix = x1 + t * (x2 - x1)
        iy = y1 + t * (y2 - y1)
        return [ix, iy]
    return None


def line_circle_intersection(p1, p2, center, radius):
    """
    Find intersections of a line segment (p1-p2) with a circle.
    Returns list of intersection points.
    """
    cx, cy = center
    x1, y1 = p1[0] - cx, p1[1] - cy
    x2, y2 = p2[0] - cx, p2[1] - cy

    dx = x2 - x1
    dy = y2 - y1
    a = dx * dx + dy * dy
    b = 2 * (x1 * dx + y1 * dy)
    c = x1 * x1 + y1 * y1 - radius * radius

    disc = b * b - 4 * a * c
    if disc < 0 or abs(a) < 1e-10:
        return []

    results = []
    sqrt_disc = math.sqrt(disc)
    for sign in [1, -1]:
        t = (-b + sign * sqrt_disc) / (2 * a)
        if 0 <= t <= 1:
            ix = p1[0] + t * (p2[0] - p1[0])
            iy = p1[1] + t * (p2[1] - p1[1])
            results.append([ix, iy])
    return results


def circle_circle_intersection(c1, r1, c2, r2):
    """
    Find intersections of two circles.
    Returns list of intersection points.
    """
    d = distance(c1, c2)
    if d > r1 + r2 or d < abs(r1 - r2) or d < 1e-10:
        return []

    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
    h_sq = r1 * r1 - a * a
    if h_sq < 0:
        return []
    h = math.sqrt(h_sq)

    mx = c1[0] + a * (c2[0] - c1[0]) / d
    my = c1[1] + a * (c2[1] - c1[1]) / d

    if abs(h) < 1e-10:
        return [[mx, my]]

    ox = h * (c2[1] - c1[1]) / d
    oy = h * (c2[0] - c1[0]) / d

    return [[mx + ox, my - oy], [mx - ox, my + oy]]


def point_to_line_distance(point, p1, p2):
    """Perpendicular distance from point to line segment p1-p2."""
    px, py = point
    x1, y1 = p1
    x2, y2 = p2

    dx = x2 - x1
    dy = y2 - y1
    len_sq = dx * dx + dy * dy

    if len_sq < 1e-10:
        return distance(point, p1)

    t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / len_sq))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return distance(point, [proj_x, proj_y])


def is_angle_between(angle, start, end):
    """Check if an angle (degrees) is between start and end (degrees), CCW."""
    angle %= 360
    start %= 360
    end %= 360
    
    if start <= end:
        return start <= angle <= end
    else: # Crosses 0/360
        return angle >= start or angle <= end


def line_arc_intersection(p1, p2, arc):
    """Intersections of line segment and arc."""
    center = [arc['cx'], arc['cy']]
    radius = arc['radius']
    inters = line_circle_intersection(p1, p2, center, radius)
    
    results = []
    sa = arc.get('startAngle', 0)
    ea = arc.get('endAngle', 360)
    
    for pt in inters:
        angle = angle_between(center, pt)
        if is_angle_between(angle, sa, ea):
            results.append(pt)
    return results


    return results


def line_ellipse_intersection(p1, p2, ellipse):
    """
    Intersections of line segment and axis-aligned ellipse.
    Strategy: Scale Y by rx/ry to transform ellipse to circle (radius rx).
    Transform line points, find intersection with circle, transform back.
    """
    cx, cy = ellipse['cx'], ellipse['cy']
    rx, ry = ellipse['rx'], ellipse['ry']
    
    if abs(ry) < 1e-10: return [] 
    scale_y = rx / ry
    
    # Transform line to circle space
    tp1 = [p1[0], (p1[1] - cy) * scale_y + cy]
    tp2 = [p2[0], (p2[1] - cy) * scale_y + cy]
    
    # Intersect with circle of radius rx
    circle_inters = line_circle_intersection(tp1, tp2, [cx, cy], rx)
    
    # Transform results back
    results = []
    for ip in circle_inters:
        # x is same, y needs unscaling
        y_unscaled = (ip[1] - cy) / scale_y + cy
        results.append([ip[0], y_unscaled])
        
    # Check segment bounds for original line (p1-p2)
    # The circle intersection checks bounds in transformed space, so t is geometric.
    # However, to be safe, we re-check if points lie on segment p1-p2
    final_results = []
    for res in results:
         d = distance(p1, p2)
         d1 = distance(p1, res)
         d2 = distance(p2, res)
         if abs(d - (d1 + d2)) < 1e-5:
             final_results.append(res)
             
    # Filter by arc angles if it's a partial ellipse
    sa = ellipse.get('startAngle', 0)
    ea = ellipse.get('endAngle', 360) 
    
    filtered = []
    for pt in final_results:
        # Calculate angle of point on ellipse relative to center
        # Angle is parametric or polar? 
        # For drawing `ctx.ellipse`, angles are polar.
        ang = math.degrees(math.atan2(pt[1] - cy, pt[0] - cx))
        if is_angle_between(ang, sa, ea):
             filtered.append(pt)
             
    return filtered


def point_ellipse_angle(point, cx, cy):
    """Angle of point relative to ellipse center."""
    return math.degrees(math.atan2(point[1] - cy, point[0] - cx))


def circle_arc_intersection(circle, arc):
    """Intersections of circle and arc."""
    c1 = [circle['cx'], circle['cy']]
    r1 = circle['radius']
    c2 = [arc['cx'], arc['cy']]
    r2 = arc['radius']
    
    inters = circle_circle_intersection(c1, r1, c2, r2)
    results = []
    sa = arc.get('startAngle', 0)
    ea = arc.get('endAngle', 360)
    
    for pt in inters:
        angle = angle_between(c2, pt)
        if is_angle_between(angle, sa, ea):
            results.append(pt)
    return results


def arc_arc_intersection(arc1, arc2):
    """Intersections of two arcs."""
    c1 = [arc1['cx'], arc1['cy']]
    r1 = arc1['radius']
    c2 = [arc2['cx'], arc2['cy']]
    r2 = arc2['radius']
    
    inters = circle_circle_intersection(c1, r1, c2, r2)
    results = []
    sa1, ea1 = arc1.get('startAngle', 0), arc1.get('endAngle', 360)
    sa2, ea2 = arc2.get('startAngle', 0), arc2.get('endAngle', 360)
    
    for pt in inters:
        ang1 = angle_between(c1, pt)
        ang2 = angle_between(c2, pt)
        if is_angle_between(ang1, sa1, ea1) and is_angle_between(ang2, sa2, ea2):
            results.append(pt)
    return results


def get_segments(shape):
    """Get list of line segments [[p1, p2], ...] for a polygonal shape."""
    stype = shape['type']
    segments = []
    
    if stype == 'line':
        segments.append([[shape['x1'], shape['y1']], [shape['x2'], shape['y2']]])
        
    elif stype == 'polyline':
        pts = shape['points']
        for i in range(len(pts) - 1):
            segments.append([pts[i], pts[i+1]])
            
    elif stype == 'rectangle':
        x, y, w, h = shape['x'], shape['y'], shape['width'], shape['height']
        corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
        for i in range(4):
            segments.append([corners[i], corners[(i+1)%4]])
            
    return segments


def polygonal_intersection(s1, s2):
    """Find intersections between two polygonal shapes (Line, Polyline, Rectangle)."""
    segs1 = get_segments(s1)
    segs2 = get_segments(s2)
    
    inters = []
    for l1 in segs1:
        for l2 in segs2:
            res = line_line_intersection(l1[0], l1[1], l2[0], l2[1])
            if res:
                inters.append(res)
    return inters


def get_shape_intersections(s1, s2):
    """Generic dispatcher for intersections between two shapes."""
    t1, t2 = s1['type'], s2['type']
    
    # Polygonal vs Polygonal (Line, Polyline, Rectangle)
    polygonal_types = ['line', 'polyline', 'rectangle']
    if t1 in polygonal_types and t2 in polygonal_types:
        return polygonal_intersection(s1, s2)

    # Normalize order to reduce combinations
    # Order: Polygonal < Circle/Arc < Ellipse
    order = {
        'line': 0, 'polyline': 0, 'rectangle': 0,
        'circle': 1, 'arc': 1,
        'ellipse': 2
    }
    
    if order.get(t1, 99) > order.get(t2, 99):
        return get_shape_intersections(s2, s1)

    # Polygonal vs Circle/Arc
    if t1 in polygonal_types:
        segs = get_segments(s1)
        inters = []
        for l in segs:
            p1, p2 = l[0], l[1]
            if t2 == 'circle':
                res = line_circle_intersection(p1, p2, [s2['cx'], s2['cy']], s2['radius'])
                inters.extend(res)
            elif t2 == 'arc':
                res = line_arc_intersection(p1, p2, s2)
                inters.extend(res)
        return inters

    # Polygonal vs Ellipse
    if t1 in polygonal_types and t2 == 'ellipse':
        segs = get_segments(s1)
        inters = []
        for l in segs:
            p1, p2 = l[0], l[1]
            res = line_ellipse_intersection(p1, p2, s2)
            inters.extend(res)
        return inters

    # Circle/Arc vs Circle/Arc
    if t1 == 'circle':
        c1, r1 = [s1['cx'], s1['cy']], s1['radius']
        if t2 == 'circle':
            return circle_circle_intersection(c1, r1, [s2['cx'], s2['cy']], s2['radius'])
        if t2 == 'arc':
            return circle_arc_intersection(s1, s2)
            
    if t1 == 'arc':
        if t2 == 'arc':
            return arc_arc_intersection(s1, s2)

    return []


def point_to_circle_distance(point, center, radius):
    """Distance from point to circle perimeter."""
    return abs(distance(point, center) - radius)


def nearest_point_on_line(point, p1, p2):
    """Find the nearest point on line segment p1-p2 to the given point."""
    px, py = point
    x1, y1 = p1
    x2, y2 = p2

    dx = x2 - x1
    dy = y2 - y1
    len_sq = dx * dx + dy * dy

    if len_sq < 1e-10:
        return list(p1)

    t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / len_sq))
    return [x1 + t * dx, y1 + t * dy]


def nearest_point_on_circle(point, center, radius):
    """Find the nearest point on circle perimeter to the given point."""
    dx = point[0] - center[0]
    dy = point[1] - center[1]
    d = math.sqrt(dx * dx + dy * dy)
    if d < 1e-10:
        return [center[0] + radius, center[1]]
    return [center[0] + radius * dx / d, center[1] + radius * dy / d]


def angle_between(p1, p2):
    """Angle in degrees from p1 to p2."""
    return math.degrees(math.atan2(p2[1] - p1[1], p2[0] - p1[0]))


def rotate_point(point, center, angle_deg):
    """Rotate a point around a center by angle in degrees."""
    angle_rad = math.radians(angle_deg)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    dx = point[0] - center[0]
    dy = point[1] - center[1]
    return [
        center[0] + dx * cos_a - dy * sin_a,
        center[1] + dx * sin_a + dy * cos_a
    ]


def perpendicular_point(point, p1, p2):
    """Find the perpendicular foot from point to line through p1-p2 (extended)."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    len_sq = dx * dx + dy * dy
    if len_sq < 1e-10:
        return list(p1)
    t = ((point[0] - p1[0]) * dx + (point[1] - p1[1]) * dy) / len_sq
    return [p1[0] + t * dx, p1[1] + t * dy]


def polygon_area(points):
    """Calculate area of a polygon using the shoelace formula."""
    n = len(points)
    if n < 3:
        return 0
    area = 0
    for i in range(n):
        j = (i + 1) % n
        area += points[i][0] * points[j][1]
        area -= points[j][0] * points[i][1]
    return abs(area) / 2


def polygon_perimeter(points, closed=True):
    """Calculate perimeter of a polyline/polygon."""
    total = 0
    for i in range(len(points) - 1):
        total += distance(points[i], points[i + 1])
    if closed and len(points) > 2:
        total += distance(points[-1], points[0])
    return total


def find_snap_points(shapes, snap_modes=None):
    """
    Extract all key snap points (Endpoint, Midpoint, Center, Quadrant, Intersection).
    """
    if snap_modes is None:
        snap_modes = ['endpoint', 'midpoint', 'center', 'intersection', 'quadrant']

    snaps = {mode: [] for mode in snap_modes}

    # 1. Shape-specific snaps
    for shape in shapes:
        stype = shape.get('type', '')

        if stype == 'line':
            if 'endpoint' in snap_modes:
                snaps['endpoint'].append([shape['x1'], shape['y1']])
                snaps['endpoint'].append([shape['x2'], shape['y2']])
            if 'midpoint' in snap_modes:
                snaps['midpoint'].append(midpoint(
                    [shape['x1'], shape['y1']],
                    [shape['x2'], shape['y2']]
                ))

        elif stype == 'circle':
            if 'center' in snap_modes:
                snaps['center'].append([shape['cx'], shape['cy']])
            if 'quadrant' in snap_modes or 'endpoint' in snap_modes:
                r = shape['radius']
                cx, cy = shape['cx'], shape['cy']
                quads = [[cx+r, cy], [cx-r, cy], [cx, cy+r], [cx, cy-r]]
                if 'quadrant' in snap_modes:
                    snaps['quadrant'].extend(quads)
                # Keep endpoint for backward compat if needed? 
                # "Quadrants" are the natural snap points for circles.

        elif stype == 'rectangle':
            x, y = shape['x'], shape['y']
            w, h = shape['width'], shape['height']
            corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
            if 'endpoint' in snap_modes:
                snaps['endpoint'].extend(corners)
            if 'midpoint' in snap_modes:
                for i in range(4):
                    snaps['midpoint'].append(midpoint(corners[i], corners[(i + 1) % 4]))
            if 'center' in snap_modes:
                snaps['center'].append([x + w / 2, y + h / 2])

        elif stype == 'arc':
            if 'center' in snap_modes:
                snaps['center'].append([shape['cx'], shape['cy']])
            if 'endpoint' in snap_modes:
                r = shape['radius']
                cx, cy = shape['cx'], shape['cy']
                sa = math.radians(shape.get('startAngle', 0))
                ea = math.radians(shape.get('endAngle', 360))
                snaps['endpoint'].append([cx + r * math.cos(sa), cy + r * math.sin(sa)])
                snaps['endpoint'].append([cx + r * math.cos(ea), cy + r * math.sin(ea)])
            if 'quadrant' in snap_modes:
                # Only include quadrants within start/end angle
                r = shape['radius']
                cx, cy = shape['cx'], shape['cy']
                sa, ea = shape.get('startAngle', 0), shape.get('endAngle', 360)
                for ang in [0, 90, 180, 270]:
                    if is_angle_between(ang, sa, ea):
                        rad = math.radians(ang)
                        snaps['quadrant'].append([cx + r * math.cos(rad), cy + r * math.sin(rad)])

        elif stype == 'ellipse':
            if 'center' in snap_modes:
                snaps['center'].append([shape['cx'], shape['cy']])
            if 'quadrant' in snap_modes:
                cx, cy = shape['cx'], shape['cy']
                rx, ry = shape['rx'], shape['ry']
                sa, ea = shape.get('startAngle', 0), shape.get('endAngle', 360)
                # 0, 90, 180, 270 relative to center
                q_pts = [
                    (0, [cx + rx, cy]), (90, [cx, cy + ry]),
                    (180, [cx - rx, cy]), (270, [cx, cy - ry])
                ]
                for ang, pt in q_pts:
                     if is_angle_between(ang, sa, ea):
                         snaps['quadrant'].append(pt)

        elif stype == 'polyline':
            pts = shape.get('points', [])
            if 'endpoint' in snap_modes:
                snaps['endpoint'].extend(pts)
            if 'midpoint' in snap_modes:
                for i in range(len(pts) - 1):
                    snaps['midpoint'].append(midpoint(pts[i], pts[i + 1]))

    # 2. Intersections (Global)
    if 'intersection' in snap_modes:
        n = len(shapes)
        for i in range(n):
            for j in range(i + 1, n):
                inters = get_shape_intersections(shapes[i], shapes[j])
                snaps['intersection'].extend(inters)

    return snaps


def find_nearest_snap(point, shapes, snap_radius=15, snap_modes=None, base_point=None):
    """
    Find the nearest snap point.
    Includes context-sensitive snaps (Tangent, Perpendicular) if base_point is provided.
    """
    if snap_modes is None:
        snap_modes = ['endpoint', 'midpoint', 'center', 'intersection', 'quadrant', 'nearest', 'tangent', 'perpendicular']

    # 1. Static Snaps
    static_modes = [m for m in snap_modes if m in ['endpoint', 'midpoint', 'center', 'intersection', 'quadrant']]
    all_snaps = find_snap_points(shapes, static_modes)

    best = None
    best_dist = snap_radius

    # Check static points
    for snap_type, points in all_snaps.items():
        for sp in points:
            d = distance(point, sp)
            if d < best_dist:
                best_dist = d
                best = {'type': snap_type, 'point': sp}
    
    # If we found a priority snap, return it? 
    # Usually Endpoint/Intersection overrides Nearest.
    if best and best_dist < 5: # High priority close match
        return best

    # 2. Dynamic/Context Snaps (Tangent, Perpendicular)
    if base_point:
        bx, by = base_point
        
        if 'tangent' in snap_modes:
            for shape in shapes:
                if shape['type'] in ['circle', 'arc']:
                    # Calculate tangent points from base_point
                    t_pts = calculate_tangent_points([bx, by], [shape['cx'], shape['cy']], shape['radius'])
                    for tp in t_pts:
                         d = distance(point, tp)
                         if d < best_dist:
                             best_dist = d
                             best = {'type': 'tangent', 'point': tp}

        if 'perpendicular' in snap_modes:
            for shape in shapes:
                perp_pt = None
                if shape['type'] == 'line':
                    perp_pt = perpendicular_point([bx, by], [shape['x1'], shape['y1']], [shape['x2'], shape['y2']])
                    # Check if on segment? Usually perp snap implies infinite line extension or segment.
                    # Let's restrict to segment for now.
                    if not on_segment(perp_pt, [shape['x1'], shape['y1']], [shape['x2'], shape['y2']]):
                        perp_pt = None
                
                if perp_pt:
                    d = distance(point, perp_pt)
                    if d < best_dist:
                        best_dist = d
                        best = {'type': 'perpendicular', 'point': perp_pt}

    # 3. Nearest Snap (Lowest Priority)
    if 'nearest' in snap_modes and (best is None or best_dist > 5):
        for shape in shapes:
            near_pt = None
            stype = shape['type']
            if stype == 'line':
                near_pt = closest_point_on_segment(point, [shape['x1'], shape['y1']], [shape['x2'], shape['y2']])
            elif stype == 'circle':
                 near_pt = nearest_point_on_circle(point, [shape['cx'], shape['cy']], shape['radius'])
            elif stype == 'arc':
                 pt = nearest_point_on_circle(point, [shape['cx'], shape['cy']], shape['radius'])
                 # Check angle
                 ang = angle_between([shape['cx'], shape['cy']], pt)
                 if is_angle_between(ang, shape.get('startAngle', 0), shape.get('endAngle', 360)):
                     near_pt = pt
            elif stype == 'polyline':
                # closest on any segment
                segs = get_segments(shape)
                min_d = float('inf')
                for s in segs:
                    np = closest_point_on_segment(point, s[0], s[1])
                    d = distance(point, np)
                    if d < min_d:
                        min_d = d
                        near_pt = np
            
            if near_pt:
                d = distance(point, near_pt)
                if d < best_dist:
                    best_dist = d
                    best = {'type': 'nearest', 'point': near_pt}

    return best


def on_segment(p, a, b):
    """Check if point p is on segment ab."""
    return abs(distance(a, b) - (distance(a, p) + distance(p, b))) < 1e-4


def offset_line(p1, p2, dist):
    """
    Offset a line segment by a distance.
    Positive dist -> Right side relative to direction p1->p2.
    """
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.sqrt(dx * dx + dy * dy)
    if length < 1e-10:
        return p1, p2

    # Normal vector (-dy, dx)
    nx = -dy / length
    ny = dx / length

    ox = nx * dist
    oy = ny * dist

    return [p1[0] + ox, p1[1] + oy], [p2[0] + ox, p2[1] + oy]


def offset_polyline(points, dist, closed=False):
    """Offset a polyline."""
    if len(points) < 2:
        return points

    segments = []
    for i in range(len(points) - 1):
        s1, s2 = offset_line(points[i], points[i+1], dist)
        segments.append((s1, s2))

    if closed:
        s1, s2 = offset_line(points[-1], points[0], dist)
        segments.append((s1, s2))

    new_points = []
    n = len(segments)

    # First point
    if not closed:
        new_points.append(segments[0][0])

    # Intersections
    for i in range(n - 1):
        l1 = segments[i]
        l2 = segments[i+1]
        inter = line_line_intersection_infinite(l1[0], l1[1], l2[0], l2[1])
        if inter:
            new_points.append(inter)
        else:
            new_points.append(l1[1]) # Fallback for parallel

    if closed:
        # Close loop
        l1 = segments[-1]
        l2 = segments[0]
        inter = line_line_intersection_infinite(l1[0], l1[1], l2[0], l2[1])
        if inter:
            new_points.append(inter)
            # Ensure correct start
            new_points.insert(0, inter)
        else:
            new_points.append(l1[1])
            new_points.insert(0, l1[1])
    else:
        new_points.append(segments[-1][1])

    return new_points


def closest_point_on_segment(p, a, b):
    """Find closest point on segment ab to point p."""
    x, y = p
    x1, y1 = a
    x2, y2 = b
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return a
    
    t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    return [x1 + t * dx, y1 + t * dy]


def calculate_tangent_points(point, center, radius):
    """
    Calculate tangent points from an external point to a circle.
    Returns list of [x, y] points (0, 1, or 2).
    """
    dx = center[0] - point[0]
    dy = center[1] - point[1]
    dist = math.sqrt(dx * dx + dy * dy)
    
    if dist < radius:
        return [] # Point inside circle
    elif abs(dist - radius) < 1e-10:
        return [point] # Point on circle
        
    angle = math.atan2(dy, dx)
    offset = math.acos(radius / dist)
    
    t1 = angle + offset
    t2 = angle - offset
    
    p1 = [center[0] - radius * math.cos(t1), center[1] - radius * math.sin(t1)]
    p2 = [center[0] - radius * math.cos(t2), center[1] - radius * math.sin(t2)]
    
    return [p1, p2]

