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

            # 0. Set Units
            settings = project_data.get('settings', {})
            units_str = settings.get('units', 'millimeters').lower()
            insunits = self._map_units(units_str)
            self.doc.header['$INSUNITS'] = insunits

            # 1. Map Layers
            layers = project_data.get('layers', [])
            self.layer_map = {} # ID -> Name
            for layer in layers:
                name = layer.get('name', '0').strip().replace(' ', '_')
                lid = layer.get('id', '0')
                color_hex = layer.get('color', '#ffffff')
                aci = self._hex_to_aci(color_hex)
                
                if not name: name = lid
                self.layer_map[lid] = name

                if name not in self.doc.layers:
                    self.doc.layers.new(name=name, dxfattribs={'color': aci})

            # 2. Map Blocks (Definitions)
            blocks = project_data.get('blocks', {})
            for name, block_shapes in blocks.items():
                safe_name = name.replace(' ', '_')
                if safe_name not in self.doc.blocks:
                    dxf_block = self.doc.blocks.new(name=safe_name)
                    # Blocks in IndCAD are relative to [0,0] typically,
                    # but check if they have a base_point.
                    # Currently IndCAD blocks are just lists of shapes.
                    for s in block_shapes:
                        self._add_shape_to_container(dxf_block, s)

            # 3. Map Project Shapes
            shapes = project_data.get('shapes', [])
            for shape in shapes:
                if shape.get('_hidden'):
                    continue
                self._add_shape_to_container(self.msp, shape)

            # 4. Save
            self.doc.saveas(output_path)
            return True
        except Exception as e:
            import traceback
            print(f"DXF Export Error: {e}")
            traceback.print_exc()
            return False

    def _map_units(self, units_str):
        """Map IndCAD units string to DXF $INSUNITS values."""
        mapping = {
            'inches': 1,
            'feet': 2,
            'millimeters': 4,
            'centimeters': 5,
            'meters': 6,
            'kilometers': 7,
            'yards': 10,
            'miles': 11
        }
        return mapping.get(units_str, 0) # 0 = Unspecified

    def _add_shape_to_container(self, container, shape):
        """Map individual IndCAD shapes to DXF entities in a container (MSP or Block)."""
        stype = shape.get('type')
        lid = shape.get('layer', 'layer-0')
        dxf_layer = self.layer_map.get(lid, '0')
        
        color_hex = shape.get('color', '#ffffff')
        aci = self._hex_to_aci(color_hex)
        attribs = {'layer': dxf_layer, 'color': aci}

        try:
            if stype == 'line':
                container.add_line((shape['x1'], -shape['y1']), (shape['x2'], -shape['y2']), dxfattribs=attribs)
            
            elif stype == 'rectangle':
                x, y = shape['x'], shape['y']
                w, h = shape['width'], shape['height']
                # Correctly orient rectangle points for Y-up
                points = [(x, -y), (x + w, -y), (x + w, -(y + h)), (x, -(y + h))]
                container.add_lwpolyline(points, close=True, dxfattribs=attribs)
            
            elif stype == 'polyline':
                points = shape.get('points', [])
                if points:
                    dxf_points = [(p[0], -p[1]) for p in points]
                    container.add_lwpolyline(dxf_points, close=shape.get('closed', False), dxfattribs=attribs)
            
            elif stype == 'circle':
                container.add_circle((shape['cx'], -shape['cy']), shape['radius'], dxfattribs=attribs)
            
            elif stype == 'arc':
                # Negate and swap angles for Y-flip
                sa = -shape['endAngle']
                ea = -shape['startAngle']
                container.add_arc(
                    (shape['cx'], -shape['cy']), 
                    shape['radius'], 
                    sa, 
                    ea, 
                    dxfattribs=attribs
                )
            
            elif stype == 'ellipse':
                rx, ry = shape['rx'], shape['ry']
                ratio = ry / rx if rx != 0 else 1
                rotation = -shape.get('rotation', 0)
                # major axis vector
                rad = math.radians(rotation)
                major_axis = (rx * math.cos(rad), rx * math.sin(rad))
                container.add_ellipse(
                    (shape['cx'], -shape['cy']), 
                    major_axis=major_axis, 
                    ratio=ratio, 
                    dxfattribs=attribs
                )
            
            elif stype == 'text':
                content = shape.get('content', '')
                t = container.add_text(
                    content, 
                    dxfattribs={
                        'insert': (shape['x'], -shape['y']),
                        'height': shape.get('fontSize', 12),
                        'layer': dxf_layer,
                        'color': aci,
                        'rotation': -shape.get('rotation', 0)
                    }
                )
            
            elif stype == 'block_reference':
                block_name = shape.get('blockName', '').replace(' ', '_')
                if block_name in self.doc.blocks:
                    scale = shape.get('scale', 1.0)
                    container.add_blockref(
                        block_name, 
                        insert=(shape['x'], -shape['y']),
                        dxfattribs={
                            'xscale': scale,
                            'yscale': scale,
                            'rotation': -shape.get('rotation', 0),
                            'layer': dxf_layer,
                            'color': aci
                        }
                    )
            
            elif stype == 'dimension':
                x1, y1 = shape.get('x1', 0), shape.get('y1', 0)
                x2, y2 = shape.get('x2', 0), shape.get('y2', 0)
                container.add_aligned_dim(
                    p1=(x1, -y1),
                    p2=(x2, -y2),
                    distance=20,
                    dxfattribs=attribs
                ).render()

        except Exception as e:
            print(f"Skipping shape {stype} due to error: {e}")

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
