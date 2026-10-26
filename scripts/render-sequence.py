"""Render the approved nested journey in Cycles, using camera-relative coordinates.

Blender -b --python render-sequence.py -- --frames 0,123,247,479 --samples 128
Omit --frames for the complete, resumable sequence. No extra 8K assets generated.
"""
import argparse,json,sys,time,math,os,bisect
from pathlib import Path

BASE=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--frames',default='')
parser.add_argument('--samples',type=int,default=128)
parser.add_argument('--width',type=int,default=2560)
parser.add_argument('--height',type=int,default=1600)
parser.add_argument('--output',default=str(BASE/'assets/renders/sequence'))
options=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
recipe_path=BASE/'assets/source/blender/sequence-recipe.json'
output=Path(options.output);output.mkdir(parents=True,exist_ok=True)

# Reuse the settled Blender material and bevel recipes, without executing its
# independent still cameras, composition edits, or render operation.
sys.argv=['blender','--','--recipe',str(recipe_path),'--textures',str(BASE/'assets/materials'),
          '--output',str(output),'--width',str(options.width),'--height',str(options.height),
          '--samples',str(options.samples)]
source=(BASE/'scripts/build-blender-assets.py').read_text().split("index=next(")[0]
source=source.replace("('die-8k' if name=='die' else name)","('die-4k' if name=='die' else name)")
# Keep atomic silhouettes round even in the final extreme macro view.
source=source.replace('u_segments=16,v_segments=8','u_segments=48,v_segments=32')
exec(compile(source,str(BASE/'scripts/build-blender-assets.py'),'exec'),globals())
S.name='Inside silicon | continuous Blender journey'
S.render.image_settings.color_mode='RGB'
S.cycles.seed=42
S.cycles.use_animated_seed=False
S.render.fps=30
S.world.node_tree.nodes['Background'].inputs[0].default_value=(.045,.055,.07,1)
S.world.node_tree.nodes['Background'].inputs[1].default_value=.45

convert=Matrix(((1,0,0),(0,0,-1),(0,1,0)));inverse=convert.transposed()
objects=[]
for stage,data in enumerate(recipe['scenes']):
    groups=defaultdict(list)
    for part in data['parts']:
        # The nested die already supplies this surface at precisely world Y=.359.
        # Keeping the package's duplicate creates unstable self-shadowing in Cycles.
        if stage==0 and part['shape']=='plane' and part['material']=='die':continue
        if stage==4 and part.get('group')=='contact-section':continue
        groups[(part['material'],part.get('group','core'),part['shape']=='plane')].append(part)
    for (mat,group,isplane),parts in groups.items():
        verts=[];faces=[];smooth=[];uvs=[]
        for part in parts:
            vv,ff,ss,uu=template(part['shape'],part['s'],part.get('bevel',0))
            offset=len(verts);pos=convert@Vector(part['p'])
            # Three.js Euler XYZ is Rx*Ry*Rz; mathutils uses the reverse product.
            rx,ry,rz=part.get('r',[0,0,0])
            rot=convert@(Matrix.Rotation(rx,3,'X')@Matrix.Rotation(ry,3,'Y')@Matrix.Rotation(rz,3,'Z'))@inverse
            verts.extend(tuple(rot@Vector(v)+pos) for v in vv)
            faces.extend(tuple(i+offset for i in face) for face in ff)
            smooth.extend(ss);uvs.extend(uu)
        mesh=bpy.data.meshes.new(f'{stage} {mat} {group}')
        mesh.from_pydata(verts,[],faces);mesh.materials.append(materials[mat]);mesh.update()
        uv=mesh.uv_layers.new(name='Surface UV');uv.data.foreach_set('uv',[x for face in uvs for pair in face for x in pair])
        for poly,value in zip(mesh.polygons,smooth):poly.use_smooth=value
        obj=bpy.data.objects.new(mesh.name,mesh);S.collection.objects.link(obj)
        objects.append((obj,stage,group))
        print('BUILT',stage,mat,group,len(parts),flush=True)

def area(name,position,power,size,color,size_y):
    light=bpy.data.lights.new(name,'AREA');ob=bpy.data.objects.new(name,light)
    S.collection.objects.link(ob);ob.location=position
    ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
    light.energy=power;light.color=color;light.shape='RECTANGLE';light.size=size;light.size_y=size_y
area('Key | broad silk',(-7,-4,17),1900,10,(.95,.97,1),8)
area('Rim | warm strip',(8,5,10),1900,10,(1,.83,.64),3)
area('Fill | cool silk',(-8,9,7),1050,9,(.65,.79,1),6)
area('Front | long softbox',(4,-12,8),700,10,(1,1,1),3)

