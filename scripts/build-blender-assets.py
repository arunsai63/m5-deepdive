"""Original chip scene builder. Blender 5.2; Y-up recipe becomes (X,-Z,Y).
Usage: blender -b --python build_assets.py -- --scene package --preview
Merged meshes retain original parts and material assignment. All assets packed.
"""
import bpy,bmesh,json,math,os,sys,argparse,time
from mathutils import Vector,Euler,Matrix
from collections import defaultdict
P=argparse.ArgumentParser();P.add_argument('--recipe',default=os.path.join(os.path.dirname(__file__),'../assets/source/blender/still-recipes.json'));P.add_argument('--textures',default=os.path.join(os.path.dirname(__file__),'../assets/materials'));P.add_argument('--output',default=os.path.join(os.path.dirname(__file__),'../assets/renders'));P.add_argument('--scene',default='package');P.add_argument('--preview',action='store_true');P.add_argument('--cutaway',action='store_true');P.add_argument('--samples',type=int,default=192);P.add_argument('--width',type=int,default=2560);P.add_argument('--height',type=int,default=1600);P.add_argument('--camera',type=int,default=-1);P.add_argument('--export-glb',action='store_true')
a=P.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=a.output;TEXTURES=a.textures;recipe=json.load(open(a.recipe))
for key,values in {'copper':{'color':'#bd8767','roughness':.33},'darkCopper':{'color':'#89624d','roughness':.39},'gate':{'color':'#a6b1b4','roughness':.31},'oxide':{'color':'#7b8c8e','iridescence':.35},'doped':{'color':'#8a7d89'}}.items():recipe['materials'][key].update(values)
OUTPUT_NAME=a.scene+('-cutaway' if a.cutaway else '')
os.makedirs(ROOT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for d in bpy.data.materials: bpy.data.materials.remove(d)
S=bpy.context.scene;S.name='Visualise — '+a.scene.title();S.render.engine='CYCLES';S.cycles.samples=48 if a.preview else a.samples;S.cycles.use_denoising=True
S.cycles.adaptive_threshold=.025 if a.preview else .007;S.cycles.max_bounces=8;S.cycles.diffuse_bounces=3;S.cycles.glossy_bounces=5
try:
 pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='METAL';pref.get_devices()
 for d in pref.devices:d.use=d.type=='METAL'
 S.cycles.device='GPU'
except Exception as e: print('GPU fallback',e);S.cycles.device='CPU'
S.render.resolution_x=1400 if a.preview else a.width;S.render.resolution_y=1000 if a.preview else a.height;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG';S.render.image_settings.color_mode='RGBA';S.render.image_settings.color_depth='8';S.render.film_transparent=False
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=.2
S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.25,.3,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.32

def linear(v): return v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4
def rgb(h):return tuple(linear(int(h[i:i+2],16)/255) for i in (1,3,5))+(1,)
def tex(nodes,name,noncolor=False):
 path=os.path.join(TEXTURES,('die-8k' if name=='die' else name)+'.webp')
 im=bpy.data.images.load(path,check_existing=True)
 if noncolor:im.colorspace_settings.name='Non-Color'
 node=nodes.new('ShaderNodeTexImage');node.image=im;node.label=name
 return node
materials={}
for name,d in recipe['materials'].items():
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=rgb(d['color']);n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
 bs.inputs['Base Color'].default_value=rgb(d['color']);bs.inputs['Metallic'].default_value=d.get('metalness',0);bs.inputs['Roughness'].default_value=d.get('roughness',.4)
 if 'map' in d:
  t=tex(n,d['map']);l.new(t.outputs['Color'],bs.inputs['Base Color'])
  if d.get('transparent'):l.new(t.outputs['Alpha'],bs.inputs['Alpha'])
 if 'roughnessMap' in d:
  t=tex(n,d['roughnessMap'],True);r=n.new('ShaderNodeMapRange');r.inputs['To Min'].default_value=.48;r.inputs['To Max'].default_value=.64;l.new(t.outputs['Color'],r.inputs['Value']);l.new(r.outputs['Result'],bs.inputs['Roughness'])
 if 'normal' in d:
  t=tex(n,d['normal'],True);normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=d.get('normalScale',.1);l.new(t.outputs['Color'],normal.inputs['Color']);l.new(normal.outputs['Normal'],bs.inputs['Normal'])
 if 'bump' in d:
  t=tex(n,d['bump'],True);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.3;b.inputs['Distance'].default_value=d.get('bumpScale',.007);l.new(t.outputs['Color'],b.inputs['Height']);l.new(b.outputs['Normal'],bs.inputs['Normal'])
 if name in ('copper','darkCopper','gate','silicon','doped'):
  roughnoise=n.new('ShaderNodeTexNoise');roughnoise.inputs['Scale'].default_value=38;roughnoise.inputs['Detail'].default_value=2;coord=n.new('ShaderNodeNewGeometry');l.new(coord.outputs['Position'],roughnoise.inputs['Vector']);rng=n.new('ShaderNodeMapRange');rng.inputs['To Min'].default_value=max(.1,d.get('roughness',.3)-.055);rng.inputs['To Max'].default_value=d.get('roughness',.3)+.065;l.new(roughnoise.outputs['Fac'],rng.inputs['Value']);l.new(rng.outputs['Result'],bs.inputs['Roughness'])
 if name=='capSide':bs.inputs['Base Color'].default_value=rgb('#a8aaa6');bs.inputs['Roughness'].default_value=.38;bs.inputs['Anisotropic'].default_value=.35
 if name=='die':bs.inputs['Metallic'].default_value=.9;bs.inputs['Roughness'].default_value=.31
 if name=='epoxy':
  bs.inputs['Base Color'].default_value=rgb('#15181a');bs.inputs['Metallic'].default_value=.12;bs.inputs['Specular IOR Level'].default_value=.3
  grain=n.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=480;grain.inputs['Detail'].default_value=2;grain.inputs['Roughness'].default_value=.62
  coord=n.new('ShaderNodeTexCoord');l.new(coord.outputs['Generated'],grain.inputs['Vector']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.45;b.inputs['Distance'].default_value=.018;l.new(grain.outputs['Fac'],b.inputs['Height'])
  if bs.inputs['Normal'].is_linked:l.new(bs.inputs['Normal'].links[0].from_socket,b.inputs['Normal'])
  l.new(b.outputs['Normal'],bs.inputs['Normal']);bs.inputs['Roughness'].default_value=.52
 if d.get('iridescence') and 'Thin Film Thickness' in bs.inputs:
  bs.inputs['Thin Film Thickness'].default_value=240*d['iridescence'];bs.inputs['Thin Film IOR'].default_value=1.46
 materials[name]=m

# Template geometry in Blender Z-up, so bevel lengths remain physically consistent.
cache={}
def template(shape,size,bevel):
 key=(shape,tuple(round(x,6) for x in size),round(bevel,6))
 if key in cache:return cache[key]
 sx,sy,sz=size; dims=(sx,sz,sy)
 if shape=='plane':
  v=[(-sx/2,sz/2,0),(sx/2,sz/2,0),(sx/2,-sz/2,0),(-sx/2,-sz/2,0)];f=[(3,2,1,0)];uv=[[(0,0),(1,0),(1,1),(0,1)]]
  # Native source plane UV: original +Z is bottom, -Z is top.
  result=(v,f,[False],uv);cache[key]=result;return result
 bm=bmesh.new()
 if shape=='round' and bevel>sy*.46 and min(sx,sz)>sy*5:
  radius=min(bevel,min(sx,sz)*.2);ring=[]
  for cx,cy,start in [(sx/2-radius,sz/2-radius,0),(-sx/2+radius,sz/2-radius,90),(-sx/2+radius,-sz/2+radius,180),(sx/2-radius,-sz/2+radius,270)]:
   for j in range(9):
    angle=math.radians(start+j*90/8);ring.append((cx+radius*math.cos(angle),cy+radius*math.sin(angle)))
  for z in [-sy/2,sy/2]:
   for x,y in ring:bm.verts.new((x,y,z))
  bm.verts.ensure_lookup_table();count=len(ring);bm.faces.new([bm.verts[i] for i in reversed(range(count))]);bm.faces.new([bm.verts[i+count] for i in range(count)])
  for i in range(count):j=(i+1)%count;bm.faces.new([bm.verts[i],bm.verts[j],bm.verts[j+count],bm.verts[i+count]])
  edges=[e for e in bm.edges if abs(e.verts[0].co.z-e.verts[1].co.z)<1e-6];bmesh.ops.bevel(bm,geom=edges,offset=min(sy*.22,.028),segments=3,affect='EDGES',clamp_overlap=True)
 elif shape in ('box','round'):
  bmesh.ops.create_cube(bm,size=1)
  for v in bm.verts:v.co.x*=dims[0];v.co.y*=dims[1];v.co.z*=dims[2]
  if shape=='round' and bevel:
   amount=min(bevel,min(dims)*.47)
   bmesh.ops.bevel(bm,geom=list(bm.edges),offset=amount,segments=3,affect='EDGES',clamp_overlap=True)
 elif shape=='cylinder':
  bmesh.ops.create_cone(bm,cap_ends=True,cap_tris=False,segments=20,radius1=.5,radius2=.5,depth=1)
  for v in bm.verts:v.co.x*=dims[0];v.co.y*=dims[1];v.co.z*=dims[2]
 elif shape=='sphere':
  bmesh.ops.create_uvsphere(bm,u_segments=16,v_segments=8,radius=.5)
  for v in bm.verts:v.co.x*=dims[0];v.co.y*=dims[1];v.co.z*=dims[2]
 elif shape=='crystal':
  # Diamond cross-section X/Y extruded in source Z, equivalent X/Z extruded Y here.
  for y in [-sz/2,sz/2]:
   for x,z in [(0,-sy/2),(sx/2,0),(0,sy/2),(-sx/2,0)]:bm.verts.new((x,y,z))
  bm.verts.ensure_lookup_table()
  for ids in [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:bm.faces.new([bm.verts[i] for i in ids])
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.verts.ensure_lookup_table();bm.verts.index_update();bm.faces.ensure_lookup_table()
 verts=[tuple(v.co) for v in bm.verts];faces=[];smooth=[];uvs=[]
 for f in bm.faces:
  faces.append(tuple(v.index for v in f.verts));smooth.append(shape=='sphere' or shape=='cylinder' and abs(f.normal.z)<.5 or shape=='round' and max(abs(c) for c in f.normal)<.99)
  axis=max(range(3),key=lambda k:abs(f.normal[k]));coords=(0,1) if axis==2 else (0,2) if axis==1 else (1,2)
  uvs.append([(v.co[coords[0]]/max(dims[coords[0]],.0001)+.5,v.co[coords[1]]/max(dims[coords[1]],.0001)+.5) for v in f.verts])
 bm.free();result=(verts,faces,smooth,uvs);cache[key]=result;return result

index=next(i for i,s in enumerate(recipe['scenes']) if s['name']==a.scene);data=recipe['scenes'][index]
if a.scene=='transistors':
 revised=[]
 for part in data['parts']:
  if part['material']=='oxide' and all(abs(x-y)<1e-6 for x,y in zip(part['s'],[.179,.7,.42])):
   x,y,z=part['p']
   for dx,yy,size in [(-.074,.267,[.025,.645,.42]),(.074,.267,[.025,.645,.42]),(0,.582,[.175,.028,.42])]:
    new=dict(part);new.update(p=[x+dx,yy,z],s=size,bevel=.005);revised.append(new)
  else:revised.append(part)
 data['parts']=revised
if a.cutaway and a.scene=='transistors':
 data['parts']=[p for p in data['parts'] if p.get('group') not in ('transistor-field','contact-section') and not (p['material']=='oxide' and abs(p['s'][0]-1.58)<.001 and p['p'][2]>0)]
 for part in data['parts']:
  if part.get('group')=='gate-section':part['p']=[part['p'][0]-.35,part['p'][1]+.7,part['p'][2]]
  if part['s'][0]>20 and part['s'][2]>20:part['s']=[3.2,.32,3.6];part['p']=[0,-.5,0]
if a.scene=='package':
 for part in data['parts']:
  if part.get('name')=='Package sidewall':part['s']=[9.30,.54,9.30];part['bevel']=.19
collection=bpy.data.collections.new('01 | Original '+a.scene+' geometry');S.collection.children.link(collection)
groups=defaultdict(list)
for p in data['parts']:groups[(p['material'],p.get('group','core'),p['shape']=='plane')].append(p)
convert=Matrix(((1,0,0),(0,0,-1),(0,1,0)));inverse=convert.transposed()
start=time.time()
for (mat,group,isplane),parts in groups.items():
 verts=[];faces=[];smooth=[];uvs=[]
 for p in parts:
  vv,ff,ss,uu=template(p['shape'],p['s'],p.get('bevel',0));offset=len(verts);pos=convert@Vector(p['p']);rot=convert@Euler(p.get('r',[0,0,0]),'XYZ').to_matrix()@inverse
  verts.extend(tuple(rot@Vector(v)+pos) for v in vv);faces.extend(tuple(i+offset for i in f) for f in ff);smooth.extend(ss);uvs.extend(uu)
 mesh=bpy.data.meshes.new(mat+' '+group);mesh.from_pydata(verts,[],faces);mesh.materials.append(materials[mat]);mesh.update()
 uv=mesh.uv_layers.new(name='Surface UV');flat=[v for face in uvs for pair in face for v in pair];uv.data.foreach_set('uv',flat)
 for poly,s in zip(mesh.polygons,smooth):poly.use_smooth=s
 obj=bpy.data.objects.new(f'{mat} | {group} | {len(parts)} original parts',mesh);collection.objects.link(obj);obj['source_part_count']=len(parts);obj['source_group']=group
 print('BUILT',mat,len(parts),len(verts),flush=True)
print('GEOMETRY SECONDS',round(time.time()-start,2),flush=True)

# Studio floor: low reflectance and very subtle surface grain.
floor_z=min(p['p'][1]-p['s'][1]/2 for p in data['parts'] if p['shape']!='plane')-.04
floor_mat=bpy.data.materials.new('Studio | charcoal');floor_mat.use_nodes=True;n=floor_mat.node_tree.nodes;l=floor_mat.node_tree.links;bs=n.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.0025,.0035,.0045,1);bs.inputs['Roughness'].default_value=.85;bs.inputs['Specular IOR Level'].default_value=.12
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=190;bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.09;bump.inputs['Distance'].default_value=.009;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
bpy.ops.mesh.primitive_plane_add(size=240,location=(0,0,floor_z));floor=bpy.context.object;floor.name='Studio | seamless floor';floor.data.materials.append(floor_mat)

def area(name,pos,power,size,color,target=(0,0,0),size_y=None):
 d=bpy.data.lights.new(name,'AREA');o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.energy=power;d.color=color;d.shape='RECTANGLE';d.size=size;d.size_y=size_y or size
area('Key | broad silk',(-7,-4,17),1900,10,(.95,.97,1),size_y=8)
area('Rim | warm strip',(8,5,10),1900,10,(1,.83,.64),size_y=3)
area('Fill | cool silk',(-8,9,7),1050,9,(.65,.79,1),size_y=6)
area('Front | long softbox',(4,-12,8),700,10,(1,1,1),size_y=3)

if a.scene=='package':area('Edge | narrow reflection card',(0,-14,2.5),550,12,(1,.94,.86),target=(0,0,.5),size_y=1.3)

cam=bpy.data.cameras.new('Macro camera');ob=bpy.data.objects.new('Macro camera',cam);S.collection.objects.link(ob);S.camera=ob
# Source cameras are vertical FOV; Blender angle is horizontal with HORIZONTAL fit.
choice=a.camera if a.camera>=0 else (0 if a.scene in ('package','die') else 1)
c=recipe['cameras'][index][choice];target=convert@Vector(c['target']);pos=convert@Vector(c['position'])
if a.scene=='die' and a.camera<0:pos=target+(pos-target)*1.72
if a.scene=='package' and a.camera<0:pos=convert@Vector((4.5,15.5,17.5))
if a.scene=='logic' and a.camera<0:pos=target+(pos-target)*1.25
if a.cutaway:target=convert@Vector((0,.15,0));pos=convert@Vector((4.3,3.4,5.9))
ob.location=pos;ob.rotation_euler=(target-pos).to_track_quat('-Z','Y').to_euler();cam.type='PERSP';cam.sensor_fit='VERTICAL';cam.sensor_height=24;cam.lens=12/math.tan(math.radians(c['fov']/2));cam.clip_start=.005;cam.clip_end=500
if a.scene=='package' and a.camera<0:ob.rotation_euler.rotate_axis('Z',math.radians(18))
cam.dof.use_dof=False
S['attribution']='Original semiconductor illustration generated from Visualise procedural geometry. Educational abstraction; not a foundry process photograph.';S['source_coordinates']='Y-up mapped to Blender Z-up: (x,-z,y)';S['recipe_part_count']=len(data['parts']);S['camera_source_sample']=choice
# Pack only used texture images, retaining a portable reusable asset.
for m in list(bpy.data.materials):
 if m.users==0:bpy.data.materials.remove(m)
for im in list(bpy.data.images):
 if im.users==0:bpy.data.images.remove(im)
for im in bpy.data.images:
 if im.source=='FILE':
  try:im.pack()
  except:pass
suffix='preview' if a.preview else 'final';S.render.filepath=os.path.join(ROOT,OUTPUT_NAME+'-'+suffix+'.png')
if not a.preview:bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,OUTPUT_NAME+'.blend'),compress=True)
if a.export_glb:
 bpy.ops.object.select_all(action='DESELECT')
 for o in collection.objects:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,OUTPUT_NAME+'.glb'),use_selection=True,export_format='GLB',export_apply=True)
print('RENDER START',S.render.filepath,flush=True);bpy.ops.render.render(write_still=True);print('RENDER DONE',flush=True)
