from PIL import Image
import os

sizes = [72, 96, 128, 192, 512]
os.makedirs("static/icons", exist_ok=True)
# Using public/logo.png as found in the directory
logo_path = "public/logo.png"

if os.path.exists(logo_path):
    src = Image.open(logo_path).convert("RGBA")
    for s in sizes:
        img = src.resize((s, s), Image.LANCZOS)
        img.save(f"static/icons/icon-{s}.png")
    print("Icons generated successfully.")
else:
    print(f"Error: {logo_path} not found.")
