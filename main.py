"""
IndCAD - Native Windows CAD Application
Entry point: creates a pywebview native window with HTML Canvas frontend.
Shows home page first, then navigates to editor when a project is opened.
"""
import os
import sys
import webview

from api import Api


def main():
    # Resolve the static directory path
    if hasattr(sys, 'frozen'):
        base_dir = os.path.join(sys._MEIPASS, 'static')
        home_path = os.path.join(base_dir, 'home.html')
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        home_path = os.path.join(base_dir, 'static', 'home.html')

    # Fallback to editor if home doesn't exist yet
    if not os.path.exists(home_path):
        home_path = os.path.join(base_dir, 'static', 'index.html')

    if not os.path.exists(home_path):
        print(f"Error: Could not find {home_path}")
        sys.exit(1)

    # Create the API bridge
    api = Api()

    # Create native window — starts with home page
    window = webview.create_window(
        title='IndCAD',
        url=home_path,
        js_api=api,
        width=1400,
        height=900,
        min_size=(1024, 600),
        background_color='#0d1117',
        text_select=False,
    )

    # Give the API a reference to the window (for file dialogs)
    api.set_window(window)

    # Start the application
    webview.start(debug=True)


if __name__ == '__main__':
    main()
