"""
IndCAD DXF Exporter
Converts internal project JSON data to CAD-standard DXF format.
"""
import ezdxf
import math

class DXFExporter:
    """Handles conversion from IndCAD JSON format to DXF."""

    def __init__(self):
        self.doc = None
        self.msp = None

    def export(self, project_data, output_path):
        """Main entry point to export project data to a DXF file."""
        try:
            # Create a new DXF document (R2010 is widely compatible)
            self.doc = ezdxf.new('R2010')
            self.msp = self.doc.modelspace()

            # 1. Map Layers
            layers = project_data.get('layers', [])
            for layer in layers:
                name = layer.get('name', '0').replace(' ', '_')
                color_hex = layer.get('color', '#ffffff')
                aci = self._hex_to_aci(color_hex)
                
                if name not in self.doc.layers:
                    self.doc.layers.new(name=name, dxfattribs={'color': aci})

            # 2. Map Shapes
            shapes = project_data.get('shapes', [])
            for shape in shapes:
                if shape.get('_hidden'):
                    continue
                self._add_shape_to_dxf(shape)

            # 3. Save
            self.doc.saveas(output_path)
            return True
        except Exception as e:
            print(f"DXF Export Error: {e}")
            return False

    def _add_shape_to_dxf(self, shape):
        """Map individual IndCAD shapes to DXF entities."""
        stype = shape.get('type')
        layer_name = shape.get('layer_name', '0').replace(' ', '_') # Fallback to 0
        
        # Determine layer
        # If the shape has a 'layer' ID, we should ideally look up the name, 
        # but for now we'll assume the layer name is passed or use a default.
        # In our system, shapes have 'layer' (ID).
        dxf_layer = layer_name
        
        color_hex = shape.get('color', '#ffffff')
        aci = self._hex_to_aci(color_hex)
        attribs = {'layer': dxf_layer, 'color': aci}

        try:
            if stype == 'line':
                self.msp.add_line((shape['x1'], shape['y1']), (shape['x2'], shape['y2']), dxfattribs=attribs)
            
            elif stype == 'rectangle':
                x, y = shape['x'], shape['y']
                w, h = shape['width'], shape['height']
                points = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
                self.msp.add_lwpolyline(points, close=True, dxfattribs=attribs)
            
            elif stype == 'polyline':
                points = shape.get('points', [])
                if points:
                    self.msp.add_lwpolyline(points, close=shape.get('closed', False), dxfattribs=attribs)
            
            elif stype == 'circle':
                self.msp.add_circle((shape['cx'], shape['cy']), shape['radius'], dxfattribs=attribs)
            
            elif stype == 'arc':
                # ezdxf uses degrees for angles
                self.msp.add_arc(
                    (shape['cx'], shape['cy']), 
                    shape['radius'], 
                    shape['startAngle'], 
                    shape['endAngle'], 
                    dxfattribs=attribs
                )
            
            elif stype == 'ellipse':
                # IndCAD ellipse is cx, cy, rx, ry. 
                # DXF Ellipse uses center, major_axis (vector), and ratio.
                # Assuming no rotation for now (major axis is rx along X)
                rx, ry = shape['rx'], shape['ry']
                ratio = ry / rx if rx != 0 else 1
                self.msp.add_ellipse(
                    (shape['cx'], shape['cy']), 
                    major_axis=(rx, 0), 
                    ratio=ratio, 
                    dxfattribs=attribs
                )
            
            elif stype == 'text':
                text = self.msp.add_text(
                    shape.get('content', ''), 
                    dxfattribs={
                        'insert': (shape['x'], shape['y']),
                        'height': shape.get('fontSize', 12),
                        'layer': dxf_layer,
                        'color': aci
                    }
                )
            
            elif stype == 'dimension':
                # Simplified: dimensions are complex in DXF, export as lines and text for stability
                # Or use AlignedDimension if rx1/ry1/rx2/ry2 exist
                x1, y1 = shape.get('x1', 0), shape.get('y1', 0)
                x2, y2 = shape.get('x2', 0), shape.get('y2', 0)
                # Aligned dimension
                self.msp.add_aligned_dim(
                    p1=(x1, y1),
                    p2=(x2, y2),
                    distance=20, # Offset from line
                    dxfattribs=attribs
                ).render()

        except KeyError as e:
            print(f"Skipping shape due to missing data: {e}")

    def _hex_to_aci(self, hex_color):
        """
        Approximate conversion from Hex color to AutoCAD Color Index (ACI).
        This is a simplified version.
        """
        if not hex_color or not hex_color.startswith('#'):
            return 7 # Default White/Black

        hex_color = hex_color.lstrip('#').lower()
        if len(hex_color) == 3:
            hex_color = ''.join([c*2 for c in hex_color])
        
        try:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
        except ValueError:
            return 7

        # Common ACI colors
        aci_map = [
            (255, 0, 0, 1),     # Red
            (255, 255, 0, 2),   # Yellow
            (0, 255, 0, 3),     # Green
            (0, 255, 255, 4),   # Cyan
            (0, 0, 255, 5),     # Blue
            (255, 0, 255, 6),   # Magenta
            (255, 255, 255, 7), # White
            (128, 128, 128, 8), # Dark Grey
            (192, 192, 192, 9)  # Light Grey
        ]

        def dist(c1, c2):
            return (c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2

        closest_aci = 7
        min_dist = float('inf')
        for rc, gc, bc, aci in aci_map:
            d = dist((r, g, b), (rc, gc, bc))
            if d < min_dist:
                min_dist = d
                closest_aci = aci
        
        return closest_aci
