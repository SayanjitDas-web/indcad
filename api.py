"""
IndCAD API Bridge
Exposes Python functions to JavaScript via pywebview's JS-Python bridge.
"""
import json
import os
import copy
import math

from project_manager import ProjectManager
import geometry_engine as geo
from database import Database
from dxf_exporter import DXFExporter
from ai_assistant import AiAssistant


class Api:
    """API class exposed to JavaScript through pywebview."""

    def __init__(self):
        self.pm = ProjectManager()
        self.db = Database()
        self.ai = AiAssistant()
        self._window = None
        self._current_project_id = None

    def set_window(self, window):
        self._window = window

    def _create_file_dialog_safe(self, dialog_type=0, file_types=None, save_filename=None):
        """Helper to call file dialog with a robust Tkinter primary choice on Windows."""
        
        # Windows Check: Prefer Tkinter due to stability issues with native WinForms bridge
        if os.name == 'nt':
            try:
                import tkinter as tk
                from tkinter import filedialog
                
                root = tk.Tk()
                root.withdraw()  # Hide main window
                root.attributes("-topmost", True)  # Bring to front

                result = None
                
                # Convert pywebview filters to Tkinter format: [("Name", "*.ext"), ...]
                tk_types = []
                if file_types:
                    for ft in file_types:
                        if '(' in ft and ')' in ft:
                            name = ft.split('(')[0].strip()
                            ext = ft.split('(')[1].split(')')[0].strip()
                            tk_types.append((name, ext))
                        elif '*' in ft:
                            tk_types.append(("Files", ft))
                        else:
                            tk_types.append(("Files", f"*.{ft}"))
                
                if not tk_types:
                    tk_types = [("All files", "*.*")]

                if dialog_type == 0:  # Open
                    result = filedialog.askopenfilename(filetypes=tk_types)
                    if result: 
                        result = [result]  # Return as list/tuple to match pywebview
                
                elif dialog_type == 2:  # Save
                    result = filedialog.asksaveasfilename(
                        filetypes=tk_types,
                        initialfile=save_filename,
                        defaultextension=".icad" if "icad" in str(tk_types) else ""
                    )
                
                elif dialog_type == 1: # Folder
                    result = filedialog.askdirectory()

                root.destroy()
                if result:
                    return result
            except Exception as tk_e:
                print(f"!!! Tkinter error: {tk_e}. Falling back to native...")

        # Fallback to native (or primary for non-Windows)
        try:
            if self._window:
                return self._window.create_file_dialog(
                    dialog_type=dialog_type,
                    file_types=file_types or ('All files (*.*)',),
                    save_filename=save_filename
                )
        except Exception as e:
            print(f"!!! Native dialog error: {e}")
            return None
        
        return None

    # ──────────────────────── Home / Project Management ────────────────────────

    def get_recent_projects(self):
        """Get recent projects for home page."""
        projects = self.db.get_recent_projects(20)
        return json.dumps(projects)

    def get_all_projects(self):
        """Get all projects."""
        projects = self.db.get_all_projects()
        return json.dumps(projects)

    def get_templates(self):
        """Get available project templates."""
        templates = self.db.get_available_templates()
        return json.dumps(templates)

    def create_new_project(self, name, description='', template='blank'):
        """Create a new project with template and return its data."""
        result = self.db.create_project(name, description, template)
        self._current_project_id = result['id']
        self.db.set_last_project_id(self._current_project_id)
        self.pm.file_path = result['file_path']
        self.pm.load_project(result['data'])
        return json.dumps(result)

    def open_project_by_id(self, project_id):
        """Open a project from the database by its ID."""
        proj = self.db.get_project(project_id)
        if not proj:
            return json.dumps({'success': False, 'error': 'Project not found'})

        project_data = None

        # Try loading from project_data column first
        if proj.get('project_data'):
            try:
                project_data = json.loads(proj['project_data'])
            except json.JSONDecodeError:
                pass

        # Fallback to file
        if not project_data and proj.get('file_path') and os.path.exists(proj['file_path']):
            with open(proj['file_path'], 'r') as f:
                project_data = json.load(f)

        if not project_data:
            return json.dumps({'success': False, 'error': 'Could not load project data'})

        self._current_project_id = project_id
        self.db.set_last_project_id(project_id)
        self.pm.file_path = proj.get('file_path')
        self.pm.load_project(project_data)

        return json.dumps({
            'success': True,
            'id': project_id,
            'name': proj.get('name', 'Untitled'),
            'data': project_data
        })

    def delete_project_by_id(self, project_id):
        """Delete a project from the database."""
        self.db.delete_project(project_id)
        if self._current_project_id == project_id:
            self._current_project_id = None
        return json.dumps({'success': True})

    def rename_project(self, project_id, new_name):
        """Rename a project."""
        proj = self.db.get_project(project_id)
        if not proj or not proj.get('project_data'):
            return json.dumps({'success': False})
        data = json.loads(proj['project_data'])
        data['name'] = new_name
        self.db.update_project(project_id, data)
        if self._current_project_id == project_id:
            self.pm.project['name'] = new_name
        return json.dumps({'success': True})

    def save_thumbnail(self, data_url):
        """Save current project's thumbnail."""
        if self._current_project_id:
            self.db.save_thumbnail(self._current_project_id, data_url)
            return json.dumps({'success': True})
        return json.dumps({'success': False})

    def sync_project_to_db(self):
        """Sync current project state to the database (compacted)."""
        if self._current_project_id:
            compact_data = json.loads(self.pm.save_to_json())
            self.db.update_project(self._current_project_id, compact_data)
            return json.dumps({'success': True})
        return json.dumps({'success': False})

    def get_current_project_id(self):
        """Get the ID of the currently open project."""
        return json.dumps({'id': self._current_project_id})

    def import_project_file(self):
        """Import an external .icad file via file dialog."""
        result = self._create_file_dialog_safe(
            dialog_type=0,
            file_types=('IndCAD Project (*.icad)', 'All files (*.*)'),
        )
        
        if result:
            path = result[0] if isinstance(result, (list, tuple)) else result
            if path and os.path.exists(path):
                imported = self.db.import_project_file(path)
                if imported:
                    return json.dumps({'success': True, 'project': imported})
            
        return json.dumps({'success': False, 'error': 'Cancelled or Error'})

    def get_last_project(self):
        """Get the last opened project for auto-loading."""
        project_id = self.db.get_last_project_id()
        if project_id:
            proj = self.db.get_project(project_id)
            if proj:
                return json.dumps({'success': True, 'project': proj})
        return json.dumps({'success': False})

    # ──────────────────────── Project Operations ────────────────────────

    def new_project(self):
        data = self.pm.new_project()
        return json.dumps(data)

    def get_project_data(self):
        return json.dumps(self.pm.get_project_data())

    def save_project(self):
        """Save project with robust syncing and backups."""
        if self._current_project_id:
            compact_data = json.loads(self.pm.save_to_json())
            self.db.update_project(self._current_project_id, compact_data)

        if self.pm.file_path:
            try:
                # Create backup before overwrite
                if os.path.exists(self.pm.file_path):
                    bak_path = self.pm.file_path + ".bak"
                    import shutil
                    shutil.copy2(self.pm.file_path, bak_path)
                
                with open(self.pm.file_path, 'w') as f:
                    f.write(self.pm.save_to_json())
                return json.dumps({'success': True, 'path': self.pm.file_path})
            except Exception as e:
                return json.dumps({'success': False, 'error': f"File write error: {e}"})

        return self.save_project_as()

    def save_project_as(self):
        """Save project with 'Save As' dialog and crash protection."""
        result = self._create_file_dialog_safe(
            dialog_type=2,
            file_types=('IndCAD Project (*.icad)', 'All files (*.*)'),
            save_filename='project.icad'
        )

        if result:
            path = result if isinstance(result, str) else result[0] if result else None
            if path:
                if not path.endswith('.icad'):
                    path += '.icad'
                self.pm.file_path = path
                with open(path, 'w') as f:
                    f.write(self.pm.save_to_json())
                if self._current_project_id:
                    self.db.update_project(self._current_project_id, self.pm.project)
                return json.dumps({'success': True, 'path': path})

        return json.dumps({'success': False, 'error': 'Cancelled or Error'})

    def load_project(self):
        """Load project with native file dialog and protection."""
        result = self._create_file_dialog_safe(
            dialog_type=0,
            file_types=('IndCAD Project (*.icad)', 'All files (*.*)'),
        )

        if result:
            path = result[0] if isinstance(result, (list, tuple)) else result
            if path and os.path.exists(path):
                with open(path, 'r') as f:
                    data = self.pm.load_from_json(f.read())
                self.pm.file_path = path

                # Also import into DB
                imported = self.db.import_project_file(path)
                if imported:
                    self._current_project_id = imported['id']
                    self.db.set_last_project_id(self._current_project_id)

                return json.dumps({'success': True, 'data': data, 'path': path})

        return json.dumps({'success': False, 'error': 'Cancelled or Error'})

    # ──────────────────────── Block Operations ────────────────────────

    def create_block(self, name, base_point_json, shape_ids_json):
        """Create a block definition from selection."""
        base_point = json.loads(base_point_json)
        shape_ids = json.loads(shape_ids_json)
        success = self.pm.create_block(name, base_point, shape_ids)
        return json.dumps({'success': success})

    def insert_block(self, name, x, y, scale=1.0, rotation=0.0):
        """Insert a block reference."""
        success = self.pm.insert_block(name, x, y, scale, rotation)
        return json.dumps({'success': success})

    def get_blocks(self):
        """Get all block definition names."""
        blocks = list(self.pm.project.get('blocks', {}).keys())
        return json.dumps({'blocks': blocks})

    def publish_block_to_library(self, name):
        """Save a local block definition to the global library."""
        blocks = self.pm.project.get('blocks', {})
        if name in blocks:
            # We save the shapes as they are in the project (already simplified if compact)
            self.db.save_global_block(name, blocks[name])
            return json.dumps({'success': True})
        return json.dumps({'success': False, 'error': 'Block not found'})

    def get_library_blocks(self):
        """Get names of all blocks in the global library."""
        blocks = self.db.get_global_blocks()
        return json.dumps({'blocks': blocks})

    def import_block_from_library(self, name):
        """Import a block definition from library into current project."""
        block_data = self.db.get_global_block(name)
        if block_data:
            # Use AddBlockDefinitionCommand to add it to PM (so it's undoable/persistable)
            from project_manager import AddBlockDefinitionCommand
            cmd = AddBlockDefinitionCommand(name, block_data)
            self.pm.execute_command(cmd)
            return json.dumps({'success': True})
        return json.dumps({'success': False, 'error': 'Global block not found'})

    def delete_library_block(self, name):
        """Delete a block from the global library."""
        self.db.delete_global_block(name)
        return json.dumps({'success': True})

    # ──────────────────────── Shape Operations ────────────────────────

    def add_shape(self, shape_json):
        shape_data = json.loads(shape_json)
        shape_id = self.pm.add_shape(shape_data)
        return json.dumps({'id': shape_id})

    def modify_shape(self, shape_id, new_data_json):
        new_data = json.loads(new_data_json)
        self.pm.modify_shape(shape_id, new_data)
        return json.dumps({'success': True})

    def delete_shape(self, shape_id):
        self.pm.delete_shape(shape_id)
        return json.dumps({'success': True})

    def delete_shapes(self, shape_ids_json):
        """Delete multiple shapes as one undo step."""
        from project_manager import DeleteShapeCommand, BatchCommand
        shape_ids = json.loads(shape_ids_json)
        commands = [DeleteShapeCommand(sid) for sid in shape_ids]
        if commands:
            batch = BatchCommand(commands)
            self.pm.execute_command(batch)
        return json.dumps({'success': True})

    # ──────────────────────── Undo / Redo ────────────────────────

    def update_settings(self, settings_json):
        """Update project settings from JSON."""
        try:
            settings = json.loads(settings_json)
            self.pm.update_settings(settings)
            self.sync_project_to_db()
            return json.dumps({'success': True})
        except Exception as e:
            return json.dumps({'success': False, 'error': str(e)})

    def undo(self):
        result = self.pm.undo()
        data = self.pm.get_project_data()
        return json.dumps({'success': result, 'data': data})

    def redo(self):
        result = self.pm.redo()
        data = self.pm.get_project_data()
        return json.dumps({'success': result, 'data': data})

    # ──────────────────────── Layer Operations ────────────────────────

    def add_layer(self, name=None, color='#ffffff'):
        layer_id = self.pm.add_layer(name, color)
        return json.dumps({'id': layer_id, 'layers': self.pm.project['layers']})

    def delete_layer(self, layer_id):
        result = self.pm.delete_layer(layer_id)
        return json.dumps({'success': result, 'layers': self.pm.project['layers']})

    def set_active_layer(self, layer_id):
        self.pm.set_active_layer(layer_id)
        return json.dumps({'success': True})

    def toggle_layer_visibility(self, layer_id):
        visible = self.pm.toggle_layer_visibility(layer_id)
        return json.dumps({'visible': visible})

    def toggle_layer_lock(self, layer_id):
        locked = self.pm.toggle_layer_lock(layer_id)
        return json.dumps({'locked': locked})

    def rename_layer(self, layer_id, new_name):
        result = self.pm.rename_layer(layer_id, new_name)
        return json.dumps({'success': result})

    # ──────────────────────── Geometry / Snap ────────────────────────

    def calculate_snap(self, point_json, radius_json, base_point_json=None):
        point = json.loads(point_json)
        radius = json.loads(radius_json)
        base_point = json.loads(base_point_json) if base_point_json else None
        
        shapes = self.pm.project['shapes']
        snap_modes = self.pm.project['settings'].get('snapModes', ['endpoint', 'midpoint', 'center', 'intersection', 'quadrant', 'nearest', 'tangent', 'perpendicular'])
        
        result = geo.find_nearest_snap(point, shapes, radius, snap_modes, base_point=base_point)
        return json.dumps(result)

    def measure_distance(self, p1_json, p2_json):
        p1 = json.loads(p1_json)
        p2 = json.loads(p2_json)
        d = geo.distance(p1, p2)
        return json.dumps({'distance': d})

    def trim_shape(self, target_id, x, y):
        """Trim any shape at intersection points."""
        target = self.pm.get_shape_by_id(target_id)
        if not target: return

        click_point = [x, y]
        cutters = self.pm.project['shapes']
        
        # 1. Collect all intersection points
        intersections = []
        for shape in cutters:
            if shape['id'] == target_id: continue
            if 'type' not in shape: continue
            
            inters = geo.get_shape_intersections(target, shape)
            for pt in inters:
                # Avoid duplicates and check if already in list
                if not any(geo.distance(pt, i) < 1e-5 for i in intersections):
                    intersections.append(pt)

        if not intersections:
            return json.dumps({'success': False, 'message': 'No intersections found'})

        new_shapes = []
        
        # 2. Logic based on shape type
        if target['type'] == 'line':
            p1, p2 = [target['x1'], target['y1']], [target['x2'], target['y2']]
            # Sort points along line
            pts = [p1, p2] + intersections
            pts.sort(key=lambda p: geo.distance(p1, p))
            
            # Find segments
            segments = []
            for i in range(len(pts) - 1):
                segments.append({'type': 'line', 'p1': pts[i], 'p2': pts[i+1]})
            
            # Filter by click
            new_segments = self._remove_clicked_segment(segments, click_point)
            for seg in new_segments:
                s = copy.deepcopy(target)
                s.pop('id', None)
                s['x1'], s['y1'] = seg['p1']
                s['x2'], s['y2'] = seg['p2']
                new_shapes.append(s)

                new_shapes.append(s)

        elif target['type'] == 'circle' or target['type'] == 'arc' or target['type'] == 'ellipse':
            center = [target['cx'], target['cy']]
            # Use 'radius' for circle/arc, 'rx/ry' for ellipse logic (handled specially below)
            # For angular sorting, we just need center.
            
            # Sort intersections by angle
            angles = []
            for pt in intersections:
                if target['type'] == 'ellipse':
                    angles.append(geo.point_ellipse_angle(pt, center[0], center[1]) % 360)
                else:
                    angles.append(geo.angle_between(center, pt) % 360)
            
            if target['type'] == 'arc' or target['type'] == 'ellipse':
                sa = target.get('startAngle', 0) % 360
                ea = target.get('endAngle', 360) % 360
                
                # If it's a closed ellipse (no angles set or 0-360)
                if 'startAngle' not in target and target['type'] == 'ellipse':
                     sa, ea = 0, 360
                     # Treat as closed loop like circle initially?
                     # Actually, if we treat it as 0-360 arc, logic holds if we wrap correctly.
                     pass 

                # Only keep angles within arc range
                # For partial shapes, we must include endpoints
                valid_angles = [a for a in angles if geo.is_angle_between(a, sa, ea)]
                valid_angles += [sa, ea]
                angles = valid_angles
            else:
                # For circles
                if len(angles) < 2: return json.dumps({'success': False})
            
            angles = sorted(list(set(angles))) # Unique sorted angles
            
            # Handle wrap-around for closed shapes
            if target['type'] == 'circle' or (target['type'] == 'ellipse' and target.get('startAngle', 0) == 0 and target.get('endAngle', 360) == 360):
                 if len(angles) > 0:
                    angles.append(angles[0] + 360)
            
            segments = []
            for i in range(len(angles) - 1):
                segments.append({
                    'type': 'arc', # Generic type for logic
                    'sa': angles[i] % 360,
                    'ea': angles[i+1] % 360
                })
            
            # Filter by click
            # Need slight variation for ellipse click detection
            if target['type'] == 'ellipse':
                rx, ry = target['rx'], target['ry']
                new_segments = self._remove_clicked_ellipse_segment(segments, center, rx, ry, click_point)
                
                for seg in new_segments:
                    s = copy.deepcopy(target)
                    s.pop('id', None)
                    s['type'] = 'ellipse' 
                    s['cx'], s['cy'] = center
                    s['rx'], s['ry'] = rx, ry
                    s['startAngle'], s['endAngle'] = seg['sa'], seg['ea']
                    new_shapes.append(s)
            else:
                radius = target['radius']
                new_segments = self._remove_clicked_arc_segment(segments, center, radius, click_point)
                for seg in new_segments:
                    s = copy.deepcopy(target)
                    s.pop('id', None)
                    s['type'] = 'arc' # Circle becomes Arc
                    s['cx'], s['cy'] = center
                    s['radius'] = radius
                    s['startAngle'], s['endAngle'] = seg['sa'], seg['ea']
                    new_shapes.append(s)

        elif target['type'] == 'polyline' or target['type'] == 'rectangle':
            # Collect points (closed for rectangle)
            if target['type'] == 'rectangle':
                rx, ry, rw, rh = target['x'], target['y'], target['width'], target['height']
                old_pts = [[rx, ry], [rx+rw, ry], [rx+rw, ry+rh], [rx, ry+rh], [rx, ry]]
            else:
                old_pts = target['points']
            
            new_pts_list = []
            for i in range(len(old_pts) - 1):
                p1, p2 = old_pts[i], old_pts[i+1]
                seg_inters = []
                for pt in intersections:
                    if geo.point_to_line_distance(pt, p1, p2) < 1e-5:
                        seg_inters.append(pt)
                
                seg_inters.sort(key=lambda p: geo.distance(p1, p))
                pts = [p1] + seg_inters + [p2]
                for j in range(len(pts) - 1):
                    new_pts_list.append((pts[j], pts[j+1]))
            
            # Filter by click
            segments = [{'type': 'line', 'p1': s[0], 'p2': s[1]} for s in new_pts_list]
            new_segments = self._remove_clicked_segment(segments, click_point)
            
            # Add as single polyline or separate lines? 
            # CAD standard: usually stays as one object if connected.
            # Simple: just add as lines/small polylines.
            for seg in new_segments:
                s = copy.deepcopy(target)
                s.pop('id', None)
                s['type'] = 'line' # Convert trimmed rectangle/polyline to lines
                s['x1'], s['y1'] = seg['p1']
                s['x2'], s['y2'] = seg['p2']
                if 'points' in s: s.pop('points')
                if 'width' in s: s.pop('width')
                if 'height' in s: s.pop('height')
                new_shapes.append(s)

        # 3. Apply changes via Project Manager
        if new_shapes:
            self.pm.delete_shape(target_id)
            for s in new_shapes:
                self.pm.add_shape(s)
            return json.dumps({'success': True})
        elif not new_shapes and target_id:
            # Special case: trimming the last segment of a shape
            self.pm.delete_shape(target_id)
            return json.dumps({'success': True})

    def _remove_clicked_segment(self, segments, click_point):
        """Find segment closest to click and remove it."""
        min_dist = float('inf')
        clicked_idx = -1
        for i, seg in enumerate(segments):
            mid = geo.midpoint(seg['p1'], seg['p2'])
            d = geo.distance(click_point, mid)
            if d < min_dist:
                min_dist = d
                clicked_idx = i
        
        return [seg for i, seg in enumerate(segments) if i != clicked_idx]

    def _remove_clicked_arc_segment(self, segments, center, radius, click_point):
        """Find arc segment closest to click and remove it."""
        min_dist = float('inf')
        clicked_idx = -1
        for i, seg in enumerate(segments):
            # Mid angle
            mid_angle = (seg['sa'] + seg['ea']) / 2
            if seg['sa'] > seg['ea']: # Wrap
                 mid_angle = (seg['sa'] + seg['ea'] + 360) / 2
            
            mid_angle_rad = math.radians(mid_angle)
            mid_pt = [
                center[0] + radius * math.cos(mid_angle_rad),
                center[1] + radius * math.sin(mid_angle_rad)
            ]
            d = geo.distance(click_point, mid_pt)
            if d < min_dist:
                min_dist = d
                clicked_idx = i
        
        return [seg for i, seg in enumerate(segments) if i != clicked_idx]

    def _remove_clicked_ellipse_segment(self, segments, center, rx, ry, click_point):
        """Find ellipse segment closest to click and remove it."""
        min_dist = float('inf')
        clicked_idx = -1
        for i, seg in enumerate(segments):
            mid_angle = (seg['sa'] + seg['ea']) / 2
            if seg['sa'] > seg['ea']: # Wrap
                 mid_angle = (seg['sa'] + seg['ea'] + 360) / 2
            
            mid_angle_rad = math.radians(mid_angle)
            # Parametric equation for ellipse
            mid_pt = [
                center[0] + rx * math.cos(mid_angle_rad),
                center[1] + ry * math.sin(mid_angle_rad)
            ]
            d = geo.distance(click_point, mid_pt)
            if d < min_dist:
                min_dist = d
                clicked_idx = i
        
        return [seg for i, seg in enumerate(segments) if i != clicked_idx]

    def offset_shape(self, shape_id, distance, px, py):
        """Create an offset copy of a shape."""
        shape = self.pm.get_shape_by_id(shape_id)
        if not shape: return

        click_point = [px, py]
        new_shape = copy.deepcopy(shape)
        new_shape.pop('id')

        if shape['type'] == 'line':
            p1 = [shape['x1'], shape['y1']]
            p2 = [shape['x2'], shape['y2']]
            
            # Determine intersection side
            # Cross product of (p2-p1) and (click-p1)
            cross = (p2[0] - p1[0]) * (click_point[1] - p1[1]) - (p2[1] - p1[1]) * (click_point[0] - p1[0])
            sign = 1 if cross < 0 else -1 # Flip depending on coord system
            
            sp1, sp2 = geo.offset_line(p1, p2, distance * sign)
            new_shape['x1'], new_shape['y1'] = sp1
            new_shape['x2'], new_shape['y2'] = sp2
            self.pm.add_shape(new_shape)

        elif shape['type'] == 'polyline':
             # Heuristic for side: check first segment
             pts = shape['points']
             p1 = pts[0]
             p2 = pts[1]
             cross = (p2[0] - p1[0]) * (click_point[1] - p1[1]) - (p2[1] - p1[1]) * (click_point[0] - p1[0])
             sign = 1 if cross < 0 else -1

             new_pts = geo.offset_polyline(pts, distance * sign, shape.get('closed', False))
             new_shape['points'] = new_pts
             self.pm.add_shape(new_shape)

        elif shape['type'] == 'circle':
            # Distance from center to click vs radius
            d_center = geo.distance([shape['cx'], shape['cy']], click_point)
            if d_center < shape['radius']:
                new_shape['radius'] -= distance
            else:
                new_shape['radius'] += distance
            if new_shape['radius'] > 0:
                self.pm.add_shape(new_shape)
                
        elif shape['type'] == 'rectangle':
             # Treat as closed polyline? Or just expand/contract
             # Simple approach: expand/contract from center
             cx = shape['x'] + shape['width']/2
             cy = shape['y'] + shape['height']/2
             
             # Check if click is inside or outside
             d_center_x = abs(click_point[0] - cx)
             d_center_y = abs(click_point[1] - cy)
             is_inside = d_center_x < shape['width']/2 and d_center_y < shape['height']/2
             
             sign = -1 if is_inside else 1
             
             new_shape['x'] -= distance * sign
             new_shape['y'] -= distance * sign
             new_shape['width'] += 2 * distance * sign
             new_shape['height'] += 2 * distance * sign
             
             if new_shape['width'] > 0 and new_shape['height'] > 0:
                 self.pm.add_shape(new_shape)

        return json.dumps({'success': True})

    def copy_shapes(self, shape_ids_json, dx, dy):
        """Copy selected shapes."""
        ids = json.loads(shape_ids_json)
        new_ids = []
        
        for sid in ids:
            shape = self.pm.get_shape_by_id(sid)
            if shape:
                new_shape = copy.deepcopy(shape)
                new_shape.pop('id')
                
                # Move
                if new_shape['type'] == 'line':
                    new_shape['x1'] += dx; new_shape['y1'] += dy
                    new_shape['x2'] += dx; new_shape['y2'] += dy
                elif new_shape['type'] == 'rectangle' or new_shape['type'] == 'text':
                    new_shape['x'] += dx; new_shape['y'] += dy
                elif new_shape['type'] in ['circle', 'arc', 'ellipse']:
                    new_shape['cx'] += dx; new_shape['cy'] += dy
                elif new_shape['type'] == 'polyline':
                    new_shape['points'] = [[p[0]+dx, p[1]+dy] for p in new_shape['points']]
                
                new_id = self.pm.add_shape(new_shape)
                new_ids.append(new_id)
                
        return json.dumps({'success': True, 'ids': new_ids})

    def scale_shapes(self, shape_ids_json, base_point_json, factor):
        """Scale multiple shapes."""
        ids = json.loads(shape_ids_json)
        base_point = json.loads(base_point_json)
        # base_point should be [x, y]
        success = self.pm.scale_shapes(ids, base_point, factor)
        return json.dumps({'success': success})

    def translate_shapes(self, shape_ids_json, dx, dy):
        """Move multiple shapes."""
        ids = json.loads(shape_ids_json)
        # dx, dy should be floats
        success = self.pm.translate_shapes(ids, dx, dy)
        return json.dumps({'success': success})

    def rotate_shapes(self, shape_ids_json, base_point_json, angle_deg):
        """Rotate multiple shapes."""
        ids = json.loads(shape_ids_json)
        base_point = json.loads(base_point_json)
        # base_point should be [x, y], angle_deg a float
        success = self.pm.rotate_shapes(ids, base_point, angle_deg)
        return json.dumps({'success': success})

    def update_settings(self, settings_json):
        settings = json.loads(settings_json)
        self.pm.update_settings(settings)
        return json.dumps({'success': True})

    # ──────────────────────── Export ────────────────────────

    def export_svg(self, svg_content):
        """Export SVG with native save dialog."""
        result = self._create_file_dialog_safe(
            dialog_type=2,
            file_types=('SVG Image (*.svg)', 'All files (*.*)'),
            save_filename='drawing.svg'
        )

        if result:
            path = result if isinstance(result, str) else result[0] if result else None
            if path:
                if not path.endswith('.svg'):
                    path += '.svg'
                with open(path, 'w') as f:
                    f.write(svg_content)
                return json.dumps({'success': True, 'path': path})

        return json.dumps({'success': False, 'error': 'Cancelled or Error'})

    def export_png(self, data_url):
        """Export PNG with native save dialog."""
        import base64
        result = self._create_file_dialog_safe(
            dialog_type=2,
            file_types=('PNG Image (*.png)', 'All files (*.*)'),
            save_filename='drawing.png'
        )

        if result:
            path = result if isinstance(result, str) else result[0] if result else None
            if path:
                if not path.endswith('.png'):
                    path += '.png'
                if ',' in data_url:
                    data_url = data_url.split(',', 1)[1]
                img_data = base64.b64decode(data_url)
                with open(path, 'wb') as f:
                    f.write(img_data)
                return json.dumps({'success': True, 'path': path})

        return json.dumps({'success': False, 'error': 'Cancelled or Error'})

    def export_dxf(self):
        """Export current project to DXF with native save dialog."""
        result = self._create_file_dialog_safe(
            dialog_type=2,
            file_types=('AutoCAD DXF (*.dxf)', 'All files (*.*)'),
            save_filename='drawing.dxf'
        )

        if result:
            path = result if isinstance(result, str) else result[0] if result else None
            if path:
                if not path.endswith('.dxf'):
                    path += '.dxf'
                from dxf_exporter import DXFExporter
                exporter = DXFExporter()
                project_data = copy.deepcopy(self.pm.project)
                success = exporter.export(project_data, path)
                return json.dumps({'success': success, 'path': path})

        return json.dumps({'success': False, 'error': 'Cancelled or Error'})

    def export_dxf_direct(self, filename=None):
        """Export to DXF directly to the exports folder without a dialog."""
        import os
        import subprocess
        import time
        from dxf_exporter import DXFExporter
        
        exports_dir = os.path.join(os.path.expanduser('~'), '.indcad', 'exports')
        os.makedirs(exports_dir, exist_ok=True)
        
        if not filename:
            name = self.pm.project.get('name', 'drawing').replace(' ', '_')
            filename = f"{name}_{int(time.time())}.dxf"
        
        if not filename.endswith('.dxf'):
            filename += '.dxf'
            
        path = os.path.join(exports_dir, filename)
        
        exporter = DXFExporter()
        project_data = copy.deepcopy(self.pm.project)
        success = exporter.export(project_data, path)
        
        if success:
            # Open the folder
            try:
                if os.name == 'nt':
                    os.startfile(exports_dir)
                else:
                    subprocess.Popen(['open', exports_dir])
            except:
                pass
            return json.dumps({'success': True, 'path': path})
        return json.dumps({'success': False, 'error': 'Export failed'})

    # ──────────────────────── AI Assistant ────────────────────────

    def _get_ai_context(self):
        """Build summarized project context for the AI with layer awareness."""
        layers = self.pm.project.get('layers', [])
        active_layer_id = self.pm.project.get('activeLayer', 'layer-0')
        layer_colors = {l['id']: l.get('color', '#ffffff') for l in layers}
        
        return {
            'name': self.pm.project.get('name', 'Untitled'),
            'settings': self.pm.project.get('settings', {}),
            'shapes_count': len(self.pm.project.get('shapes', [])),
            'layers': layers,
            'activeLayer': active_layer_id,
            'activeLayerColor': layer_colors.get(active_layer_id, '#ffffff'),
            'shapes_summary': [
                {'type': s.get('type', 'unknown'), 'id': s.get('id', 'unknown'), 'layer': s.get('layer', 'Unknown')} 
                for s in self.pm.project.get('shapes', []) if isinstance(s, dict)
            ]
        }

    def ai_chat(self, prompt):
        """Handle AI chat requests with context and drawing support."""
        context = self._get_ai_context()
        result = self.ai.get_chat_response(prompt, context)
        
        # If result is already a standardized dict, handle it directly
        if isinstance(result, dict):
            if result.get('draw'):
                for shape in result['draw']:
                    self.pm.add_shape(shape)
                self.sync_project_to_db()
            return json.dumps(result)
            
        # Fallback for simple string responses (e.g. errors or rate limits)
        return json.dumps({'text': str(result), 'draw': []})

    def ai_generate_start(self, name, description):
        """Generate starting shapes for a project."""
        shapes = self.ai.generate_starting_drawing(name, description)
        if shapes:
            for s in shapes:
                self.pm.add_shape(s)
            self.sync_project_to_db()
            return json.dumps({'success': True, 'shapes_count': len(shapes)})
        return json.dumps({'success': False, 'error': 'AI Generation failed or rate limited.'})

    def update_ai_config(self, api_key, provider='gemini', persist=False):
        """Update the AI assistant's API key and optionally persist it."""
        self.ai.set_api_key(api_key, persist=persist, provider=provider)
        return json.dumps({'success': True})

    def import_html_snippet(self, html_code, x=0, y=0):
        """Translate HTML/CSS/SVG into CAD shapes and add to project."""
        from html_cad_kernel import HTMLCADKernel
        kernel = HTMLCADKernel(base_x=float(x), base_y=float(y))
        try:
            shapes = kernel.translate(html_code)
            for s in shapes:
                self.pm.add_shape(s)
            self.sync_project_to_db()
            return json.dumps({'success': True, 'shapes_count': len(shapes)})
        except Exception as e:
            return json.dumps({'success': False, 'error': str(e)})

    def get_ai_config(self):
        """Retrieve the current AI configurations (masked keys)."""
        return json.dumps({
            'gemini_key': self.ai.get_api_key(provider='gemini'),
            'openrouter_key': self.ai.get_api_key(provider='openrouter'),
            'has_gemini': bool(self.ai.gemini_key),
            'has_openrouter': bool(self.ai.openrouter_key)
        })
