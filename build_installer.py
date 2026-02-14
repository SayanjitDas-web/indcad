import os
import shutil
import zipfile
import subprocess
import time

def build():
    print("🚀 Starting IndCAD Distribution Build...")
    # Get absolute paths relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(script_dir)
    dist_dir = os.path.join(root, 'dist', 'IndCAD')
    output_root = os.path.join(root, 'distribution')
    portable_dir = os.path.join(output_root, 'IndCAD_Portable')
    installer_dir = os.path.join(output_root, 'IndCAD_Installer')

    # 1. Clean previous builds
    print("🧹 Cleaning previous builds...")
    if os.path.exists(output_root):
        # Retry logic for Windows folder locking
        for i in range(5):
            try:
                shutil.rmtree(output_root)
                break
            except:
                time.sleep(1)
    
    os.makedirs(portable_dir, exist_ok=True)
    os.makedirs(installer_dir, exist_ok=True)

    # 1.5 Install Dependencies
    print("📥 Installing build dependencies...")
    try:
        subprocess.run(['python', '-m', 'pip', 'install', 'pyinstaller', 'Pillow', 'ezdxf', 'python-dotenv', 'bottle', 'pywebview'], check=True)
    except Exception as e:
        print(f"⚠️ Dependency install warning: {e}")

    # 2. Run PyInstaller
    print("📦 Running PyInstaller (this may take a minute)...")
    try:
        subprocess.run(['python', '-m', 'PyInstaller', 'IndCAD.spec', '--noconfirm'], cwd=root, check=True, shell=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ PyInstaller failed: {e}")
        return

    if not os.path.exists(dist_dir):
        print("❌ Error: PyInstaller failed to produce output in 'dist/IndCAD'.")
        return

    # 3. Create Portable Version
    print("🚚 Organizing Portable Version...")
    portable_app_dir = os.path.join(portable_dir, 'IndCAD')
    shutil.copytree(dist_dir, portable_app_dir, dirs_exist_ok=True)
    
    # Add extra files
    if os.path.exists(os.path.join(root, '.env.example')):
        shutil.copy(os.path.join(root, '.env.example'), os.path.join(portable_app_dir, '.env.example'))
    
    # Create ZIP
    print("zipping Portable Version...")
    zip_path = os.path.join(output_root, 'IndCAD_v1.0_Portable.zip')
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for r, dirs, files in os.walk(portable_dir):
            for file in files:
                abs_path = os.path.join(r, file)
                rel_path = os.path.relpath(abs_path, portable_dir)
                zipf.write(abs_path, rel_path)
    print(f"✅ Portable ZIP created: {zip_path}")

    # 4. Create Installer Folder
    print("📂 Organizing Installer Folder...")
    installer_app_dir = os.path.join(installer_dir, 'IndCAD_App')
    shutil.copytree(dist_dir, installer_app_dir, dirs_exist_ok=True)
    
    readme_content = """IndCAD v1.0 - Installation Guide
==================================

IndCAD is a professional, AI-powered CAD solution.

To use IndCAD:
1. Copy the 'IndCAD_App' folder to your computer (e.g., C:\\IndCAD).
2. Right-click 'IndCAD.exe' inside the folder and select 'Send to' -> 'Desktop (create shortcut)'.
3. Double-click the desktop shortcut to launch IndCAD.

System Requirements:
- Windows 10/11
- WebView2 Runtime (usually included with Windows)

Data & Settings:
- Your projects are automatically saved to your user profile (~/.indcad/).
- You can set your Gemini API key in the AI Assistant settings within the app.

Thank you for using IndCAD!
"""
    with open(os.path.join(installer_dir, 'README.txt'), 'w') as f:
        f.write(readme_content)

    print(f"✨ Distribution ready in: {output_root}")
    print(f"   - Portable: {zip_path}")
    print(f"   - Installer: {installer_dir}")

if __name__ == "__main__":
    build()
