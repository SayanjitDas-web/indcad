"""
IndCAD CAD Designer Agent
Unified AI + HTML Kernel pipeline for intelligent CAD shape generation.

The agent can generate designs through two strategies:
  1. JSON Mode  — AI outputs IndCAD JSON shapes directly (existing behaviour)
  2. HTML Mode  — AI outputs HTML/SVG markup → HTMLCADKernel converts to shapes

HTML mode unlocks the full power of SVG (bézier curves, arcs, complex paths)
which is much harder to represent in raw JSON.
"""

import json
import uuid
import logging

from html_cad_kernel import HTMLCADKernel

log = logging.getLogger("CADDesignerAgent")


# ────────── System prompt addendum for HTML/SVG generation ──────────

HTML_DESIGN_PROMPT = """

ADVANCED DRAWING MODE — HTML/SVG Output:
In addition to the JSON "draw" array, you may also output an SVG code block
when the design benefits from curves, arcs, complex paths, or precise geometry.

To use SVG mode, output a fenced code block like this:

```svg
<svg viewBox="0 0 500 500">
  <!-- your design here -->
</svg>
```

SVG Guidelines:
- Use <line>, <rect>, <circle>, <ellipse>, <polyline>, <polygon>, <path> elements.
- Use the full SVG <path> d-attribute: M, L, H, V, C (cubic bézier), Q (quadratic),
  S (smooth cubic), T (smooth quad), A (arc), Z (close). Both absolute and relative.
- Set stroke, fill, stroke-width attributes for styling.
- You may use <g transform="..."> for grouping and transforms.
- Coordinates should be centered around 0,0 unless context suggests otherwise.
- The SVG will be automatically parsed into IndCAD shapes.

When to use SVG vs JSON:
- Use SVG for: curved shapes, complex outlines, architectural details, mechanical parts,
  flowcharts, detailed floor plans, schematics with smooth lines
- Use JSON for: simple rectangles, circles, straight lines, text labels

You can mix both in one response: provide text advice, a JSON "draw" block for simple
shapes, AND an SVG block for complex geometry.

ALL IndCAD Shape Types You Can Create:
- line:      x1, y1, x2, y2, color, layer, lineWidth
- rectangle: x, y, width, height, color, layer, lineWidth
- circle:    cx, cy, radius, color, layer, lineWidth
- arc:       cx, cy, radius, startAngle, endAngle, color, layer, lineWidth
- ellipse:   cx, cy, rx, ry, color, layer, lineWidth
- polyline:  points (array of [x,y]), closed (bool), color, layer, lineWidth
- text:      x, y, content, fontSize, color, layer
"""


