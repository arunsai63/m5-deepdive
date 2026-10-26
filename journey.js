export const JOURNEY_END=1.55;
// One physical hierarchy and one camera trajectory. Detail is embedded in its
// parent from the beginning; changing chapters never replaces the scene.
export const hierarchy = [
  {p:[0,0,0],s:[1,1,1]},
  {p:[0,.359-.118*(7.45/16),0],s:[7.45/16,7.45/16,7.45/16]},
  {p:[-8+(1670+650)*16/8192,.125,-8+(1870+500)*16/8192],s:[1300*16/8192/22,.105,1000*16/8192/22]},
  {p:[1.58,.285,-1.84],s:[.055,.055,.055]},
  {p:[.97,.025,.94],s:[.038,.038,.038]},
  {p:[0,.555,.27],s:[.005,.005,.005]},
];

// The illustrative floorplan uses different X/Z scales. Cancel that stretch
// for the crystal so its unit cells remain cubic and its atom sites isotropic.
for(let axis=0;axis<3;axis++)hierarchy[5].s[axis]=.0000005/hierarchy.slice(1,5).reduce((n,h)=>n*h.s[axis],1);

export function toPackage(stage,point) {
  let p=[...point];
  for(let i=stage;i>0;i--)p=p.map((v,k)=>v*hierarchy[i].s[k]+hierarchy[i].p[k]);
  return p;
}

const keys=[
  {p:0,d:28.5,target:[0,.2,0],direction:[.49,.67,.56]},
  {p:.13,d:22,target:toPackage(1,[0,.13,0]),direction:[.30,.86,.42]},
  {p:.26,d:8,target:toPackage(1,[-3.46875,.13,-3.3711]),direction:[.24,.88,.41]},
  {p:.40,d:1.9,target:toPackage(2,[0,.12,0]),direction:[.28,.85,.45]},
  {p:.55,d:.28,target:toPackage(2,[1.58,.35,-1.84]),direction:[.33,.81,.48]},
  {p:.66,d:.075,target:toPackage(3,[.97,1.4,.94]),direction:[.20,.96,.16]},
  {p:.80,d:.0065,target:toPackage(3,[.97,.16,.94]),direction:[-.15,.985,.08]},
  {p:.90,d:.0016,target:toPackage(4,[0,.48,0]),direction:[-.15,.97,.18]},
  {p:1,d:.00050,target:toPackage(4,[0,.48,0]),direction:[.39,.75,.54]},
  {p:1.13,d:.00010,target:toPackage(4,[0,.555,.27]),direction:[.25,.94,.23]},
  {p:1.28,d:.000013,target:toPackage(5,[0,-.5,.5]),direction:[.32,.89,.32]},
  {p:1.42,d:.0000022,target:toPackage(5,[0,-.5,.5]),direction:[.04,.99,.15]},
  {p:JOURNEY_END,d:.00000072,target:toPackage(5,[0,-.5,.5]),direction:[.04,.99,.15]},
];
const values=keys.map(k=>Math.log(k.d));
const deltas=keys.slice(1).map((k,i)=>(values[i+1]-values[i])/(k.p-keys[i].p));
const slopes=keys.map((k,i)=>{
  if(i===0)return deltas[0];
  if(i===keys.length-1)return deltas.at(-1);
  if(k.p===1)return deltas[i-1];
  const before=k.p-keys[i-1].p,after=keys[i+1].p-k.p;
  const w1=2*after+before,w2=after+2*before;
  return (w1+w2)/(w1/deltas[i-1]+w2/deltas[i]);
});

export function journeyAt(progress,aspect=1.6) {
  const p=Math.max(0,Math.min(JOURNEY_END,progress));
  const i=Math.min(keys.length-2,Math.max(0,keys.findIndex((k,j)=>j<keys.length-1&&p>=k.p&&p<=keys[j+1].p)));
  const a=keys[i],b=keys[i+1],h=b.p-a.p,u=(p-a.p)/h;
  const ease=u*u*(3-2*u);
  const logDistance=(2*u**3-3*u*u+1)*values[i]+(u**3-2*u*u+u)*h*slopes[i]+(-2*u**3+3*u*u)*values[i+1]+(u**3-u*u)*h*slopes[i+1];
  const target=a.target.map((v,k)=>v+(b.target[k]-v)*ease);
  const direction=a.direction.map((v,k)=>v+(b.direction[k]-v)*ease);
  const norm=Math.hypot(...direction);
  const mobile=aspect<.9;
  const distance=Math.exp(logDistance)*(mobile?Math.max(1.25,.99/aspect):1);
  return {target,direction:direction.map(v=>v/norm),distance,fov:34,
    shiftX:mobile?0:.16,shiftY:mobile?.17:0,magnification:28.5/Math.exp(logDistance)};
}

