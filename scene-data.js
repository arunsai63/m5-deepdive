/** Original geometry recipes, shared by the realtime and Blender renderers.
 * Coordinates use Y up. All dimensions are illustrative, in local scene units.
 * Repeated parts are instances, never thousands of individual draw calls.
 */
export const materials = {
  epoxy: { color: '#25282a', metalness: .24, roughness: .43, normal: 'epoxy-normal', normalScale: .28, roughnessMap: 'epoxy-roughness' },
  capSide: { color: '#66685f', metalness: .94, roughness: .28, normal: 'metal-normal', normalScale: .12 },
  substrate: { color: '#244c40', metalness: .15, roughness: .55, normal: 'epoxy-normal', normalScale: .14 },
  substrateMap: { color: '#ffffff', metalness: .25, roughness: .49, map: 'substrate-4k' },
  laminate: { color: '#7a7351', metalness: .2, roughness: .58 },
  copper: { color: '#bd8767', metalness: 1, roughness: .33, normal: 'metal-normal', normalScale: .32 },
  darkCopper: { color: '#89624d', metalness: .98, roughness: .39, normal: 'metal-normal', normalScale: .28 },
  gold: { color: '#d6b675', metalness: 1, roughness: .25, normal: 'metal-normal', normalScale: .06 },
  solder: { color: '#c8cbd0', metalness: 1, roughness: .25, normal: 'metal-normal', normalScale: .08 },
  ceramic: { color: '#a8a18c', metalness: .04, roughness: .5 },
  darkCeramic: { color: '#353b3d', metalness: .18, roughness: .4 },
  silicon: { color: '#71858c', metalness: .79, roughness: .2, iridescence: .42 },
  die: { color: '#ffffff', metalness: .75, roughness: .26, map: 'die', bump: 'die-height-4k', bumpScale: .007, iridescence: .34 },
  marking: { color: '#ffffff', metalness: .65, roughness: .46, map: 'package-marking-4k', transparent: true },
  dark: { color: '#10191b', metalness: .14, roughness: .65 },
  dielectric: { color: '#40515a', metalness: .12, roughness: .39 },
  oxide: { color: '#7b8c8e', metalness: .2, roughness: .32, iridescence: .35 },
  gate: { color: '#a6b1b4', metalness: 1, roughness: .31, normal: 'metal-normal', normalScale: .22 },
  doped: { color: '#8a7d89', metalness: .69, roughness: .32, iridescence: .35 },
  cellA: { color: '#ac9d6f', metalness: .85, roughness: .28, iridescence: .25 },
  cellB: { color: '#718b88', metalness: .88, roughness: .29, iridescence: .38 },
  cellC: { color: '#9984a4', metalness: .85, roughness: .29, iridescence: .4 },
  atom: { color: '#9cadb5', metalness: .58, roughness: .24 },
  detailAtom: { color: '#9cadb5', metalness: .58, roughness: .24 },
  selectedAtom: { color: '#ddbb80', metalness: .55, roughness: .22 },
  bond: { color: '#687d88', metalness: .65, roughness: .34 },
  selectedBond: { color: '#c8a56d', metalness: .6, roughness: .3 },
  cellD: { color: '#b29579', metalness: .9, roughness: .28, iridescence: .28 },
};

