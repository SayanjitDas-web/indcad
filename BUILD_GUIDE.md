# IndCAD Build Guide

This document explains how to build the IndCAD executable and package it for distribution (Portable & Installer).

## Prerequisites

Ensure you have Python 3.10+ installed. It is highly recommended to use a virtual environment:

```bash
# Create a virtual environment
python -m venv venv

# Activate it (Windows)
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt pyinstaller Pillow
```

## Build Steps

### 1. Generate the Application Icon (Optional)
If you need to refresh the icon from `static/icon-raw.png` (or similar), run:
```bash
python make_icon.py
```

### 2. Build the Core Executable
The first step is to generate the base build and the PyInstaller `.spec` file. Run the batch file:
```bash
build.bat
```
*   **Result**: This creates `dist\IndCAD\IndCAD.exe` and `IndCAD.spec`.
*   **Note**: `build.bat` uses `--windowed`, so no terminal will appear when running the app.

### 3. Build the Distribution Package
To create the "Portable" ZIP and the "Installer" folder with a README:
```bash
python build_installer.py
```
*   **Output Folder**: `distribution/`
*   **IndCAD_v1.0_Portable.zip**: A ready-to-use standalone version.
*   **IndCAD_Installer/**: A folder containing the app and installation instructions.

## Verification
- Run `dist\IndCAD\IndCAD.exe` to ensure the app starts correctly.
- Verify that `static/` files are correctly bundled (the app should show the home page).

## Troubleshooting
- **Missing Spec File**: If `build_installer.py` fails saying it can't find `IndCAD.spec`, run `build.bat` first.
- **Folder Locking**: If building fails with "Access Denied" on the `distribution` folder, ensure no instances of IndCAD are running and try again.
