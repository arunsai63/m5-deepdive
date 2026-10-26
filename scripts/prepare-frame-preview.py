"""Create lighter browser review images without touching Blender's PNG masters."""
from pathlib import Path
import json,os,time
from PIL import Image
os.nice(10)
root=Path(__file__).resolve().parent.parent/'assets/renders/sequence'
out=root/'preview';out.mkdir(exist_ok=True)
while True:
    available={int(p.stem.split('-')[-1]) for p in out.glob('frame-[0-9][0-9][0-9][0-9].webp')}
    for png in sorted(root.glob('frame-[0-9][0-9][0-9][0-9].png')):
        dest=out/png.with_suffix('.webp').name
        if not dest.exists():
            with Image.open(png) as im:
                im.thumbnail((1600,1000))
                temp=dest.with_suffix('.partial.webp');im.save(temp,quality=90,method=2);temp.replace(dest)
        available.add(int(png.stem.split('-')[-1]))
        temp=out/'manifest.tmp'
        temp.write_text(json.dumps(dict(total=480,width=1600,height=1000,available=sorted(available))))
        temp.replace(out/'manifest.json')
    if len(available)==480:break
    time.sleep(15)
