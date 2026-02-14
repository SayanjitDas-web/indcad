import re
import uuid
from html.parser import HTMLParser

class HTMLCADKernel(HTMLParser):
    """
    Robust kernel to translate HTML + Inline CSS + SVG into IndCAD JSON format.
    """
    def __init__(self, base_x=0, base_y=0):
        super().__init__()
        self.shapes = []
        self.stack = []  # Current transformation context (x, y, layer, color)
        self.base_coords = (base_x, base_y)
        self.current_offset = {'x': base_x, 'y': base_y}
        
    def translate(self, html_code):
        self.shapes = []
        self.stack = [{'x': self.base_coords[0], 'y': self.base_coords[1], 'color': '#ffffff', 'layer': 'layer-0'}]
        self.feed(html_code)
        return self.shapes

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        style_str = attr_dict.get('style', '')
        styles = self._parse_style(style_str)
        
        # Merge SVG attributes as styles if applicable
        if tag in ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']:
            styles.update(self._map_svg_attrs(attr_dict))

        # Calculate positioning
        parent = self.stack[-1]
        x = parent['x'] + self._parse_px(styles.get('left', '0')) + self._parse_px(attr_dict.get('x', '0'))
        y = parent['y'] + self._parse_px(styles.get('top', '0')) + self._parse_px(attr_dict.get('y', '0'))
        
        # Color & Stroke
        color = styles.get('color', styles.get('stroke', parent['color']))
        bg_color = styles.get('background-color', styles.get('fill', 'transparent'))
        line_width = self._parse_px(styles.get('border-width', styles.get('stroke-width', '1')))
        
        ctx = {
            'tag': tag,
            'x': x,
            'y': y,
            'color': color,
            'bg_color': bg_color,
            'lineWidth': line_width,
            'layer': parent['layer']
        }
        
        # Shape Mapping
        shape = None
        if tag in ['div', 'section', 'header', 'rect']:
            w = self._parse_px(styles.get('width', attr_dict.get('width', '50')))
            h = self._parse_px(styles.get('height', attr_dict.get('height', '50')))
            
            # Check for circle/ellipse via border-radius
            br = styles.get('border-radius', '')
            if '50%' in br or (self._parse_px(br) >= w/2 and w == h):
                shape = {
                    'type': 'circle',
                    'cx': x + w/2,
                    'cy': y + h/2,
                    'radius': w/2
                }
            elif '50%' in br:
                shape = {
                    'type': 'ellipse',
                    'cx': x + w/2,
                    'cy': y + h/2,
                    'rx': w/2,
                    'ry': h/2
                }
            else:
                shape = {
                    'type': 'rectangle',
                    'x': x,
                    'y': y,
                    'width': w,
                    'height': h
                }
        
        elif tag == 'circle':
            cx = self._parse_px(attr_dict.get('cx', '0')) + parent['x']
            cy = self._parse_px(attr_dict.get('cy', '0')) + parent['y']
            r = self._parse_px(attr_dict.get('r', '0'))
            shape = {'type': 'circle', 'cx': cx, 'cy': cy, 'radius': r}
            
        elif tag == 'ellipse':
            cx = self._parse_px(attr_dict.get('cx', '0')) + parent['x']
            cy = self._parse_px(attr_dict.get('cy', '0')) + parent['y']
            rx = self._parse_px(attr_dict.get('rx', '0'))
            ry = self._parse_px(attr_dict.get('ry', '0'))
            shape = {'type': 'ellipse', 'cx': cx, 'cy': cy, 'rx': rx, 'ry': ry}

        elif tag in ['line', 'hr']:
            x1 = self._parse_px(attr_dict.get('x1', '0')) + parent['x']
            y1 = self._parse_px(attr_dict.get('y1', '0')) + parent['y']
            x2 = self._parse_px(attr_dict.get('x2', '100')) + parent['x']
            y2 = self._parse_px(attr_dict.get('y2', '0')) + parent['y']
            shape = {'type': 'line', 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2}

        elif tag in ['polyline', 'polygon']:
            pts_str = attr_dict.get('points', '')
            pts = self._parse_svg_points(pts_str, parent['x'], parent['y'])
            if pts:
                shape = {'type': 'polyline', 'points': pts, 'closed': tag == 'polygon'}

        elif tag == 'path':
            d = attr_dict.get('d', '')
            pts = self._parse_svg_path(d, parent['x'], parent['y'])
            if pts:
                shape = {'type': 'polyline', 'points': pts, 'closed': 'z' in d.lower()}

        if shape:
            shape['id'] = str(uuid.uuid4())
            shape['color'] = color
            shape['layer'] = ctx['layer']
            shape['lineWidth'] = line_width
            self.shapes.append(shape)

        self.stack.append(ctx)

    def handle_endtag(self, tag):
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        content = data.strip()
        if content and self.stack:
            ctx = self.stack[-1]
            if ctx['tag'] not in ['style', 'script', 'svg']:
                fs = self._parse_px(self.stack[-1].get('font-size', '12'))
                self.shapes.append({
                    'id': str(uuid.uuid4()),
                    'type': 'text',
                    'x': ctx['x'],
                    'y': ctx['y'],
                    'content': content,
                    'fontSize': fs,
                    'color': ctx['color'],
                    'layer': ctx['layer']
                })

    def _parse_style(self, style_str):
        styles = {}
        if not style_str: return styles
        parts = style_str.split(';')
        for p in parts:
            if ':' in p:
                k, v = p.split(':', 1)
                styles[k.strip().lower()] = v.strip()
        return styles

    def _map_svg_attrs(self, attrs):
        mapped = {}
        for k, v in attrs.items():
            if k in ['stroke', 'fill', 'stroke-width']:
                key = 'color' if k == 'stroke' else ('background-color' if k == 'fill' else 'border-width')
                mapped[key] = v
        return mapped

    def _parse_px(self, val):
        if not val: return 0.0
        match = re.search(r'([-+]?\d*\.?\d+)', str(val))
        return float(match.group(1)) if match else 0.0

    def _parse_svg_points(self, pts_str, ox, oy):
        # Parses "x1,y1 x2,y2 ..." or "x1 y1 x2 y2"
        nums = re.findall(r'([-+]?\d*\.?\d+)', pts_str)
        pts = []
        for i in range(0, len(nums) - 1, 2):
            pts.append([float(nums[i]) + ox, float(nums[i+1]) + oy])
        return pts

    def _parse_svg_path(self, d_str, ox, oy):
        """Simple path parser - handles M, L commands. High-level approximation."""
        commands = re.findall(r'([a-df-z][^a-df-z]*)', d_str, re.I)
        pts = []
        cx, cy = 0, 0
        for cmd in commands:
            type = cmd[0]
            nums = re.findall(r'([-+]?\d*\.?\d+)', cmd)
            if type.upper() == 'M' or type.upper() == 'L':
                for i in range(0, len(nums) - 1, 2):
                    cx, cy = float(nums[i]), float(nums[i+1])
                    pts.append([cx + ox, cy + oy])
        return pts
