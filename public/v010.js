// v0.10 visual override: red vial más limpia, referencias "hacia ..." y nombres de calles editables.
const ROAD_FILL_V10 = '#dfe5ea';
const ROAD_VERGE_V10 = '#f6f3ed';
const ROAD_EDGE_V10 = '#bcc6ce';
const ROAD_TEXT_V10 = '#455a6b';

function addRoadLabelV10(text,x,y,angle=0,anchor='start'){
  const g=addLabel(x,y,text||'Calle');
  g.classList.add('road-label');
  g.dataset.angle=angle;
  g.setAttribute('transform',`translate(${x} ${y}) rotate(${angle})`);
  const t=g.querySelector('text');
  if(t){
    t.classList.add('road-name');
    t.setAttribute('font-size','16');
    t.setAttribute('font-weight','700');
    t.setAttribute('fill',ROAD_TEXT_V10);
    t.setAttribute('text-anchor',anchor);
  }
  return g;
}

function roadRectV10(x,y,w,h,name,orient='h',showLabel=true){
  const g=el('g',{class:'static-road road-surface'}),pad=14;
  g.appendChild(el('rect',{x:x-pad,y:y-pad,width:w+pad*2,height:h+pad*2,rx:10,fill:ROAD_VERGE_V10}));
  g.appendChild(el('rect',{x,y,width:w,height:h,rx:5,fill:ROAD_FILL_V10}));
  if(orient==='h'){
    g.appendChild(el('line',{x1:x,y1:y+7,x2:x+w,y2:y+7,stroke:ROAD_EDGE_V10,'stroke-width':1.5}));
    g.appendChild(el('line',{x1:x,y1:y+h-7,x2:x+w,y2:y+h-7,stroke:ROAD_EDGE_V10,'stroke-width':1.5}));
    g.appendChild(el('line',{x1:x+16,y1:y+h/2,x2:x+w-16,y2:y+h/2,stroke:'#fff','stroke-width':3,'stroke-dasharray':'16 12','stroke-linecap':'round'}));
    svg.appendChild(g);
    if(showLabel) addRoadLabelV10(name||'Calle',x+16,y+25,0,'start');
  }else{
    g.appendChild(el('line',{x1:x+7,y1:y,x2:x+7,y2:y+h,stroke:ROAD_EDGE_V10,'stroke-width':1.5}));
    g.appendChild(el('line',{x1:x+w-7,y1:y,x2:x+w-7,y2:y+h,stroke:ROAD_EDGE_V10,'stroke-width':1.5}));
    g.appendChild(el('line',{x1:x+w/2,y1:y+16,x2:x+w/2,y2:y+h-16,stroke:'#fff','stroke-width':3,'stroke-dasharray':'16 12','stroke-linecap':'round'}));
    svg.appendChild(g);
    if(showLabel) addRoadLabelV10(name||'Calle',x+w+10,y+22,0,'start');
  }
  return g;
}

function diagonalRoadV10(cx,cy,length,width,name,angle=-32,showLabel=true){
  const x=cx-length/2,y=cy-width/2,pad=14;
  const g=el('g',{class:'static-road road-surface',transform:`rotate(${angle} ${cx} ${cy})`});
  g.appendChild(el('rect',{x:x-pad,y:y-pad,width:length+pad*2,height:width+pad*2,rx:10,fill:ROAD_VERGE_V10}));
  g.appendChild(el('rect',{x,y,width:length,height:width,rx:5,fill:ROAD_FILL_V10}));
  g.appendChild(el('line',{x1:x,y1:y+7,x2:x+length,y2:y+7,stroke:ROAD_EDGE_V10,'stroke-width':1.5}));
  g.appendChild(el('line',{x1:x,y1:y+width-7,x2:x+length,y2:y+width-7,stroke:ROAD_EDGE_V10,'stroke-width':1.5}));
  g.appendChild(el('line',{x1:x+18,y1:cy,x2:x+length-18,y2:cy,stroke:'#fff','stroke-width':3,'stroke-dasharray':'16 12','stroke-linecap':'round'}));
  svg.appendChild(g);
  if(showLabel){
    const rad=angle*Math.PI/180;
    const lx=cx-Math.cos(rad)*(length*.42)+Math.sin(rad)*(width*.18);
    const ly=cy-Math.sin(rad)*(length*.42)-Math.cos(rad)*(width*.18);
    addRoadLabelV10(name||'Diagonal',lx,ly,angle,'start');
  }
  return g;
}