function random(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function builder(name) {
  const parts = [];
  const add = (shape, material, p, s, options = {}) => parts.push({ shape, material, p, s, ...options });
  return { name, parts, add,
    box: (m,p,s,o) => add('box',m,p,s,o),
    round: (m,p,s,o) => add('round',m,p,s,o),
    cylinder: (m,p,s,o) => add('cylinder',m,p,s,o),
    sphere: (m,p,s,o) => add('sphere',m,p,s,o),
    plane: (m,p,s,o) => add('plane',m,p,s,o),
  };
}

export function makePackage() {
  const b = builder('package');
  b.round('substrate', [0,0,0], [10.5,.29,10.5], { bevel:.06, name:'Organic substrate' });
  b.round('laminate', [0,-.117,0], [10.48,.028,10.48], { bevel:.04 });
  b.round('copper', [0,-.132,0], [10.44,.014,10.44], { bevel:.035 });
  b.plane('substrateMap', [0,.149,0], [10.47,1,10.47]);
  b.round('dark', [0,.203,0], [7.6,.13,7.64], { bevel:.04, name:'Die underfill' });
  b.round('silicon', [0,.305,0], [7.45,.105,7.49], { bevel:.017, name:'Silicon die' });
  b.plane('die', [0,.359,0], [7.445,1,7.485]);
  // Precision metal sidewall, graphite cap, and shallow laser etching.
  b.round('capSide', [0,.492,0], [9.18,.51,9.18], { bevel:.145, group:'lid', name:'Package sidewall' });
  b.round('dark', [0,.708,0], [9.22,.05,9.22], { bevel:.15, group:'lid' });
  b.round('epoxy', [0,.766,0], [9.15,.12,9.15], { bevel:.17, group:'lid', name:'Graphite moulding' });
  b.plane('marking', [0,.829,0], [8.97,1,8.97], { group:'lid', name:'Laser marking' });
  // Ceramic decoupling capacitors with silver terminations and solder fillets.
  for (let side=0;side<4;side++) {
    const angle=side*Math.PI/2;
    const put=(shape,m,x,y,z,s,o={})=>{
      const p=[x*Math.cos(angle)-z*Math.sin(angle),y,x*Math.sin(angle)+z*Math.cos(angle)];
      b.add(shape,m,p,s,{r:[0,-angle,0],...o});
    };
    for(let i=0;i<32;i++) {
      const x=-4.7+i*.3;
      const length = i%5===0 ? .23:.18;
      put('round',i%5===0?'darkCeramic':'ceramic',x,.232,4.83,[length,.105,.13],{bevel:.017});
      for(const sign of [-1,1]) {
        put('round','solder',x+sign*length*.39,.235,4.83,[.05,.11,.139],{bevel:.014});
        put('round','solder',x+sign*length*.5,.177,4.83,[.077,.026,.17],{bevel:.01});
      }
      put('cylinder','gold',x,.158,5.085,[.07,.009,.07]);
      put('cylinder','dark',x,.164,5.085,[.028,.008,.028]);
      put('box','gold',x,.155,4.61,[.05,.008,.065]);
    }
    for(let i=0;i<18;i++) {
      const x=-3.3+i*.388;
      put('box','gold',x,.156,4.38,[.10,.009,.09]);
    }
  }
  // Underside ball-grid array and annular landing pads, not flat painted dots.
  for(let i=0;i<31;i++)for(let j=0;j<31;j++) {
    if(i>11&&i<19&&j>11&&j<19)continue;
    const x=(i-15)*.315,z=(j-15)*.315;
    b.cylinder('gold',[x,-.157,z],[.19,.018,.19]);
    b.sphere('solder',[x,-.235,z],[.166,.154,.166]);
  }
  // Three substrate registration fiducials and the orientation mark.
  for(const [x,z] of [[-5.02,-5.02],[5.02,-5.02],[5.02,5.02]]) {
    b.cylinder('gold',[x,.155,z],[.12,.012,.12]);
    b.cylinder('substrate',[x,.164,z],[.046,.009,.046]);
  }
  return b;
}

export function makeDie() {
  const b=builder('die');
  b.round('dark',[0,-.28,0],[16.35,.6,16.35],{bevel:.035});
  b.round('silicon',[0,.065,0],[16,.10,16],{bevel:.014});
  b.plane('die',[0,.118,0],[15.995,1,15.995]);
  // Diced edges retain visible layers and a narrow scribe lane.
  for(let i=0;i<8;i++)b.round(i%2?'darkCopper':'oxide',[0,-.032-i*.027,0],[16.12+i*.012,.012,16.12+i*.012],{bevel:.015});
  for(let i=0;i<118;i++)for(const side of [-1,1]) {
    const v=(i-58.5)*.132;
    b.box('gold',[v,.128,side*7.913],[.071,.012,.075]);
    b.box('gold',[side*7.913,.128,v],[.075,.012,.071]);
  }
  // Sparse raised top-metal lines give the macro view actual specular relief.
  for(let i=0;i<24;i++) {
    b.box('cellA',[-1.975+i*.009,.125,.04],[.003,.006,14.2]);
    b.box('cellB',[4.485+i*.009,.125,.04],[.003,.006,14.2]);
  }
  return b;
}

export function makeLogic() {
  const b=builder('logic'), rand=random(1428);
  b.round('silicon',[0,-.29,0],[22,.4,22],{bevel:.025});
  b.box('dark',[0,-.075,0],[21.99,.029,21.99]);
  const colors=['cellA','cellB','cellC','cellD'];
  // Dense, repetitive standard-cell placement across 36 separated macro blocks.
  for(let row=0;row<6;row++)for(let col=0;col<6;col++) {
    const x0=-10.4+col*3.5,z0=-10.4+row*3.5;
    const memory=(col+row)%3===0;
    const mat=colors[(col+row*2)%4];
    b.box('dielectric',[x0+1.55,-.021,z0+1.55],[3.14,.072,3.14]);
    for(let y=0;y<26;y++) {
      let cursor=0;
      while(cursor<2.95) {
        const width=memory?.15:.08+Math.floor(rand()*5)*.06;
        if(cursor+width>3.05)break;
        const xx=x0+.08+cursor,zz=z0+.075+y*.118;
        const elevation=memory?.052:.035+rand()*.04;
        b.box(mat,[xx+width/2,elevation,zz],[width,.08,.065]);
        if(y%3===0)b.box('gold',[xx+width/2,elevation+.043,zz],[width*.82,.007,.012]);
        if(rand()>.78)b.cylinder('solder',[xx+.03,elevation+.05,zz],[.018,.013,.018]);
        cursor+=width+.035;
      }
      b.box(y%2?'darkCopper':'cellB',[x0+1.57,.135,z0+.032+y*.118],[3.05,.018,.013]);
    }
    // Local routing channels and decoders within each memory/logic macro.
    for(let i=0;i<8;i++)b.box('cellA',[x0+3.22+i*.023,.04,z0+1.56],[.009,.025,3.34]);
    for(let i=0;i<4;i++)b.box('cellD',[x0+1.58,.17,z0+3.2+i*.034],[3.37,.022,.012]);
  }
  // Wider top-metal power distribution alternates direction across layers.
  for(let i=0;i<17;i++) {
    const v=-10.6+i*1.32;
    b.box('cellA',[v,.225,0],[.028,.033,21.55]);
    b.box('cellB',[0,.285,v],[21.55,.034,.027]);
    for(let j=0;j<17;j++)if((i+j)%3===0)b.cylinder('gold',[v,.255,-10.6+j*1.32],[.039,.064,.039]);
  }
  return b;
}

export function makeWiring() {
  const b=builder('wiring'),rand=random(650);
  b.round('silicon',[0,-.56,0],[22,.6,22],{bevel:.035});
  b.box('dielectric',[0,-.205,0],[22,.10,22]);
  // Device level: silicon fins with gate stripes, partly visible below the vias.
  for(let row=0;row<35;row++)for(let col=0;col<35;col++) {
    const x=-10.3+col*.61,z=-10.3+row*.61;
    // This window contains the actual nested transistor array, not a coarse
    // device placeholder that the camera would otherwise fly through.
    if(x>.48&&x<1.46&&z>.45&&z<1.48)continue;
    b.box('silicon',[x,-.095,z],[.39,.11,.065]);
    b.box('oxide',[x,-.045,z],[.1,.15,.16]);
    b.box('gate',[x,.02,z],[.068,.04,.19]);
  }
  // Six metal levels with increasing pitch. Segments and jogs form real volume.
  const levels=[{y:.24,pitch:.43,w:.095,h:.12},{y:.7,pitch:.61,w:.13,h:.15},
    {y:1.31,pitch:.9,w:.18,h:.21},{y:2.12,pitch:1.3,w:.26,h:.28},
    {y:3.21,pitch:1.85,w:.38,h:.36},{y:4.58,pitch:2.6,w:.56,h:.46}];
  levels.forEach((l,k)=>{
    const count=Math.floor(20.5/l.pitch),horizontal=k%2===1;
    for(let i=0;i<count;i++) {
      const v=(i-(count-1)/2)*l.pitch;
      // Cutaway removes an advancing upper-right corner to reveal lower layers.
      let begin=-10.55,end=10.55;
      if(k>2&&v>1.4)end=3.6-(k-3)*1.5;
      const gaps=k<3?3:2;
      for(let q=0;q<gaps;q++) {
        const start=begin+(end-begin)*q/gaps+.10;
        const stop=begin+(end-begin)*(q+1)/gaps-.09;
        const pos=horizontal?[(start+stop)/2,l.y,v]:[v,l.y,(start+stop)/2];
        const size=horizontal?[stop-start,l.h,l.w]:[l.w,l.h,stop-start];
        b.round(k%3===0?'darkCopper':'copper',pos,size,{bevel:l.h*.08});
      }
      if(i%3===0) {
        const jog=-7.6+rand()*13;
        const pos=horizontal?[jog,l.y,v+l.pitch/2]:[v+l.pitch/2,l.y,jog];
        b.round('copper',pos,horizontal?[l.w,l.h,l.pitch]:[l.pitch,l.h,l.w],{bevel:.013});
      }
      if(k>0) {
        const lower=levels[k-1];
        const viaHeight=l.y-lower.y-(l.h+lower.h)/2;
        for(let j=0;j<Math.floor((end-begin)/lower.pitch);j++) {
          if(rand()<.65)continue;
          const along=begin+j*lower.pitch+.24;
          const p=horizontal?[along,lower.y+lower.h/2+viaHeight/2,v]:[v,lower.y+lower.h/2+viaHeight/2,along];
          b.cylinder('copper',p,[lower.w*.8,viaHeight+.02,lower.w*.8]);
          // Via liner is a separate, slightly wider annular landing.
          b.cylinder('gate',[p[0],lower.y+lower.h/2+.012,p[2]],[lower.w*1.12,.03,lower.w*1.12]);
        }
      }
    }
  });
  // Exposed cross-section of insulating stack, with thin barrier films.
  for(let k=0;k<6;k++) {
    const y=levels[k].y;
    b.box('dielectric',[9.8,y-.2,-1],[2.2,.3,19.2]);
    b.box('oxide',[9.8,y-.034,-1],[2.21,.025,19.21]);
  }
  return b;
}

function transistor(b,ox,oz,detail=false) {
  // Three fins share a wraparound gate. Diffusion is faceted; contacts rise
  // to the first wiring level. Detail is deliberately enlarged for the cutaway.
  const start=b.parts.length;
  b.round('dielectric',[ox,-.22,oz],[2.10,.25,2.5],{bevel:.035});
  b.round('silicon',[ox,-.071,oz],[1.8,.06,2.32],{bevel:.025});
  for(const fx of [-.48,0,.48]) {
    if(detail&&fx===0) {
      // A genuine inspection window in the same fin. The crystal is nested
      // here from the start; no replacement plane or scene crossfade.
      b.round('silicon',[ox,.23,oz],[.115,.57,2.1],{bevel:.012});
      for(const side of [-1,1])b.box('silicon',[ox+side*.04075,.535,oz],[.0335,.04,2.1]);
      b.box('silicon',[ox,.535,oz-.402],[.048,.04,1.296]);
      b.box('silicon',[ox,.535,oz+.672],[.048,.04,.756]);
    } else b.round('silicon',[ox+fx,.25,oz],[.115,.61,2.1],{bevel:.02});
    for(const sign of [-1,1]) {
      // Faceted epitaxial source/drain with a crystalline diamond section.
      b.add('crystal','doped',[ox+fx,.27,oz+sign*.66],[.31,.54,.73]);
      b.round('gate',[ox+fx,.579,oz+sign*.68],[.175,.095,.35],{bevel:.012,group:detail&&sign===1?'contact-section':undefined});
      b.round('gate',[ox+fx,.91,oz+sign*.68],[.12,.59,.21],{bevel:.014,group:detail&&sign===1?'contact-section':undefined});
    }
    // Oxide liner around each fin, visible just outside the metal gate.
    for(const side of [-1,1])b.round('oxide',[ox+fx+side*.074,.267,oz],[.025,.645,.42],{bevel:.005});
    b.round('oxide',[ox+fx,.582,oz],[.175,.028,.42],{bevel:.005});
  }
  // A metal gate forms a continuous bar over and between the fins.
  b.round('gate',[ox,.636,oz],[1.49,.135,.31],{bevel:.024,group:detail?'gate-section':undefined});
  for(const x of [-.715,-.24,.24,.715])b.round('gate',[ox+x,.295,oz],[.17,.58,.31],{bevel:.018,group:detail?'gate-section':undefined});
  for(const sign of [-1,1]) {
    b.round('oxide',[ox,.309,oz+sign*.217],[1.58,.70,.09],{bevel:.017,group:detail&&sign===1?'contact-section':undefined});
    b.round('copper',[ox,1.248,oz+sign*.68],[1.54,.19,.3],{bevel:.024,group:detail&&sign===1?'contact-section':undefined});
  }
  b.round('gate',[ox+.708,.904,oz],[.16,.43,.18],{bevel:.015});
  b.round('copper',[ox+.708,1.39,oz],[.21,.19,2.13],{bevel:.02});
  for(let i=start;i<b.parts.length;i++)b.parts[i].group??=detail?'transistor-focus':'transistor-field';
}

export function makeTransistors() {
  const b=builder('transistors');
  b.round('silicon',[0,-.54,0],[23,.44,25],{bevel:.045});
  for(let row=-4;row<=4;row++)for(let col=-4;col<=4;col++)transistor(b,col*2.5,row*2.85,col===0&&row===0);
  return b;
}

// Diamond-cubic silicon: conventional cell a ≈ 0.543 nm. Coordinates use
// quarter-cell integers, making nearest-neighbour connectivity exact.
export function makeCrystal() {
  const b=builder('silicon-crystal');
  const basis=[[0,0,0],[0,2,2],[2,0,2],[2,2,0],[1,1,1],[1,3,3],[3,1,3],[3,3,1]];
  const atoms=new Map(),selected='0,-2,2';
  for(let x=-4;x<=4;x++)for(let y=-6;y<=0;y++)for(let z=-4;z<=4;z++)for(const v of basis) {
    const q=[x*4+v[0],y*4+v[1],z*4+v[2]];
    if(q[0]>16||q[1]>0||q[2]>16)continue;
    const key=q.join(',');atoms.set(key,q);
    b.sphere(key===selected?'selectedAtom':Math.hypot(q[0],q[1]+2,q[2]-2)<6?'detailAtom':'atom',q.map(v=>v/4),[.22,.22,.22],{name:key===selected?'Selected silicon atom':'Silicon atom'});
  }
  for(const [key,a] of atoms)for(const dx of [-1,1])for(const dy of [-1,1])for(const dz of [-1,1]) {
    const next=[a[0]+dx,a[1]+dy,a[2]+dz],other=next.join(',');
    if(!atoms.has(other)||key>=other)continue;
    const length=Math.sqrt(3)/4;
    b.cylinder(key===selected||other===selected?'selectedBond':'bond',a.map((v,k)=>(v+next[k])/8),[.036,length,.036],{
      r:[Math.atan2(dz,dy),0,-Math.asin(dx/Math.sqrt(3))],name:'Covalent bond (model)',
    });
  }
  return b;
}

export function createSceneData() {
  return [makePackage(),makeDie(),makeLogic(),makeWiring(),makeTransistors(),makeCrystal()].map(({name,parts})=>({name,parts}));
}

/** Continuous camera paths; same functions also drive offline asset renders. */
export function cameraAt(stage, t, aspect=1.6) {
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t*t*(3-2*t);
  const mobile=aspect<.9;
  const paths=[
    {a:[12.8,16.6,16.2],b:[6.6,11.8,8.8],ta:[0,.05,0],tb:[0,.30,0],fov:34},
    {a:[8.4,18.5,10.7],b:[-1.1,3.7,2.6],ta:[0,.1,0],tb:[-1.65,.12,-.50],fov:35},
    {a:[8.1,13.7,10.8],b:[1.0,2.05,2.7],ta:[0,0,0],tb:[.45,.17,.18],fov:37},
    {a:[13.6,12.0,17.5],b:[1.6,3.5,5.4],ta:[0,1.6,0],tb:[-.18,.65,1.2],fov:39},
    {a:[7.2,8.3,10.6],b:[2.65,2.01,3.4],ta:[0,.3,0],tb:[0,.48,0],fov:36},
  ];
  const p=paths[stage];
  const target=p.ta.map((v,i)=>mix(v,p.tb[i],smooth));
  const position=p.a.map((v,i)=>mix(v,p.b[i],smooth));
  // A wider view preserves the whole package on phones. Off-axis framing
  // places the subject above the copy rather than cropping a desktop canvas.
  if(mobile)for(let i=0;i<3;i++)position[i]=target[i]+(position[i]-target[i])*Math.max(1.25,.99/aspect);
  return {position,target,fov:p.fov,shiftX:mobile?0:.16,shiftY:mobile?.16:0};
}
