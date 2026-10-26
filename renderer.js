import * as THREE from 'three';
import { RoundedBoxGeometry } from './assets/vendor/RoundedBoxGeometry.js';
import { materials as materialRecipes, createSceneData } from './scene-data.js';
import { hierarchy, journeyAt, annotations, JOURNEY_END } from './journey.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,t)=>{const x=clamp((t-a)/(b-a));return x*x*(3-2*x);};
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));

function roundedPlate(width,height,depth,radius) {
  // Independent plan-view radius and vertical chamfer. A generic rounded cube
  // clamps its radius to the plate thickness and loses the package silhouette.
  const shape=new THREE.Shape(),r=Math.min(radius,width*.49,depth*.49);
  const x=-width/2,z=-depth/2;
  shape.moveTo(x+r,z);
  shape.lineTo(x+width-r,z);shape.quadraticCurveTo(x+width,z,x+width,z+r);
  shape.lineTo(x+width,z+depth-r);shape.quadraticCurveTo(x+width,z+depth,x+width-r,z+depth);
  shape.lineTo(x+r,z+depth);shape.quadraticCurveTo(x,z+depth,x,z+depth-r);
  shape.lineTo(x,z+r);shape.quadraticCurveTo(x,z,x+r,z);shape.closePath();
  const edge=Math.min(height*.2,.022);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height-2*edge,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:edge,bevelThickness:edge,curveSegments:12});
  geometry.rotateX(-Math.PI/2);geometry.translate(0,-height/2+edge,0);
  return geometry;
}