function junctionPlateV10(x,y,w,h){
  const g=el('g',{class:'static-road junction-plate'});
  g.appendChild(el('rect',{x,y,width:w,height:h,fill:ROAD_FILL_V10}));
  svg.appendChild(g);
}

function drawRailCrossingV10(){
  const g=el('g',{class:'static-road'}),x=430;
  g.appendChild(el('line',{x1:x-11,y1:0,x2:x-11,y2:SVG_H,stroke:'#555','stroke-width':3}));
  g.appendChild(el('line',{x1:x+11,y1:0,x2:x+11,y2:SVG_H,stroke:'#555','stroke-width':3}));
  for(let y=8;y<SVG_H;y+=18) g.appendChild(el('line',{x1:x-20,y1:y,x2:x+20,y2:y,stroke:'#8a6a48','stroke-width':3}));
  svg.appendChild(g);
  addRoadLabelV10('Vías',x+30,36,0,'start');
}

function drawRoundaboutV10(streets){
  const cx=430,cy=280,r=82,roadW=105;
  roadRectV10(0,cy-roadW/2,cx-r,roadW,textOr(streets[0]?.nombre,'Acceso'),'h',true);
  roadRectV10(cx+r,cy-roadW/2,DRAW_W-(cx+r),roadW,textOr(streets[0]?.nombre,'Acceso'),'h',false);
  roadRectV10(cx-roadW/2,0,roadW,cy-r,textOr(streets[1]?.nombre,'Acceso'),'v',true);
  roadRectV10(cx-roadW/2,cy+r,roadW,SVG_H-(cy+r),textOr(streets[1]?.nombre,'Acceso'),'v',false);
  const g=el('g',{class:'static-road'});
  g.appendChild(el('circle',{cx,cy,r:r+roadW/2+14,fill:ROAD_VERGE_V10}));
  g.appendChild(el('circle',{cx,cy,r:r+roadW/2,fill:ROAD_FILL_V10}));
  g.appendChild(el('circle',{cx,cy,r:r-roadW/2+10,fill:'#fbfaf7',stroke:ROAD_EDGE_V10,'stroke-width':1.6}));
  g.appendChild(el('circle',{cx,cy,r:r,fill:'none',stroke:'#fff','stroke-width':3,'stroke-dasharray':'16 12'}));
  svg.appendChild(g);
}

