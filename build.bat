@echo off
echo Installing build dependencies...
pip install pyinstaller Pillow

echo Generating icon...
python make_icon.py

echo Building IndCAD...
pyinstaller --noconfirm ^
    --name "IndCAD" ^
    --windowed ^
    --icon "icon.ico" ^
    --add-data "static;static" ^
    --hidden-import "engineio.async_drivers.threading" ^
    main.py

echo Build complete!
echo Executable is in dist\IndCAD\IndCAD.exe
pause
