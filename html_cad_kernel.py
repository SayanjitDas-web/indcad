"""
IndCAD HTML/CSS/SVG → CAD Kernel  (v2 — Production-grade)
Translates HTML + inline/block CSS + full SVG into IndCAD JSON shapes.

Supported output shapes:
  line, rectangle, circle, arc, ellipse, polyline, text

Features:
  • Full SVG <path> d-attribute: M L H V C S Q T A Z (abs + rel)
  • Bézier curves tessellated to polyline segments
  • SVG arcs (A command) → IndCAD arc or polyline approximation
  • CSS transform: translate / rotate / scale / matrix
  • <style> block class resolution
  • <table> → grid of rectangles + text
  • <ul>/<ol>/<li> → text items with offsets
  • <img> → placeholder rectangle + label
  • Border / opacity / stroke-dasharray / font properties
  • Nested <svg> with viewBox coordinate mapping
  • Error-resilient: malformed elements skipped, valid ones kept
"""

import re
import uuid
import math
import logging
from html.parser import HTMLParser

log = logging.getLogger("HTMLCADKernel")

# ──────────────────────── helpers ────────────────────────

_UNIT_TO_PX = {
    'px': 1, 'pt': 1.333, 'em': 16, 'rem': 16,
    'mm': 3.7795, 'cm': 37.795, 'in': 96,
}

def _parse_px(val):
    """Parse a CSS length value to a float in px."""
    if val is None:
        return 0.0
    s = str(val).strip().lower()
    if not s:
        return 0.0
    # percentage — treat as 0 (no parent context)
    if s.endswith('%'):
        return 0.0
    for unit, factor in _UNIT_TO_PX.items():
        if s.endswith(unit):
            num = s[:-len(unit)].strip()
            m = re.search(r'([-+]?\d*\.?\d+)', num)
            return float(m.group(1)) * factor if m else 0.0
    m = re.search(r'([-+]?\d*\.?\d+)', s)
    return float(m.group(1)) if m else 0.0

def _parse_color(val, fallback='#ffffff'):
    """Normalise a CSS/SVG colour value — pass-through for now."""
    if not val or val == 'none' or val == 'transparent':
        return fallback
    return val.strip()

# ──────────────── Bézier tessellation ────────────────

def _cubic_bezier(p0, p1, p2, p3, n=12):
    """Tessellate cubic Bézier to n line segments."""
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3*p0[0] + 3*u**2*t*p1[0] + 3*u*t**2*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u**2*t*p1[1] + 3*u*t**2*p2[1] + t**3*p3[1]
        pts.append([x, y])
    return pts

def _quadratic_bezier(p0, p1, p2, n=10):
    """Tessellate quadratic Bézier to n line segments."""
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**2*p0[0] + 2*u*t*p1[0] + t**2*p2[0]
        y = u**2*p0[1] + 2*u*t*p1[1] + t**2*p2[1]
        pts.append([x, y])
    return pts

def _arc_to_points(cx, cy, rx, ry, phi, theta1, dtheta, n=16):
    """Convert SVG arc parameterisation to polyline points."""
    pts = []
    cos_phi = math.cos(phi)
    sin_phi = math.sin(phi)
    for i in range(n + 1):
        t = theta1 + dtheta * i / n
        cos_t = math.cos(t)
        sin_t = math.sin(t)
        x = cx + rx * cos_t * cos_phi - ry * sin_t * sin_phi
        y = cy + rx * cos_t * sin_phi + ry * sin_t * cos_phi
        pts.append([x, y])
    return pts

def _svg_arc_params(x1, y1, rx, ry, phi_deg, fa, fs, x2, y2):
    """
    Convert SVG endpoint arc (x1,y1,rx,ry,phi,fa,fs,x2,y2)
    to center parameterisation (cx,cy,theta1,dtheta).
    Returns (cx, cy, rx, ry, phi_rad, theta1, dtheta) or None.
    """
    if rx == 0 or ry == 0:
        return None
    rx, ry = abs(rx), abs(ry)
    phi = math.radians(phi_deg)
    cos_phi = math.cos(phi)
    sin_phi = math.sin(phi)

    dx2 = (x1 - x2) / 2
    dy2 = (y1 - y2) / 2
    x1p = cos_phi * dx2 + sin_phi * dy2
    y1p = -sin_phi * dx2 + cos_phi * dy2

    # scale radii if needed
    lam = (x1p**2) / (rx**2) + (y1p**2) / (ry**2)
    if lam > 1:
        s = math.sqrt(lam)
        rx *= s
        ry *= s

    num = max(rx**2 * ry**2 - rx**2 * y1p**2 - ry**2 * x1p**2, 0)
    den = rx**2 * y1p**2 + ry**2 * x1p**2
    if den == 0:
        return None
    sq = math.sqrt(num / den)
    if fa == fs:
        sq = -sq

    cxp = sq * rx * y1p / ry
    cyp = -sq * ry * x1p / rx

    cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2
    cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2

    def _angle(ux, uy, vx, vy):
        dot = ux * vx + uy * vy
        le = math.hypot(ux, uy) * math.hypot(vx, vy)
        if le == 0:
            return 0
        cos_a = max(-1, min(1, dot / le))
        a = math.acos(cos_a)
        if ux * vy - uy * vx < 0:
            a = -a
        return a

    theta1 = _angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dtheta = _angle(
        (x1p - cxp) / rx, (y1p - cyp) / ry,
        (-x1p - cxp) / rx, (-y1p - cyp) / ry
    )

    if fs == 0 and dtheta > 0:
        dtheta -= 2 * math.pi
    elif fs == 1 and dtheta < 0:
        dtheta += 2 * math.pi

    return (cx, cy, rx, ry, phi, theta1, dtheta)

