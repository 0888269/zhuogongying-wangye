import * as THREE from 'three';
import { buildMedal as modelFor } from './medal-model.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// A single GPU context serves cached shelf portraits and the interactive specimen.
let renderer, environment, active = null, unavailable = false;
const portraits = new Map();
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function gpu() {
    if (unavailable) return null;
    if (renderer) return renderer;
    try {
        renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = .88;
        renderer.shadowMap.enabled=true;
        renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        const generator = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
        environment = generator.fromScene(room, .04); room.dispose(); generator.dispose();
        renderer.domElement.addEventListener('webglcontextlost', event => {
            event.preventDefault(); unavailable=true; active?.close();
        });
        return renderer;
    } catch { unavailable=true; return null; }
}
function sceneFor(model) {
    const scene=new THREE.Scene(); scene.environment=environment.texture;scene.environmentIntensity=.65;
    scene.add(new THREE.HemisphereLight(0xfff5e2,0x171b2c,.6));
    for(const [color,intensity,x,y,z] of [[0xfff2d9,2.4,-3,4,5],[0xd6ddff,.85,4,0,3],[0xffffff,.7,-4,-2,1]]) {
        const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);
        if(x===-3){light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-2;light.shadow.camera.right=2;light.shadow.camera.top=2;light.shadow.camera.bottom=-2;light.shadow.bias=-.0003;light.shadow.normalBias=.015;}
        scene.add(light);
    }
    scene.add(model);return scene;
}
function dispose(model){const materials=new Set(),textures=new Set();model.traverse(item=>{item.geometry?.dispose();for(const mat of [item.material].flat().filter(Boolean))materials.add(mat);});for(const mat of materials){for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);mat.dispose();}for(const texture of textures)texture.dispose();}
function disposeScene(scene){scene.traverse(item=>item.shadow?.dispose());}
function camera(aspect=1){const camera=new THREE.PerspectiveCamera(35,aspect,.1,50);camera.position.z=6.1;return camera;}
export function renderPortrait(icon,earned,tone,mark){
    const key=[icon,earned,tone,mark].join('|');if(portraits.has(key))return portraits.get(key);
    const r=gpu();if(!r || active)return null;
    const model=modelFor(icon,earned,tone,mark),scene=sceneFor(model);r.setSize(240,320,false);r.render(scene,camera(.75));
    const url=r.domElement.toDataURL('image/webp',.9);
    // The mount uses the exact model alpha, so its silhouette and occupant align.
    const mask=document.createElement('canvas');mask.width=r.domElement.width;mask.height=r.domElement.height;
    const context=mask.getContext('2d');context.filter='blur(2px)';context.drawImage(r.domElement,0,0);context.filter='none';context.globalCompositeOperation='source-in';context.fillStyle='#fff';context.fillRect(0,0,mask.width,mask.height);
    const portrait={url,mask:mask.toDataURL()};dispose(model);disposeScene(scene);portraits.set(key,portrait);return portrait;
}
export function inspect(options,source,details){
    if(active)return;const r=gpu();if(!r){details();return;}
    const dialog=document.createElement('dialog');dialog.className='cabinet-inspector';dialog.setAttribute('aria-label',options.name);
    const panel=document.createElement('div');panel.className='cabinet-inspector-panel';
    panel.innerHTML='<div class="inspector-top"><span>3D / COLLECTION</span><button type="button" class="inspector-close" aria-label="\u653e\u56de\u5c55\u67dc">\u00d7</button></div><h2></h2><p class="inspector-state"></p><div class="inspector-stage" tabindex="0" role="img" aria-label="\u62d6\u52a8\u6216\u65b9\u5411\u952e\u65cb\u8f6c\uff0cHome \u590d\u4f4d"></div><p class="spin-hint">\u624b\u6307\u62d6\u52a8\u65cb\u8f6c \u00b7 \u67e5\u770b\u6b63\u9762\u4e0e\u80cc\u9762</p><div class="medal-zoom"><button type="button" class="zoom-out" aria-label="缩小">−</button><output class="zoom-level" aria-live="polite">100%</output><button type="button" class="zoom-in" aria-label="放大">+</button></div><div class="inspector-actions"><button type="button" class="reset-model">\u590d\u4f4d</button><button type="button" class="inspect-details">\u67e5\u770b\u4efb\u52a1\u4e0e\u8bb0\u5f55</button></div>';
    panel.querySelector('h2').textContent=options.name;panel.querySelector('.inspector-state').textContent='\u5df2\u83b7\u5f97 \u00b7 \u73d0\u7405\u5178\u85cf';
    const stage=panel.querySelector('.inspector-stage');dialog.append(panel);document.body.append(dialog);dialog.showModal();
    const model=modelFor(options.icon,options.earned,options.tone||'blue',options.mark||''),scene=sceneFor(model),cam=camera();
    const home=model.quaternion.clone();
    let zoom=1,closeZoom=1;const pointers=new Map();
    stage.setAttribute('aria-label','拖动或方向键旋转，双指或滚轮缩放，加减键缩放，Home 复位');
    panel.querySelector('.spin-hint').textContent='拖动旋转 · 双指或滚轮缩放';
    function setZoom(value){if(closing)return;zoom=Math.max(1,Math.min(3,value));cam.zoom=zoom;cam.updateProjectionMatrix();stage.dataset.zoom=zoom.toFixed(2);panel.querySelector('.zoom-level').textContent=Math.round(zoom*100)+'%';panel.querySelector('.zoom-out').disabled=zoom<=1;panel.querySelector('.zoom-in').disabled=zoom>=3;vx=vy=0;wake();}
    let raf=0,drag=null,vx=0,vy=0,closing=false,disposed=false,wantsDetails=false,flight=null,travel=null,closeStart=0,closeFrom=null;
    dialog.dataset.phase='opening';
    function fittedRect(){
        if(!source.isConnected||!source.getClientRects().length)return null;
        const rect=(source.querySelector('.medal-art')||source).getBoundingClientRect();
        if(rect.bottom<=0||rect.top>=innerHeight||rect.right<=0||rect.left>=innerWidth)return null;
        const height=Math.min(rect.height,rect.width/.75);return {left:rect.left,top:rect.top+(rect.height-height)/2,width:rect.width,height};
    }
    function transformTo(rect,base){return `translate(${rect.left+rect.width/2-base.left-base.width/2}px,${rect.top+rect.height/2-base.top-base.height/2}px) scale(${rect.height/base.height})`;}
    function resize(){const width=stage.clientWidth,height=stage.clientHeight;r.setSize(width,height,false);cam.aspect=width/height;cam.updateProjectionMatrix();wake();}
    function makeFlight(base){
        flight?.remove();flight=document.createElement('div');flight.className='medal-flight';flight.setAttribute('aria-hidden','true');
        Object.assign(flight.style,{left:base.left+'px',top:base.top+'px',width:base.width+'px',height:base.height+'px'});
        flight.append(r.domElement);dialog.append(flight);
    }
    function wake(){if(!disposed&&!raf)raf=requestAnimationFrame(draw);}
    function draw(now){
        raf=0;if(disposed||!dialog.open)return;
        if(closing&&closeFrom){const t=Math.min(1,(now-closeStart)/320),ease=t*t*(3-2*t);model.quaternion.slerpQuaternions(closeFrom,home,ease);cam.zoom=closeZoom+(1-closeZoom)*ease;cam.updateProjectionMatrix();}
        else if(!drag){if(reduced()){vx=vy=0;}else{model.rotation.y+=vx;model.rotation.x+=vy;vx*=.92;vy*=.92;if(Math.abs(vx)<.0001)vx=0;if(Math.abs(vy)<.0001)vy=0;}}
        r.render(scene,cam);stage.dataset.rotation=model.rotation.y.toFixed(3);
        if(closing||vx||vy)wake();
    }
    function settleOpening(){
        if(closing||disposed)return;travel?.cancel();travel=null;stage.append(r.domElement);flight?.remove();flight=null;dialog.dataset.phase='idle';wake();
    }
    function finish(){if(disposed)return;source.classList.remove('badge-lifted');dialog.close();}
    function close(){
        if(closing||disposed)return;closing=true;closeZoom=zoom;drag=null;pointers.clear();vx=vy=0;
        dialog.dataset.phase='closing';dialog.classList.add('is-closing');
        if(reduced()){finish();return;}
        // Capture the current flight pose before cancelling a possibly unfinished entry.
        const current=flight?.getBoundingClientRect()||stage.getBoundingClientRect();
        const base=stage.getBoundingClientRect(),destination=fittedRect();
        travel?.cancel();travel=null;makeFlight(base);
        closeFrom=model.quaternion.clone();closeStart=performance.now();wake();
        const opacity=getComputedStyle(panel).opacity;panel.getAnimations().forEach(a=>a.cancel());
        panel.animate([{opacity},{opacity:0}],{duration:160,fill:'forwards'});
        travel=flight.animate([{transform:transformTo(current,base),opacity:1},{transform:destination?transformTo(destination,base):transformTo(current,base),opacity:destination?1:0}],{duration:destination?320:160,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
        travel.finished.then(finish,()=>{});
    }
    source.classList.add('badge-lifted');stage.append(r.domElement);resize();r.render(scene,cam);
    if(!reduced()&&fittedRect()){
        const base=stage.getBoundingClientRect(),origin=fittedRect();makeFlight(base);
        panel.animate([{opacity:0},{opacity:1}],{duration:180});
        travel=flight.animate([{transform:transformTo(origin,base)},{transform:'translate(0,0) scale(1)'}],{duration:360,easing:'cubic-bezier(.18,.8,.2,1)',fill:'forwards'});
        travel.finished.then(settleOpening,()=>{});
    }else settleOpening();
    let lastWidth=stage.clientWidth,lastHeight=stage.clientHeight;
    const observer=new ResizeObserver(()=>{if(stage.clientWidth===lastWidth&&stage.clientHeight===lastHeight)return;lastWidth=stage.clientWidth;lastHeight=stage.clientHeight;if(closing){finish();return;}settleOpening();resize();});observer.observe(stage);
    const onResize=()=>{if(closing)finish();else{settleOpening();resize();}};window.addEventListener('resize',onResize);
    const distance=()=>{const [a,b]=[...pointers.values()];return b?Math.hypot(a.x-b.x,a.y-b.y):0;};
    stage.addEventListener('pointerdown',e=>{if(e.button!==0||closing)return;settleOpening();stage.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag=true;vx=vy=0;stage.classList.add('dragging');});
    stage.addEventListener('pointermove',e=>{
        const previous=pointers.get(e.pointerId);if(!previous||closing)return;
        const oldDistance=distance(),dx=e.clientX-previous.x,dy=e.clientY-previous.y;
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.size>1){if(oldDistance>0)setZoom(zoom*distance()/oldDistance);}
        else{vx=dx*.009;vy=dy*.009;model.rotation.y+=vx;model.rotation.x+=vy;wake();}
    });
    function release(e){if(!pointers.delete(e.pointerId))return;drag=pointers.size?true:null;if(!drag)stage.classList.remove('dragging');wake();}
    stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',e=>{vx=vy=0;release(e);});stage.addEventListener('lostpointercapture',release);
    stage.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*(e.deltaMode===1?.03:.002)));},{passive:false});
    panel.querySelector('.zoom-in').onclick=()=>setZoom(zoom+.25);
    panel.querySelector('.zoom-out').onclick=()=>setZoom(zoom-.25);
    setZoom(1);
    function reset(){if(closing)return;model.quaternion.copy(home);setZoom(1);vx=vy=0;wake();}
    stage.addEventListener('keydown',e=>{if(closing)return;const keys={ArrowLeft:[0,-.15],ArrowRight:[0,.15],ArrowUp:[-.15,0],ArrowDown:[.15,0]};if(keys[e.key]){e.preventDefault();model.rotation.x+=keys[e.key][0];model.rotation.y+=keys[e.key][1];vx=vy=0;wake();}if(['+','=','-','_'].includes(e.key)){e.preventDefault();setZoom(zoom+(['-','_'].includes(e.key)?-.25:.25));}if(e.key==='Home'){e.preventDefault();reset();}});
    active={close};panel.querySelector('.inspector-close').onclick=close;panel.querySelector('.reset-model').onclick=reset;
    panel.querySelector('.inspect-details').onclick=()=>{wantsDetails=true;close();};
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    dialog.addEventListener('close',()=>{
        disposed=true;cancelAnimationFrame(raf);travel?.cancel();observer.disconnect();window.removeEventListener('resize',onResize);
        panel.getAnimations().forEach(a=>a.cancel());dispose(model);disposeScene(scene);r.domElement.remove();
        source.classList.remove('badge-lifted');dialog.remove();active=null;if(source.isConnected)source.focus({preventScroll:true});if(wantsDetails)details();
    },{once:true});
    stage.focus({preventScroll:true});
}
