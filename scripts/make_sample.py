"""Deterministic synthetic viewer fixture; not biological observations."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math, random
root = Path(__file__).resolve().parents[1]
(root / 'public').mkdir(exist_ok=True)
random.seed(71)
im = Image.new('RGB', (1200, 800), '#343a3a')
d = ImageDraw.Draw(im)
for x in range(0,1200,100): d.line((x,0,x,800),fill='#454d4c')
for y in range(0,800,100): d.line((0,y,1200,y),fill='#454d4c')
d.polygon([(100,410),(175,310),(340,195),(590,155),(880,225),(1080,340),(1090,650),(800,720),(370,685),(150,550)],fill='#b1b4a8')
d.ellipse((285,225,500,425),fill='#747c73',outline='#d8d6b9',width=9)
d.ellipse((329,257,462,391),fill='#2e3c39',outline='#8e9a88',width=8)
d.ellipse((351,270,412,321),fill='#4b5c52')
d.arc((102,350,570,625),5,170,fill='#646e65',width=8)
d.arc((380,210,1010,730),-65,68,fill='#7c897a',width=9)
d.arc((250,275,1055,795),-45,45,fill='#d4d4bc',width=7)
for j in range(9):
    for i in range(8+j):
        x=220+i*39+random.uniform(-4,4)
        y=470+j*18+math.sin(i*.37+j*.3)*20
        r=3.7
        d.ellipse((x-r,y-r,x+r,y+r),fill='#565f54',outline='#dddfc8')
for _ in range(7000):
    x=random.randrange(130,1050); y=random.randrange(230,680)
    if im.getpixel((x,y))==(177,180,168):
        v=random.randrange(154,192); d.point((x,y),fill=(v,v+2,v-9))
d.text((30,25),'SYNTHETIC QA IMAGE - NOT RESEARCH DATA',fill='#d0e1d7',font_size=24)
d.text((30,60),'1200 x 800 px | Original top-left origin (0, 0)',fill='#a5b9af',font_size=16)
d.line((925,750,1125,750),fill='#fff2d5',width=5)
d.text((960,760),'200 px (test)',fill='#fff2d5',font_size=16)
im.save(root/'public'/'sample.png')
im.save(root/'tests'/'sample.tif',compression='tiff_lzw')
im.resize((600,400)).save(root/'tests'/'sample-small.jpg',quality=95)
print('Created PNG / TIFF / JPG synthetic QA fixtures')