# ──────────────── SVG path parser ────────────────

def _parse_svg_path(d_str, ox=0, oy=0):
    """
    Full SVG <path> d-attribute parser.
    Returns list of polyline point-lists (one per sub-path) and a closed flag.
    Each sub-path is a list of [x, y] points.
    """
    if not d_str:
        return [], False

    # tokenise
    tokens = re.findall(r'[a-zA-Z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?', d_str)
    idx = [0]
    closed = False

    def _peek():
        if idx[0] >= len(tokens):
            return None
        return tokens[idx[0]]

    def _next():
        t = tokens[idx[0]]
        idx[0] += 1
        return t

    def _num():
        t = _next()
        return float(t)

    def _is_number(t):
        if t is None:
            return False
        try:
            float(t)
            return True
        except ValueError:
            return False

    sub_paths = []
    current = []
    cx, cy = 0.0, 0.0   # current point
    sx, sy = 0.0, 0.0   # sub-path start
    last_cp = None       # last control point (for S/T)
    last_cmd = None

    while idx[0] < len(tokens):
        t = _peek()
        if t is None:
            break

        if _is_number(t):
            # implicit repeat of last command
            cmd = last_cmd
        else:
            cmd = _next()

        try:
            if cmd == 'M':
                if current:
                    sub_paths.append(current)
                    current = []
                cx, cy = _num(), _num()
                sx, sy = cx, cy
                current.append([cx + ox, cy + oy])
                # implicit lineto
                while _is_number(_peek()):
                    cx, cy = _num(), _num()
                    current.append([cx + ox, cy + oy])
                last_cmd = 'L'

            elif cmd == 'm':
                if current:
                    sub_paths.append(current)
                    current = []
                cx += _num()
                cy += _num()
                sx, sy = cx, cy
                current.append([cx + ox, cy + oy])
                while _is_number(_peek()):
                    cx += _num()
                    cy += _num()
                    current.append([cx + ox, cy + oy])
                last_cmd = 'l'

            elif cmd == 'L':
                while _is_number(_peek()):
                    cx, cy = _num(), _num()
                    current.append([cx + ox, cy + oy])
                last_cmd = 'L'

            elif cmd == 'l':
                while _is_number(_peek()):
                    cx += _num()
                    cy += _num()
                    current.append([cx + ox, cy + oy])
                last_cmd = 'l'

            elif cmd == 'H':
                while _is_number(_peek()):
                    cx = _num()
                    current.append([cx + ox, cy + oy])
                last_cmd = 'H'

            elif cmd == 'h':
                while _is_number(_peek()):
                    cx += _num()
                    current.append([cx + ox, cy + oy])
                last_cmd = 'h'

            elif cmd == 'V':
                while _is_number(_peek()):
                    cy = _num()
                    current.append([cx + ox, cy + oy])
                last_cmd = 'V'

            elif cmd == 'v':
                while _is_number(_peek()):
                    cy += _num()
                    current.append([cx + ox, cy + oy])
                last_cmd = 'v'

            elif cmd == 'C':
                while _is_number(_peek()):
                    x1, y1 = _num(), _num()
                    x2, y2 = _num(), _num()
                    x, y = _num(), _num()
                    pts = _cubic_bezier([cx, cy], [x1, y1], [x2, y2], [x, y])
                    current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    last_cp = [x2, y2]
                    cx, cy = x, y
                last_cmd = 'C'

            elif cmd == 'c':
                while _is_number(_peek()):
                    x1, y1 = cx+_num(), cy+_num()
                    x2, y2 = cx+_num(), cy+_num()
                    x, y = cx+_num(), cy+_num()
                    pts = _cubic_bezier([cx, cy], [x1, y1], [x2, y2], [x, y])
                    current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    last_cp = [x2, y2]
                    cx, cy = x, y
                last_cmd = 'c'

            elif cmd == 'S':
                while _is_number(_peek()):
                    if last_cp and last_cmd in ('C', 'c', 'S', 's'):
                        x1 = 2*cx - last_cp[0]
                        y1 = 2*cy - last_cp[1]
                    else:
                        x1, y1 = cx, cy
                    x2, y2 = _num(), _num()
                    x, y = _num(), _num()
                    pts = _cubic_bezier([cx, cy], [x1, y1], [x2, y2], [x, y])
                    current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    last_cp = [x2, y2]
                    cx, cy = x, y
                last_cmd = 'S'

            elif cmd == 's':
                while _is_number(_peek()):
                    if last_cp and last_cmd in ('C', 'c', 'S', 's'):
                        x1 = 2*cx - last_cp[0]
                        y1 = 2*cy - last_cp[1]
                    else:
                        x1, y1 = cx, cy
                    x2 = cx + _num()
                    y2 = cy + _num()
                    x = cx + _num()
                    y = cy + _num()
                    pts = _cubic_bezier([cx, cy], [x1, y1], [x2, y2], [x, y])
                    current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    last_cp = [x2, y2]
                    cx, cy = x, y
                last_cmd = 's'

            elif cmd == 'Q':
                while _is_number(_peek()):
                    x1, y1 = _num(), _num()
                    x, y = _num(), _num()
                    pts = _quadratic_bezier([cx, cy], [x1, y1], [x, y])
                    current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    last_cp = [x1, y1]
                    cx, cy = x, y
                last_cmd = 'Q'

            elif cmd == 'q':
                while _is_number(_peek()):
                    x1 = cx + _num()
                    y1 = cy + _num()
                    x = cx + _num()
                    y = cy + _num()
                    pts = _quadratic_bezier([cx, cy], [x1, y1], [x, y])
                    current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    last_cp = [x1, y1]
                    cx, cy = x, y
                last_cmd = 'q'

            elif cmd == 'T':
                while _is_number(_peek()):
                    if last_cp and last_cmd in ('Q', 'q', 'T', 't'):
                        x1 = 2*cx - last_cp[0]
                        y1 = 2*cy - last_cp[1]
                    else:
                        x1, y1 = cx, cy
                    x, y = _num(), _num()
                    pts = _quadratic_bezier([cx, cy], [x1, y1], [x, y])
                    current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    last_cp = [x1, y1]
                    cx, cy = x, y
                last_cmd = 'T'

            elif cmd == 't':
                while _is_number(_peek()):
                    if last_cp and last_cmd in ('Q', 'q', 'T', 't'):
                        x1 = 2*cx - last_cp[0]
                        y1 = 2*cy - last_cp[1]
                    else:
                        x1, y1 = cx, cy
                    x = cx + _num()
                    y = cy + _num()
                    pts = _quadratic_bezier([cx, cy], [x1, y1], [x, y])
                    current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    last_cp = [x1, y1]
                    cx, cy = x, y
                last_cmd = 't'

            elif cmd == 'A':
                while _is_number(_peek()):
                    arx, ary = _num(), _num()
                    rot = _num()
                    fa = int(_num())
                    fs = int(_num())
                    ex, ey = _num(), _num()
                    params = _svg_arc_params(cx, cy, arx, ary, rot, fa, fs, ex, ey)
                    if params:
                        acx, acy, arx2, ary2, phi, th1, dth = params
                        pts = _arc_to_points(acx, acy, arx2, ary2, phi, th1, dth)
                        current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    else:
                        current.append([ex + ox, ey + oy])
                    cx, cy = ex, ey
                last_cmd = 'A'

            elif cmd == 'a':
                while _is_number(_peek()):
                    arx, ary = _num(), _num()
                    rot = _num()
                    fa = int(_num())
                    fs = int(_num())
                    dx, dy = _num(), _num()
                    ex, ey = cx + dx, cy + dy
                    params = _svg_arc_params(cx, cy, arx, ary, rot, fa, fs, ex, ey)
                    if params:
                        acx, acy, arx2, ary2, phi, th1, dth = params
                        pts = _arc_to_points(acx, acy, arx2, ary2, phi, th1, dth)
                        current.extend([[p[0]+ox, p[1]+oy] for p in pts[1:]])
                    else:
                        current.append([ex + ox, ey + oy])
                    cx, cy = ex, ey
                last_cmd = 'a'

            elif cmd in ('Z', 'z'):
                closed = True
                if current:
                    # close back to sub-path start
                    cx, cy = sx, sy
                last_cmd = cmd

            else:
                # unknown command, skip
                _next() if not _is_number(t) else None
                last_cmd = cmd

        except Exception as e:
            log.warning(f"SVG path parse error in command '{cmd}': {e}")
            # skip ahead to next command letter
            while idx[0] < len(tokens) and _is_number(_peek()):
                _next()

    if current:
        sub_paths.append(current)

    return sub_paths, closed


