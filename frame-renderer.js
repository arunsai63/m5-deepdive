import * as THREE from './assets/vendor/three.module.js';
import {journeyAt,annotations,toPackage,JOURNEY_END} from './journey.js';
import {makeWiring} from './scene-data.js';

const base='./assets/renders/sequence/preview/';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class FrameRenderer {
  constructor(canvas,callbacks={}) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.callbacks=callbacks;
    this.pointer={x:0,y:0};this.cache=new Map();this.pending=new Set();this.queue=[];
    this.blobs=new Map();this.fetches=new Map();
    this.camera=new THREE.PerspectiveCamera(34,1.6,.03,200);this.annotations=annotations.map(a=>({...a,p:[...a.p]}));
    this.tweenCamera=this.camera.clone();
    const via=this.annotations.find(a=>a.id==='via');
    const candidates=makeWiring().parts.filter(p=>p.shape==='cylinder'&&p.material==='copper'&&p.p[1]>.6&&p.p[1]<2.4);
    candidates.sort((a,b)=>a.p.reduce((n,v,i)=>n+(v-via.p[i])**2,0)-b.p.reduce((n,v,i)=>n+(v-via.p[i])**2,0));
    if(candidates[0])via.p=[...candidates[0].p];
    this.badge=document.createElement('a');this.badge.className='frame-preview-status';
    this.badge.href='./assets/renders/sequence/';document.body.append(this.badge);
    this.original=document.createElement('a');this.original.className='frame-original';this.original.textContent='Open full-resolution frame';this.original.target='_blank';this.original.rel='noopener';document.body.append(this.original);
  }
  async refresh() {
    const r=await fetch(base+'manifest.json',{cache:'no-store'});if(!r.ok)throw Error('Preparing browser frames…');
    const d=await r.json();this.total=d.total;this.available=new Set(d.available);
    let end=0;while(this.available.has(end+1))end++;
    this.end=Math.max(this.end??0,end);
    this.badge.textContent=`Blender preview · ${this.end+1} / ${this.total}`;
    if(this.requested!==undefined)this.render(this.requested);
    this.callbacks.onFrame?.();
    if(this.initialized)this.preload();
  }
  async init() {
    this.callbacks.onProgress?.('Loading the rendered chip…');await this.refresh();this.resize();
    await this.load(0);this.interval=setInterval(()=>this.refresh().catch(()=>{}),15000);
    this.initialized=true;this.preload();
  }
  async blob(i) {
    if(this.blobs.has(i))return this.blobs.get(i);
    if(this.fetches.has(i))return this.fetches.get(i);
    const task=(async()=>{const r=await fetch(base+`frame-${String(i).padStart(4,'0')}.webp`);if(!r.ok)throw Error('Frame unavailable');const blob=await r.blob();if(!this.disposed)this.blobs.set(i,blob);return blob;})();
    this.fetches.set(i,task);try{return await task;}finally{this.fetches.delete(i);}
  }
  async preload() {
    if(this.preloading||this.disposed)return;this.preloading=true;
    try{for(let i=0;i<=this.end&&!this.disposed;i+=3)await Promise.all([i,i+1,i+2].filter(j=>j<=this.end).map(j=>this.blob(j).catch(()=>{})));}
    finally{this.preloading=false;}
  }
  resize() {
    this.width=innerWidth;this.height=innerHeight;
    // The review assets are 1600 × 1000. Oversampling beyond those source pixels
    // increases the cost of every scroll repaint without adding image detail.
    const dpr=this.width/this.height<.9?Math.min(devicePixelRatio,1.5):Math.min(devicePixelRatio,1.5,1600/this.width,1000/this.height);
    this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);
    this.ctx.setTransform(dpr,0,0,dpr,0,0);this.lastDraw='';
  }
  async load(i) {
    if(this.cache.has(i)||this.pending.has(i)||this.disposed)return;
    this.pending.add(i);
    try {
      const bitmap=await createImageBitmap(await this.blob(i));
      if(this.disposed){bitmap.close();return;}
      this.cache.set(i,bitmap);
      while(this.cache.size>24) {
        const far=[...this.cache.keys()].sort((a,b)=>Math.abs(b-this.wanted)-Math.abs(a-this.wanted)).find(k=>k!==this.wanted&&k!==this.displayed);
        if(far===undefined)break;this.cache.get(far).close();this.cache.delete(far);
      }
      this.callbacks.onFrame?.();
    }finally{this.pending.delete(i);this.pump();}
  }
  pump() {
    while(this.pending.size<3&&this.queue.length){const i=this.queue.shift();if(!this.cache.has(i)&&!this.pending.has(i))this.load(i).catch(()=>{});}
  }
  render(progress) {
    this.requested=progress;const f=clamp(progress/JOURNEY_END*(this.total-1),0,this.end);
    this.wanted=Math.floor(f);
    const order=[this.wanted];for(let offset=1;offset<=9;offset++)order.push(this.wanted+offset,this.wanted-offset);
    this.queue=order.filter(i=>i>=0&&i<=this.end&&!this.cache.has(i));this.pump();
    let index=this.wanted;
    // Never substitute a future frame that can jump backwards when the requested
    // frame finishes decoding. Keep the last displayed image until it is ready.
    if(!this.cache.has(index))index=this.cache.has(this.displayed)?this.displayed:(this.cache.has(0)?0:undefined);
    if(index===undefined)return;
    this.displayed=index;this.presentedProgress=index/(this.total-1)*JOURNEY_END;
    this.pose=journeyAt(this.presentedProgress,1.6);
    const tweenPose=journeyAt((Math.abs(f-index)<1.05?f:index)/(this.total-1)*JOURNEY_END,1.6);
    const mobile=this.width/this.height<.9;
    this.scale=mobile?this.width/1600:Math.max(this.width/1600,this.height/1000);
    this.drawWidth=1600*this.scale;this.drawHeight=1000*this.scale;
    this.left=(this.width-this.drawWidth)/2;this.top=mobile?Math.max(90,this.height*.15):(this.height-this.drawHeight)/2;
    this.cx=this.left+this.drawWidth*.66;this.cy=this.top+this.drawHeight*.5;
    this.configureCamera(this.camera,this.pose);this.configureCamera(this.tweenCamera,tweenPose);
    // Follow the full camera motion between frames: translation, rotation and
    // scale. Scaling alone snapped whenever a new image changed the viewpoint.
    const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0);
    const up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1);
    const radius=this.pose.distance*Math.tan(17*Math.PI/180)*.5;
    const points=[new THREE.Vector3(...this.pose.target),new THREE.Vector3(...this.pose.target).addScaledVector(right,radius),new THREE.Vector3(...this.pose.target).addScaledVector(up,radius)];
    const src=points.map(p=>this.project(p,this.pose,this.camera)),dst=points.map(p=>this.project(p,tweenPose,this.tweenCamera));
    const dx=src[1].x-src[0].x,dy=src[2].y-src[0].y;
    const a=(dst[1].x-dst[0].x)/dx,b=(dst[1].y-dst[0].y)/dx,c=(dst[2].x-dst[0].x)/dy,d=(dst[2].y-dst[0].y)/dy;
    this.affine=[a,b,c,d,dst[0].x-a*src[0].x-c*src[0].y,dst[0].y-b*src[0].x-d*src[0].y];
    const key=[index,...this.affine,this.width,this.height].join(':');
    if(key!==this.lastDraw){
      this.ctx.fillStyle='#101214';this.ctx.fillRect(0,0,this.width,this.height);
      this.ctx.save();this.ctx.transform(...this.affine);
      this.ctx.drawImage(this.cache.get(index),this.left,this.top,this.drawWidth,this.drawHeight);this.ctx.restore();this.lastDraw=key;
    }
    this.original.href=`./assets/renders/sequence/frame-${String(index).padStart(4,'0')}.png`;
    this.badge.textContent=progress/JOURNEY_END*(this.total-1)>this.end+1?`Blender preview · waiting beyond frame ${this.end+1}`:`Blender preview · ${this.end+1} / ${this.total}`;
  }
  configureCamera(camera,pose){camera.position.fromArray(pose.direction.map(v=>v*24));camera.lookAt(0,0,0);camera.setViewOffset(1600,1000,-256,0,1600,1000);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
  project(world,pose,camera){const p=new THREE.Vector3(...world.toArray().map((v,k)=>(v-pose.target[k])*24/pose.distance)).project(camera);return {x:this.left+(p.x*.5+.5)*this.drawWidth,y:this.top+(-p.y*.5+.5)*this.drawHeight};}
  projectedAnnotations() {
    if(!this.pose)return [];
    return this.annotations.filter(a=>this.presentedProgress>=a.range[0]&&this.presentedProgress<=a.range[1]).map(a=>{
      let anchor=a.p;
      if(a.id==='housing'){
        const t=clamp((this.presentedProgress-.025)/.12,0,1),lift=t*t*(3-2*t);
        anchor=new THREE.Vector3(...a.p).applyEuler(new THREE.Euler(-lift*.24,0,lift*.33,'XYZ')).add(new THREE.Vector3(-lift*5.8,lift*7.5,-lift*3.5)).toArray();
      }
      const world=toPackage(a.stage,anchor);
      const p=new THREE.Vector3(...world.map((v,k)=>(v-this.pose.target[k])*24/this.pose.distance)).project(this.camera);
      let x=this.left+(p.x*.5+.5)*this.drawWidth,y=this.top+(-p.y*.5+.5)*this.drawHeight;
      const [aa,b,c,d,e,f]=this.affine;[x,y]=[aa*x+c*y+e,b*x+d*y+f];
      return {...a,x,y,visible:p.z>-1&&p.z<1&&x>18&&x<this.width-18&&y>90&&y<this.height-100};
    }).filter(a=>a.visible);
  }
  stats(){return {renderer:'blender-frames',displayedFrame:this.displayed,availableFrames:this.end+1,cachedFrames:this.cache.size,bufferedFrames:this.blobs.size,pendingFrames:this.pending.size,presentedProgress:this.presentedProgress};}
  dispose(){this.disposed=true;clearInterval(this.interval);for(const bitmap of this.cache.values())bitmap.close();this.cache.clear();this.blobs.clear();this.badge.remove();this.original.remove();}
}
