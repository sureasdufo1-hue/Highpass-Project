from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

root = Path(r"C:\Users\user\Documents\New project\tmp_doc_work\single_table_render")
groups = [(40, 44), (45, 49), (50, 54)]
for start, end in groups:
    thumbs = []
    for page in range(start, end + 1):
        image = Image.open(root / f"qa-{page:02}.png").convert("RGB")
        image.thumbnail((510, 660))
        canvas = Image.new("RGB", (530, 700), "white")
        canvas.paste(image, ((530-image.width)//2, 24))
        ImageDraw.Draw(canvas).text((10, 8), f"Page {page}", fill="black")
        thumbs.append(ImageOps.expand(canvas, border=1, fill="#777777"))
    sheet = Image.new("RGB", (len(thumbs)*532, 702), "#dddddd")
    for i, thumb in enumerate(thumbs):
        sheet.paste(thumb, (i*532, 0))
    sheet.save(root / f"contact-{start}-{end}.png")