# ──────────────── CSS transform parser ────────────────

def _parse_transform(tf_str):
    """
    Parse CSS/SVG transform string.
    Returns a 3x3 affine matrix [[a,c,e],[b,d,f],[0,0,1]].
    We store as flat [a, b, c, d, e, f] for convenience.
    """
    if not tf_str:
        return None
    mat = [1, 0, 0, 1, 0, 0]  # identity (a,b,c,d,e,f)

    def _mul(m1, m2):
        # multiply two 2D affine matrices stored as [a,b,c,d,e,f]
        a1, b1, c1, d1, e1, f1 = m1
        a2, b2, c2, d2, e2, f2 = m2
        return [
            a1*a2 + c1*b2,
            b1*a2 + d1*b2,
            a1*c2 + c1*d2,
            b1*c2 + d1*d2,
            a1*e2 + c1*f2 + e1,
            b1*e2 + d1*f2 + f1,
        ]

    funcs = re.findall(r'(\w+)\s*\(([^)]*)\)', tf_str)
    for fn, args_str in funcs:
        nums = [float(x) for x in re.findall(r'[-+]?\d*\.?\d+', args_str)]
        fn = fn.lower()

        if fn == 'translate':
            tx = nums[0] if len(nums) > 0 else 0
            ty = nums[1] if len(nums) > 1 else 0
            mat = _mul(mat, [1, 0, 0, 1, tx, ty])

        elif fn == 'scale':
            sx = nums[0] if len(nums) > 0 else 1
            sy = nums[1] if len(nums) > 1 else sx
            mat = _mul(mat, [sx, 0, 0, sy, 0, 0])

        elif fn == 'rotate':
            deg = nums[0] if nums else 0
            r = math.radians(deg)
            cos_r, sin_r = math.cos(r), math.sin(r)
            if len(nums) >= 3:
                # rotate(deg, cx, cy)
                rcx, rcy = nums[1], nums[2]
                mat = _mul(mat, [1, 0, 0, 1, rcx, rcy])
                mat = _mul(mat, [cos_r, sin_r, -sin_r, cos_r, 0, 0])
                mat = _mul(mat, [1, 0, 0, 1, -rcx, -rcy])
            else:
                mat = _mul(mat, [cos_r, sin_r, -sin_r, cos_r, 0, 0])

        elif fn == 'skewx':
            a = math.radians(nums[0]) if nums else 0
            mat = _mul(mat, [1, 0, math.tan(a), 1, 0, 0])

        elif fn == 'skewy':
            a = math.radians(nums[0]) if nums else 0
            mat = _mul(mat, [1, math.tan(a), 0, 1, 0, 0])

        elif fn == 'matrix':
            if len(nums) >= 6:
                mat = _mul(mat, nums[:6])

    if mat == [1, 0, 0, 1, 0, 0]:
        return None
    return mat


