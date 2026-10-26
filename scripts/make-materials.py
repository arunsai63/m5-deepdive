"""Original, deterministic semiconductor texture assets. No downloaded die imagery.

Run with Python + Pillow + NumPy. Full-resolution masters and browser maps are
written beside the page. Floorplan is illustrative, not Apple's mask layout.
"""
from pathlib import Path
import json
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = Path(__file__).resolve().parents[1] / 'assets' / 'materials'
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(52026)
nrng = np.random.default_rng(52026)
S = 8192

def save(image, name, quality=97):
    image.save(OUT / f'{name}.webp', quality=quality, method=6)
    print(name, image.size, flush=True)

def font(size):
    for path in ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if Path(path).exists(): return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)

# Silica passivation has restrained, spatially coherent interference color.
# Draw the structured topology first; its subdivisions are intentionally legible
# from millimetres down to the transition into the explicit geometry scene.
die = Image.new('RGB', (S, S), '#292c35')
d = ImageDraw.Draw(die)
height = Image.new('L', (S, S), 38)
h = ImageDraw.Draw(height)
regions = []
palette = [(164,143,88),(128,133,108),(134,104,134),(92,135,135),
           (168,117,83),(103,112,149),(153,148,106)]

def bus(x0, y0, x1, y1, vertical=False, pitch=12):
    if vertical:
        for x in range(x0, x1, pitch):
            col = rng.choice(palette)
            d.line((x,y0,x,y1), fill=col, width=3)
            h.line((x,y0,x,y1), fill=132, width=3)
            for y in range(y0+30, y1, 146):
                d.rectangle((x-1,y-1,x+3,y+3), fill='#c3b47b')
    else:
        for y in range(y0, y1, pitch):
            col = rng.choice(palette)
            d.line((x0,y,x1,y), fill=col, width=3)
            h.line((x0,y,x1,y), fill=132, width=3)
            for x in range(x0+30, x1, 146):
                d.rectangle((x-1,y-1,x+3,y+3), fill='#c3b47b')

