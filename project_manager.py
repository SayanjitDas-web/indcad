"""
IndCAD Project Manager
Handles project state, undo/redo, and serialization.
"""
import json
import copy
import uuid


class Command:
    """Base command for undo/redo."""
    def execute(self, project):
        raise NotImplementedError

    def undo(self, project):
        raise NotImplementedError


class AddShapeCommand(Command):
    def __init__(self, shape_data):
        self.shape_data = shape_data

    def execute(self, project):
        project['shapes'].append(self.shape_data)

    def undo(self, project):
        project['shapes'] = [s for s in project['shapes'] if s['id'] != self.shape_data['id']]


class DeleteShapeCommand(Command):
    def __init__(self, shape_id):
        self.shape_id = shape_id
        self.shape_data = None
        self.index = -1

    def execute(self, project):
        for i, s in enumerate(project['shapes']):
            if s['id'] == self.shape_id:
                self.shape_data = copy.deepcopy(s)
                self.index = i
                project['shapes'].pop(i)
                return

    def undo(self, project):
        if self.shape_data:
            project['shapes'].insert(self.index, self.shape_data)


class ModifyShapeCommand(Command):
    def __init__(self, shape_id, new_data):
        self.shape_id = shape_id
        self.new_data = new_data
        self.old_data = None

    def execute(self, project):
        for i, s in enumerate(project['shapes']):
            if s['id'] == self.shape_id:
                self.old_data = copy.deepcopy(s)
                project['shapes'][i].update(self.new_data)
                return

    def undo(self, project):
        if self.old_data:
            for i, s in enumerate(project['shapes']):
                if s['id'] == self.shape_id:
                    project['shapes'][i] = self.old_data
                    return


class AddLayerCommand(Command):
    def __init__(self, layer_data):
        self.layer_data = layer_data

    def execute(self, project):
        project['layers'].append(self.layer_data)

    def undo(self, project):
        project['layers'] = [l for l in project['layers'] if l['id'] != self.layer_data['id']]


class DeleteLayerCommand(Command):
    def __init__(self, layer_id):
        self.layer_id = layer_id
        self.layer_data = None
        self.index = -1
        self.orphaned_shapes = []

    def execute(self, project):
        for i, l in enumerate(project['layers']):
            if l['id'] == self.layer_id:
                self.layer_data = copy.deepcopy(l)
                self.index = i
                project['layers'].pop(i)
                break
        # Track shapes on this layer
        self.orphaned_shapes = [copy.deepcopy(s) for s in project['shapes'] if s.get('layer') == self.layer_id]
        project['shapes'] = [s for s in project['shapes'] if s.get('layer') != self.layer_id]

    def undo(self, project):
        if self.layer_data:
            project['layers'].insert(self.index, self.layer_data)
        project['shapes'].extend(self.orphaned_shapes)


class ScaleShapesCommand(Command):
    def __init__(self, shape_ids, base_point, factor):
        self.shape_ids = shape_ids
        self.base_point = base_point
        self.factor = factor
        self.old_shapes = {} # ID -> full shape data before scale

    def execute(self, project):
        from geometry_engine import scale_shape
        for i, s in enumerate(project['shapes']):
            if s['id'] in self.shape_ids:
                if s['id'] not in self.old_shapes:
                    self.old_shapes[s['id']] = copy.deepcopy(s)
                scale_shape(project['shapes'][i], self.base_point, self.factor)

    def undo(self, project):
        for i, s in enumerate(project['shapes']):
            if s['id'] in self.old_shapes:
                project['shapes'][i] = copy.deepcopy(self.old_shapes[s['id']])


class TranslateShapesCommand(Command):
    def __init__(self, shape_ids, dx, dy):
        self.shape_ids = shape_ids
        self.dx = dx
        self.dy = dy
        self.old_shapes = {}

    def execute(self, project):
        from geometry_engine import translate_shape
        for i, s in enumerate(project['shapes']):
            if s['id'] in self.shape_ids:
                if s['id'] not in self.old_shapes:
                    self.old_shapes[s['id']] = copy.deepcopy(s)
                translate_shape(project['shapes'][i], self.dx, self.dy)

    def undo(self, project):
        for i, s in enumerate(project['shapes']):
            if s['id'] in self.old_shapes:
                project['shapes'][i] = copy.deepcopy(self.old_shapes[s['id']])


