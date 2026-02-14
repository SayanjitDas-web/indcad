/**
 * UI Controller
 * Handles panel resizing (splitter), collapsing sections, and global panel toggle.
 */

class UIController {
    constructor(app) {
        this.app = app;
        this.resizer = document.getElementById('panel-resizer');
        this.panel = document.getElementById('right-panel');
        this.toggle = document.getElementById('panel-toggle');

        this.isDragging = false;
        this.minWidth = 150;
        this.maxWidth = 600;
        this.defaultWidth = 260;

        this.init();
    }

    init() {
        // Load saved preferences
        const savedWidth = localStorage.getItem('indcad_panel_width');
        if (savedWidth) this.panel.style.width = savedWidth + 'px';


        // Splitter events
        this.resizer.addEventListener('mousedown', this._onMouseDown.bind(this));
        document.addEventListener('mousemove', this._onMouseMove.bind(this));
        document.addEventListener('mouseup', this._onMouseUp.bind(this));

        // Global toggle
        if (this.toggle) {
            this.toggle.addEventListener('click', () => {
                this.panel.classList.toggle('collapsed');
                setTimeout(() => this.app.engine?.resize(), 350);
            });
        }


        // Snap Settings Menu
        this._initSnapMenu();

        // Collapsible sections
        document.querySelectorAll('.panel-header.collapsible').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.panel-btn') && !e.target.closest('.collapse-btn')) return;
                const panel = header.closest('.panel');
                panel.classList.toggle('collapsed');
            });
        });
    }

    _initSnapMenu() {
        const menuBtn = document.getElementById('snap-menu-toggle');
        const menu = document.getElementById('snap-settings-menu');
        if (!menuBtn || !menu) return;

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('active');
        });

        document.addEventListener('click', () => menu.classList.remove('active'));
        menu.addEventListener('click', (e) => e.stopPropagation());

        // Checkbox changes
        menu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const type = cb.dataset.snap;
                if (this.app.tools) {
                    if (!this.app.tools.snapSettings) this.app.tools.snapSettings = {};
                    this.app.tools.snapSettings[type] = cb.checked;

                    if (type === 'grid') {
                        this.app.tools.gridSnap = cb.checked;
                    }

                    if (this.app.engine) this.app.engine.snapSettings = this.app.tools.snapSettings;
                }

                // special case for grid snap which also affects gridVisibility if desired?
                // Actually, let's keep gridSnap and gridSize logic in ToolManager for now.
            });
        });

        // Command buttons
        menu.querySelectorAll('.menu-cmd').forEach(cmd => {
            cmd.addEventListener('click', () => {
                const action = cmd.dataset.cmd;
                const checkboxes = menu.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.checked = (action === 'snap-all');
                    cb.dispatchEvent(new Event('change'));
                });
            });
        });
    }

    _onMouseDown(e) {
        this.isDragging = true;
        this.resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    }

    _onMouseMove(e) {
        if (!this.isDragging) return;

        const newWidth = window.innerWidth - e.clientX;

        if (newWidth >= this.minWidth && newWidth <= this.maxWidth) {
            this.panel.style.width = newWidth + 'px';
            localStorage.setItem('indcad_panel_width', newWidth);

            // Notify engine to resize (Debounced ideally, but direct is okay for now)
            if (this.app.engine) this.app.engine.resize();
        }
    }

    _onMouseUp() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.resizer.classList.remove('dragging');
        document.body.style.cursor = '';
    }
}

// Export or global attach
window.UIController = UIController;
