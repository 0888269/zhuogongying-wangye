import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original club decorations informed by historical medal construction:
// cloth suspension, connecting rings, struck relief, enamel and milled edges.
export function buildMedal(icon, earned, tone='blue', mark='') {
    const spec=window.engineeringMedalDesign(icon,tone,mark);
    icon=spec.icon;
    const medal=new THREE.Group();
    const grainCanvas=document.createElement('canvas');grainCanvas.width=256;grainCanvas.height=256;
    const grainCtx=grainCanvas.getContext('2d'),pixels=grainCtx.createImageData(256,256);let seed=73;
    for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=115+(seed%75);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}grainCtx.putImageData(pixels,0,0);
    const grain=new THREE.CanvasTexture(grainCanvas);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(3,3);
    const metal=(color,roughness=.29)=>new THREE.MeshStandardMaterial({color,metalness:.88,roughness,bumpMap:grain,bumpScale:.007});
    const gold=metal(0xc79a4b),brightGold=metal(0xe7c780,.23),silver=metal(0xb7c2ce,.3),dark=metal(0x4b453a,.42);
    const enamel=color=>new THREE.MeshPhysicalMaterial({color,metalness:.25,roughness:.24,clearcoat:1,clearcoatRoughness:.13});
    const red=enamel(earned?0x99192a:0x61303b),blue=enamel(earned?0x203f7f:0x34415b),purple=enamel(earned?0x624087:0x51425e),ivory=enamel(0xe1d9bc);
    const accent=spec.family==='star'?red:spec.family==='oval'?purple:blue;
    const rim=tone==='silver'||tone==='graphite'?silver:gold;
    function add(geometry,mat,x=0,y=0,z=0){const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);medal.add(mesh);return mesh;}
    function shape(points){const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
    function poly(radius,n=5,inner=radius){const pts=[];for(let i=0;i<(inner===radius?n:n*2);i++){const a=Math.PI/2+i*Math.PI*2/(inner===radius?n:n*2),r=i%2?inner:radius;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}return shape(pts);}
    function extrude(s,mat,depth=.055,z=0,x=0,y=0,bevel=.015){return add(new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,steps:1,curveSegments:32}),mat,x,y,z);}
    function disc(radius,mat,z,depth=.045){const s=new THREE.Shape();s.absarc(0,0,radius,0,Math.PI*2,false);return extrude(s,mat,depth,z);}
    function ring(radius,width,mat,z,x=0,y=0){return add(new THREE.TorusGeometry(radius,width,10,80),mat,x,y,z);}
    function wire(points,width,mat){const curve=new THREE.CurvePath();for(let i=1;i<points.length;i++){const a=new THREE.Vector3(...points[i-1]),b=new THREE.Vector3(...points[i]);if(a.distanceTo(b)>.0001)curve.add(new THREE.LineCurve3(a,b));}if(curve.curves.length)add(new THREE.TubeGeometry(curve,Math.max(24,points.length*2),width,8,false),mat);}
    function label(text,y,z,width=.85,height=.15,color='#e7d3a6',reverse=false){
        const c=document.createElement('canvas');c.width=1024;c.height=192;const ctx=c.getContext('2d');
        ctx.fillStyle=color;ctx.font='600 82px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,101,980);
        const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
        const m=add(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}),0,y,z);if(reverse)m.rotation.y=Math.PI;
    }
    // Five-sided folded silk mount. Generated weave is an actual bump map.
    const clothCanvas=document.createElement('canvas');clothCanvas.width=512;clothCanvas.height=512;const ctx=clothCanvas.getContext('2d');
    const colors=spec.ribbon;
    const stops=[0,.10,.16,.30,.70,.84,.90,1];
    for(let i=0;i<7;i++){ctx.fillStyle=colors[i%colors.length];ctx.fillRect(stops[i]*512,0,(stops[i+1]-stops[i])*512,512);}
    for(let y=0;y<512;y+=4){ctx.fillStyle=y%8?'#ffffff20':'#00000035';ctx.fillRect(0,y,512,1);}
    for(let x=0;x<512;x+=3){ctx.fillStyle=x%6?'#ffffff12':'#00000018';ctx.fillRect(x,0,1,512);}
    const fold=ctx.createLinearGradient(0,0,512,0);fold.addColorStop(0,'#00000038');fold.addColorStop(.36,'#ffffff00');fold.addColorStop(.49,'#ffffff28');fold.addColorStop(.505,'#00000040');fold.addColorStop(.65,'#00000000');fold.addColorStop(1,'#ffffff15');ctx.fillStyle=fold;ctx.fillRect(0,0,512,512);
    const clothMap=new THREE.CanvasTexture(clothCanvas);clothMap.colorSpace=THREE.SRGBColorSpace;
    const bumpCanvas=document.createElement('canvas');bumpCanvas.width=256;bumpCanvas.height=256;const bump=bumpCanvas.getContext('2d');bump.fillStyle='#888';bump.fillRect(0,0,256,256);
    for(let y=0;y<256;y+=3){bump.fillStyle='#ddd';bump.fillRect(0,y,256,1);bump.fillStyle='#555';bump.fillRect(0,y+1,256,1);}
    const weave=new THREE.CanvasTexture(bumpCanvas);
    const cloth=new THREE.MeshStandardMaterial({map:clothMap,bumpMap:weave,bumpScale:.012,roughness:.88,metalness:0});
    const ribbonPoints=[[-.58,2.12],[.58,2.12],[.72,1.39],[0,1.03],[-.72,1.39]];
    extrude(shape(ribbonPoints),dark,.065,-.12,0,0,.018);
    const ribbon=extrude(shape(ribbonPoints.map(([x,y])=>[x*.97,1.58+(y-1.58)*.97])),cloth,.018,-.04,0,0,.008);
    const uv=ribbon.geometry.attributes.uv,pos=ribbon.geometry.attributes.position;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+.74)/1.48,(pos.getY(i)-1.02)/1.12);uv.needsUpdate=true;
    add(new THREE.BoxGeometry(1.18,.045,.045),rim,0,2.12,-.015);
    // Eyelet plus a perpendicular connector: physical space between ribbon and order.
    const attachment=spec.family==='round'?.72:spec.family==='oval'?.82:.96;
    ring(.085,.026,rim,.03,0,1.04);const connector=ring(.09,.021,brightGold,.055,0,(1.04+attachment)/2);connector.rotation.y=.9;
    ring(.062,.023,rim,.06,0,attachment);
    // Medal body sits below its ribbon, with different silhouettes for the families.
    const bodyStart=medal.children.length;
    if(spec.family==='star'){
        extrude(poly(1.09,5,.49),rim,.105,-.06);
        // Five bundles of narrow, cut-metal rays between the enamel points.
        for(let i=0;i<50;i++){
            const a=i*Math.PI/25+Math.PI/10;const r=.80+.25*Math.pow(Math.cos((a-Math.PI/2)*5),2);
            const ray=extrude(shape([[-.018,.55],[.018,.55],[.014,r],[0,r+.035],[-.014,r]]),i%2?silver:brightGold,.035,-.005);
            ray.rotation.z=a;
        }
        const star=extrude(poly(.97,5,.455),brightGold,.055,.09);star.rotation.z=0;
        extrude(poly(.885,5,.422),accent,.028,.157,0,0,.012);
        disc(.58,dark,.19);disc(.548,ivory,.21);ring(.555,.021,brightGold,.265);
    }else if(spec.family==='oval'){
        const s=new THREE.Shape();s.absellipse(0,0,.78,.97,0,Math.PI*2,false,0);extrude(s,silver,.105,-.075);
        const plate=new THREE.Shape();plate.absellipse(0,0,.65,.85,0,Math.PI*2,false,0);extrude(plate,accent,.045,.052);
        // Two draped enamel banners behind the centre medallion.
        for(const sign of [-1,1]){const pennant=extrude(shape([[0,.64],[sign*.67,.48],[sign*.58,-.41],[sign*.22,-.31]]),gold,.04,.1);const inner=extrude(shape([[sign*.06,.57],[sign*.60,.43],[sign*.52,-.34],[sign*.25,-.25]]),red,.017,.15);}
        disc(.50,brightGold,.19);disc(.46,ivory,.235);ring(.475,.02,gold,.285);
    }else{
        disc(.86,rim,-.065,.115);ring(.84,.03,brightGold,.09);
        // Radial incisions and scalloped edging are visible in grazing light.
        for(let i=0;i<64;i++){const a=i*Math.PI/32;const ray=add(new THREE.BoxGeometry(.012,.11,.022),i%2?gold:brightGold,Math.sin(a)*.79,Math.cos(a)*.79,.085);ray.rotation.z=-a;}
        disc(.72,blue,.09);ring(.7,.021,gold,.155);disc(.52,gold,.155);disc(.485,ivory,.20);
    }
    // Laurel branches: overlapping convex leaves, stems, and embossed veins.
    for(const sign of [-1,1]){
        const points=[];
        for(let i=0;i<18;i++){const a=-1.37+i*.133;points.push([sign*Math.cos(a)*.68,Math.sin(a)*.69,.30]);}
        wire(points,.016,gold);
        for(let i=0;i<13;i++){
            const a=-1.25+i*.166,cx=sign*Math.cos(a)*.68,cy=Math.sin(a)*.69;
            for(const branch of [-1,1]){
                const leaf=new THREE.Shape();leaf.moveTo(0,0);leaf.bezierCurveTo(-.062,.048,-.048,.14,0,.185);leaf.bezierCurveTo(.05,.135,.057,.055,0,0);
                const m=extrude(leaf,i%3===0?brightGold:gold,.018,.305,cx,cy,.009);m.rotation.z=-sign*(a+Math.PI/2)+branch*.55;
                const positions=m.geometry.attributes.position;for(let k=0;k<positions.count;k++){const x=positions.getX(k),y=positions.getY(k);positions.setZ(k,positions.getZ(k)+.032*Math.sin(Math.max(0,Math.min(1,y/.185))*Math.PI)*Math.max(0,1-Math.abs(x)/.06));}m.geometry.computeVertexNormals();
            }
        }
    }
    // A small enamel star caps the wreath; body colour remains visible around it.
    extrude(poly(.16,5,.073),brightGold,.026,.33,0,.685,.008);
    extrude(poly(.123,5,.055),red,.014,.367,0,.685,.006);
    ring(.413,.013,gold,.29);
    disc(.329,blue,.278,.024);ring(.335,.013,brightGold,.313);
    // Fine lettering on the ivory chapter ring, like a struck order's inscription.
    const inscription=document.createElement('canvas');inscription.width=inscription.height=1024;const ic=inscription.getContext('2d');ic.translate(512,512);ic.fillStyle='#705222';ic.font='bold 39px Georgia, serif';ic.textAlign='center';ic.textBaseline='middle';
    const inscriptionText='SCIENCE · PRACTICE · EXCELLENCE';for(let i=0;i<inscriptionText.length;i++){const a=-Math.PI*.82+i/(inscriptionText.length-1)*Math.PI*1.64;ic.save();ic.rotate(a);ic.fillText(inscriptionText[i],0,-383);ic.restore();}
    const inscriptionMap=new THREE.CanvasTexture(inscription);inscriptionMap.colorSpace=THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(.91,.91),new THREE.MeshBasicMaterial({map:inscriptionMap,transparent:true,depthWrite:false}),0,0,.32);
    // Small struck engineering emblem in the centre instead of a giant UI icon.
    const d=window.EngineeringMedalPaths?.[icon]||window.EngineeringMedalPaths.spark;
    const paths=new SVGLoader().parse('<svg xmlns="http://www.w3.org/2000/svg"><path d="'+d+'" fill="none" stroke="white"/></svg>').paths;
    for(const path of paths)for(const sub of path.subPaths){const points=sub.getPoints(18).map(p=>[(p.x-70)*.0095,(100-p.y)*.0095+.015,.345]);wire(points,.0185,brightGold);}
    // Curved red-enamel title cartouche, rimmed in gold.
    const banner=shape([[-.56,-.50],[-.30,-.56],[0,-.58],[.30,-.56],[.56,-.50],[.53,-.68],[.26,-.73],[0,-.75],[-.26,-.73],[-.53,-.68]]);
    extrude(banner,brightGold,.035,.34,0,0,.012);
    const inset=banner.clone();const b=extrude(inset,spec.family==='round'?purple:red,.018,.39,0,0,.004);b.scale.set(.94,.94,1);b.position.y=-.037;
    label('SZU · MIEE',-.628,.424,.87,.12);
    label(mark||'EXCELLENCE',-.39,.34,.25,.065,'#73582d');
    // Reverse is modeled too: medal plate, engraved serial, clasp and pin.
    const back=disc(spec.family==='oval'?.66:.72,dark,-.102,.022);if(spec.family==='oval')back.scale.y=1.17;
    ring(.57,.012,rim,-.114);label('SZU · MIEE',.12,-.129,.75,.13,'#c4b58f',true);label('No. '+(mark||'001'),-.1,-.13,.50,.1,'#c4b58f',true);
    for(let i=bodyStart;i<medal.children.length;i++){medal.children[i].position.y-=.21;}
    const pin=add(new THREE.CylinderGeometry(.018,.018,1.03,10),silver,0,1.73,-.21);pin.rotation.z=Math.PI/2;
    add(new THREE.BoxGeometry(.09,.15,.09),rim,-.5,1.73,-.18);add(new THREE.BoxGeometry(.07,.12,.08),rim,.5,1.73,-.18);
    // Bake static parts per material to keep the cabinet efficient on mobile GPUs.
    medal.updateMatrixWorld(true);const batches=new Map();
    for(const mesh of [...medal.children]){const g=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(mesh.matrix);const list=batches.get(mesh.material)||[];list.push(g);batches.set(mesh.material,list);mesh.geometry.dispose();medal.remove(mesh);}
    for(const [mat,geometries] of batches){const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=!mat.transparent;mesh.receiveShadow=!mat.transparent;medal.add(mesh);}
    for(const mat of [gold,brightGold,silver,dark,red,blue,purple,ivory])if(!batches.has(mat))mat.dispose();
    const root=new THREE.Group();medal.position.y=-.49;root.add(medal);root.rotation.set(.06,-.16,-.025);root.userData.family=spec.family;
    return root;
}
