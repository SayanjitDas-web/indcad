"""
IndCAD Database Module
SQLite database for project metadata, recent files, and thumbnail storage.
"""
import sqlite3
import os
import json
import time
import uuid
import base64


class Database:
    """SQLite database for IndCAD project management."""

    def __init__(self, db_path=None):
        if db_path is None:
            # Store in user's AppData
            app_data = os.path.join(os.path.expanduser('~'), '.indcad')
            os.makedirs(app_data, exist_ok=True)
            db_path = os.path.join(app_data, 'indcad.db')

        self.db_path = db_path
        self.projects_dir = os.path.join(os.path.expanduser('~'), '.indcad', 'projects')
        os.makedirs(self.projects_dir, exist_ok=True)
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self):
        conn = self._get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                file_path TEXT,
                description TEXT DEFAULT '',
                template TEXT DEFAULT 'blank',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                shape_count INTEGER DEFAULT 0,
                layer_count INTEGER DEFAULT 1,
                thumbnail TEXT,
                project_data TEXT
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS global_blocks (
                name TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at REAL NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
        """)
        conn.commit()
        conn.close()

    def get_last_project_id(self):
        """Get the ID of the last opened project."""
        return self.get_setting('last_project_id')

    def set_last_project_id(self, project_id):
        """Set the ID of the last opened project."""
        self.set_setting('last_project_id', project_id)

    # ──────────────────────── Project CRUD ────────────────────────

    def create_project(self, name, description='', template='blank'):
        """Create a new project and return its metadata."""
        project_id = str(uuid.uuid4())
        now = time.time()

        # Create project file
        file_path = os.path.join(self.projects_dir, f'{project_id}.icad')

        # Build initial project data based on template
        project_data = self._get_template_data(name, template)

        # Save to file
        with open(file_path, 'w') as f:
            json.dump(project_data, f, indent=2)

        # Save to database
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO projects (id, name, file_path, description, template,
                                  created_at, updated_at, shape_count, layer_count, project_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (project_id, name, file_path, description, template,
              now, now, len(project_data.get('shapes', [])),
              len(project_data.get('layers', [])),
              json.dumps(project_data)))
        conn.commit()
        conn.close()

        return {
            'id': project_id,
            'name': name,
            'file_path': file_path,
            'description': description,
            'template': template,
            'created_at': now,
            'updated_at': now,
            'shape_count': len(project_data.get('shapes', [])),
            'layer_count': len(project_data.get('layers', [])),
            'data': project_data
        }

    def get_project(self, project_id):
        """Get a project by ID."""
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        conn.close()
        if row:
            return dict(row)
        return None

    def update_project(self, project_id, project_data, thumbnail=None):
        """Update project data and metadata."""
        now = time.time()
        shapes = project_data.get('shapes', [])
        layers = project_data.get('layers', [])
        name = project_data.get('name', 'Untitled')

        conn = self._get_conn()
        try:
            if thumbnail:
                conn.execute("""
                    UPDATE projects SET name=?, updated_at=?, shape_count=?,
                    layer_count=?, thumbnail=?, project_data=? WHERE id=?
                """, (name, now, len(shapes), len(layers), thumbnail,
                      json.dumps(project_data), project_id))
            else:
                conn.execute("""
                    UPDATE projects SET name=?, updated_at=?, shape_count=?,
                    layer_count=?, project_data=? WHERE id=?
                """, (name, now, len(shapes), len(layers),
                      json.dumps(project_data), project_id))
            conn.commit()
        except Exception as e:
            print(f"Database update failed: {e}")
        finally:
            conn.close()

        # Also save to file (Atomic write)
        proj = self.get_project(project_id)
        if proj and proj.get('file_path'):
            file_path = proj['file_path']
            try:
                temp_path = file_path + ".tmp"
                with open(temp_path, 'w') as f:
                    json.dump(project_data, f, indent=2)
                
                # Windows replacement logic
                if os.path.exists(file_path):
                    os.replace(temp_path, file_path)
                else:
                    os.rename(temp_path, file_path)
            except Exception as e:
                print(f"File update failed: {e}")

    def delete_project(self, project_id):
        """Delete a project."""
        proj = self.get_project(project_id)
        if proj and proj.get('file_path'):
            try:
                os.remove(proj['file_path'])
            except OSError:
                pass

        conn = self._get_conn()
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
        conn.close()

    def get_recent_projects(self, limit=20):
        """Get recently updated projects."""
        conn = self._get_conn()
        rows = conn.execute("""
            SELECT id, name, file_path, description, template,
                   created_at, updated_at, shape_count, layer_count, thumbnail
            FROM projects ORDER BY updated_at DESC LIMIT ?
        """, (limit,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_all_projects(self):
        """Get all projects."""
        conn = self._get_conn()
        rows = conn.execute("""
            SELECT id, name, file_path, description, template,
                   created_at, updated_at, shape_count, layer_count, thumbnail
            FROM projects ORDER BY updated_at DESC
        """).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def save_thumbnail(self, project_id, data_url):
        """Save a thumbnail image for a project."""
        conn = self._get_conn()
        conn.execute("UPDATE projects SET thumbnail=? WHERE id=?", (data_url, project_id))
        conn.commit()
        conn.close()

    def import_project_file(self, file_path):
        """Import an existing .icad file into the database."""
        if not os.path.exists(file_path):
            return None

        with open(file_path, 'r') as f:
            project_data = json.load(f)

        project_id = str(uuid.uuid4())
        now = time.time()
        name = project_data.get('name', os.path.splitext(os.path.basename(file_path))[0])

        # Copy to projects directory
        dest_path = os.path.join(self.projects_dir, f'{project_id}.icad')
        with open(dest_path, 'w') as f:
            json.dump(project_data, f, indent=2)

        conn = self._get_conn()
        conn.execute("""
            INSERT INTO projects (id, name, file_path, description, template,
                                  created_at, updated_at, shape_count, layer_count, project_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (project_id, name, dest_path, '', 'imported',
              now, now, len(project_data.get('shapes', [])),
              len(project_data.get('layers', [])),
              json.dumps(project_data)))
        conn.commit()
        conn.close()

        return {
            'id': project_id,
            'name': name,
            'file_path': dest_path,
            'data': project_data
        }

    # ──────────────────────── Settings ────────────────────────

    def get_setting(self, key, default=None):
        conn = self._get_conn()
        row = conn.execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
        conn.close()
        if row:
            return row['value']
        return default

    def set_setting(self, key, value):
        conn = self._get_conn()
        conn.execute("""
            INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
        """, (key, str(value)))
        conn.commit()
        conn.close()

    # ──────────────────────── Global Blocks ────────────────────────

    def save_global_block(self, name, data):
        """Save a block definition to the global library."""
        now = time.time()
        conn = self._get_conn()
        conn.execute("""
            INSERT OR REPLACE INTO global_blocks (name, data, updated_at)
            VALUES (?, ?, ?)
        """, (name, json.dumps(data), now))
        conn.commit()
        conn.close()

    def get_global_blocks(self):
        """Get all block names from the global library."""
        conn = self._get_conn()
        rows = conn.execute("SELECT name, updated_at FROM global_blocks ORDER BY name ASC").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_global_block(self, name):
        """Get a specific block definition from the library."""
        conn = self._get_conn()
        row = conn.execute("SELECT data FROM global_blocks WHERE name = ?", (name,)).fetchone()
        conn.close()
        if row:
            return json.loads(row['data'])
        return None

    def delete_global_block(self, name):
        """Delete a block from the global library."""
        conn = self._get_conn()
        conn.execute("DELETE FROM global_blocks WHERE name = ?", (name,))
        conn.commit()
        conn.close()

    # ──────────────────────── Templates ────────────────────────

    def _get_template_data(self, name, template):
        """Get initial project data for a template."""
        base = {
            'name': name,
            'shapes': [],
            'layers': [
                {'id': 'layer-0', 'name': 'Layer 0', 'color': '#ffffff', 'visible': True, 'locked': False}
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

        if template == 'mechanical':
            base['layers'] = [
                {'id': 'layer-outline', 'name': 'Outline', 'color': '#ffffff', 'visible': True, 'locked': False},
                {'id': 'layer-hidden', 'name': 'Hidden Lines', 'color': '#888888', 'visible': True, 'locked': False},
                {'id': 'layer-center', 'name': 'Center Lines', 'color': '#ff0000', 'visible': True, 'locked': False},
                {'id': 'layer-dimensions', 'name': 'Dimensions', 'color': '#00ff88', 'visible': True, 'locked': False},
                {'id': 'layer-notes', 'name': 'Notes', 'color': '#ffcc00', 'visible': True, 'locked': False},
            ]
            base['activeLayer'] = 'layer-outline'
            base['settings']['gridSize'] = 5

        elif template == 'architectural':
            base['layers'] = [
                {'id': 'layer-walls', 'name': 'Walls', 'color': '#ffffff', 'visible': True, 'locked': False},
                {'id': 'layer-doors', 'name': 'Doors & Windows', 'color': '#00d4ff', 'visible': True, 'locked': False},
                {'id': 'layer-furniture', 'name': 'Furniture', 'color': '#ff9500', 'visible': True, 'locked': False},
                {'id': 'layer-electrical', 'name': 'Electrical', 'color': '#ff3b30', 'visible': True, 'locked': False},
                {'id': 'layer-plumbing', 'name': 'Plumbing', 'color': '#34c759', 'visible': True, 'locked': False},
                {'id': 'layer-dimensions', 'name': 'Dimensions', 'color': '#ffcc00', 'visible': True, 'locked': False},
                {'id': 'layer-annotations', 'name': 'Annotations', 'color': '#8b8b8b', 'visible': True, 'locked': False},
            ]
            base['activeLayer'] = 'layer-walls'
            base['settings']['gridSize'] = 10

        elif template == 'electrical':
            base['layers'] = [
                {'id': 'layer-schematic', 'name': 'Schematic', 'color': '#ffffff', 'visible': True, 'locked': False},
                {'id': 'layer-power', 'name': 'Power Lines', 'color': '#ff3b30', 'visible': True, 'locked': False},
                {'id': 'layer-signal', 'name': 'Signal Lines', 'color': '#00d4ff', 'visible': True, 'locked': False},
                {'id': 'layer-ground', 'name': 'Ground', 'color': '#34c759', 'visible': True, 'locked': False},
                {'id': 'layer-labels', 'name': 'Labels', 'color': '#ffcc00', 'visible': True, 'locked': False},
            ]
            base['activeLayer'] = 'layer-schematic'
            base['settings']['gridSize'] = 5

        elif template == 'pcb':
            base['layers'] = [
                {'id': 'layer-top', 'name': 'Top Copper', 'color': '#ff3b30', 'visible': True, 'locked': False},
                {'id': 'layer-bottom', 'name': 'Bottom Copper', 'color': '#007aff', 'visible': True, 'locked': False},
                {'id': 'layer-silkscreen', 'name': 'Silkscreen', 'color': '#ffffff', 'visible': True, 'locked': False},
                {'id': 'layer-drill', 'name': 'Drill Holes', 'color': '#34c759', 'visible': True, 'locked': False},
                {'id': 'layer-outline', 'name': 'Board Outline', 'color': '#ffcc00', 'visible': True, 'locked': False},
            ]
            base['activeLayer'] = 'layer-top'
            base['settings']['gridSize'] = 2.54

        return base

    def get_available_templates(self):
        """Return list of available project templates."""
        return [
            {
                'id': 'blank',
                'name': 'Blank Project',
                'description': 'Start from scratch with a single default layer',
                'icon': '📄',
                'color': '#6e7681'
            },
            {
                'id': 'mechanical',
                'name': 'Mechanical Drawing',
                'description': 'Pre-configured layers for mechanical part drawings',
                'icon': '⚙️',
                'color': '#58a6ff'
            },
            {
                'id': 'architectural',
                'name': 'Architectural Plan',
                'description': 'Floor plans with walls, doors, electrical, plumbing layers',
                'icon': '🏠',
                'color': '#f0883e'
            },
            {
                'id': 'electrical',
                'name': 'Electrical Schematic',
                'description': 'Circuit diagram with schematic and signal layers',
                'icon': '⚡',
                'color': '#ff3b30'
            },
            {
                'id': 'pcb',
                'name': 'PCB Layout',
                'description': 'Printed circuit board with copper and silkscreen layers',
                'icon': '🔲',
                'color': '#34c759'
            },
        ]
