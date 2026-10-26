import { JOURNEY_END } from './journey.js';
import { LabelLayer } from './labels.js';
const $=selector=>document.querySelector(selector);
const labelLayer=new LabelLayer($('#object-annotations'));
const chapters=[...document.querySelectorAll('.chapter')];
const navLinks=[...document.querySelectorAll('.chapter-nav a')];
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const depthLabels=['Package scale','Millimetre scale','Micrometre scale','Submicron scale','Nanometre scale'];
let scrollUnit=1,finalPhase=-1;
let visualizer=null,ready=false,disposed=false,raf=0,active=-1;
let targetProgress=0,progress=0,lastTime=0,needsDraw=true,initializing=false;
const pointer={x:0,y:0};

// Append scroll distance only to the final chapter. Earlier pixel positions,
// chapter changes, and camera poses stay identical to the approved journey.
function sizeJourney() {
  const previous=scrollUnit>1?targetProgress:null;
  const last=chapters.at(-1);last.style.height='';
  const baseHeight=last.getBoundingClientRect().height;
  scrollUnit=Math.max(1,document.documentElement.scrollHeight-innerHeight);
  last.style.height=`${baseHeight+(JOURNEY_END-1)*scrollUnit}px`;
  if(previous!==null)scrollTo({top:previous*scrollUnit,behavior:'instant'});
}
function updateProgress() {
  targetProgress=Math.max(0,Math.min(JOURNEY_END,scrollY/scrollUnit));
  if(reduceMotion.matches)progress=targetProgress;
  needsDraw=true;
  schedule();
}

function updateLabels(displayProgress=progress) {
  const index=Math.min(4,Math.floor(displayProgress*5));
  if(index!==active) {
    active=index;
    chapters.forEach((el,i)=>el.classList.toggle('is-active',i===index));
    navLinks.forEach((el,i)=>i===index?el.setAttribute('aria-current','step'):el.removeAttribute('aria-current'));
    $('#depth-label').textContent=depthLabels[index];
    $('#chapter-position').textContent=`0${index+1} / 05`;
  }
  const phase=displayProgress<1.07?0:displayProgress<1.29?1:displayProgress<1.46?2:3;
  if(phase!==finalPhase) {
    finalPhase=phase;
    document.body.classList.toggle('atomic-view',phase>=2);
    const copy=chapters[4].querySelector('.chapter-copy');
    const content=[
      ['The transistor','It comes down<br>to a switch.','A gate controls current through a silicon channel. Repeat this tiny idea billions of times, and a computer emerges.','FinFET · illustrative cutaway'],
      ['The material','Inside<br>the silicon.','The fin is silicon (Si). A conductive metal gate controls it through an insulating oxide, commonly hafnium-based. The small window opens into the silicon crystal.','Silicon · Si'],
      ['The crystal','Matter,<br>in formation.','Silicon atoms form a continuous crystal. Each interior atom bonds to four neighbours. The repeating cubic cell is just 0.543 nanometres wide.','Ball-and-stick model · illustrative colours'],
      ['One silicon atom','One silicon<br>atom.','Four bonds connect this silicon atom to its neighbours, just 0.235 nm away. These are the building blocks of the fin.','Atomic model · spheres are not solid shells'],
    ][phase];
    copy.querySelector('.chapter-index').textContent=content[0];
    copy.querySelector('h2').innerHTML=content[1];
    copy.querySelector('.final-description').textContent=content[2];
    copy.querySelector('.final-material').textContent=content[3];
    copy.querySelector('.atomic-comparison').hidden=phase!==3;
  }
  if(index===4)$('#depth-label').textContent=displayProgress>=1.29?'Atomic scale':depthLabels[4];
  $('.journey-progress span').style.width=`${displayProgress/JOURNEY_END*100}%`;
  $('.journey-progress').setAttribute('aria-valuenow',String(Math.round(displayProgress/JOURNEY_END*100)));
}

function schedule() {
  if(!raf&&!document.hidden&&!disposed)raf=requestAnimationFrame(frame);
}