floor_mat=bpy.data.materials.new('Studio charcoal');floor_mat.use_nodes=True
bs=floor_mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.0025,.0035,.0045,1);bs.inputs['Roughness'].default_value=.85
bpy.ops.mesh.primitive_plane_add(size=240)
floor=bpy.context.object;floor.data.materials.append(floor_mat)
cam=bpy.data.cameras.new('Continuous macro camera');camera=bpy.data.objects.new(cam.name,cam);S.collection.objects.link(camera);S.camera=camera
cam.sensor_fit='VERTICAL';cam.sensor_height=24;cam.clip_start=.03;cam.clip_end=200
cam.dof.use_dof=False

# Compute the parent hierarchy in Python doubles before assigning camera-relative
# coordinates to Blender's float matrices. Never round tiny world geometry.
origins=[[0.,0.,0.]];scales=[[1.,1.,1.]]
for h in recipe['hierarchy'][1:]:
    origins.append([origins[-1][k]+h['p'][k]*scales[-1][k] for k in range(3)])
    scales.append([scales[-1][k]*h['s'][k] for k in range(3)])
ranges=[(0,.39),(0,.62),(0,.82),(.29,1.19),(.59,1.38),(1.02,1.55)]
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def set_frame(frame):
    p=frame['progress'];unit=24/frame['distance'];target=frame['target']
    for ob,stage,group in objects:
        ob.hide_render=not ranges[stage][0]<=p<=ranges[stage][1]
        local=[0.,0.,0.];rotation=Matrix.Identity(3)
        if stage==0 and group=='lid':
            lift=smooth(.025,.145,p);local=[-lift*5.8,lift*7.5,-lift*3.5]
            rotation=Matrix.Rotation(-lift*.24,3,'X')@Matrix.Rotation(lift*.33,3,'Z')
            ob.hide_render=ob.hide_render or lift>=.99
        if stage==4 and group=='gate-section':local=[-.35,.7,0]
        pos=[(origins[stage][k]-target[k]+local[k]*scales[stage][k])*unit for k in range(3)]
        scale=[v*unit for v in scales[stage]]
        rot=convert@rotation@inverse
        ob.matrix_world=Matrix.Translation(convert@Vector(pos))@Matrix.Diagonal(Vector((scale[0],scale[2],scale[1],1)))@rot.to_4x4()
    camera.location=convert@Vector([v*24 for v in frame['direction']])
    camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
    cam.lens=12/math.tan(math.radians(frame['fov']/2))
    cam.shift_x=-frame['shiftX']*options.width/options.height
    cam.shift_y=frame['shiftY']
    floor.location.z=(-.42-target[1])*unit;floor.hide_render=p>=.35
    # Gradually isolate the selected atomic site with optical depth of field.
    cam.dof.use_dof=p>1.26;cam.dof.focus_distance=24
    cam.dof.aperture_fstop=16-12*smooth(1.26,1.49,p)
    bpy.context.view_layer.update()

frames=recipe['frames'];indices=[int(i) for i in options.frames.split(',')] if options.frames else list(range(len(frames)))
status_path=output/'progress.json'
timings={}
if (output/'timings.json').exists():timings=json.loads((output/'timings.json').read_text())
def atomic_json(path,value):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,indent=2));temp.replace(path)
def status(state,index=None):
    completed=sum((output/f'frame-{i:04d}.png').exists() for i in range(len(frames)))
    known=sorted((int(k),v) for k,v in timings.items())
    positions=[k for k,v in known]
    def estimate(i):
        slot=bisect.bisect_left(positions,i)
        if slot==0:return known[0][1]
        if slot==len(known):return known[-1][1]
        a,x=known[slot-1];b,y=known[slot]
        return x+(y-x)*(i-a)/(b-a)
    remaining=sum(estimate(i) for i in range(len(frames)) if not (output/f'frame-{i:04d}.png').exists()) if known else None
    last=next(reversed(timings),None)
    atomic_json(status_path,dict(state=state,total=len(frames),completed=completed,current=index,
        width=options.width,height=options.height,samples=options.samples,
        updatedAtEpoch=time.time(),
        remainingSeconds=remaining,
        latestFrame=f'frame-{int(last):04d}.png' if last is not None else None))
try:
    for index in indices:
        path=output/f'frame-{index:04d}.png'
        if path.exists():continue
        set_frame(frames[index]);status('rendering',index)
        partial=path.with_name(path.stem+'.partial.png')
        S.render.filepath=str(partial)
        print('FRAME START',index,'of',len(frames),flush=True)
        started=time.time();bpy.ops.render.render(write_still=True);partial.replace(path)
        timings[str(index)]=round(time.time()-started,3)
        atomic_json(output/'timings.json',timings);status('rendering',index)
        print('FRAME DONE',index,timings[str(index)],flush=True)
    status('benchmarked' if options.frames else 'rendered',indices[-1])
except Exception as error:
    status('failed');raise
