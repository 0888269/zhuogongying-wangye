import assets from './medal-assets/manifest.json';

// The collection uses cached images. WebGL is reserved for an opened specimen.
function mount(art){
    if(art.dataset.rendered)return;
    const design=window.engineeringMedalDesign(art.dataset.icon,art.dataset.tone,art.dataset.mark);
    const asset=assets.ranks[art.dataset.mark]||assets.icons[design.icon];
    if(!asset)return;
    const recess=document.createElement('span');recess.className='medal-recess model-recess';
    recess.style.maskImage=recess.style.webkitMaskImage='url("/medal-assets/'+asset.mask+'")';
    art.replaceChildren(recess);
    if(art.dataset.earned==='true'){
        const occupant=document.createElement('span');occupant.className='medal-occupant';
        const img=new Image();img.className='medal-model-portrait';img.alt='';img.width=240;img.height=320;
        img.loading='lazy';img.decoding='async';img.src='/medal-assets/'+asset.image;
        occupant.append(img);art.append(occupant);
    }
    art.dataset.rendered='true';
}
function upgrade(root=document){for(const art of root.querySelectorAll('.medal-art[data-mounted="true"]'))mount(art);}
let viewerPromise,pending=null;
async function inspect(options,source,details){
    if(pending||document.querySelector('.cabinet-inspector'))return;
    const request={cancelled:false};pending=request;source.setAttribute('aria-busy','true');source.classList.add('medal-loading');
    const cancel=e=>{if(e.key==='Escape'){request.cancelled=true;source.removeAttribute('aria-busy');source.classList.remove('medal-loading');if(pending===request)pending=null;}};document.addEventListener('keydown',cancel);
    try{
        const url='/badge-viewer.js';
        viewerPromise ||= import(url).catch(error=>{viewerPromise=null;throw error;});
        const viewer=await viewerPromise;
        if(!request.cancelled&&source.isConnected&&source.getClientRects().length)viewer.inspect(options,source,details);
    }catch(error){if(!request.cancelled&&source.isConnected&&source.getClientRects().length)details();}
    finally{source.removeAttribute('aria-busy');source.classList.remove('medal-loading');document.removeEventListener('keydown',cancel);if(pending===request)pending=null;}
}
window.BadgeCabinet={mount,upgrade,inspect};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>upgrade());else upgrade();