// Anchors are in the geometry's own coordinates, never fixed screen positions.
// Regions describe this illustrative floorplan, not Apple's proprietary layout.
export const annotations=[
  {id:'housing',stage:0,p:[0,.83,0],title:'Chip package',detail:'Protects the silicon inside',range:[0,.105],side:'left'},
  {id:'substrate',stage:0,p:[4.93,.15,1.4],title:'Package substrate',detail:'Routes power and signals',range:[0,.20],side:'right'},
  {id:'capacitors',stage:0,p:[2.8,.24,4.83],title:'Decoupling capacitors',detail:'Keep the power supply stable',range:[0,.16],side:'left'},
  {id:'die',stage:1,p:[5.4,.13,5.5],title:'Silicon die',detail:'The chip’s active silicon',range:[.10,.29],side:'right'},
  {id:'cpu',stage:1,p:[-3.46875,.14,-3.3711],title:'CPU core',detail:'The region we’re entering',range:[.13,.41],side:'left',focus:true},
  {id:'gpu',stage:1,p:[2.05,.13,-4.5],title:'GPU blocks',detail:'Many operations in parallel',range:[.14,.32],side:'right'},
  {id:'cache',stage:1,p:[-5.1,.13,2.6],title:'Cache memory',detail:'Data kept close to the cores',range:[.13,.30],side:'left'},
  {id:'io',stage:1,p:[6.3,.13,-.1],title:'Memory interfaces',detail:'Connect the die to memory',range:[.14,.28],side:'right'},
  {id:'sram',stage:2,p:[1.2,.15,1.4],title:'SRAM array',detail:'Repeating memory cells',range:[.28,.56],side:'left'},
  {id:'cells',stage:2,p:[-1.8,.13,-1.8],title:'Standard-cell rows',detail:'Small circuits that form logic',range:[.28,.59],side:'right'},
  {id:'routing',stage:2,p:[-.12,.16,-1.6],title:'Local routing',detail:'Wires between neighbouring cells',range:[.38,.60],side:'left'},
  {id:'power',stage:2,p:[1.32,.30,2.64],title:'Power distribution',detail:'Wider rails supply the circuits',range:[.36,.57],side:'right'},
  {id:'stack',stage:3,p:[.97,4.81,0],title:'Metal interconnect stack',detail:'Our path down to the devices',range:[.47,.70],side:'right',focus:true},
  {id:'upper-metal',stage:3,p:[2.6,4.82,0],title:'Upper metal layer',detail:'Longer routes across the core',range:[.55,.73],side:'left'},
  {id:'via',stage:3,p:[.97,1.65,.94],title:'Via',detail:'A vertical connection between layers',range:[.58,.80],side:'right',snap:'via'},
  {id:'lower-metal',stage:3,p:[.86,.30,1.1],title:'Local metal layer',detail:'Connections closest to the transistors',range:[.64,.82],side:'left'},
  {id:'transistor-field',stage:4,p:[0,.65,0],title:'Transistor array',detail:'The smallest repeating switches',range:[.74,.90],side:'right',focus:true},
  {id:'gate',stage:4,p:[-.35,1.34,0],title:'Metal gate · cutaway',detail:'Controls current in the channel',range:[.87,1.12],side:'right'},
  {id:'fin',stage:4,p:[0,.55,.25],title:'Silicon fin',detail:'Silicon (Si) · the conducting channel',range:[.89,1.19],side:'left'},
  {id:'insulator',stage:4,p:[.074,.52,.13],title:'Gate dielectric',detail:'Hafnium-based oxide · typical material',range:[.97,1.16],side:'right'},
  {id:'source',stage:4,p:[0,.32,.68],title:'Source / drain region',detail:'Doped semiconductor · current enters / leaves',range:[.88,1.10],side:'right'},
  {id:'crystal-window',stage:5,p:[0,0,0],title:'Inside the silicon fin',detail:'One continuous crystal of silicon atoms',range:[1.09,1.29],side:'left',focus:true},
  {id:'crystal-lattice',stage:5,p:[1,-1,1],title:'Silicon crystal',detail:'A repeating diamond-cubic structure',range:[1.23,1.44],side:'right'},
  {id:'unit-cell',stage:5,p:[-1,0,-1],title:'0.543 nm',detail:'The width of one crystal unit cell',range:[1.30,1.45],side:'left'},
  {id:'single-atom',stage:5,p:[0,-.5,.5],title:'One silicon atom · Si',clearance:150,detail:'Four bonds join its nearest neighbours',range:[1.36,1.55],side:'left',focus:true},
  {id:'atomic-bond',stage:5,p:[.125,-.375,.625],title:'Si–Si · 0.235 nm',detail:'Distance between neighbouring atom centres',range:[1.39,1.55],side:'right'},
];
