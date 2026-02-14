from PIL import Image, ImageDraw

def create_icon():
    # Create a 256x256 image
    img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw rounded rect background (dark blue)
    draw.rounded_rectangle([(10, 10), (246, 246)], radius=40, fill='#0d1117', outline='#0078d4', width=10)

    # Draw grid lines
    for i in range(40, 220, 40):
        draw.line([(i, 40), (i, 216)], fill='#1c2128', width=2)
        draw.line([(40, i), (216, i)], fill='#1c2128', width=2)

    # Draw "IC" text or shape
    # Cyan circle
    draw.ellipse([(60, 60), (196, 196)], outline='#00d4ff', width=8)
    # Green line
    draw.line([(60, 196), (196, 60)], fill='#00ff88', width=8)
    # Blue square
    draw.rectangle([(100, 100), (156, 156)], outline='#58a6ff', width=6)

    try:
        img.save('icon.ico', format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
        print("Icon created successfully: icon.ico")
    except Exception as e:
        print(f"Failed to create icon: {e}")

if __name__ == '__main__':
    try:
        import PIL
        create_icon()
    except ImportError:
        print("Pillow not installed. Installing...")
        import os
        os.system('pip install Pillow')
        create_icon()