function drawScenario(c){
  const streets=c.calles||[],sc=c.escenario||'indeterminado';
  if(sc==='rotonda'){drawRoundaboutV10(streets);return;}
  if(sc==='cruce_vias'){
    roadRectV10(0,220,DRAW_W,125,textOr(streets[0]?.nombre,'Calle'),'h');
    drawRailCrossingV10();
    return;
  }
  if(sc==='cruce_t'){
    roadRectV10(0,220,DRAW_W,125,textOr(streets[0]?.nombre,'Calle 1'),'h');
    roadRectV10(370,0,125,282,textOr(streets[1]?.nombre,'Calle 2'),'v');
    junctionPlateV10(370,220,125,62);
    return;
  }
  if(sc==='diagonal'){
    roadRectV10(0,220,DRAW_W,125,textOr(streets[0]?.nombre,'Calle 1'),'h');
    diagonalRoadV10(430,280,980,118,textOr(streets[1]?.nombre,'Calle 2'),-35);
    return;
  }
  if(sc==='cruce_multiple'){
    roadRectV10(0,220,DRAW_W,125,textOr(streets[0]?.nombre,'Calle 1'),'h');
    roadRectV10(370,0,125,SVG_H,textOr(streets[1]?.nombre,'Calle 2'),'v');
    junctionPlateV10(370,220,125,125);
    if(streets[2]) diagonalRoadV10(430,280,980,104,textOr(streets[2]?.nombre,'Calle 3'),32);
    return;
  }
  if(sc==='interseccion'||streets.length>=2){
    roadRectV10(0,220,DRAW_W,125,textOr(streets[0]?.nombre,'Calle 1'),'h');
    if(streets[1]?.orientacion==='diagonal') diagonalRoadV10(430,280,980,118,textOr(streets[1]?.nombre,'Calle 2'),-35);
    else {
      roadRectV10(370,0,125,SVG_H,textOr(streets[1]?.nombre,'Calle 2'),'v');
      junctionPlateV10(370,220,125,125);
    }
    if(streets[2]) diagonalRoadV10(430,280,980,96,textOr(streets[2]?.nombre,'Calle 3'),32);
    return;
  }
  roadRectV10(0,215,DRAW_W,130,textOr(streets[0]?.nombre,sc==='ruta'?'Ruta':'Calle'),'h');
}

function vehicleArrow(x,y,ang){
  const rad=ang*Math.PI/180,back=182,len=46;
  const sx=x-Math.cos(rad)*back,sy=y-Math.sin(rad)*back;
  arrow(sx,sy,sx+Math.cos(rad)*len,sy+Math.sin(rad)*len);
  const g=svg.lastElementChild;
  if(g){const line=g.querySelector('line');if(line)line.setAttribute('stroke-width','3');}
}

function referenceLabel(ref){
  let x=(Number(ref.x)/100)*DRAW_W,y=(Number(ref.y)/100)*SVG_H;
  if(!Number.isFinite(x)||!Number.isFinite(y)){x=740;y=35;}
  if(ref.borde==='derecho') x=Math.min(DRAW_W-18,Math.max(x,DRAW_W-145));
  if(ref.borde==='izquierdo') x=Math.max(18,Math.min(x,145));
  if(ref.borde==='superior') y=Math.max(24,Math.min(y,55));
  if(ref.borde==='inferior') y=Math.min(SVG_H-18,Math.max(y,SVG_H-55));
  let labelText=(ref.texto||'Referencia').trim();
  if((ref.tipo||'')==='sentido'){
    labelText=labelText.replace(/^[-–—>→\s]+/,'').trim();
    if(labelText&&!/^hacia\b/i.test(labelText)) labelText=`hacia ${labelText}`;
  }
  const g=addLabel(x,y,labelText||'Referencia');
  g.dataset.referenceType=ref.tipo||'sentido';
  const t=g.querySelector('text');
  if(t){
    t.setAttribute('font-size',ref.tipo==='direccion'?'13':'14');
    t.setAttribute('font-weight',ref.tipo==='direccion'?'600':'700');
    t.setAttribute('fill',ref.tipo==='direccion'?'#60788b':'#0a6fa8');
    if(ref.borde==='derecho') t.setAttribute('text-anchor','end');
    else if(ref.borde==='izquierdo') t.setAttribute('text-anchor','start');
    else t.setAttribute('text-anchor','middle');
  }
}

function renderTrajectory(g){
  const pts=JSON.parse(g.dataset.points||'[]');g.innerHTML='';if(pts.length<2)return;
  g.appendChild(el('polyline',{points:pts.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:'#146aa1','stroke-width':2.6,'stroke-dasharray':'7 5','stroke-linecap':'round','stroke-linejoin':'round','marker-end':'url(#arrowHead)',opacity:.9}));
  pts.forEach((p,i)=>g.appendChild(el('circle',{cx:p.x,cy:p.y,r:4.5,class:'trajectory-handle','data-index':i,fill:'#fff',stroke:'#146aa1','stroke-width':2,cursor:'move'})));
}
