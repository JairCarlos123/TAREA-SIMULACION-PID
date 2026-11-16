'use strict';
const $ = (id) => document.getElementById(id);
const icons = {
  sliders:'M4 7h16M4 17h16M8 4v6M16 14v6',
  chart:'M4 4v16h16M8 15l4-5 4 2 4-7',
  function:'M6 18h2l4-12h6M9 12h7',
  book:'M12 6v14M3 5c4-1 6-1 9 1 3-2 5-2 9-1v14c-4-1-6-1-9 1-3-2-5-2-9-1z',
  help:'M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  layers:'m12 3 10 5-10 5L2 8zm-9 10 9 5 9-5M3 18l9 5 9-5',
  target:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  drop:'M12 2S4 10 4 15a8 8 0 0 0 16 0c0-5-8-13-8-13M8 15c0 2 1 3 3 3',
  restart:'M4 9a8 8 0 1 1 0 7M4 3v6h6',
  play:'m9 5 11 7-11 7z', pause:'M8 5v14M16 5v14',
  chevron:'m6 9 6 6 6-6', arrow:'M4 12h16m-6-6 6 6-6 6',
  info:'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  loader:'M21 12a9 9 0 1 1-9-9',
  moon:'M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10z',
  sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.info}"/></svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
function setTheme(theme) {
  const dark=theme==='dark';
  document.documentElement.dataset.theme=dark?'dark':'light';
  const label=dark?'Activar modo día':'Activar modo noche';
  $('theme-toggle').innerHTML=icon(dark?'sun':'moon');
  $('theme-toggle').setAttribute('aria-label',label);
  $('theme-toggle').setAttribute('title',label);
  $('theme-toggle').setAttribute('aria-pressed',String(dark));
  try { localStorage.setItem('celda-lab-theme',dark?'dark':'light'); } catch { /* Almacenamiento opcional. */ }
}
let savedTheme;
try { savedTheme=localStorage.getItem('celda-lab-theme'); } catch { /* Usar la preferencia del sistema. */ }
setTheme(savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
$('theme-toggle').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
const colors = ['#128b7c', '#568bd0', '#d4a34d'];
const state = { result:null, strategy:1, time:0, playing:false, chart:'nivel', visible:[true,true,true], last:0, renderLast:0, busy:false, chartRange:null };
const fmt = (x, n=2) => Number(x).toLocaleString('es-PE', {minimumFractionDigits:n, maximumFractionDigits:n});
const clock = (t) => `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
let toastTimer;
function toast(text) { $('toast').textContent=text; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,3500); }
function page(name) {
  if (!['simulacion','comparacion','modelo','guia'].includes(name)) name='simulacion';
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${name}`));
  document.querySelectorAll('[data-page]').forEach(el=>{el.classList.toggle('active',el.dataset.page===name);el.setAttribute('aria-current',el.dataset.page===name?'page':'false');});
  $('breadcrumb').textContent = {simulacion:'Simulación',comparacion:'Comparación',modelo:'Modelo matemático',guia:'Guía rápida'}[name];
  history.replaceState(null,'',`#${name}`);
  window.scrollTo({top:0,behavior:'instant'});
  if(name==='simulacion' && state.result) drawChart();
}
document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>page(el.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(el=>el.addEventListener('click',()=>{page(el.dataset.goto);window.scrollTo({top:0,behavior:'smooth'});}));
$('help-button').addEventListener('click',()=>page('guia'));
window.addEventListener('hashchange',()=>page(location.hash.slice(1)));
page(location.hash.slice(1));

function readSettings() {
  return { consignas:[1,2,3].map(i=>Number($(`sp${i}`).value)),
    kff:[1,2,3].map(i=>Number($(`ff${i}`).value)),
    cambio_sp:Number($('sp-time').value), caudal_base:Number($('base-flow').value),
    perturbacion:$('disturbance').value, amplitud:Number($('amplitude').value),
    inicio:Number($('dist-time').value), ancho:Number($('dist-width').value),
    tau_c:Number($('tau').value), duracion:Number($('duration').value) };
}
function updateSettingsLabels() {
  const a=Number($('amplitude').value);
  $('amplitude-output').textContent=`${a>=0?'+':''}${a} L/min`;
  $('tau-output').textContent=`${$('tau').value} s`;
  $('disturbance-fields').hidden=$('disturbance').value==='ninguna';
  $('width-label').hidden=$('disturbance').value!=='pulso';
  const max=Number($('duration').value)-1;
  $('sp-time').max=max; $('dist-time').max=max;
  // Los parámetros ocultos no deben impedir enviar otro tipo de perturbación.
  $('dist-width').disabled=$('disturbance').value!=='pulso';
  $('dist-time').disabled=$('disturbance').value==='ninguna';
  $('pending').hidden=false;
}
function applyPreset(name) {
  const preset={disturbance:{sp:[30,30,30],type:'pulso',amp:10,tau:8},setpoint:{sp:[29,32,31],type:'ninguna',amp:10,tau:8},combined:{sp:[29,32,31],type:'pulso',amp:15,tau:12}}[name];
  [1,2,3].forEach((i)=>{$(`sp${i}`).value=preset.sp[i-1];$(`ff${i}`).value=1;});
  $('disturbance').value=preset.type; $('amplitude').value=preset.amp; $('tau').value=preset.tau;
  $('sp-time').value=60; $('dist-time').value=120; $('dist-width').value=300; $('base-flow').value=45; $('duration').value=900;
  updateSettingsLabels();
}
$('settings').addEventListener('input',updateSettingsLabels);
$('settings').addEventListener('change',updateSettingsLabels);
$('preset').addEventListener('change',()=>applyPreset($('preset').value));
$('reset').addEventListener('click',()=>{$('settings').reset();applyPreset('disturbance');toast('Valores restablecidos. Pulsa Calcular ensayo para aplicarlos.');});
$('settings').addEventListener('submit',(e)=>{e.preventDefault();run();});

async function run(initial=false) {
  if(state.busy || !$('settings').reportValidity()) return;
  state.busy=true;setPlaying(false);$('run').disabled=true;$('run').classList.add('loading');$('run').innerHTML=`${icon('loader')}<span>Calculando en Python…</span>`;$('message').hidden=true;
  const submitted=readSettings();
  try {
    const response=await fetch('/api/simular',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submitted)});
    const data=await response.json();
    if(!response.ok) throw new Error([data.error,data.ayuda].filter(Boolean).join(' '));
    state.result=data;state.time=0;setPlaying(false);
    $('connection').textContent='Python conectado';$('timeline').max=data.escenario.duracion;
    $('time-total').textContent=clock(data.escenario.duracion);$('timeline-end').textContent=`${data.escenario.duracion} s`;
    $('pending').hidden=JSON.stringify(submitted)===JSON.stringify(readSettings());drawChart();renderFrame();renderComparison();renderTuning();
    if(!initial) toast('Ensayo calculado. Las dos estrategias están listas para comparar.');
  } catch(error) {
    $('message').textContent=location.protocol==='file:'?'Para ejecutar los cálculos, abre INICIAR_SIMULACION.bat desde la carpeta principal. Después usa http://127.0.0.1:8765 en el navegador. Abrir index.html directamente no inicia Python.':error instanceof TypeError?(['127.0.0.1','localhost'].includes(location.hostname)?'No se pudo conectar con Python. Comprueba que la ventana del servidor siga abierta.':'El servidor de simulación no respondió. Intenta calcular el ensayo de nuevo en unos instantes.'):error.message;
    if(state.result)$('message').textContent+=' Se conserva el último ensayo calculado.';
    $('message').hidden=false;
    if(!state.result) $('connection').textContent='Sin conexión';
  } finally {
    state.busy=false;$('run').disabled=false;$('run').classList.remove('loading');$('run').innerHTML=`${icon('play')}<span>Calcular ensayo</span>`;
  }
}
function strategyResult(){return state.result?.estrategias[state.strategy];}
function sampleAt(time=state.time) {
  const rows=strategyResult().datos;
  const left=Math.min(Math.floor(time),rows.length-1), right=Math.min(left+1,rows.length-1);
  const f=Math.max(0,Math.min(1,time-left)), a=rows[left], b=rows[right];
  const lerp=(x,y)=>x+(y-x)*f;
  // Interpolación exclusivamente visual de los estados. Mandos y consignas se retienen.
  return { ...a, t_s:time, niveles_cm:a.niveles_cm.map((h,i)=>lerp(h,b.niveles_cm[i])),
    deposito_l:lerp(a.deposito_l,b.deposito_l), iae_cm_s:a.iae_cm_s.map((v,i)=>lerp(v,b.iae_cm_s[i])) };
}
function setPlaying(value) {
  if(value && !state.result) return;
  state.playing=value;state.last=0;
  $('play').innerHTML=icon(value?'pause':'play');$('play').setAttribute('aria-label',value?'Pausar reproducción':'Reproducir simulación');
  if(state.result) $('plant-status').innerHTML=`<span class="status-dot"></span>${value?'Reproduciendo':state.time>=state.result.escenario.duracion?'Finalizado':state.time>0?'En pausa':'Preparado'}`;
}
$('play').addEventListener('click',()=>{if(!state.result)return;if(state.time>=state.result.escenario.duracion)state.time=0;setPlaying(!state.playing);renderFrame();});
$('restart').addEventListener('click',()=>{state.time=0;setPlaying(false);if(state.result)renderFrame();});
$('timeline').addEventListener('input',()=>{state.time=Number($('timeline').value);setPlaying(false);if(state.result)renderFrame();});
document.querySelectorAll('[data-strategy]').forEach(el=>el.addEventListener('click',()=>{
  state.strategy=Number(el.dataset.strategy);
  document.querySelectorAll('[data-strategy]').forEach(b=>b.classList.toggle('active',b===el));
  if(state.result){drawChart();renderFrame();}
}));
function animate(now) {
  if(state.playing && state.result) {
    if(state.last)state.time=Math.min(state.time+Math.min((now-state.last)/1000,.2)*Number($('speed').value),state.result.escenario.duracion);
    state.last=now;
    if(now-state.renderLast>=40){renderFrame();state.renderLast=now;}
    if(state.time>=state.result.escenario.duracion){setPlaying(false);renderFrame();}
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function renderFrame() {
  const d=sampleAt(), c=state.result.configuracion;
  $('timeline').value=state.time;$('time-current').textContent=clock(state.time);
  $('kpi-strategy').textContent=state.strategy?'PI + Feedforward':'Solo PI';
  $('kpi-iae').textContent=fmt(d.iae_cm_s.reduce((a,b)=>a+b,0));
  const volume=d.deposito_l+d.niveles_cm.reduce((a,b)=>a+b,0)*c.area_cm2/1000;
  $('kpi-volume').textContent=fmt(volume);
  $('cell-readings').innerHTML=d.niveles_cm.map((h,i)=>`<div class="cell-reading"><div class="cell-reading-header"><span>CELDA ${i+1}</span><span class="reading-indicator" style="background:${Math.abs(h-d.consignas_cm[i])<.25?'#289785':'#d7a658'}"></span></div><strong>${fmt(h)} <small>cm</small></strong><div class="cell-reading-footer">Consigna <b>${fmt(d.consignas_cm[i],1)} cm</b><span> · </span>Error <b>${fmt(h-d.consignas_cm[i])}</b></div></div>`).join('');
  $('plant').innerHTML=plantSvg(d,c);
  $('balance-label').textContent=`Depósito ${fmt(d.deposito_l,1)} L · celdas ${fmt(volume-d.deposito_l,1)} L`;
  const range=state.chartRange;
  if(range) {
    const x=range.left+(state.time-range.xmin)/(range.xmax-range.xmin)*range.width;
    const cursor=$('chart').querySelector('.play-cursor');
    if(cursor){cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);cursor.style.display=state.time<range.xmin||state.time>range.xmax?'none':'';}
  }
}
function pump(x,y,label,q) {
  const angle=state.playing?state.time*30:0;
  return `<g><circle cx="${x}" cy="${y}" r="12" fill="#fff" stroke="#a6bdb7" stroke-width="1.4"/><path d="m${x-4} ${y-6} 9 6-9 6z" fill="#83b3a7" transform="rotate(${angle} ${x} ${y})"/><text x="${x}" y="${y+26}" text-anchor="middle" fill="#8ca39e" font-size="9">${label}</text><text x="${x}" y="${y-21}" text-anchor="middle" fill="#528d82" font-size="10" font-weight="500">${fmt(q,1)} L/min</text></g>`;
}
function plantSvg(d,c) {
  const y=68,height=164,width=134, xs=[132,367,602], bottom=y+height;
  return `<svg viewBox="0 0 860 332" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9ad6c7" stop-opacity=".8"/><stop offset="1" stop-color="#b9e0d6" stop-opacity=".65"/></linearGradient><pattern id="plantgrid" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".5" fill="#d9e6e0"/></pattern><marker id="arr" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="m0 0 5 3-5 3" fill="none" stroke="#79a99c" stroke-width="1"/></marker>${xs.map((x,i)=>`<clipPath id="tank${i}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10"/></clipPath>`).join('')}</defs>
  <rect x="8" y="26" width="844" height="275" fill="url(#plantgrid)" opacity=".6"/>
  <g fill="none" stroke="#b4cdc4" stroke-width="2"><path d="M74 140H130" marker-end="url(#arr)"/><path d="M266 207H299V123H365" marker-end="url(#arr)"/><path d="M501 207H534V123H600" marker-end="url(#arr)"/><path d="M736 207H790V283H48V197" marker-end="url(#arr)"/></g>
  <path d="M790 245v16M490 283h-25M225 283h-25" stroke="#7fac9d" stroke-width="1.5" marker-end="url(#arr)"/>
  <rect x="21" y="120" width="54" height="77" rx="7" fill="#fff" stroke="#b6cbc4" stroke-width="1.5"/><rect x="25" y="${193-64*d.deposito_l/130}" width="46" height="${64*d.deposito_l/130}" rx="3" fill="#d2e9df"/>
  <text x="48" y="106" fill="#7b9891" text-anchor="middle" font-size="10" font-weight="600">T-1</text><text x="48" y="214" fill="#8ca39b" text-anchor="middle" font-size="8">DEPÓSITO</text>
  ${pump(103,140,'P4',d.alimentacion_lpm)}
  ${xs.map((x,i)=>{
    const liquidY=bottom-height*d.niveles_cm[i]/45,spY=bottom-height*d.consignas_cm[i]/45;
    return `<text x="${x+width/2}" y="44" text-anchor="middle" font-size="13" fill="#527a73" font-weight="550">Celda ${i+1}</text><text x="${x+width/2}" y="58" text-anchor="middle" font-size="8" fill="#a0b4ae">C-${i+1} / LI-${i+1}</text>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="#fafffc" stroke="#aac7bd" stroke-width="1.7"/>
      <g clip-path="url(#tank${i})"><rect x="${x}" y="${liquidY}" width="${width}" height="${bottom-liquidY}" fill="url(#water)"/><line x1="${x}" x2="${x+width}" y1="${liquidY}" y2="${liquidY}" stroke="#57ac98" stroke-width="2"/></g>
      <line x1="${x-5}" x2="${x+width+5}" y1="${spY}" y2="${spY}" stroke="#c99a66" stroke-width="1.1" stroke-dasharray="4 4"/>
      ${[0,15,30,45].map(v=>`<line x1="${x+width+8}" x2="${x+width+12}" y1="${bottom-v/45*height}" y2="${bottom-v/45*height}" stroke="#c2d3cd"/><text x="${x+width+17}" y="${bottom-v/45*height+3}" font-size="8" fill="#a6b9b1">${v}</text>`).join('')}
      <text x="${x+width/2}" y="${bottom-35}" fill="#518f80" text-anchor="middle" font-size="21" font-weight="350">${fmt(d.niveles_cm[i],1)}<tspan font-size="10" dx="4">cm</tspan></text>`;
  }).join('')}
  ${pump(299,207,'P1',d.salidas_lpm[0])}${pump(534,207,'P2',d.salidas_lpm[1])}${pump(790,207,'P3',d.salidas_lpm[2])}
  <rect x="334" y="272" width="189" height="20" rx="10" fill="#f8fcf9"/><text x="428" y="285" fill="#91aaa0" text-anchor="middle" font-size="8" letter-spacing="1">RETORNO AL DEPÓSITO · CIRCUITO CERRADO</text>
  <text x="430" y="316" text-anchor="middle" font-size="8" fill="#a3b5af">P1, P2 y P3 regulan la salida de cada celda · P4 alimenta el banco</text></svg>`;
}

document.querySelectorAll('[data-chart]').forEach(el=>el.addEventListener('click',()=>{
  state.chart=el.dataset.chart;document.querySelectorAll('[data-chart]').forEach(b=>b.classList.toggle('active',b===el));if(state.result)drawChart();
}));
$('chart-window').addEventListener('change',()=>{if(state.result)drawChart();});
function drawChart() {
  if(!state.result)return;
  const rows=strategyResult().datos,total=state.result.escenario.duracion;
  const win=$('chart-window').value,xmin=win==='last'?Math.max(0,total-300):0,xmax=win==='first'?Math.min(300,total):total;
  const width=800,height=246,left=53,top=26,right=20,bottom=37,pw=width-left-right,ph=height-top-bottom;
  const value=(d,i)=>state.chart==='nivel'?d.niveles_cm[i]:state.chart==='caudal'?d.salidas_lpm[i]:d.niveles_cm[i]-d.consignas_cm[i];
  const shown=rows.filter(d=>d.t_s>=xmin&&d.t_s<=xmax);const values=[];
  shown.forEach(d=>{for(let i=0;i<3;i++)if(state.visible[i]){values.push(value(d,i));if(state.chart==='nivel')values.push(d.consignas_cm[i]);}if(state.chart==='caudal')values.push(d.alimentacion_lpm);});
  let ymin,ymax;
  if(state.chart==='caudal'){ymin=0;ymax=Math.max(60,...values)*1.1;}
  else if(state.chart==='error'){const abs=Math.max(1,...values.map(Math.abs));ymin=-abs*1.15;ymax=abs*1.15;}
  else{ymin=Math.floor((Math.min(29,...values)-.5)*2)/2;ymax=Math.ceil((Math.max(31,...values)+.5)*2)/2;}
  const x=t=>left+(t-xmin)/(xmax-xmin)*pw,y=v=>top+(ymax-v)/(ymax-ymin)*ph;
  state.chartRange={left,top,width:pw,height:ph,xmin,xmax,ymin,ymax};
  const path=(f)=>shown.map((d,j)=>`${j?'L':'M'}${x(d.t_s).toFixed(2)} ${y(f(d)).toFixed(2)}`).join(' ');
  const grid=Array.from({length:5},(_,i)=>{const val=ymin+(ymax-ymin)*i/4,yp=y(val);return `<line x1="${left}" x2="${width-right}" y1="${yp}" y2="${yp}" stroke="#eaf0f1"/><text x="${left-10}" y="${yp+3}" text-anchor="end" fill="#9dadb4" font-size="10">${fmt(val,Math.abs(val)<10?1:0)}</text>`;}).join('');
  const ticks=Array.from({length:7},(_,i)=>{const t=xmin+(xmax-xmin)*i/6;return `<text x="${x(t)}" y="${height-16}" text-anchor="middle" fill="#9dadb4" font-size="10">${Math.round(t)}</text>`;}).join('');
  const events=state.result.eventos.filter(e=>e.t>=xmin&&e.t<=xmax).map(e=>`<line x1="${x(e.t)}" x2="${x(e.t)}" y1="${top}" y2="${top+ph}" stroke="#ccd9d8" stroke-dasharray="3 5"><title>${e.nombre}: ${e.t} s</title></line>`).join('');
  let traces='';
  for(let i=0;i<3;i++)if(state.visible[i]) {
    if(state.chart==='nivel')traces+=`<path d="${path(d=>d.consignas_cm[i])}" fill="none" stroke="${colors[i]}" stroke-width="1" opacity=".45" stroke-dasharray="5 5"/>`;
    traces+=`<path d="${path(d=>value(d,i))}" fill="none" stroke="${colors[i]}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  if(state.chart==='caudal')traces+=`<path d="${path(d=>d.alimentacion_lpm)}" fill="none" stroke="#8f9ba4" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  $('chart-subtitle').textContent={nivel:'Niveles y consignas a lo largo del ensayo',caudal:'Caudales reales de las bombas y alimentación',error:'Desviación de nivel: nivel menos consigna'}[state.chart];
  $('chart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="plotclip"><rect x="${left}" y="${top}" width="${pw}" height="${ph}"/></clipPath></defs><text x="${left}" y="13" fill="#99abb2" font-size="10">${state.chart==='caudal'?'L/min':'cm'}</text>${grid}${ticks}<text x="${width-right}" y="${height-1}" text-anchor="end" fill="#a8b7bc" font-size="9">Tiempo (s)</text><g clip-path="url(#plotclip)">${events}${traces}<line class="play-cursor" y1="${top}" y2="${top+ph}" stroke="#49796d" stroke-width="1" opacity=".5"/><line class="hover-cursor" y1="${top}" y2="${top+ph}" stroke="#92aca3" stroke-width="1" stroke-dasharray="3 3" style="display:none"/></g></svg><div class="chart-tooltip" hidden></div>`;
  $('chart-legend').innerHTML=colors.map((c,i)=>`<button class="${state.visible[i]?'':'muted'}" data-cell="${i}" aria-pressed="${state.visible[i]}"><i style="background:${c}"></i>Celda ${i+1}</button>`).join('')+(state.chart==='caudal'?'<span style="font-size:9px;color:#94a2aa">┄ Alimentación</span>':'');
  $('chart-legend').querySelectorAll('button').forEach(el=>el.addEventListener('click',()=>{state.visible[Number(el.dataset.cell)]=!state.visible[Number(el.dataset.cell)];drawChart();}));
  $('chart').tabIndex=0;$('chart').setAttribute('aria-label','Respuesta temporal. Usa las flechas izquierda y derecha para mover el instante de inspección.');
  renderFrame();
}
$('chart').addEventListener('pointermove',event=>{
  if(!state.result)return;
  const svg=$('chart').querySelector('svg'),bounds=svg.getBoundingClientRect(),r=state.chartRange;
  const local=(event.clientX-bounds.left)/bounds.width*800;
  const tt=$('chart').querySelector('.chart-tooltip'),line=$('chart').querySelector('.hover-cursor');
  if(local<r.left||local>r.left+r.width){tt.hidden=true;line.style.display='none';return;}
  const time=Math.round(r.xmin+(local-r.left)/r.width*(r.xmax-r.xmin));
  const d=strategyResult().datos[time];
  if(!d)return;
  const vals=state.chart==='nivel'?d.niveles_cm:state.chart==='caudal'?d.salidas_lpm:d.niveles_cm.map((v,i)=>v-d.consignas_cm[i]);
  tt.innerHTML=`<b>${clock(time)} · ${time} s</b>${vals.map((v,i)=>state.visible[i]?`<div>Celda ${i+1} &nbsp; ${fmt(v)} ${state.chart==='caudal'?'L/min':'cm'}</div>`:'').join('')}${state.chart==='caudal'?`<div>Alimentación &nbsp; ${fmt(d.alimentacion_lpm,1)}</div>`:''}`;
  tt.hidden=false;
  tt.style.left=`${Math.min(Math.max(8,event.clientX-bounds.left+10),bounds.width-170)}px`;tt.style.top='32px';
  line.style.display='';line.setAttribute('x1',local);line.setAttribute('x2',local);
});
$('chart').addEventListener('pointerleave',()=>{$('chart').querySelector('.chart-tooltip')?.setAttribute('hidden','');const line=$('chart').querySelector('.hover-cursor');if(line)line.style.display='none';});
$('chart').addEventListener('click',event=>{
  if(!state.result)return;const b=$('chart').querySelector('svg').getBoundingClientRect(),r=state.chartRange;
  const t=r.xmin+((event.clientX-b.left)/b.width*800-r.left)/r.width*(r.xmax-r.xmin);
  state.time=Math.max(0,Math.min(state.result.escenario.duracion,t));setPlaying(false);renderFrame();
});
$('chart').addEventListener('keydown',event=>{if(state.result&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();state.time=Math.max(0,Math.min(state.result.escenario.duracion,state.time+(event.key==='ArrowLeft'?-1:1)));setPlaying(false);renderFrame();}});

function renderComparison() {
  const [a,b]=state.result.estrategias,ta=a.iae_cm_s.reduce((x,y)=>x+y,0),tb=b.iae_cm_s.reduce((x,y)=>x+y,0);
  const improvement=ta>1e-8?(ta-tb)/ta*100:0,max=Math.max(1,...a.iae_cm_s,...b.iae_cm_s);
  const diff=i=>a.iae_cm_s[i]>1e-8?`${fmt((a.iae_cm_s[i]-b.iae_cm_s[i])/a.iae_cm_s[i]*100,1)} %`:'—';
  const bars=a.iae_cm_s.map((v,i)=>`<div class="compare-cell"><h3>CELDA ${i+1}</h3><div class="bar-line"><span>Solo PI</span><div class="bar-track"><div class="bar-fill" style="width:${v/max*100}%"></div></div><b>${fmt(v,1)}</b></div><div class="bar-line"><span>PI + FF</span><div class="bar-track"><div class="bar-fill ff" style="width:${b.iae_cm_s[i]/max*100}%"></div></div><b>${fmt(b.iae_cm_s[i],1)}</b></div></div>`).join('');
  $('comparison-content').innerHTML=`<article class="card comparison-summary"><div><div class="eyebrow">ERROR ABSOLUTO INTEGRADO</div><h2>${ta<1e-8?'Ambas estrategias mantienen el equilibrio':improvement>=0?'Menos error acumulado con PI + FF':'Mayor error acumulado con PI + FF'}</h2><p>Resultado del ensayo calculado de ${state.result.escenario.duracion} s · suma de las tres celdas</p></div><div class="improvement">${fmt(Math.abs(improvement),1)}<span style="font-size:25px">%</span><small>${improvement>=0?'reducción del IAE total':'aumento del IAE total'}</small></div></article>
  <div class="comparison-grid"><article class="card comparison-bars"><h2>Error por celda</h2><p>IAE en cm·s · menor es mejor</p>${bars}</article><article class="card comparison-table-card"><h2>Resumen cuantitativo</h2><table class="data-table"><thead><tr><th>Celda</th><th>PI</th><th>PI + FF</th><th>Reducción</th></tr></thead><tbody>${a.iae_cm_s.map((v,i)=>`<tr><td>Celda ${i+1}</td><td>${fmt(v,1)}</td><td>${fmt(b.iae_cm_s[i],1)}</td><td class="good">${diff(i)}</td></tr>`).join('')}<tr><td><strong>Total</strong></td><td><strong>${fmt(ta,1)}</strong></td><td><strong>${fmt(tb,1)}</strong></td><td class="good">${ta>1e-8?fmt(improvement,1)+' %':'—'}</td></tr></tbody></table><p class="comparison-time">Valores de todo el ensayo, independientes del cursor de reproducción.</p></article></div>
  <div class="comparison-cells">${[0,1,2].map(i=>`<article class="card metric-card"><h2>Celda ${i+1} · respuesta y límites</h2><div class="metric-line"><span>Desviación máxima · PI</span><b>${fmt(a.max_desviacion_cm[i])} cm</b></div><div class="metric-line"><span>Desviación máxima · PI + FF</span><b>${fmt(b.max_desviacion_cm[i])} cm</b></div><div class="metric-line"><span>Saturación · PI / PI + FF</span><b>${fmt(a.tiempo_limite_bomba_s[i],1)} / ${fmt(b.tiempo_limite_bomba_s[i],1)} s</b></div></article>`).join('')}</div>
  <article class="card comparison-note"><p><strong>Comparación justa:</strong> ambas estrategias utilizan las mismas consignas, condiciones iniciales, perturbaciones, ganancias PI y límites. Solo cambia la compensación anticipativa. Los IAE se integran en Python con un paso de 0.1 s.</p><p><strong>Conservación de volumen:</strong> error máximo ${Math.max(a.max_error_balance_l,b.max_error_balance_l).toExponential(2)} L. Los resultados corresponden a esta simulación hidráulica; no son los valores experimentales publicados.</p><button class="button secondary" id="back-lab">Volver a la simulación ${icon('arrow')}</button></article>`;
  $('back-lab').addEventListener('click',()=>{page('simulacion');window.scrollTo({top:0,behavior:'smooth'});});
}
function renderTuning() {
  const p=strategyResult().parametros_pi;
  $('tuning-table').innerHTML=`<table class="data-table"><thead><tr><th>Celda</th><th>Kc · (L/min)/cm</th><th>Ti · s</th><th>θ · s</th></tr></thead><tbody>${p.map((v,i)=>`<tr><td>${i+1}</td><td>${fmt(v.kc,3)}</td><td>${fmt(v.ti,0)}</td><td>${state.result.configuracion.retardos_s[i]}</td></tr>`).join('')}</tbody></table><p class="theory-detail" style="margin-top:10px">Parámetros del último ensayo calculado · τc = ${state.result.escenario.tau_c} s.</p>`;
}
function download(content,filename,type) {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('export-json').addEventListener('click',()=>{if(!state.result)return toast('Primero calcula un ensayo.');download(JSON.stringify(state.result,null,2),'celda-lab-ensayo.json','application/json');toast('Ensayo exportado con configuración y ambas estrategias.');});
$('export-csv').addEventListener('click',()=>{
  if(!state.result)return toast('Primero calcula un ensayo.');
  const r=strategyResult(),header=['t_s','h1_cm','h2_cm','h3_cm','sp1_cm','sp2_cm','sp3_cm','mando1_lpm','mando2_lpm','mando3_lpm','q1_lpm','q2_lpm','q3_lpm','alimentacion_lpm','deposito_l','iae1_cm_s','iae2_cm_s','iae3_cm_s'];
  const csv=[header.join(','),...r.datos.map(d=>[d.t_s,...d.niveles_cm,...d.consignas_cm,...d.mandos_lpm,...d.salidas_lpm,d.alimentacion_lpm,d.deposito_l,...d.iae_cm_s].map(x=>Number(x).toFixed(6)).join(','))].join('\r\n');
  download('\ufeff'+csv,`celda-lab-${state.strategy?'pi-ff':'pi'}.csv`,'text/csv;charset=utf-8');toast('CSV exportado a intervalos de 1 s. IAE calculado con paso de 0.1 s.');
});
updateSettingsLabels();$('pending').hidden=true;
run(true);