def block(x,y,w,ht,kind,pal):
    regions.append(dict(x=x,y=y,w=w,h=ht,kind=kind))
    col = palette[pal % len(palette)]
    base = tuple(int(c*.48) for c in col)
    d.rectangle((x,y,x+w,y+ht), fill=base, outline=col, width=6)
    d.rectangle((x+11,y+11,x+w-11,y+ht-11), outline=tuple(int(c*.8) for c in col), width=2)
    h.rectangle((x,y,x+w,y+ht), fill=75, outline=170, width=5)
    if kind in ['cache','sram']:
        # SRAM is visually dense and regular: banks, decoder strips, bit lines.
        for bx in range(x+24,x+w-28,130):
            for by in range(y+24,y+ht-28,186):
                bw=min(110,x+w-bx-18); bh=min(164,y+ht-by-18)
                d.rectangle((bx,by,bx+bw,by+bh), fill=tuple(int(c*.70) for c in col))
                for yy in range(by+4,by+bh,7):
                    d.line((bx+3,yy,bx+bw-3,yy), fill=col,width=2)
                    h.line((bx+3,yy,bx+bw-3,yy), fill=117,width=2)
                for xx in range(bx+8,bx+bw-3,14):
                    d.line((xx,by,xx,by+bh),fill=base,width=2)
                d.rectangle((bx,by+bh-7,bx+bw,by+bh),fill='#c5a66b')
    else:
        # Place-and-route logic: standard-cell rows, local routing, macro gaps.
        for yy in range(y+22,y+ht-24,17):
            cursor=x+20
            while cursor<x+w-24:
                cw=min(rng.choice([12,20,26,35,48,66]),x+w-22-cursor)
                c=tuple(max(0,min(255,int(v*rng.uniform(.65,1.15)))) for v in col)
                d.rectangle((cursor,yy,cursor+cw,yy+8),fill=c)
                h.rectangle((cursor,yy,cursor+cw,yy+8),fill=rng.randrange(80,130))
                if rng.random()>.75:
                    d.line((cursor+2,yy+2,cursor+cw-2,yy+2),fill='#c4b490',width=1)
                cursor+=cw+rng.randrange(4,9)
        for j in range(max(8,w//25)):
            xx=rng.randrange(x+16,x+w-16); yy=rng.randrange(y+16,y+ht-36)
            end=min(yy+rng.randrange(30,max(31,ht//2)),y+ht-16)
            d.line((xx,yy,xx,end,xx+8,end),fill=col,width=2)
            h.line((xx,yy,xx,end,xx+8,end),fill=145,width=2)

# Four large CPU complexes, six smaller cores, ten GPU tiles, memory and I/O.
for row in range(2):
    for col in range(2):
        x=300+col*1370; y=320+row*1550
        block(x,y,1300,1000,'logic',4+row)
        block(x,y+1030,1300,440,'cache',0)
for row in range(2):
    for col in range(3):
        block(305+col*900,3510+row*655,845,590,'logic',3+row)
block(300,4870,2670,1210,'cache',1)
block(300,6160,2670,1510,'sram',3)
for row in range(5):
    for col in range(2):
        x=3450+col*1495; y=320+row*1200
        block(x,y,1420,760,'logic',row%3)
        block(x,y+784,1420,335,'cache',row%3)
for i in range(4):
    block(3450+i*730,6370,670,1310,'logic',2)
for i in range(6):
    block(6570,320+i*1210,1315,1110,'sram' if i<3 else 'logic',i)
bus(3070,285,3310,7760,True,13)
bus(6350,285,6470,7760,True,10)
bus(260,6170,6310,6270,False,9)
for inset in [80,94,108,132,158,180,211]:
    d.rectangle((inset,inset,S-inset,S-inset),outline=palette[inset%7],width=3)
    h.rectangle((inset,inset,S-inset,S-inset),outline=160,width=3)
for pos in range(260,S-260,66):
    for x,y in [(pos,30),(pos,S-64),(30,pos),(S-64,pos)]:
        d.rectangle((x,y,x+34,y+34),fill='#b5a581',outline='#ead3a1',width=4)
        h.rectangle((x,y,x+34,y+34),fill=215)

# Very fine film interference, lapping grain and wafer-level variation.
arr=np.array(die,dtype=np.float32)
xx=np.arange(S,dtype=np.float32)[None,:]
yy=np.arange(S,dtype=np.float32)[:,None]
for c,phase in enumerate([0,2.094,4.189]):
    arr[:,:,c] += 6*np.sin(xx/1070+yy/1770+phase)+3*np.sin(yy/630+phase)
noise=nrng.normal(0,1.5,(S,S)).astype(np.float32)
arr += noise[:,:,None]
die=Image.fromarray(np.clip(arr,0,255).astype('uint8'))
del arr,noise
save(die,'die-8k',98)
save(die.resize((4096,4096),Image.Resampling.LANCZOS),'die-4k',96)
save(die.resize((2048,2048),Image.Resampling.LANCZOS),'die-2k',95)
save(height.resize((4096,4096),Image.Resampling.LANCZOS),'die-height-4k',97)

# Tangent-space normal detail for moulded epoxy and brushed conductive metal.
N=2048
grain=nrng.normal(0,1,(N,N)).astype(np.float32)
large=np.array(Image.fromarray(nrng.integers(0,255,(128,128),dtype=np.uint8)).resize((N,N),Image.Resampling.BICUBIC),dtype=np.float32)/255
surface=grain*.5+large*2
dy,dx=np.gradient(surface)
normal=np.stack((128+dx*11,128-dy*11,np.full_like(dx,254)),axis=2)
save(Image.fromarray(np.clip(normal,0,255).astype('uint8')),'epoxy-normal',98)
rough=np.clip(180+grain*7+large*17,0,255).astype('uint8')
save(Image.fromarray(rough),'epoxy-roughness',98)
brushed=nrng.normal(0,1,(N,1))*2+nrng.normal(0,.4,(N,N))
dy,dx=np.gradient(brushed)
normal=np.stack((128+dx*6,128-dy*6,np.full_like(dx,254)),axis=2)
save(Image.fromarray(np.clip(normal,0,255).astype('uint8')),'metal-normal',98)

# Physical top marking: applied as a transparent plane, not baked lighting.
cap=Image.new('RGBA',(4096,4096),(0,0,0,0))
c=ImageDraw.Draw(cap)
c.text((2048,1940),'M5',font=font(870),fill=(196,196,194,238),anchor='mm',stroke_width=1)
c.text((2048,3450),'APL · SILICON',font=font(80),fill=(139,141,140,190),anchor='mm')
c.text((2048,3580),'M5  /  SYSTEM ON A CHIP',font=font(43),fill=(121,124,122,170),anchor='mm')
# Laser-etched batch marks, orientation dot and data-matrix-like identification.
c.ellipse((265,265,316,316),fill=(160,161,157,160))
for y in range(18):
    for x in range(18):
        if x==0 or y==17 or (x==17 and y%2==0) or (y==0 and x%2==0) or rng.random()>.48:
            c.rectangle((350+x*9,3520+y*9,356+x*9,3526+y*9),fill=(130,135,132,125))
save(cap,'package-marking-4k',98)

# Organic ABF substrate: true routed fan-out, via-in-pad, solder mask grain.
N=4096
pcb=Image.new('RGB',(N,N),'#203c37')
p=ImageDraw.Draw(pcb)
for i in range(7):
    inset=30+i*9
    p.rounded_rectangle((inset,inset,N-inset,N-inset),radius=60,outline='#547066',width=2)
for side in range(4):
    panel=Image.new('RGBA',(N,N)); q=ImageDraw.Draw(panel)
    for x in range(150,N-150,35):
        end=rng.randrange(410,740)
        q.line((x,130,x,230,x+22,252,x+22,end),fill=(102,129,106,170),width=3)
        q.ellipse((x-6,120,x+6,132),fill='#af9360',outline='#ecd39b',width=2)
        q.ellipse((x+17,end-5,x+27,end+5),fill='#a99b6f')
    pcb.paste(panel.rotate(side*90),mask=panel.rotate(side*90).getchannel('A'))
arr=np.array(pcb,dtype=np.int16)
noise=nrng.normal(0,1.1,(N,N,1))
pcb=Image.fromarray(np.clip(arr+noise,0,255).astype('uint8'))
save(pcb,'substrate-4k',97)
(OUT/'floorplan.json').write_text(json.dumps(regions,indent=2)+'\n')
print('All material assets generated.',flush=True)