class RotateShapesCommand(Command):
    def __init__(self, shape_ids, base_point, angle_deg):
        self.shape_ids = shape_ids
        self.base_point = base_point
        self.angle_deg = angle_deg
        self.old_shapes = {}

    def execute(self, project):
        from geometry_engine import rotate_shape
        for i, s in enumerate(project['shapes']):
            if s['id'] in self.shape_ids:
                if s['id'] not in self.old_shapes:
                    self.old_shapes[s['id']] = copy.deepcopy(s)
                rotate_shape(project['shapes'][i], self.base_point, self.angle_deg)

    def undo(self, project):
        for i, s in enumerate(project['shapes']):
            if s['id'] in self.old_shapes:
                project['shapes'][i] = copy.deepcopy(self.old_shapes[s['id']])


class AddBlockDefinitionCommand(Command):
    def __init__(self, name, shapes):
        self.name = name
        self.shapes = shapes

    def execute(self, project):
        if 'blocks' not in project:
            project['blocks'] = {}
        project['blocks'][self.name] = self.shapes

    def undo(self, project):
        if self.name in project.get('blocks', {}):
            del project['blocks'][self.name]


class InsertBlockCommand(Command):
    def __init__(self, block_ref):
        self.block_ref = block_ref

    def execute(self, project):
        project['shapes'].append(self.block_ref)

    def undo(self, project):
        project['shapes'] = [s for s in project['shapes'] if s['id'] != self.block_ref['id']]


class BatchCommand(Command):
    """Multiple commands as one undo/redo step."""
    def __init__(self, commands):
        self.commands = commands

    def execute(self, project):
        for cmd in self.commands:
            cmd.execute(project)

    def undo(self, project):
        for cmd in reversed(self.commands):
            cmd.undo(project)


