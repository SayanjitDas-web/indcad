/**
 * IndCAD Home Page Controller
 * Manages recent projects grid, new project modal, and navigation to editor.
 */

class HomeApp {
    constructor() {
        this.api = null;
        this.projects = [];
        this.selectedTemplate = 'blank';
        this._contextProjectId = null;
    }

    async init() {
        this.api = await this._waitForApi();
        this._bindEvents();
        await this._loadProjects();
        await this._checkAutoLoad();
    }

    _waitForApi() {
        return new Promise(resolve => {
            if (window.pywebview && window.pywebview.api) {
                resolve(window.pywebview.api);
                return;
            }
            window.addEventListener('pywebviewready', () => {
                resolve(window.pywebview.api);
            });
        });
    }

    // ──────────────────────── Events ────────────────────────

    _bindEvents() {
        // New project buttons
        document.getElementById('new-project-btn').addEventListener('click', () => this._showModal());
        document.getElementById('empty-new-btn').addEventListener('click', () => this._showModal());

        // Modal
        document.getElementById('modal-close-btn').addEventListener('click', () => this._hideModal());
        document.getElementById('cancel-btn').addEventListener('click', () => this._hideModal());
        document.getElementById('create-btn').addEventListener('click', () => this._createProject());
        document.querySelector('.modal-backdrop').addEventListener('click', () => this._hideModal());

        // Import
        document.getElementById('import-btn').addEventListener('click', () => this._importProject());

        // Context menu close
        document.addEventListener('click', () => this._hideContextMenu());

        // Enter key in project name
        document.getElementById('project-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._createProject();
        });