/** Nested geometry, a continuous camera, and a moving origin for precision. */
export class SiliconRenderer {
  constructor(canvas, { onProgress=()=>{}, onFailure=()=>{} }={}) {
    this.canvas=canvas;
    this.onProgress=onProgress;
    this.onFailure=onFailure;
    this.disposed=false;
    this.quality='high';
    this.currentStage=0;
    this.progress=0;
    this.textureCache=new Map();
    this.materialCache=new Map();
    this.geometries=new Map();
    this.scenes=[];
    this.annotations=annotations.map(a=>({...a,p:[...a.p]}));
    this.pointer={x:0,y:0};
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x101214,1);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.07;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.info.autoReset=false;
    this.camera=new THREE.PerspectiveCamera(35,1,.03,200);
    this.loadManager=new THREE.LoadingManager();
    this.loader=new THREE.TextureLoader(this.loadManager);
    this.environment=this.makeEnvironment();
    this.targetA=this.makeTarget();
    this.targetB=this.makeTarget();
    this.composite=this.makeComposite();
    this.resize();
    this.handleContextLost=e=>{e.preventDefault();this.onFailure(new Error('WebGL context lost'));};
    this.canvas.addEventListener('webglcontextlost',this.handleContextLost);
  }

  makeTarget() {
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,depthBuffer:true,samples:Math.min(4,this.renderer.capabilities.maxSamples)});
    target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    return target;
  }

  makeEnvironment() {
    const width=1024,height=512,data=new Float32Array(width*height*4);
    const panel=(u,v,x,y,w,h)=>{
      let dx=Math.abs(u-x);dx=Math.min(dx,1-dx);
      const dy=Math.abs(v-y);
      return (1-smooth(w*.43,w*.5,dx))*(1-smooth(h*.43,h*.5,dy));
    };
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const u=x/width,v=y/height,i=(y*width+x)*4;
      const ambient=.018+.016*Math.sin(Math.PI*v);
      const key=panel(u,v,.18,.32,.22,.25)*3.5;
      const rim=panel(u,v,.68,.34,.09,.40)*3.1;
      const fill=panel(u,v,.94,.50,.20,.22)*.8;
      const ceiling=panel(u,v,.43,.12,.26,.13)*1.3;
      data[i]=ambient+key+rim*.85+fill*.67+ceiling;
      data[i+1]=ambient+key*.95+rim*.93+fill*.82+ceiling;
      data[i+2]=ambient+key*.85+rim+fill+ceiling;
      data[i+3]=1;
    }
    const raw=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
    raw.mapping=THREE.EquirectangularReflectionMapping;
    raw.needsUpdate=true;
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const result=pmrem.fromEquirectangular(raw);
    raw.dispose();pmrem.dispose();
    this.environmentTarget=result;
    return result.texture;
  }

  async texture(name, color=false) {
    const resolved=name==='die'?`die-${this.quality==='ultra'?'8k':'4k'}`:name;
    if(this.textureCache.has(resolved))return this.textureCache.get(resolved);
    const promise=this.loader.loadAsync(`./assets/materials/${resolved}.webp`).then(texture=>{
      texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
      texture.anisotropy=Math.min(this.renderer.capabilities.getMaxAnisotropy(),16);
      texture.generateMipmaps=true;
      texture.minFilter=THREE.LinearMipmapLinearFilter;
      texture.magFilter=THREE.LinearFilter;
      return texture;
    });
    this.textureCache.set(resolved,promise);
    return promise;
  }

  async loadMaterials() {
    let count=0;
    const entries=Object.entries(materialRecipes);
    await Promise.all(entries.map(async([name,r])=>{
      const material=new THREE.MeshPhysicalMaterial({
        color:r.color,metalness:r.metalness,roughness:r.roughness,
        iridescence:r.iridescence??0,iridescenceIOR:1.46,
        iridescenceThicknessRange:[180,390],
        clearcoat:['silicon','die'].includes(name)?.24:name==='epoxy'?.08:0,
        clearcoatRoughness:.2,
        envMapIntensity:name==='epoxy'?.75:.9,
        transparent:r.transparent??false,
        depthWrite:!r.transparent,
        polygonOffset:r.transparent??false,polygonOffsetFactor:-1,
      });
      material.name=name;
      const tasks=[];
      if(r.map)tasks.push(this.texture(r.map,true).then(t=>{material.map=t;}));
      if(r.normal)tasks.push(this.texture(r.normal).then(t=>{material.normalMap=t;material.normalScale.setScalar(r.normalScale??.15);}));
      if(r.roughnessMap)tasks.push(this.texture(r.roughnessMap).then(t=>{material.roughnessMap=t;}));
      if(r.bump)tasks.push(this.texture(r.bump).then(t=>{material.bumpMap=t;material.bumpScale=r.bumpScale;}));
      await Promise.all(tasks);
      if(!r.map&&!['atom','detailAtom','selectedAtom','bond','selectedBond'].includes(name)) {
        // Manufacturing variation belongs to the surface, so it remains fixed
        // as the camera moves. It breaks up perfect, toy-like flat highlights.
        material.onBeforeCompile=shader=>{
          shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSiliconSurface;');
          shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 assetPoint=vec4(transformed,1.);
            #ifdef USE_INSTANCING
              assetPoint=instanceMatrix*assetPoint;
            #endif
            vSiliconSurface=assetPoint.xyz;
            #include <project_vertex>`);
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
            varying vec3 vSiliconSurface;
            float siliconHash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
            float siliconNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
              return mix(mix(mix(siliconHash(i),siliconHash(i+vec3(1,0,0)),f.x),mix(siliconHash(i+vec3(0,1,0)),siliconHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(siliconHash(i+vec3(0,0,1)),siliconHash(i+vec3(1,0,1)),f.x),mix(siliconHash(i+vec3(0,1,1)),siliconHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
          `);
          shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
            diffuseColor.rgb*=.91+.18*siliconNoise(vSiliconSurface*35.);`);
          shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
            roughnessFactor=clamp(roughnessFactor*(.78+.46*siliconNoise(vSiliconSurface*120.)),.10,.9);`);
        };
        material.customProgramCacheKey=()=>`silicon-surface-v1`;
      }
      this.materialCache.set(name,material);
      this.onProgress(`Preparing materials · ${Math.round(++count/entries.length*100)}%`);
    }));
  }

  geometry(part) {
    const isRound=part.shape==='round';
    const key=part.shape==='sphere'&&['selectedAtom','detailAtom'].includes(part.material)?'selected-atom':part.shape==='sphere'&&part.material==='atom'?'atomic-sphere':isRound?`round:${part.s.join(',')}:${part.bevel??.02}:${part.group==='transistor-field'?2:3}`:part.shape;
    if(this.geometries.has(key))return this.geometries.get(key);
    let geometry;
    if(isRound) {
      const [w,h,d]=part.s;
      geometry=w/h>20&&d/h>20?roundedPlate(w,h,d,part.bevel??.04):new RoundedBoxGeometry(w,h,d,part.group==='transistor-field'?2:3,part.bevel??Math.min(...part.s)*.12);
    }
    else if(part.shape==='box')geometry=new THREE.BoxGeometry(1,1,1);
    else if(part.shape==='plane') {geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);}
    else if(part.shape==='cylinder')geometry=new THREE.CylinderGeometry(.5,.5,1,24,1);
    else if(part.shape==='sphere')geometry=new THREE.SphereGeometry(.5,key==='selected-atom'?64:key==='atomic-sphere'?24:18,key==='selected-atom'?48:key==='atomic-sphere'?16:12);
    else if(part.shape==='crystal') {
      const shape=new THREE.Shape();
      shape.moveTo(-.5,0);shape.lineTo(-.25,.5);shape.lineTo(.25,.5);shape.lineTo(.5,0);shape.lineTo(.25,-.5);shape.lineTo(-.25,-.5);shape.closePath();
      geometry=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:2,steps:1});
      geometry.translate(0,0,-.5);
    } else throw new Error(`Unknown geometry ${part.shape}`);
    geometry.computeBoundingSphere();
    this.geometries.set(key,geometry);
    return geometry;
  }

  async buildScene(data,index) {
    const scene=new THREE.Scene();
    scene.name=data.name;
    scene.background=new THREE.Color(0x101214);
    scene.environment=this.environment;
    scene.environmentIntensity=1;
    scene.environmentRotation.y=.4;
    const root=new THREE.Group();
    const lid=new THREE.Group(),field=new THREE.Group(),gate=new THREE.Group(),contacts=new THREE.Group();
    root.add(lid,field,gate,contacts);scene.add(root);
    scene.userData={root,lid,field,gate,contacts,meshes:[]};
    const groups=new Map();
    for(const part of data.parts) {
      // The bare die below is the very same object seen after the lid opens.
      if(index===0&&(part.material==='die'||part.name==='Silicon die'))continue;
      const roundKey=part.shape==='round'?`:${part.s.join(',')}:${part.bevel??.02}`:'';
      const key=`${part.shape}:${part.material}:${part.group??''}${roundKey}`;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(part);
    }
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),euler=new THREE.Euler();
    let batches=0;
    for(const parts of groups.values()) {
      const part=parts[0],geometry=this.geometry(part),material=this.materialCache.get(part.material);
      const mesh=new THREE.InstancedMesh(geometry,material,parts.length);
      mesh.name=part.name??`${part.material} ${part.shape}`;
      mesh.castShadow=part.shape!=='plane'&&part.material!=='marking';
      mesh.receiveShadow=true;
      parts.forEach((p,i)=>{
        position.fromArray(p.p);
        if(p.shape==='round')scale.set(1,1,1);else scale.fromArray(p.s);
        rotation.setFromEuler(euler.set(...(p.r??[0,0,0])));
        matrix.compose(position,rotation,scale);
        mesh.setMatrixAt(i,matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
      const group=part.group==='lid'?lid:part.group==='transistor-field'?field:part.group==='gate-section'?gate:part.group==='contact-section'?contacts:root;
      group.add(mesh);
      scene.userData.meshes.push(mesh);
      if(++batches%25===0)await nextFrame();
    }
    const key=new THREE.DirectionalLight(0xfff1dd,2.0);
    key.position.set(-7,15,9);
    key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);
    Object.assign(key.shadow.camera,{left:-17,right:17,top:17,bottom:-17,near:.1,far:70});
    key.shadow.bias=-.00015;
    key.shadow.normalBias=.018;
    key.shadow.radius=3;
    scene.add(key);
    const fill=new THREE.DirectionalLight(0xd1e3f4,.45);fill.position.set(9,6,2);scene.add(fill);
    const rim=new THREE.DirectionalLight(0xf2f5ff,1.15);rim.position.set(2,8,-12);scene.add(rim);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:0x07090a,roughness:.96,metalness:0}));
    floor.rotation.x=-Math.PI/2;floor.position.y=index===0?-.42:index===1?-.65:-.8;
    floor.receiveShadow=true;scene.add(floor);
    scene.userData.key=key;
    scene.userData.floor=floor;
    return scene;
  }

  makeComposite() {
    const uniforms={
      imageA:{value:this.targetA.texture},imageB:{value:this.targetB.texture},
      depthA:{value:this.targetA.depthTexture},depthB:{value:this.targetB.depthTexture},
      blend:{value:0},resolution:{value:new THREE.Vector2(1,1)},near:{value:.03},far:{value:200},
      aoStrength:{value:.45},grain:{value:.35},
    };
    const material=new THREE.ShaderMaterial({
      uniforms,depthWrite:false,depthTest:false,toneMapped:false,
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader:`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D imageA,imageB,depthA,depthB;
        uniform float blend,near,far,aoStrength,grain;
        uniform vec2 resolution;
        float linearDepth(float z){return (near*far)/(far-z*(far-near));}
        float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
        vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
        float occlusion(sampler2D tex,vec2 uv){
          float center=linearDepth(texture2D(tex,uv).r);
          float result=0.;
          float radius=clamp(19./max(center,.5),1.5,8.);
          for(int i=0;i<12;i++){
            float a=float(i)*2.399963;
            vec2 delta=vec2(cos(a),sin(a))*radius*(.5+float(i)/15.)/resolution;
            float sampled=linearDepth(texture2D(tex,uv+delta).r);
            float diff=center-sampled;
            float threshold=max(.004,center*.0005);
            result+=smoothstep(threshold,threshold*5.,diff)*(1.-smoothstep(.025,.25,diff));
          }
          return 1.-result/12.*aoStrength;
        }
        void main(){
          vec3 a=texture2D(imageA,vUv).rgb*occlusion(depthA,vUv);
          vec3 b=texture2D(imageB,vUv).rgb;
          if(blend>.001)b*=occlusion(depthB,vUv);
          vec3 color=mix(a,b,blend);
          vec2 q=(vUv-.5)*vec2(1.,.8);
          color*=1.-.22*dot(q,q);
          color=aces(color*1.07);
          color=pow(max(color,vec3(0.)),vec3(1./2.2));
          color+=(hash(gl_FragCoord.xy)-.5)*grain/255.;
          gl_FragColor=vec4(color,1.);
        }`,
    });
    const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
    return {scene,camera:new THREE.Camera(),uniforms,material};
  }

  async init() {
    await this.loadMaterials();
    const data=createSceneData();
    for(let i=0;i<data.length;i++) {
      this.onProgress(`Building ${['the package','silicon','circuit blocks','interconnects','transistors','the silicon crystal'][i]}…`);
      this.scenes.push(await this.buildScene(data[i],i));
      await nextFrame();
    }
    this.assembleWorld(data);
    this.addAtomicRuler();
    this.onProgress('Lighting the chip…');
    // Warm the material programs before scrolling, so a newly revealed scale
    // does not interrupt the camera with a shader compilation pause.
    this.setCameraProgress(0);
    if(this.renderer.compileAsync)await this.renderer.compileAsync(this.world,this.camera);
    this.render(0);
    return this;
  }

  resize() {
    const width=this.canvas.clientWidth||innerWidth,height=this.canvas.clientHeight||innerHeight;
    const maxDpr=this.quality==='ultra'?2:1.5;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,maxDpr));
    this.renderer.setSize(width,height,false);
    const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.targetA?.setSize(size.x,size.y);this.targetB?.setSize(size.x,size.y);
    this.composite?.uniforms.resolution.value.copy(size);
    this.camera.aspect=width/height;
    this.width=width;this.height=height;
  }

  async setQuality(quality) {
    this.quality=quality;
    const texture=await this.texture('die',true);
    const material=this.materialCache.get('die');
    if(material){material.map=texture;material.needsUpdate=true;}
    for(const scene of this.scenes) {
      const key=scene.userData.key;
      key.shadow.mapSize.setScalar(quality==='ultra'?4096:2048);
      key.shadow.map?.dispose();key.shadow.map=null;key.shadow.needsUpdate=true;
    }
    this.resize();
  }

  assembleWorld(data) {
    this.world=this.scenes[0];
    this.world.fog=new THREE.Fog(0x101214,200,400);
    this.universe=new THREE.Group();this.universe.name='One nested chip';
    this.world.add(this.universe);
    this.universe.add(this.scenes[0].userData.root);
    for(let i=1;i<this.scenes.length;i++) {
      const root=this.scenes[i].userData.root;
      const parent=i===1?this.universe:this.scenes[i-1].userData.root;
      parent.add(root);root.position.fromArray(hierarchy[i].p);root.scale.fromArray(hierarchy[i].s);
    }
    // The selected device is a fixed cutaway, not another exploded animation.
    this.scenes[4].userData.contacts.visible=false;
    this.scenes[4].userData.gate.position.set(-.35,.7,0);
    const candidates=data[3].parts.filter(p=>p.shape==='cylinder'&&p.material==='copper'&&p.p[1]>.6&&p.p[1]<2.4);
    const desired=this.annotations.find(a=>a.id==='via');
    candidates.sort((a,b)=>a.p.reduce((n,v,i)=>n+(v-desired.p[i])**2,0)-b.p.reduce((n,v,i)=>n+(v-desired.p[i])**2,0));
    if(candidates[0])desired.p=[...candidates[0].p];
    this.focusFrames=[];
    for(const [stage,size,y,range] of [[2,22,.34,[.13,.39]],[3,22,5.05,[.40,.64]]]) {
      const r=size/2;
      const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-r,y,-r),new THREE.Vector3(r,y,-r),new THREE.Vector3(r,y,r),new THREE.Vector3(-r,y,r)]);
      const line=new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color:0xe0bf84,transparent:true,opacity:.8,depthTest:false}));
      line.renderOrder=3;
      this.scenes[stage].userData.root.add(line);
      this.focusFrames.push({line,range});
    }
  }

  addAtomicRuler() {
    const cube=new THREE.BoxGeometry(1,1,1);
    const line=new THREE.LineSegments(new THREE.EdgesGeometry(cube),new THREE.LineBasicMaterial({color:0xe0bf84,transparent:true,opacity:.6}));
    cube.dispose();line.position.set(-.5,-.5,-.5);
    this.scenes[5].userData.root.add(line);
    this.focusFrames.push({line,range:[1.30,1.44]});
  }

  setCameraProgress(progress) {
    const pose=journeyAt(progress,this.width/this.height);
    this.pose=pose;
    const atomicFocus=smooth(1.26,1.49,progress);
    this.world.fog.near=200+(26-200)*atomicFocus;
    this.world.fog.far=400+(48-400)*atomicFocus;
    const unit=24/pose.distance;
    this.universe.scale.setScalar(unit);
    this.universe.position.set(...pose.target.map(v=>-v*unit));
    this.camera.position.set(...pose.direction.map(v=>v*24));
    this.camera.position.x+=this.pointer.x*.11;
    this.camera.position.y+=this.pointer.y*.07;
    this.camera.fov=pose.fov;
    this.camera.near=.03;
    this.camera.far=200;
    this.camera.clearViewOffset();
    this.camera.lookAt(0,0,0);
    this.camera.setViewOffset(this.width,this.height,-this.width*pose.shiftX,this.height*pose.shiftY,this.width,this.height);
    this.camera.updateProjectionMatrix();
    this.composite.uniforms.near.value=this.camera.near;
    const shadow=this.scenes[0].userData.key.shadow;
    const radius=16;
    Object.assign(shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius});
    shadow.camera.updateProjectionMatrix();
    const lid=this.scenes[0].userData.lid;
    {
      const lift=smooth(.025,.145,progress);
      lid.position.y=lift*7.5;
      lid.position.x=-lift*5.8;
      lid.position.z=-lift*3.5;
      lid.rotation.z=lift*.33;
      lid.rotation.x=-lift*.24;
      lid.visible=lift<.99;
    }
    // Only discard parent geometry after its detailed child fills the view.
    // Small descendants become visible while still only a few pixels wide.
    const ranges=[[0,.39],[0,.62],[0,.82],[.29,1.19],[.59,1.38],[1.02,JOURNEY_END]];
    this.scenes.forEach((scene,i)=>{
      const visible=progress>=ranges[i][0]&&progress<=ranges[i][1];
      scene.userData.meshes.forEach(mesh=>{mesh.visible=visible;});
    });
    const floor=this.scenes[0].userData.floor;
    floor.position.y=(-.42-pose.target[1])*unit;
    floor.visible=progress<.35;
    for(const {line,range} of this.focusFrames) {
      line.visible=progress>=range[0]&&progress<=range[1];
      line.material.opacity=.7*smooth(range[0],range[0]+.025,progress)*(1-smooth(range[1]-.025,range[1],progress));
    }
    this.world.updateMatrixWorld(true);
  }

  projectedAnnotations() {
    if(!this.pose)return [];
    return this.annotations.filter(a=>this.progress>=a.range[0]&&this.progress<=a.range[1]).map(a=>{
      const point=new THREE.Vector3(...a.p);
      this.scenes[a.stage].userData.root.localToWorld(point);
      point.project(this.camera);
      return {...a,x:(point.x*.5+.5)*this.width,y:(-.5*point.y+.5)*this.height,
        visible:point.z>-1&&point.z<1&&point.x>-.96&&point.x<.96&&point.y>-.87&&point.y<.84};
    }).filter(a=>a.visible);
  }

  render(progress) {
    if(this.disposed||this.scenes.length!==6)return;
    this.progress=clamp(progress,0,JOURNEY_END);
    this.currentStage=Math.min(4,Math.floor(progress*5));
    this.renderer.info.reset();
    this.setCameraProgress(progress);
    this.renderer.setRenderTarget(this.targetA);
    this.renderer.render(this.world,this.camera);
    this.composite.uniforms.blend.value=0;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.composite.scene,this.composite.camera);
  }

  stats() {
    return {stage:this.currentStage,progress:this.progress,quality:this.quality,sceneCount:1,
      cameraDistance:this.pose?.distance,magnification:this.pose?.magnification,
      annotations:this.projectedAnnotations().map(a=>a.id),
      calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,
      geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures};
  }

  dispose() {
    if(this.disposed)return;
    this.disposed=true;
    this.canvas.removeEventListener('webglcontextlost',this.handleContextLost);
    for(const geometry of this.geometries.values())geometry.dispose();
    for(const material of this.materialCache.values())material.dispose();
    for(const texture of this.textureCache.values())texture.then(t=>t.dispose()).catch(()=>{});
    for(const scene of this.scenes) {
      scene.userData.key.shadow.map?.dispose();
      scene.userData.floor.geometry.dispose();scene.userData.floor.material.dispose();
    }
    this.targetA.dispose();this.targetB.dispose();this.environmentTarget.dispose();
    this.focusFrames?.forEach(({line})=>{line.geometry.dispose();line.material.dispose();});
    this.composite.material.dispose();this.composite.scene.children[0].geometry.dispose();
    this.renderer.dispose();
  }
}
