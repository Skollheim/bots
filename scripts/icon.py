"""Draws Bots's icon: a robot head of the app's own design, flat shapes only."""
import sys
from PIL import Image, ImageDraw

SIZE = 1024
S = 4  # supersampling
out = sys.argv[1]
img = Image.new("RGBA", (SIZE * S, SIZE * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
k = lambda v: int(v * S)

body = (52, 211, 153, 255)   # mint
dark = (17, 24, 39, 255)     # face plate
eye = (236, 253, 245, 255)
accent = (251, 191, 36, 255) # antenna bulb

# antenna
d.rounded_rectangle([k(496), k(110), k(528), k(250)], radius=k(16), fill=body)
d.ellipse([k(452), k(56), k(572), k(176)], fill=accent)
# ears
d.rounded_rectangle([k(96), k(430), k(170), k(650)], radius=k(30), fill=body)
d.rounded_rectangle([k(854), k(430), k(928), k(650)], radius=k(30), fill=body)
# head
d.rounded_rectangle([k(150), k(230), k(874), k(900)], radius=k(170), fill=body)
# face plate
d.rounded_rectangle([k(226), k(330), k(798), k(780)], radius=k(120), fill=dark)
# eyes
d.rounded_rectangle([k(330), k(450), k(450), k(600)], radius=k(56), fill=eye)
d.rounded_rectangle([k(574), k(450), k(694), k(600)], radius=k(56), fill=eye)
# smile
d.arc([k(420), k(560), k(604), k(720)], start=30, end=150, fill=eye, width=k(22))

img.resize((SIZE, SIZE), Image.LANCZOS).save(out)