        // Escape closes modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this._hideModal();
        });

        // AI Configuration
        document.getElementById('home-ai-settings-btn').addEventListener('click', () => this._showAiModal());
        document.getElementById('ai-modal-close-btn').addEventListener('click', () => this._hideAiModal());
        document.getElementById('ai-cancel-btn').addEventListener('click', () => this._hideAiModal());
        document.getElementById('ai-save-btn').addEventListener('click', () => this._saveGlobalAiKey());

        // Context menu actions
        document.querySelectorAll('.ctx-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleContextAction(item.dataset.action);
                this._hideContextMenu();
            });
        });
    }

    // ──────────────────────── AI Configuration ────────────────────────

    async _showAiModal() {
        const modal = document.getElementById('ai-config-modal');
        const keyInput = document.getElementById('global-api-key');
        const orKeyInput = document.getElementById('global-or-key');
        const statusMsg = document.getElementById('ai-config-status');

        modal.classList.remove('hidden');
        statusMsg.classList.add('hidden');
        keyInput.value = '';
        orKeyInput.value = '';

        try {
            const result = await this.api.get_ai_config();
            const config = JSON.parse(result);
            if (config.has_gemini) {
                keyInput.placeholder = config.gemini_key;
            }
            if (config.has_openrouter) {
                orKeyInput.placeholder = config.openrouter_key;
            }
        } catch (e) {
            console.error('Failed to load AI config:', e);
        }
    }

    _hideAiModal() {
        document.getElementById('ai-config-modal').classList.add('hidden');
    }

    async _saveGlobalAiKey() {
        const keyInput = document.getElementById('global-api-key');
        const orKeyInput = document.getElementById('global-or-key');
        const statusMsg = document.getElementById('ai-config-status');

        const geminiKey = keyInput.value.trim();
        const orKey = orKeyInput.value.trim();

        if (!geminiKey && !orKey) {
            statusMsg.textContent = "Please enter at least one API key.";
            statusMsg.className = "status-msg error";
            statusMsg.classList.remove('hidden');
            return;
        }

        try {
            let success = true;
            if (geminiKey) {
                const res = await this.api.update_ai_config(geminiKey, 'gemini', true);
                if (!JSON.parse(res).success) success = false;
            }
            if (orKey) {
                const res = await this.api.update_ai_config(orKey, 'openrouter', true);
                if (!JSON.parse(res).success) success = false;
            }

            if (success) {
                statusMsg.textContent = "✅ AI Configuration saved globally!";
                statusMsg.className = "status-msg success";
                statusMsg.classList.remove('hidden');
                keyInput.value = '';
                orKeyInput.value = '';

                // Refresh placeholders
                const result = await this.api.get_ai_config();
                const config = JSON.parse(result);
                if (config.has_gemini) keyInput.placeholder = config.gemini_key;
                if (config.has_openrouter) orKeyInput.placeholder = config.openrouter_key;

                setTimeout(() => this._hideAiModal(), 1500);
            }
        } catch (e) {
            statusMsg.textContent = "❌ Error saving config: " + e.message;
            statusMsg.className = "status-msg error";
            statusMsg.classList.remove('hidden');
        }
    }

    // ──────────────────────── Projects List ────────────────────────

    async _loadProjects() {
        try {
            const result = await this.api.get_recent_projects();
            this.projects = JSON.parse(result);
            this._renderProjects();
        } catch (e) {
            console.error('Failed to load projects:', e);
        }
    }

    _renderProjects() {
        const grid = document.getElementById('projects-grid');
        const empty = document.getElementById('empty-state');
        const countEl = document.getElementById('project-count');

        if (this.projects.length === 0) {
            grid.classList.add('hidden');
            empty.classList.remove('hidden');
            countEl.textContent = '';
            return;
        }

        empty.classList.add('hidden');
        grid.classList.remove('hidden');
        countEl.textContent = `${this.projects.length} project${this.projects.length !== 1 ? 's' : ''}`;

        grid.innerHTML = '';

        this.projects.forEach(proj => {
            const card = document.createElement('div');
            card.className = 'project-card';
            card.dataset.id = proj.id;

            // Thumbnail
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'card-thumbnail';

            if (proj.thumbnail) {
                const img = document.createElement('img');
                img.src = proj.thumbnail;
                img.alt = proj.name;
                img.loading = 'lazy';
                thumbDiv.appendChild(img);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'thumb-placeholder';
                placeholder.innerHTML = `
                    <span class="thumb-icon">📐</span>
                    <span class="thumb-text">No preview</span>
                `;
                thumbDiv.appendChild(placeholder);
            }

            // Template badge
            if (proj.template && proj.template !== 'blank' && proj.template !== 'imported') {
                const badge = document.createElement('span');
                badge.className = 'card-template-badge';
                badge.textContent = proj.template;
                thumbDiv.appendChild(badge);
            }

            // Delete button overlay
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'card-actions';
            const delBtn = document.createElement('button');
            delBtn.className = 'card-action-btn';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete project';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._confirmDelete(proj.id, proj.name);
            });
            actionsDiv.appendChild(delBtn);
            thumbDiv.appendChild(actionsDiv);

            // Body
            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'card-body';

            const nameEl = document.createElement('div');
            nameEl.className = 'card-name';
            nameEl.textContent = proj.name;

            const descEl = document.createElement('div');
            descEl.className = 'card-desc';
            descEl.textContent = proj.description || '';

            const metaEl = document.createElement('div');
            metaEl.className = 'card-meta';

            const dateStr = this._formatDate(proj.updated_at);
            metaEl.innerHTML = `
                <span>🕐 ${dateStr}</span>
                <span>📐 ${proj.shape_count || 0}</span>
                <span>📋 ${proj.layer_count || 1}L</span>
            `;

            bodyDiv.appendChild(nameEl);
            bodyDiv.appendChild(descEl);
            bodyDiv.appendChild(metaEl);

            card.appendChild(thumbDiv);
            card.appendChild(bodyDiv);

            // Click to open
            card.addEventListener('click', () => this._openProject(proj.id));

            // Right click
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._contextProjectId = proj.id;
                this._showContextMenu(e.clientX, e.clientY);
            });

            grid.appendChild(card);
        });
    }

    _formatDate(timestamp) {
        if (!timestamp) return '—';
        const d = new Date(timestamp * 1000);
        const now = new Date();
        const diff = now - d;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ──────────────────────── Open / Create ────────────────────────

    async _openProject(projectId) {
        try {
            const result = await this.api.open_project_by_id(projectId);
            const data = JSON.parse(result);
            if (data.success) {
                // Navigate to editor
                window.location.href = 'index.html';
            } else {
                alert('Failed to open project: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            console.error('Failed to open project:', e);
        }
    }

    async _createProject() {
        const name = document.getElementById('project-name').value.trim() || 'Untitled Project';
        const desc = document.getElementById('project-desc').value.trim();

        try {
            const result = await this.api.create_new_project(name, desc, this.selectedTemplate);
            const data = JSON.parse(result);
            if (data.id) {
                // Navigate to editor
                window.location.href = 'index.html';
            }
        } catch (e) {
            console.error('Failed to create project:', e);
        }
    }

    async _importProject() {
        try {
            const result = await this.api.import_project_file();
            const data = JSON.parse(result);
            if (data.success) {
                await this._loadProjects();
            }
        } catch (e) {
            console.error('Import failed:', e);
        }
    }

    // ──────────────────────── Delete ────────────────────────

    async _confirmDelete(projectId, projectName) {
        if (confirm(`Delete "${projectName}"? This cannot be undone.`)) {
            try {
                await this.api.delete_project_by_id(projectId);
                await this._loadProjects();
            } catch (e) {
                console.error('Delete failed:', e);
            }
        }
    }

    // ──────────────────────── Modal ────────────────────────

    async _showModal() {
        const modal = document.getElementById('new-project-modal');
        modal.classList.remove('hidden');
        document.getElementById('project-name').value = '';
        document.getElementById('project-desc').value = '';
        document.getElementById('project-name').focus();

        // Load templates
        try {
            const result = await this.api.get_templates();
            const templates = JSON.parse(result);
            this._renderTemplates(templates);
        } catch (e) {
            console.error('Failed to load templates:', e);
        }
    }

    _hideModal() {
        document.getElementById('new-project-modal').classList.add('hidden');
    }

    _renderTemplates(templates) {
        const grid = document.getElementById('template-grid');
        grid.innerHTML = '';
        this.selectedTemplate = 'blank';

        templates.forEach(t => {
            const card = document.createElement('div');
            card.className = 'template-card' + (t.id === 'blank' ? ' selected' : '');
            card.dataset.id = t.id;

            card.innerHTML = `
                <span class="template-icon">${t.icon}</span>
                <div class="template-name">${t.name}</div>
                <div class="template-desc">${t.description}</div>
            `;

            card.addEventListener('click', () => {
                grid.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedTemplate = t.id;
            });

            grid.appendChild(card);
        });
    }

    // ──────────────────────── Context Menu ────────────────────────

    _showContextMenu(x, y) {
        const menu = document.getElementById('context-menu');
        menu.classList.remove('hidden');
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        // Keep on screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
    }

    _hideContextMenu() {
        document.getElementById('context-menu').classList.add('hidden');
        this._contextProjectId = null;
    }

    async _handleContextAction(action) {
        if (!this._contextProjectId) return;
        const pid = this._contextProjectId;

        switch (action) {
            case 'open':
                this._openProject(pid);
                break;
            case 'rename':
                const newName = prompt('Enter new name:');
                if (newName && newName.trim()) {
                    await this.api.rename_project(pid, newName.trim());
                    await this._loadProjects();
                }
                break;
            case 'delete':
                const proj = this.projects.find(p => p.id === pid);
                this._confirmDelete(pid, proj ? proj.name : 'Project');
                break;
        }
    }

    async _checkAutoLoad() {
        // Check for noautoload param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('noautoload') === 'true') return;

        try {
            const result = await this.api.get_last_project();
            const data = JSON.parse(result);
            if (data.success && data.project) {
                console.log('Auto-loading last project:', data.project.id);
                this._openProject(data.project.id);
            }
        } catch (e) {
            console.error('Auto-load failed:', e);
        }
    }
}

// ──────────────────────── Bootstrap ────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const app = new HomeApp();
    app.init().catch(err => console.error('Home init failed:', err));
});