function frame(time) {
  raf=0;
  if(document.hidden||disposed)return;
  const delta=Math.min(64,time-lastTime||16);lastTime=time;
  const difference=targetProgress-progress;
  progress=reduceMotion.matches?targetProgress:progress+difference*(1-Math.exp(-delta/105));
  if(Math.abs(targetProgress-progress)<.00003)progress=targetProgress;
  updateLabels();
  if(ready&&(needsDraw||Math.abs(difference)>.00001)) {
    visualizer.pointer.x=reduceMotion.matches?0:pointer.x;
    visualizer.pointer.y=reduceMotion.matches?0:pointer.y;
    try{visualizer.render(progress);labelLayer.update(visualizer.projectedAnnotations(),active);}catch(error){fallback(error);}
  }
  needsDraw=false;
  if(Math.abs(targetProgress-progress)>.00001)schedule();
}

function fallback(error) {
  console.warn('Silicon 3D view:',error?.message??error);
  ready=false;
  document.body.classList.remove('is-ready');
  document.body.classList.add('is-fallback');
  $('#fallback-message').hidden=false;
}

async function initialize() {
  if(initializing)return;
  initializing=true;
  $('#retry').disabled=true;
  document.body.classList.remove('is-fallback');
  $('#fallback-message').hidden=true;
  try {
    if(visualizer) {
      visualizer.dispose();
      // A fresh canvas also recovers a deliberately lost or exhausted context.
      const oldCanvas=$('#world');oldCanvas.replaceWith(oldCanvas.cloneNode(false));
    }
    const Renderer=(await import('./renderer.js')).SiliconRenderer;
    visualizer=new Renderer($('#world'),{
      onProgress:message=>{$('#load-message').textContent=message;},onFailure:fallback,
      onFrame:()=>{needsDraw=true;schedule();},
    });
    await visualizer.init();
    ready=true;
    visualizer.render(progress);
    labelLayer.update(visualizer.projectedAnnotations(),active);
    document.body.classList.add('is-ready');
    needsDraw=true;schedule();
  }catch(error){fallback(error);}
  finally{initializing=false;$('#retry').disabled=false;}
}

// Navigation shares the camera timeline. Extra atomic scroll distance is
// appended after the original ending and does not move earlier chapter stops.
function navigate(index,writeHash=true) {
  const p=index===0?0:(index+.18)/5;
  const top=p*scrollUnit;
  if(writeHash)history.replaceState(null,'',`#${chapters[index].id}`);
  window.scrollTo({top,behavior:reduceMotion.matches?'instant':'smooth'});
}
document.querySelectorAll('a[href^="#"]').forEach(link=>{
  const index=chapters.findIndex(c=>`#${c.id}`===link.getAttribute('href'));
  if(index<0)return;
  link.addEventListener('click',event=>{event.preventDefault();navigate(index);});
});
$('#replay').addEventListener('click',()=>navigate(0));
$('#retry').addEventListener('click',initialize);
$('#labels-button').addEventListener('click',()=>{
  const hidden=document.body.classList.toggle('text-hidden');
  $('#labels-button').setAttribute('aria-pressed',String(hidden));
  $('#labels-button').textContent=hidden?'Show text':'Hide text';
});
const dialog=$('#about-dialog');
$('#about-button').addEventListener('click',()=>dialog.showModal());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
addEventListener('scroll',updateProgress,{passive:true});
addEventListener('resize',()=>{sizeJourney();visualizer?.resize();updateProgress();},{passive:true});
addEventListener('pointermove',event=>{
  if(event.pointerType!=='mouse'||reduceMotion.matches)return;
  pointer.x=event.clientX/innerWidth*2-1;pointer.y=-(event.clientY/innerHeight*2-1);
  needsDraw=true;schedule();
},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastTime=0;needsDraw=true;schedule();}else if(raf){cancelAnimationFrame(raf);raf=0;}});
reduceMotion.addEventListener('change',updateProgress);
addEventListener('pagehide',event=>{
  if(event.persisted)return;
  disposed=true;cancelAnimationFrame(raf);visualizer?.dispose();
});
addEventListener('pageshow',event=>{if(event.persisted){needsDraw=true;schedule();}});

sizeJourney();updateProgress();updateLabels();
const initialChapter=chapters.findIndex(c=>`#${c.id}`===location.hash);
if(initialChapter>=0)requestAnimationFrame(()=>navigate(initialChapter,false));
initialize();

// Read-only diagnostics for validating the actual running render loop.
export function diagnostics(){return {ready,active,progress,targetProgress,scrollUnit,journeyEnd:JOURNEY_END,...visualizer?.stats()};}
