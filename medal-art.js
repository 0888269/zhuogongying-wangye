'use strict';
// Club medal designs shared by the SVG fallback and the interactive 3D model.
window.createEngineeringMedal = (() => {
    let serial=0;
    const ns='http://www.w3.org/2000/svg';
    const icons={
        circuit:'M49 99h18m0 0V83h19m-19 16v17h19M52 99v-17m0 17v17 M47 78h10v9H47z M82 78h10v9H82z M82 112h10v9H82z M47 112h10v9H47z',
        code:'M60 84L46 99l14 15m20-30l14 15-14 15M75 79l-10 40',
        chip:'M53 82h34v34H53z M62 90h16v17H62z M59 75v7m11-7v7m11-7v7m-22 34v7m11-7v7m11-7v7M46 89h7m-7 11h7m-7 10h7m34-21h7m-7 11h7m-7 10h7',
        signal:'M43 100h10l7-20 11 40 9-30 7 10h10',
        exam:'M49 97l14 15 29-31',
        project:'M48 86l22-12 22 12v28l-22 12-22-12z M48 86l22 13 22-13M70 99v27',
        spark:'M70 75l7 15 17 3-12 13 3 18-15-9-15 9 3-18-12-13 17-3z',
        search:'M78 95a15 15 0 1 1-30 0 15 15 0 1 1 30 0M74 107l17 17',
        design:'M48 117l4-15 29-29 14 14-29 29-18 1zM77 77l14 14M52 102l14 14',
        shield:'M70 74l23 9v18c0 13-11 23-23 28-12-5-23-15-23-28V83zM58 100l9 9 16-20',
        medical:'M62 77h16v15h15v15H78v16H62v-16H47V92h15z',
        team:'M60 84a10 10 0 1 1 20 0 10 10 0 1 1-20 0M51 121v-8c0-20 38-20 38 0v8M43 98a7 7 0 1 1 9-11M97 98a7 7 0 1 0-9-11M40 120v-10m60 10v-10'
    };
    window.EngineeringMedalPaths=icons;
    window.engineeringMedalDesign=(icon,tone='blue',mark='')=>{
        icon=({cog:'circuit',bolt:'project','wave-square':'signal',lock:'shield',award:'spark'})[icon]||icon;
        if(!icons[icon])icon='spark';
        const rank=['I','II','III','IV'].indexOf(mark);
        const family=rank>=0?['round','oval','star','star'][rank]:({circuit:'round',code:'oval',chip:'round',signal:'oval',exam:'star',project:'star',spark:'star',search:'round',design:'oval',shield:'star',medical:'round',team:'oval'})[icon];
        const ribbon=family==='star'?['#243b6a','#d6ba7b','#932d40','#3c5396','#932d40','#d6ba7b','#243b6a']:family==='oval'?['#372e56','#d6ba7b','#d6c8a0','#674886','#d6c8a0','#d6ba7b','#372e56']:['#253b69','#d8c89e','#4769a1','#66458c','#4769a1','#d8c89e','#253b69'];
        return {icon,family,ribbon,tone};
    };
    function node(tag,attrs={},parent,text){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;}
    return function(icon,earned,tone='blue',mark=''){
        const spec=window.engineeringMedalDesign(icon,tone,mark);icon=spec.icon;
        const id='medal-'+(++serial),svg=node('svg',{viewBox:'0 0 160 220',class:'sculpted-medal ceremonial-medal'+(earned?' metal-earned':''),'aria-hidden':'true'});
        const defs=node('defs',{},svg),gold=node('linearGradient',{id:id+'gold',x1:0,y1:0,x2:1,y2:1},defs);
        [['0%','#fae2a5'],['35%','#ac7b34'],['60%','#e4c27a'],['100%','#775323']].forEach(([offset,color])=>node('stop',{offset,'stop-color':color},gold));
        const clip=node('clipPath',{id:id+'ribbon'},defs);node('path',{d:'M45 9h70l9 46-44 23-44-23z'},clip);
        const cloth=node('g',{'clip-path':'url(#'+id+'ribbon)'},svg);
        const stops=[0,.10,.16,.30,.70,.84,.90,1];for(let i=0;i<7;i++)node('rect',{x:36+88*stops[i],y:9,width:88*(stops[i+1]-stops[i])+1,height:70,fill:spec.ribbon[i]},cloth);
        for(let y=10;y<78;y+=2)node('path',{d:'M36 '+y+'h88',stroke:'#fff','stroke-opacity':'.13','stroke-width':'.5'},cloth);
        node('path',{d:'M45 9h70l9 46-44 23-44-23z',fill:'none',stroke:'#d5b774','stroke-width':1},svg);
        for(const y of [78,84,91])node('ellipse',{cx:80,cy:y,rx:4,ry:5,fill:'none',stroke:'url(#'+id+'gold)','stroke-width':2},svg);
        const body=node('g',{transform:'translate(80 150)'},svg),metal='url(#'+id+'gold)';
        function star(radius,inner,n=5){return Array.from({length:n*2},(_,i)=>{const a=-Math.PI/2+i*Math.PI/n,r=i%2?inner:radius;return (i?'L':'M')+(Math.cos(a)*r)+' '+(Math.sin(a)*r)}).join('')+'z';}
        if(spec.family==='star'){
            node('path',{d:star(59,47,40),fill:metal,stroke:'#ae8c51','stroke-width':1},body);
            node('path',{d:star(56,26),fill:'#851b31',stroke:metal,'stroke-width':3},body);
        }else if(spec.family==='oval'){
            node('ellipse',{cx:0,cy:0,rx:44,ry:58,fill:'#5c3c78',stroke:metal,'stroke-width':4},body);
            for(const sign of [-1,1])node('path',{d:'M0 -42L'+sign*41+' -28L'+sign*33+' 32L'+sign*10+' 21Z',fill:'#9b2537',stroke:metal,'stroke-width':2},body);
        }else{
            node('circle',{cx:0,cy:0,r:51,fill:metal},body);node('circle',{cx:0,cy:0,r:44,fill:'#27467d',stroke:'#e2c484','stroke-width':2},body);
            for(let i=0;i<48;i++){const a=i*Math.PI/24;node('path',{d:'M'+Math.cos(a)*47+' '+Math.sin(a)*47+'L'+Math.cos(a)*50+' '+Math.sin(a)*50,stroke:'#775826','stroke-width':.6},body);}
        }
        node('circle',{cx:0,cy:0,r:33,fill:'#eee2bf',stroke:metal,'stroke-width':2},body);
        node('circle',{cx:0,cy:0,r:23,fill:'#284779',stroke:metal,'stroke-width':1.5},body);
        for(const sign of [-1,1])for(let i=0;i<11;i++){const a=-1.25+i*.20,x=sign*Math.cos(a)*40,y=-Math.sin(a)*42;node('ellipse',{cx:0,cy:0,rx:3.5,ry:8,transform:'translate('+x+' '+y+') rotate('+(-sign*(i*11-50))+')',fill:metal,stroke:'#9d783c','stroke-width':'.4'},body);}
        node('path',{d:star(10,4.5),transform:'translate(0 -43)',fill:'#a12538',stroke:metal,'stroke-width':1.4},body);
        const emblem=node('g',{transform:'translate(-39.2 -56) scale(.56)'},body);node('path',{d:icons[icon],fill:'none',stroke:'#e4c57e','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'},emblem);
        node('path',{d:'M-35 32Q0 43 35 32L33 46Q0 54-33 46Z',fill:spec.family==='round'?'#674387':'#8c2639',stroke:metal,'stroke-width':1.5},body);
        node('text',{x:0,y:44,'text-anchor':'middle',fill:'#f2dfb4','font-family':'Georgia,serif','font-size':6,'letter-spacing':1},body,'SZU MIEE');
        node('text',{x:0,y:30,'text-anchor':'middle',fill:'#866332','font-family':'Georgia,serif','font-size':4.5},body,mark||'EXCELLENCE');
        return svg;
    };
})();
