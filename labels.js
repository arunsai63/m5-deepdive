const NS='http://www.w3.org/2000/svg';
const intersects=(a,b,pad=0)=>a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class LabelLayer {
  constructor(container) {
    this.container=container;this.items=new Map();
    this.svg=document.createElementNS(NS,'svg');
    this.svg.setAttribute('aria-hidden','true');container.append(this.svg);
  }

  item(annotation) {
    if(this.items.has(annotation.id))return this.items.get(annotation.id);
    const label=document.createElement('div');label.className='object-label';
    const title=document.createElement('strong');title.textContent=annotation.title;
    const detail=document.createElement('span');detail.textContent=annotation.detail;
    label.append(title,detail);this.container.append(label);
    const line=document.createElementNS(NS,'path');line.setAttribute('fill','none');
    const dot=document.createElementNS(NS,'circle');dot.setAttribute('r','3');
    this.svg.append(line,dot);
    const item={label,line,dot};this.items.set(annotation.id,item);return item;
  }

  update(annotations,stage) {
    const width=innerWidth,height=innerHeight,mobile=width<=800;
    this.svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const copy=document.querySelector('.chapter.is-active .chapter-copy')?.getBoundingClientRect();
    const reserved=copy?{x:copy.x-8,y:copy.y-8,w:copy.width+16,h:copy.height+16}:null;
    const reviewControls=[...document.querySelectorAll('.frame-preview-status,.frame-original')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
    const placed=[],visible=new Set();
    const candidates=[...annotations].sort((a,b)=>(Number(b.focus)-Number(a.focus))||(Math.abs(a.stage-stage)-Math.abs(b.stage-stage)));
    for(const a of candidates) {
      if(placed.length>=(mobile?3:5))break;
      const item=this.item(a),w=mobile?150:220,h=mobile?34:78;
      let baseX=a.side==='left'?a.x-w-(a.clearance??42):a.x+(a.clearance??42);
      if(mobile)baseX=a.x<width/2?18:width-w-18;
      let found=null;
      const offsets=mobile?(a.clearance?[-115,-155,65,100]:[-44,30,-88,70,-130]):[-h/2,-h-28,32,-h-90,92,-h-155];
      if(mobile&&a.stage===5)for(let y=104;y<height-h-105;y+=12)offsets.push(y-a.y);
      for(const side of [baseX,a.side==='left'?a.x+(a.clearance??42):a.x-w-(a.clearance??42)]) {
        for(const offset of offsets) {
          const box={x:clamp(side,18,width-w-22),y:clamp(a.y+offset,104,height-h-105),w,h};
          if(reserved&&intersects(box,reserved,12))continue;
          if(reviewControls.some(r=>intersects(box,r,8)))continue;
          if(placed.some(p=>intersects(box,p,10)))continue;
          // Don't cover the projected structure with its own label.
          if(a.x>box.x-8&&a.x<box.x+w+8&&a.y>box.y-8&&a.y<box.y+h+8)continue;
          found=box;break;
        }
        if(found)break;
      }
      if(!found)continue;
      placed.push(found);visible.add(a.id);
      item.label.style.transform=`translate3d(${found.x}px,${found.y}px,0)`;
      item.label.classList.toggle('is-focus',Boolean(a.focus));
      const endX=a.x<found.x?found.x:a.x>found.x+w?found.x+w:clamp(a.x,found.x+8,found.x+w-8);
      const endY=a.y<found.y?found.y:a.y>found.y+h?found.y+h:found.y+h/2;
      const elbowX=endX+(a.x<endX?-12:12);
      item.line.setAttribute('d',`M${a.x.toFixed(2)},${a.y.toFixed(2)} L${elbowX.toFixed(2)},${endY.toFixed(2)} L${endX.toFixed(2)},${endY.toFixed(2)}`);
      item.dot.setAttribute('cx',a.x);item.dot.setAttribute('cy',a.y);
    }
    for(const [id,item] of this.items) {
      const show=visible.has(id);
      item.label.hidden=!show;item.line.style.display=show?'':'none';item.dot.style.display=show?'':'none';
    }
    this.container.dataset.labelCount=String(visible.size);
  }
}