class CADDesignerAgent:
    """
    Intelligent CAD design agent that combines AI generation with the
    HTMLCADKernel for converting HTML/SVG output into IndCAD shapes.
    """

    def __init__(self, ai_assistant):
        """
        Args:
            ai_assistant: An instance of AiAssistant from ai_assistant.py
        """
        self.ai = ai_assistant
        self.kernel = HTMLCADKernel()

    def get_html_prompt_addendum(self):
        """Return the system prompt addendum for HTML/SVG generation."""
        return HTML_DESIGN_PROMPT

    def design(self, prompt, context, x=0, y=0):
        """
        Full design pipeline:
          1. Send prompt to AI (with enhanced system prompt)
          2. Parse response for both JSON shapes AND SVG blocks
          3. Convert SVG blocks through HTMLCADKernel
          4. Validate and return unified shape list

        Returns dict: { 'text': str, 'draw': [shape_dicts] }
        """
        # Get AI response (the system prompt is now enhanced in ai_assistant)
        result = self.ai.get_chat_response(prompt, context)

        if isinstance(result, str):
            result = {'text': result, 'draw': []}
        elif not isinstance(result, dict):
            result = {'text': str(result), 'draw': []}

        # Extract SVG blocks from the text and convert via kernel
        raw_text = result.get('text', '')
        svg_shapes = self._extract_and_convert_svg(raw_text, x, y)

        # Merge SVG shapes with any JSON-drawn shapes
        all_shapes = list(result.get('draw', []))
        all_shapes.extend(svg_shapes)

        # Validate all shapes
        validated = []
        for s in all_shapes:
            v = self._validate_shape(s, context)
            if v:
                validated.append(v)

        # Clean the text of SVG code blocks for display
        clean_text = self._clean_display_text(raw_text)
        result['text'] = clean_text
        result['draw'] = validated

        return result

    def design_from_html(self, html_code, x=0, y=0, context=None):
        """
        Direct HTML/SVG → IndCAD shapes conversion with validation.

        Args:
            html_code: HTML/SVG string to convert
            x, y: base position offset
            context: optional project context for defaults

        Returns list of validated shape dicts.
        """
        self.kernel = HTMLCADKernel(base_x=float(x), base_y=float(y))
        try:
            raw_shapes = self.kernel.translate(html_code)
        except Exception as e:
            log.error(f"Kernel translation failed: {e}")
            return []

        validated = []
        for s in raw_shapes:
            v = self._validate_shape(s, context)
            if v:
                validated.append(v)

        return validated

    def _extract_and_convert_svg(self, text, x=0, y=0):
        """
        Find ```svg ... ``` or ```html ... ``` or raw <svg>...</svg> blocks
        in AI response text, convert each through the kernel.
        """
        shapes = []

        import re

        # Fenced code blocks: ```svg ... ``` or ```html ... ```
        fenced = re.findall(r'```(?:svg|html)\s*\n(.*?)```', text, re.DOTALL | re.IGNORECASE)
        for block in fenced:
            try:
                kernel = HTMLCADKernel(base_x=float(x), base_y=float(y))
                block_shapes = kernel.translate(block)
                shapes.extend(block_shapes)
            except Exception as e:
                log.warning(f"SVG block conversion failed: {e}")

        # Inline <svg>...</svg> not inside fenced blocks
        if not fenced:
            inline_svgs = re.findall(r'(<svg[^>]*>.*?</svg>)', text, re.DOTALL | re.IGNORECASE)
            for svg in inline_svgs:
                try:
                    kernel = HTMLCADKernel(base_x=float(x), base_y=float(y))
                    block_shapes = kernel.translate(svg)
                    shapes.extend(block_shapes)
                except Exception as e:
                    log.warning(f"Inline SVG conversion failed: {e}")

        return shapes

    def _validate_shape(self, shape, context=None):
        """
        Validate and normalise a shape dict, ensuring it has all required fields.
        Returns the shape or None if invalid.
        """
        if not isinstance(shape, dict):
            return None

        stype = shape.get('type', '').lower()
        if not stype:
            return None

        # Ensure ID
        if 'id' not in shape:
            shape['id'] = str(uuid.uuid4())

        # Defaults from context
        default_color = '#ffffff'
        default_layer = 'layer-0'
        if context:
            default_color = context.get('activeLayerColor', default_color)
            default_layer = context.get('activeLayer', default_layer)

        shape['color'] = shape.get('color', default_color)
        shape['layer'] = shape.get('layer', default_layer)
        shape['lineWidth'] = shape.get('lineWidth', 1)

        # Type-specific validation
        if stype == 'line':
            for k in ('x1', 'y1', 'x2', 'y2'):
                if k not in shape:
                    shape[k] = 0
                shape[k] = float(shape[k])

        elif stype == 'rectangle':
            for k in ('x', 'y'):
                shape[k] = float(shape.get(k, 0))
            shape['width'] = max(float(shape.get('width', 10)), 0.1)
            shape['height'] = max(float(shape.get('height', 10)), 0.1)

        elif stype == 'circle':
            # handle AI "center": [x, y] format
            center = shape.get('center')
            if isinstance(center, list) and len(center) >= 2:
                shape['cx'] = float(center[0])
                shape['cy'] = float(center[1])
                del shape['center']
            else:
                shape['cx'] = float(shape.get('cx', shape.get('x', 0)))
                shape['cy'] = float(shape.get('cy', shape.get('y', 0)))
            shape['radius'] = max(float(shape.get('radius', 5)), 0.1)
            # clean up alternative keys
            for k in ('x', 'y', 'center'):
                shape.pop(k, None)

        elif stype == 'arc':
            center = shape.get('center')
            if isinstance(center, list) and len(center) >= 2:
                shape['cx'] = float(center[0])
                shape['cy'] = float(center[1])
                del shape['center']
            else:
                shape['cx'] = float(shape.get('cx', shape.get('x', 0)))
                shape['cy'] = float(shape.get('cy', shape.get('y', 0)))
            shape['radius'] = max(float(shape.get('radius', 5)), 0.1)
            shape['startAngle'] = float(shape.get('startAngle', 0))
            shape['endAngle'] = float(shape.get('endAngle', 90))
            for k in ('x', 'y', 'center'):
                shape.pop(k, None)

        elif stype == 'ellipse':
            center = shape.get('center')
            if isinstance(center, list) and len(center) >= 2:
                shape['cx'] = float(center[0])
                shape['cy'] = float(center[1])
                del shape['center']
            else:
                shape['cx'] = float(shape.get('cx', shape.get('x', 0)))
                shape['cy'] = float(shape.get('cy', shape.get('y', 0)))
            shape['rx'] = max(float(shape.get('rx', 10)), 0.1)
            shape['ry'] = max(float(shape.get('ry', 10)), 0.1)
            for k in ('x', 'y', 'center'):
                shape.pop(k, None)

        elif stype == 'polyline':
            pts = shape.get('points', [])
            if not isinstance(pts, list) or len(pts) < 2:
                return None
            # ensure points are [float, float]
            validated_pts = []
            for p in pts:
                if isinstance(p, (list, tuple)) and len(p) >= 2:
                    validated_pts.append([float(p[0]), float(p[1])])
            if len(validated_pts) < 2:
                return None
            shape['points'] = validated_pts
            shape['closed'] = bool(shape.get('closed', False))

        elif stype == 'text':
            shape['x'] = float(shape.get('x', 0))
            shape['y'] = float(shape.get('y', 0))
            shape['content'] = str(shape.get('content', ''))
            shape['fontSize'] = float(shape.get('fontSize', 14))
            if not shape['content']:
                return None

        else:
            # Unknown shape type — skip
            return None

        shape['type'] = stype
        return shape

    def _clean_display_text(self, text):
        """Remove SVG/HTML/JSON code blocks from text for chat display."""
        import re
        # Remove fenced SVG/HTML blocks
        text = re.sub(r'```(?:svg|html)\s*\n.*?```', '', text, flags=re.DOTALL | re.IGNORECASE)
        # Remove fenced JSON blocks
        text = re.sub(r'```json\s*\n.*?```', '', text, flags=re.DOTALL | re.IGNORECASE)
        # Remove inline SVG
        text = re.sub(r'<svg[^>]*>.*?</svg>', '', text, flags=re.DOTALL | re.IGNORECASE)
        # Clean up excess whitespace
        return re.sub(r'\n{3,}', '\n\n', text).strip()
