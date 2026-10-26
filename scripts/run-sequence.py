"""Resumable Blender queue, followed by browser frames and an H.264 film.

Run with system Python (Pillow required). Progress is served by sequence/index.html.
"""
from pathlib import Path
import json,subprocess,sys,os,time,fcntl
from PIL import Image

BASE=Path(__file__).resolve().parent.parent
OUT=BASE/'assets/renders/sequence'
OUT.mkdir(parents=True,exist_ok=True)
lock=open(OUT/'queue.lock','w')
try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit('A render queue is already running.')
def write_json(path,value):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,indent=2));temp.replace(path)
def update(state,**fields):
    path=OUT/'progress.json';d=json.loads(path.read_text()) if path.exists() else {}
    d.update(state=state,**fields);write_json(path,d)
try:
    write_json(OUT/'job.json',dict(pid=os.getpid(),startedAtEpoch=time.time(),state='running'))
    with open(OUT/'render.log','a',buffering=1) as log:
        result=subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender','-b','--python',str(BASE/'scripts/render-sequence.py')],stdout=log,stderr=subprocess.STDOUT)
        if result.returncode:raise RuntimeError(f'Blender exited with code {result.returncode}')
    frames=json.loads((BASE/'assets/source/blender/sequence-recipe.json').read_text())['frames']
    update('encoding',remainingSeconds=None)
    names=[]
    for i in range(len(frames)):
        png=OUT/f'frame-{i:04d}.png';webp=png.with_suffix('.webp')
        with Image.open(png) as im:
            im.load()
            if im.size!=(2560,1600):raise RuntimeError(f'Unexpected dimensions: {png.name}')
            if not webp.exists():im.save(webp,quality=91,method=6)
        names.append(webp.name)
    with open(OUT/'encode.log','a') as log:
        subprocess.run(['/opt/homebrew/bin/ffmpeg','-y','-framerate','24','-i',str(OUT/'frame-%04d.png'),
            '-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',
            str(OUT/'inside-silicon.mp4')],stdout=log,stderr=subprocess.STDOUT,check=True)
    write_json(OUT/'manifest.json',dict(width=2560,height=1600,samples=128,count=len(frames),journeyEnd=1.55,
        frames=names,video='inside-silicon.mp4',fps=24,source='Blender Cycles / Metal',atomicModel='Illustrative ball-and-stick silicon crystal'))
    update('complete',completed=len(frames),remainingSeconds=0,latestFrame=names[-1])
    write_json(OUT/'job.json',dict(pid=os.getpid(),finishedAtEpoch=time.time(),state='complete'))
except Exception as error:
    update('failed',error=str(error));raise