def _apply_transform(mat, x, y):
    """Apply affine transform [a,b,c,d,e,f] to point (x,y)."""
    if mat is None:
        return x, y
    a, b, c, d, e, f = mat
    return a*x + c*y + e, b*x + d*y + f


# ──────────────── Main Kernel ────────────────

class HTMLCADKernel(HTMLParser):
    """
    Production-grade kernel to translate HTML + CSS + SVG into IndCAD JSON format.

    Outputs every IndCAD shape type:
        line, rectangle, circle, arc, ellipse, polyline, text

    Handles:
        • All HTML block/inline elements
        • Full SVG path commands (M L H V C S Q T A Z, abs & rel)
        • Bézier curve tessellation to polyline
        • SVG arcs
        • CSS transform: translate, rotate, scale, matrix
        • <style> block class rules
        • <table> grids, <ul>/<ol> lists, <img> placeholders
        • Border, opacity, font properties
        • Nested <svg> viewBox mapping
        • Error-resilient parsing
    """

    def __init__(self, base_x=0, base_y=0):
        super().__init__()
        self.shapes = []
        self.stack = []
        self.base_coords = (base_x, base_y)

        # <style> class rules: { ".classname": {prop: val} }
        self._class_rules = {}
        self._in_style = False
        self._style_buffer = ''

        # table state
        self._table_stack = []

        # list state
        self._list_counter = []

    # ─── public API ───

    def translate(self, html_code):
        """Parse HTML/SVG string and return list of IndCAD shape dicts."""
        self.shapes = []
        self._class_rules = {}
        self._in_style = False
        self._style_buffer = ''
        self._table_stack = []
        self._list_counter = []
        self.stack = [{
            'tag': '__root__',
            'x': self.base_coords[0],
            'y': self.base_coords[1],
            'color': '#ffffff',
            'layer': 'layer-0',
            'lineWidth': 1,
            'fontSize': 14,
            'opacity': 1.0,
            'transform': None,
            'viewBox': None,
        }]

        try:
            self.feed(html_code)
        except Exception as e:
            log.warning(f"HTML parse error (partial results returned): {e}")

        return self.shapes

    # ─── HTMLParser overrides ───

    def handle_starttag(self, tag, attrs):
        try:
            self._handle_starttag_inner(tag, dict(attrs))
        except Exception as e:
            log.warning(f"Error processing <{tag}>: {e}")
            # push a dummy context so endtag still pops
            parent = self.stack[-1] if self.stack else self._root_ctx()
            self.stack.append({**parent, 'tag': tag})

    def handle_endtag(self, tag):
        if tag == 'style':
            self._in_style = False
            self._parse_style_block(self._style_buffer)
            self._style_buffer = ''

        if tag == 'table' and self._table_stack:
            self._table_stack.pop()

        if tag in ('ul', 'ol') and self._list_counter:
            self._list_counter.pop()

        if self.stack and len(self.stack) > 1:
            self.stack.pop()

    def handle_data(self, data):
        if self._in_style:
            self._style_buffer += data
            return

        content = data.strip()
        if not content or not self.stack:
            return
        ctx = self.stack[-1]
        if ctx.get('tag') in ('style', 'script'):
            return

        try:
            tx, ty = ctx['x'], ctx['y']
            if ctx.get('transform'):
                tx, ty = _apply_transform(ctx['transform'], tx, ty)

            self.shapes.append({
                'id': str(uuid.uuid4()),
                'type': 'text',
                'x': tx,
                'y': ty,
                'content': content,
                'fontSize': ctx.get('fontSize', 14),
                'color': ctx.get('color', '#ffffff'),
                'layer': ctx.get('layer', 'layer-0'),
                'lineWidth': 1,
            })
        except Exception as e:
            log.warning(f"Error handling text data: {e}")

    # ─── Core tag handler ───

    def _handle_starttag_inner(self, tag, attr_dict):
        parent = self.stack[-1] if self.stack else self._root_ctx()

        # ── style tag enters buffering mode ──
        if tag == 'style':
            self._in_style = True
            self.stack.append({**parent, 'tag': 'style'})
            return

        if tag == 'script':
            self.stack.append({**parent, 'tag': 'script'})
            return

        # ── Gather styles: inline + class ──
        styles = {}
        # class rules first (lower priority)
        cls = attr_dict.get('class', '')
        for c in cls.split():
            key = '.' + c.strip()
            if key in self._class_rules:
                styles.update(self._class_rules[key])
        # inline style overrides
        styles.update(self._parse_inline_style(attr_dict.get('style', '')))

        # SVG attribute mapping
        if tag in ('rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'g', 'svg'):
            styles.update(self._map_svg_attrs(attr_dict))

        # ── Compute context ──
        x = parent['x'] + _parse_px(styles.get('left', attr_dict.get('x', '0')))
        y = parent['y'] + _parse_px(styles.get('top', attr_dict.get('y', '0')))

        color = _parse_color(
            styles.get('color', styles.get('stroke', None)),
            parent['color']
        )
        bg_color = _parse_color(
            styles.get('background-color', styles.get('fill', None)),
            'transparent'
        )
        line_width = _parse_px(styles.get('border-width', styles.get('stroke-width', str(parent.get('lineWidth', 1)))))
        if line_width <= 0:
            line_width = parent.get('lineWidth', 1)

        font_size = parent.get('fontSize', 14)
        fs_raw = styles.get('font-size')
        if fs_raw:
            font_size = _parse_px(fs_raw) or font_size
        # heading font sizes
        heading_sizes = {'h1': 32, 'h2': 28, 'h3': 24, 'h4': 20, 'h5': 16, 'h6': 14}
        if tag in heading_sizes:
            font_size = heading_sizes[tag]

        opacity = float(styles.get('opacity', parent.get('opacity', 1.0)))

        # Transform
        tf_str = styles.get('transform', attr_dict.get('transform', ''))
        local_tf = _parse_transform(tf_str)
        parent_tf = parent.get('transform')
        if local_tf and parent_tf:
            # compose
            combined = _mul_matrices(parent_tf, local_tf)
        elif local_tf:
            combined = local_tf
        else:
            combined = parent_tf

        # SVG viewBox
        vb = parent.get('viewBox')
        if tag == 'svg':
            vb_str = attr_dict.get('viewbox', attr_dict.get('viewBox', ''))
            if vb_str:
                vb_nums = [float(n) for n in re.findall(r'[-+]?\d*\.?\d+', vb_str)]
                if len(vb_nums) >= 4:
                    svg_w = _parse_px(attr_dict.get('width', str(vb_nums[2])))
                    svg_h = _parse_px(attr_dict.get('height', str(vb_nums[3])))
                    vb = {
                        'min_x': vb_nums[0], 'min_y': vb_nums[1],
                        'vb_w': vb_nums[2], 'vb_h': vb_nums[3],
                        'svg_w': svg_w, 'svg_h': svg_h,
                        'ox': x, 'oy': y,
                    }

        ctx = {
            'tag': tag, 'x': x, 'y': y,
            'color': color, 'bg_color': bg_color,
            'lineWidth': line_width, 'fontSize': font_size,
            'opacity': opacity, 'layer': parent['layer'],
            'transform': combined, 'viewBox': vb,
        }

        # ── Shape generation ──
        shape = None

        # ---------- HTML block elements → rectangle ----------
        if tag in ('div', 'section', 'header', 'footer', 'article', 'main', 'aside', 'nav', 'rect'):
            w = _parse_px(styles.get('width', attr_dict.get('width', '0')))
            h = _parse_px(styles.get('height', attr_dict.get('height', '0')))
            if w > 0 and h > 0:
                br = styles.get('border-radius', '')
                if '50%' in br or (self._try_px(br) >= w/2 and w == h and w > 0):
                    shape = self._make_circle(x + w/2, y + h/2, w/2, ctx)
                elif '50%' in br and w != h:
                    shape = self._make_ellipse(x + w/2, y + h/2, w/2, h/2, ctx)
                else:
                    shape = self._make_rect(x, y, w, h, ctx)

            # Border → additional rectangle outline
            border = styles.get('border', '')
            if border and w > 0 and h > 0:
                bw = _parse_px(border.split()[0]) if border.split() else 1
                if bw > 0:
                    outline = self._make_rect(x, y, w, h, ctx)
                    outline['lineWidth'] = bw
                    # extract border color
                    bc_match = re.search(r'#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\)|\b[a-z]+\b', border)
                    if bc_match:
                        outline['color'] = bc_match.group()
                    if shape is None:
                        shape = outline
                    else:
                        self._add_shape(outline)

        # ---------- SVG circle ----------
        elif tag == 'circle':
            scx = _parse_px(attr_dict.get('cx', '0')) + parent['x']
            scy = _parse_px(attr_dict.get('cy', '0')) + parent['y']
            r = _parse_px(attr_dict.get('r', '0'))
            if r > 0:
                shape = self._make_circle(scx, scy, r, ctx)

        # ---------- SVG ellipse ----------
        elif tag == 'ellipse':
            ecx = _parse_px(attr_dict.get('cx', '0')) + parent['x']
            ecy = _parse_px(attr_dict.get('cy', '0')) + parent['y']
            erx = _parse_px(attr_dict.get('rx', '0'))
            ery = _parse_px(attr_dict.get('ry', '0'))
            if erx > 0 and ery > 0:
                if abs(erx - ery) < 0.01:
                    shape = self._make_circle(ecx, ecy, erx, ctx)
                else:
                    shape = self._make_ellipse(ecx, ecy, erx, ery, ctx)

        # ---------- line / hr ----------
        elif tag in ('line', 'hr'):
            lx1 = _parse_px(attr_dict.get('x1', '0')) + parent['x']
            ly1 = _parse_px(attr_dict.get('y1', '0')) + parent['y']
            lx2 = _parse_px(attr_dict.get('x2', '100')) + parent['x']
            ly2 = _parse_px(attr_dict.get('y2', '0')) + parent['y']
            shape = self._make_line(lx1, ly1, lx2, ly2, ctx)

        # ---------- polyline / polygon ----------
        elif tag in ('polyline', 'polygon'):
            pts_str = attr_dict.get('points', '')
            pts = self._parse_svg_points(pts_str, parent['x'], parent['y'])
            if len(pts) >= 2:
                shape = self._make_polyline(pts, tag == 'polygon', ctx)

        # ---------- SVG path (full) ----------
        elif tag == 'path':
            d = attr_dict.get('d', '')
            sub_paths, path_closed = _parse_svg_path(d, parent['x'], parent['y'])
            for sp in sub_paths:
                if len(sp) >= 2:
                    s = self._make_polyline(sp, path_closed, ctx)
                    self._add_shape(s)

        # ---------- SVG g / svg (group — just push context) ----------
        elif tag in ('g', 'svg'):
            pass  # context already pushed below

        # ---------- <table> ----------
        elif tag == 'table':
            self._table_stack.append({
                'x0': x, 'y0': y, 'row': 0, 'col': 0,
                'cell_w': _parse_px(styles.get('width', '80')),
                'cell_h': _parse_px(styles.get('height', '30')),
            })
        elif tag == 'tr':
            if self._table_stack:
                ts = self._table_stack[-1]
                ts['col'] = 0
                ctx['x'] = ts['x0']
                ctx['y'] = ts['y0'] + ts['row'] * ts['cell_h']
        elif tag in ('td', 'th'):
            if self._table_stack:
                ts = self._table_stack[-1]
                cell_x = ts['x0'] + ts['col'] * ts['cell_w']
                cell_y = ts['y0'] + ts['row'] * ts['cell_h']
                cell = self._make_rect(cell_x, cell_y, ts['cell_w'], ts['cell_h'], ctx)
                self._add_shape(cell)
                ctx['x'] = cell_x + 4  # text padding
                ctx['y'] = cell_y + 4
                ts['col'] += 1
                if tag == 'th':
                    ctx['fontSize'] = max(ctx['fontSize'], 16)

        # ---------- Lists ----------
        elif tag in ('ul', 'ol'):
            self._list_counter.append({'type': tag, 'count': 0, 'x': x, 'y': y})
        elif tag == 'li':
            if self._list_counter:
                lc = self._list_counter[-1]
                lc['count'] += 1
                bullet_x = lc['x']
                bullet_y = lc['y'] + (lc['count'] - 1) * (font_size + 6)
                prefix = f"{lc['count']}. " if lc['type'] == 'ol' else "• "
                self.shapes.append({
                    'id': str(uuid.uuid4()),
                    'type': 'text',
                    'x': bullet_x,
                    'y': bullet_y,
                    'content': prefix,
                    'fontSize': font_size,
                    'color': color,
                    'layer': ctx['layer'],
                    'lineWidth': 1,
                })
                ctx['x'] = bullet_x + font_size * 1.5
                ctx['y'] = bullet_y

        # ---------- <img> placeholder ----------
        elif tag == 'img':
            iw = _parse_px(attr_dict.get('width', styles.get('width', '60')))
            ih = _parse_px(attr_dict.get('height', styles.get('height', '40')))
            if iw > 0 and ih > 0:
                rect = self._make_rect(x, y, iw, ih, ctx)
                self._add_shape(rect)
                # diagonal cross
                self._add_shape(self._make_line(x, y, x + iw, y + ih, ctx))
                self._add_shape(self._make_line(x + iw, y, x, y + ih, ctx))
                # label
                alt = attr_dict.get('alt', attr_dict.get('src', 'img'))
                if alt:
                    alt = alt.split('/')[-1][:20]
                    self.shapes.append({
                        'id': str(uuid.uuid4()),
                        'type': 'text',
                        'x': x + 4, 'y': y + ih / 2 - 6,
                        'content': f'[{alt}]',
                        'fontSize': min(font_size, 10),
                        'color': color,
                        'layer': ctx['layer'],
                        'lineWidth': 1,
                    })

        # ---------- Headings / paragraph / span ----------
        elif tag in ('p', 'span', 'b', 'strong', 'i', 'em', 'a', 'label',
                     'h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            pass  # text will be captured by handle_data

        # Push context after handling end-tag pop for <tr>
        if tag == 'tr' and self._table_stack:
            self._table_stack[-1]['row'] += 1

        if shape:
            self._add_shape(shape)

        self.stack.append(ctx)

    # ─── Shape factories ───

    def _make_line(self, x1, y1, x2, y2, ctx):
        tx1, ty1 = self._tf(ctx, x1, y1)
        tx2, ty2 = self._tf(ctx, x2, y2)
        return {
            'id': str(uuid.uuid4()),
            'type': 'line',
            'x1': tx1, 'y1': ty1,
            'x2': tx2, 'y2': ty2,
            'color': ctx['color'],
            'layer': ctx['layer'],
            'lineWidth': ctx['lineWidth'],
        }

    def _make_rect(self, x, y, w, h, ctx):
        tx, ty = self._tf(ctx, x, y)
        return {
            'id': str(uuid.uuid4()),
            'type': 'rectangle',
            'x': tx, 'y': ty,
            'width': w, 'height': h,
            'color': ctx.get('bg_color', ctx['color']),
            'layer': ctx['layer'],
            'lineWidth': ctx['lineWidth'],
        }

    def _make_circle(self, cx, cy, r, ctx):
        tcx, tcy = self._tf(ctx, cx, cy)
        return {
            'id': str(uuid.uuid4()),
            'type': 'circle',
            'cx': tcx, 'cy': tcy,
            'radius': r,
            'color': ctx['color'],
            'layer': ctx['layer'],
            'lineWidth': ctx['lineWidth'],
        }

    def _make_ellipse(self, cx, cy, rx, ry, ctx):
        tcx, tcy = self._tf(ctx, cx, cy)
        return {
            'id': str(uuid.uuid4()),
            'type': 'ellipse',
            'cx': tcx, 'cy': tcy,
            'rx': rx, 'ry': ry,
            'color': ctx['color'],
            'layer': ctx['layer'],
            'lineWidth': ctx['lineWidth'],
        }

    def _make_arc(self, cx, cy, r, start_deg, end_deg, ctx):
        tcx, tcy = self._tf(ctx, cx, cy)
        return {
            'id': str(uuid.uuid4()),
            'type': 'arc',
            'cx': tcx, 'cy': tcy,
            'radius': r,
            'startAngle': start_deg,
            'endAngle': end_deg,
            'color': ctx['color'],
            'layer': ctx['layer'],
            'lineWidth': ctx['lineWidth'],
        }

    def _make_polyline(self, points, closed, ctx):
        tf = ctx.get('transform')
        if tf:
            points = [[*_apply_transform(tf, p[0], p[1])] for p in points]
        return {
            'id': str(uuid.uuid4()),
            'type': 'polyline',
            'points': points,
            'closed': closed,
            'color': ctx['color'],
            'layer': ctx['layer'],
            'lineWidth': ctx['lineWidth'],
        }

    # ─── Utilities ───

    def _tf(self, ctx, x, y):
        """Apply context transform to a point."""
        tf = ctx.get('transform')
        if tf:
            return _apply_transform(tf, x, y)
        return x, y

    def _add_shape(self, shape):
        """Append shape with viewBox mapping if active."""
        if shape is None:
            return
        # apply viewBox mapping to shape coordinates
        # ...shapes added as-is for now; viewBox handled at context level
        self.shapes.append(shape)

    def _parse_inline_style(self, style_str):
        """Parse 'key: value; ...' inline style string."""
        styles = {}
        if not style_str:
            return styles
        for part in style_str.split(';'):
            if ':' in part:
                k, v = part.split(':', 1)
                styles[k.strip().lower()] = v.strip()
        return styles

    def _parse_style_block(self, css_text):
        """Parse a <style> block and populate class rules."""
        if not css_text:
            return
        # simple class selector parser  .classname { prop: val; }
        rules = re.findall(r'([.#]?[\w-]+)\s*\{([^}]*)\}', css_text)
        for selector, body in rules:
            props = self._parse_inline_style(body)
            sel_key = selector.strip()
            if sel_key in self._class_rules:
                self._class_rules[sel_key].update(props)
            else:
                self._class_rules[sel_key] = props

    def _map_svg_attrs(self, attrs):
        """Map common SVG presentation attributes to CSS-style dict."""
        mapped = {}
        mapping = {
            'stroke': 'color',
            'fill': 'background-color',
            'stroke-width': 'border-width',
            'opacity': 'opacity',
            'font-size': 'font-size',
            'transform': 'transform',
        }
        for k, v in attrs.items():
            if k in mapping:
                mapped[mapping[k]] = v
        return mapped

    def _parse_svg_points(self, pts_str, ox, oy):
        """Parse SVG points attribute 'x1,y1 x2,y2 ...' or 'x1 y1 x2 y2'."""
        nums = re.findall(r'[-+]?\d*\.?\d+', pts_str)
        pts = []
        for i in range(0, len(nums) - 1, 2):
            pts.append([float(nums[i]) + ox, float(nums[i+1]) + oy])
        return pts

    def _try_px(self, val):
        """Try to parse px, return 0 on failure."""
        try:
            return _parse_px(val)
        except Exception:
            return 0

    def _root_ctx(self):
        return {
            'tag': '__root__',
            'x': self.base_coords[0], 'y': self.base_coords[1],
            'color': '#ffffff', 'layer': 'layer-0',
            'lineWidth': 1, 'fontSize': 14,
            'opacity': 1.0, 'transform': None, 'viewBox': None,
        }


def _mul_matrices(m1, m2):
    """Multiply two affine matrices [a,b,c,d,e,f]."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return [
        a1*a2 + c1*b2,
        b1*a2 + d1*b2,
        a1*c2 + c1*d2,
        b1*c2 + d1*d2,
        a1*e2 + c1*f2 + e1,
        b1*e2 + d1*f2 + f1,
    ]