class ProjectManager:
    """Manages the project state with undo/redo support."""

    MAX_UNDO = 100

    def __init__(self):
        self.project = self._new_project()
        self.undo_stack = []
        self.redo_stack = []
        self.file_path = None
        self.dirty = False

    def update_settings(self, settings):
        """Update project settings."""
        if 'settings' not in self.project:
            self.project['settings'] = {}
        self.project['settings'].update(settings)
        self.dirty = True

    def _new_project(self):
        return {
            'name': 'Untitled',
            'shapes': [],
            'layers': [
                {
                    'id': 'layer-0',
                    'name': 'Layer 0',
                    'color': '#ffffff',
                    'visible': True,
                    'locked': False
                }
            ],
            'activeLayer': 'layer-0',
            'settings': {
                'gridSize': 10,
                'gridVisible': True,
                'snapEnabled': True,
                'snapModes': ['endpoint', 'midpoint', 'center', 'grid'],
                'backgroundColor': '#1a1a2e',
                'unitType': 'decimal',     # decimal, architectural, engineering, fractional, scientific
                'unitPrecision': 2,
                'angleType': 'decimalDegrees', # decimalDegrees, degMinSec, grads, radians, surveyor
                'anglePrecision': 0,
                'units': 'millimeters'     # drawing units
            },
            'blocks': {}
        }

    def new_project(self):
        self.project = self._new_project()
        self.undo_stack.clear()
        self.redo_stack.clear()
        self.file_path = None
        self.dirty = False
        return self.project

    def execute_command(self, command):
        command.execute(self.project)
        self.undo_stack.append(command)
        if len(self.undo_stack) > self.MAX_UNDO:
            self.undo_stack.pop(0)
        self.redo_stack.clear()
        self.dirty = True

    def undo(self):
        if not self.undo_stack:
            return False
        cmd = self.undo_stack.pop()
        cmd.undo(self.project)
        self.redo_stack.append(cmd)
        self.dirty = True
        return True

    def redo(self):
        if not self.redo_stack:
            return False
        cmd = self.redo_stack.pop()
        cmd.execute(self.project)
        self.undo_stack.append(cmd)
        self.dirty = True
        return True

    def add_shape(self, shape_data):
        if 'id' not in shape_data:
            shape_data['id'] = str(uuid.uuid4())
        if 'layer' not in shape_data:
            shape_data['layer'] = self.project.get('activeLayer', 'layer-0')
        cmd = AddShapeCommand(shape_data)
        self.execute_command(cmd)
        return shape_data['id']

    def scale_shapes(self, ids, base_point, factor):
        """Scale multiple shapes."""
        command = ScaleShapesCommand(ids, base_point, factor)
        return self.execute_command(command)

    def translate_shapes(self, ids, dx, dy):
        """Move multiple shapes."""
        command = TranslateShapesCommand(ids, dx, dy)
        return self.execute_command(command)

    def rotate_shapes(self, ids, base_point, angle_deg):
        """Rotate multiple shapes."""
        command = RotateShapesCommand(ids, base_point, angle_deg)
        return self.execute_command(command)

    def delete_shape(self, shape_id):
        cmd = DeleteShapeCommand(shape_id)
        self.execute_command(cmd)

    def modify_shape(self, shape_id, new_data):
        cmd = ModifyShapeCommand(shape_id, new_data)
        self.execute_command(cmd)

    def add_layer(self, name=None, color='#ffffff'):
        layer_id = f'layer-{uuid.uuid4().hex[:8]}'
        if name is None:
            name = f'Layer {len(self.project["layers"])}'
        layer_data = {
            'id': layer_id,
            'name': name,
            'color': color,
            'visible': True,
            'locked': False
        }
        cmd = AddLayerCommand(layer_data)
        self.execute_command(cmd)
        return layer_id

    # ──────────────────────── Block Operations ────────────────────────

    def create_block(self, name, base_point, shape_ids):
        """Create a block definition from existing shapes and remove them from canvas."""
        if not name or name in self.project.get('blocks', {}):
            return False
            
        block_shapes = []
        commands = []
        
        for sid in shape_ids:
            shape = self.get_shape_by_id(sid)
            if shape:
                # Transform shape to be relative to base_point
                from geometry_engine import scale_shape, scale_point
                # Here we logic: offset everything so base_point is 0,0
                rel_shape = copy.deepcopy(shape)
                # We reuse scale_shape with factor 1 but use it to apply transformation?
                # Better: implement a translate_shape in geometry_engine. 
                # For now, let's just manually offset
                self._offset_shape(rel_shape, -base_point[0], -base_point[1])
                block_shapes.append(rel_shape)
                commands.append(DeleteShapeCommand(sid))
                
        if not block_shapes:
            return False
            
        commands.append(AddBlockDefinitionCommand(name, block_shapes))
        
        # Also insert one instance at the same location if desired? 
        # Usually block creation in AutoCAD replaces selected objects with a block reference.
        ref_id = str(uuid.uuid4())
        ref = {
            'id': ref_id,
            'type': 'block_reference',
            'blockName': name,
            'x': base_point[0],
            'y': base_point[1],
            'scale': 1.0,
            'rotation': 0.0,
            'layer': self.project.get('activeLayer', 'layer-0')
        }
        commands.append(InsertBlockCommand(ref))
        
        self.execute_command(BatchCommand(commands))
        return True

    def insert_block(self, name, x, y, scale=1.0, rotation=0.0):
        """Insert a block reference."""
        if name not in self.project.get('blocks', {}):
            return False
            
        ref = {
            'id': str(uuid.uuid4()),
            'type': 'block_reference',
            'blockName': name,
            'x': x,
            'y': y,
            'scale': scale,
            'rotation': rotation,
            'layer': self.project.get('activeLayer', 'layer-0')
        }
        self.execute_command(InsertBlockCommand(ref))
        return True

    def _offset_shape(self, shape, dx, dy):
        """Helper to move a shape definition."""
        stype = shape['type']
        if stype == 'line':
            shape['x1'] += dx; shape['y1'] += dy
            shape['x2'] += dx; shape['y2'] += dy
        elif stype in ['circle', 'arc', 'ellipse']:
            shape['cx'] += dx; shape['cy'] += dy
        elif stype in ['rectangle', 'text']:
            shape['x'] += dx; shape['y'] += dy
        elif stype == 'polyline':
            shape['points'] = [[p[0] + dx, p[1] + dy] for p in shape['points']]
        elif stype == 'block_reference':
            shape['x'] += dx; shape['y'] += dy

    def delete_layer(self, layer_id):
        if len(self.project['layers']) <= 1:
            return False
        cmd = DeleteLayerCommand(layer_id)
        self.execute_command(cmd)
        if self.project['activeLayer'] == layer_id:
            self.project['activeLayer'] = self.project['layers'][0]['id']
        return True

    def set_active_layer(self, layer_id):
        # Validate that layer_id exists
        if any(l['id'] == layer_id for l in self.project['layers']):
            self.project['activeLayer'] = layer_id
            return True
        return False

    def change_layer_color(self, layer_id, color):
        for layer in self.project['layers']:
            if layer['id'] == layer_id:
                layer['color'] = color
                self.dirty = True
                return True
        return False

    def toggle_layer_visibility(self, layer_id):
        for layer in self.project['layers']:
            if layer['id'] == layer_id:
                layer['visible'] = not layer['visible']
                return layer['visible']
        return None

    def toggle_layer_lock(self, layer_id):
        for layer in self.project['layers']:
            if layer['id'] == layer_id:
                layer['locked'] = not layer['locked']
                return layer['locked']
        return None

    def rename_layer(self, layer_id, new_name):
        for layer in self.project['layers']:
            if layer['id'] == layer_id:
                layer['name'] = new_name
                return True
        return False

    def get_project_data(self):
        return copy.deepcopy(self.project)

    def _compact_shape(self, shape):
        """Convert shape to a compact format for storage."""
        mapping = {
            'type': 't', 'layer': 'l', 'color': 'c', 
            'lineWidth': 'w', 'lineStyle': 's', 'points': 'p',
            'width': 'wid', 'height': 'hgt', 'fontSize': 'fs',
            'cx': 'cx', 'cy': 'cy', 'radius': 'r', 
            'rx': 'rx', 'ry': 'ry', 'startAngle': 'sa', 'endAngle': 'ea',
            'blockName': 'bn', 'rotation': 'rot', 'scale': 'sc'
        }
        
        compact = {}
        for k, v in shape.items():
            # Round floats
            if isinstance(v, float):
                v = round(v, 4)
            elif isinstance(v, list) and k == 'points':
                v = [[round(p[0], 4), round(p[1], 4)] for p in v]
            
            # Skip defaults
            if k == 'lineWidth' and v == 1: continue
            if k == 'lineStyle' and v == 'solid': continue
            if k == 'visible' and v is True: continue
            if k == 'locked' and v is False: continue

            key = mapping.get(k, k)
            compact[key] = v
        return compact

    def _expand_shape(self, compact):
        """Convert compact storage format back to full internal format."""
        rev_mapping = {
            't': 'type', 'l': 'layer', 'c': 'color', 
            'w': 'lineWidth', 's': 'lineStyle', 'p': 'points',
            'wid': 'width', 'hgt': 'height', 'fs': 'fontSize',
            'r': 'radius', 'sa': 'startAngle', 'ea': 'endAngle',
            'bn': 'blockName', 'rot': 'rotation', 'sc': 'scale'
        }
        
        shape = {}
        for k, v in compact.items():
            key = rev_mapping.get(k, k)
            shape[key] = v
        
        # Ensure ID exists (backward compat if somehow missing)
        if 'id' not in shape: 
            import uuid
            shape['id'] = str(uuid.uuid4())
            
        return shape

    def load_project(self, data):
        """Load project from a dictionary, expanding shapes if needed."""
        if 'shapes' in data:
            data['shapes'] = [self._expand_shape(s) if 't' in s else s for s in data['shapes']]
        if 'blocks' in data:
            for name, shapes in data['blocks'].items():
                data['blocks'][name] = [self._expand_shape(s) if 't' in s else s for s in shapes]
        self.project = data
        self.undo_stack.clear()
        self.redo_stack.clear()
        self.dirty = False
        return self.project

    def load_from_json(self, json_str):
        data = json.loads(json_str)
        return self.load_project(data)

    def save_to_json(self):
        self.dirty = False
        # Create a deep copy for compaction to avoid mutating active project
        export_project = copy.deepcopy(self.project)
        export_project['shapes'] = [self._compact_shape(s) for s in export_project['shapes']]
        if 'blocks' in export_project:
            for name, shapes in export_project['blocks'].items():
                export_project['blocks'][name] = [self._compact_shape(s) for s in shapes]
        # Use separators for maximum compactness (remove spaces)
        return json.dumps(export_project, separators=(',', ':'))

    def get_shape_by_id(self, shape_id):
        for s in self.project['shapes']:
            if s['id'] == shape_id:
                return copy.deepcopy(s)
        return None

    def get_shapes_on_layer(self, layer_id):
        return [s for s in self.project['shapes'] if s.get('layer') == layer_id]

    def update_settings(self, settings):
        self.project['settings'].update(settings)
