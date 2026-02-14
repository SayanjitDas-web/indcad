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
                'backgroundColor': '#1a1a2e'
            }
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

    def delete_layer(self, layer_id):
        if len(self.project['layers']) <= 1:
            return False
        cmd = DeleteLayerCommand(layer_id)
        self.execute_command(cmd)
        if self.project['activeLayer'] == layer_id:
            self.project['activeLayer'] = self.project['layers'][0]['id']
        return True

    def set_active_layer(self, layer_id):
        self.project['activeLayer'] = layer_id

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
            'rx': 'rx', 'ry': 'ry', 'startAngle': 'sa', 'endAngle': 'ea'
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
            'r': 'radius', 'sa': 'startAngle', 'ea': 'endAngle'
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

    def load_from_json(self, json_str):
        data = json.loads(json_str)
        # Expand shapes if they appear compacted (checking for 't' key)
        if 'shapes' in data:
            data['shapes'] = [self._expand_shape(s) if 't' in s else s for s in data['shapes']]
        self.project = data
        self.undo_stack.clear()
        self.redo_stack.clear()
        self.dirty = False
        return self.project

    def save_to_json(self):
        self.dirty = False
        # Create a deep copy for compaction to avoid mutating active project
        export_project = copy.deepcopy(self.project)
        export_project['shapes'] = [self._compact_shape(s) for s in export_project['shapes']]
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
