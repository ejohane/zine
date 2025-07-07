import{k as ue,l as Ge,m as z,o as xt,q as mt,v as Y,w as L,x as p,y as Z,z as O,A as d,B as s,C as Ze,D as Te,E as St,F as wt,G as Qe,H as Ft,I as Je,J as gt,K as zt,L as Mt,M as Ut,N as Bt,O as Et}from"./main-BHyfKfzB.js";function bt(e){var t,i,r="";if(typeof e=="string"||typeof e=="number")r+=e;else if(typeof e=="object")if(Array.isArray(e)){var u=e.length;for(t=0;t<u;t++)e[t]&&(i=bt(e[t]))&&(r&&(r+=" "),r+=i)}else for(i in e)e[i]&&(r&&(r+=" "),r+=i);return r}function Q(){for(var e,t,i=0,r="",u=arguments.length;i<u;i++)(e=arguments[i])&&(t=bt(e))&&(r&&(r+=" "),r+=t);return r}const Dt=typeof window>"u";function Ye(e){const t={pending:"yellow",success:"green",error:"red",notFound:"purple",redirected:"gray"};return e.isFetching&&e.status==="success"?e.isFetching==="beforeLoad"?"purple":"blue":t[e.status]}function Ot(e,t){const i=e.find(r=>r.routeId===t.id);return i?Ye(i):"gray"}function It(){const[e,t]=ue(!1);return(Dt?Ge:z)(()=>{t(!0)}),e}const Gt=e=>{const t=Object.getOwnPropertyNames(Object(e)),i=typeof e=="bigint"?`${e.toString()}n`:e;try{return JSON.stringify(i,t)}catch{return"unable to stringify"}};function Tt(e,t=[i=>i]){return e.map((i,r)=>[i,r]).sort(([i,r],[u,o])=>{for(const a of t){const c=a(i),g=a(u);if(typeof c>"u"){if(typeof g>"u")continue;return 1}if(c!==g)return c>g?1:-1}return r-o}).map(([i])=>i)}let At={data:""},Pt=e=>typeof window=="object"?((e?e.querySelector("#_goober"):window._goober)||Object.assign((e||document.head).appendChild(document.createElement("style")),{innerHTML:" ",id:"_goober"})).firstChild:e||At,Lt=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,Rt=/\/\*[^]*?\*\/|  +/g,pt=/\n+/g,_e=(e,t)=>{let i="",r="",u="";for(let o in e){let a=e[o];o[0]=="@"?o[1]=="i"?i=o+" "+a+";":r+=o[1]=="f"?_e(a,o):o+"{"+_e(a,o[1]=="k"?"":t)+"}":typeof a=="object"?r+=_e(a,t?t.replace(/([^,])+/g,c=>o.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,g=>/&/.test(g)?g.replace(/&/g,c):c?c+" "+g:g)):o):a!=null&&(o=/^--/.test(o)?o:o.replace(/[A-Z]/g,"-$&").toLowerCase(),u+=_e.p?_e.p(o,a):o+":"+a+";")}return i+(t&&u?t+"{"+u+"}":u)+r},he={},yt=e=>{if(typeof e=="object"){let t="";for(let i in e)t+=i+yt(e[i]);return t}return e},jt=(e,t,i,r,u)=>{let o=yt(e),a=he[o]||(he[o]=(g=>{let l=0,n=11;for(;l<g.length;)n=101*n+g.charCodeAt(l++)>>>0;return"go"+n})(o));if(!he[a]){let g=o!==e?e:(l=>{let n,$,v=[{}];for(;n=Lt.exec(l.replace(Rt,""));)n[4]?v.shift():n[3]?($=n[3].replace(pt," ").trim(),v.unshift(v[0][$]=v[0][$]||{})):v[0][n[1]]=n[2].replace(pt," ").trim();return v[0]})(e);he[a]=_e(u?{["@keyframes "+a]:g}:g,i?"":"."+a)}let c=i&&he.g?he.g:null;return i&&(he.g=he[a]),((g,l,n,$)=>{$?l.data=l.data.replace($,g):l.data.indexOf(g)===-1&&(l.data=n?g+l.data:l.data+g)})(he[a],t,r,c),a},Ht=(e,t,i)=>e.reduce((r,u,o)=>{let a=t[o];if(a&&a.call){let c=a(i),g=c&&c.props&&c.props.className||/^go/.test(c)&&c;a=g?"."+g:c&&typeof c=="object"?c.props?"":_e(c,""):c===!1?"":c}return r+u+(a??"")},"");function ze(e){let t=this||{},i=e.call?e(t.p):e;return jt(i.unshift?i.raw?Ht(i,[].slice.call(arguments,1),t.p):i.reduce((r,u)=>Object.assign(r,u&&u.call?u(t.p):u),{}):i,Pt(t.target),t.g,t.o,t.k)}ze.bind({g:1});ze.bind({k:1});const D={colors:{inherit:"inherit",current:"currentColor",transparent:"transparent",black:"#000000",white:"#ffffff",neutral:{50:"#f9fafb",100:"#f2f4f7",200:"#eaecf0",300:"#d0d5dd",400:"#98a2b3",500:"#667085",600:"#475467",700:"#344054",800:"#1d2939",900:"#101828"},darkGray:{50:"#525c7a",100:"#49536e",200:"#414962",300:"#394056",400:"#313749",500:"#292e3d",600:"#212530",700:"#191c24",800:"#111318",900:"#0b0d10"},gray:{50:"#f9fafb",100:"#f2f4f7",200:"#eaecf0",300:"#d0d5dd",400:"#98a2b3",500:"#667085",600:"#475467",700:"#344054",800:"#1d2939",900:"#101828"},blue:{25:"#F5FAFF",50:"#EFF8FF",100:"#D1E9FF",200:"#B2DDFF",300:"#84CAFF",400:"#53B1FD",500:"#2E90FA",600:"#1570EF",700:"#175CD3",800:"#1849A9",900:"#194185"},green:{25:"#F6FEF9",50:"#ECFDF3",100:"#D1FADF",200:"#A6F4C5",300:"#6CE9A6",400:"#32D583",500:"#12B76A",600:"#039855",700:"#027A48",800:"#05603A",900:"#054F31"},red:{50:"#fef2f2",100:"#fee2e2",200:"#fecaca",300:"#fca5a5",400:"#f87171",500:"#ef4444",600:"#dc2626",700:"#b91c1c",800:"#991b1b",900:"#7f1d1d",950:"#450a0a"},yellow:{25:"#FFFCF5",50:"#FFFAEB",100:"#FEF0C7",200:"#FEDF89",300:"#FEC84B",400:"#FDB022",500:"#F79009",600:"#DC6803",700:"#B54708",800:"#93370D",900:"#7A2E0E"},purple:{25:"#FAFAFF",50:"#F4F3FF",100:"#EBE9FE",200:"#D9D6FE",300:"#BDB4FE",400:"#9B8AFB",500:"#7A5AF8",600:"#6938EF",700:"#5925DC",800:"#4A1FB8",900:"#3E1C96"},teal:{25:"#F6FEFC",50:"#F0FDF9",100:"#CCFBEF",200:"#99F6E0",300:"#5FE9D0",400:"#2ED3B7",500:"#15B79E",600:"#0E9384",700:"#107569",800:"#125D56",900:"#134E48"},pink:{25:"#fdf2f8",50:"#fce7f3",100:"#fbcfe8",200:"#f9a8d4",300:"#f472b6",400:"#ec4899",500:"#db2777",600:"#be185d",700:"#9d174d",800:"#831843",900:"#500724"},cyan:{25:"#ecfeff",50:"#cffafe",100:"#a5f3fc",200:"#67e8f9",300:"#22d3ee",400:"#06b6d4",500:"#0891b2",600:"#0e7490",700:"#155e75",800:"#164e63",900:"#083344"}},alpha:{90:"e5",70:"b3",20:"33"},font:{size:{"2xs":"calc(var(--tsrd-font-size) * 0.625)",xs:"calc(var(--tsrd-font-size) * 0.75)",sm:"calc(var(--tsrd-font-size) * 0.875)",md:"var(--tsrd-font-size)"},lineHeight:{xs:"calc(var(--tsrd-font-size) * 1)",sm:"calc(var(--tsrd-font-size) * 1.25)"},weight:{normal:"400",medium:"500",semibold:"600",bold:"700"},fontFamily:{sans:"ui-sans-serif, Inter, system-ui, sans-serif, sans-serif",mono:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"}},border:{radius:{xs:"calc(var(--tsrd-font-size) * 0.125)",sm:"calc(var(--tsrd-font-size) * 0.25)",md:"calc(var(--tsrd-font-size) * 0.375)",full:"9999px"}},size:{0:"0px",.5:"calc(var(--tsrd-font-size) * 0.125)",1:"calc(var(--tsrd-font-size) * 0.25)",1.5:"calc(var(--tsrd-font-size) * 0.375)",2:"calc(var(--tsrd-font-size) * 0.5)",2.5:"calc(var(--tsrd-font-size) * 0.625)",3:"calc(var(--tsrd-font-size) * 0.75)",3.5:"calc(var(--tsrd-font-size) * 0.875)",4:"calc(var(--tsrd-font-size) * 1)",5:"calc(var(--tsrd-font-size) * 1.25)",8:"calc(var(--tsrd-font-size) * 2)"}},Nt=e=>{const{colors:t,font:i,size:r,alpha:u,border:o}=D,{fontFamily:a,lineHeight:c,size:g}=i,l=e?ze.bind({target:e}):ze;return{devtoolsPanelContainer:l`
      direction: ltr;
      position: fixed;
      bottom: 0;
      right: 0;
      z-index: 99999;
      width: 100%;
      max-height: 90%;
      border-top: 1px solid ${t.gray[700]};
      transform-origin: top;
    `,devtoolsPanelContainerVisibility:n=>l`
        visibility: ${n?"visible":"hidden"};
      `,devtoolsPanelContainerResizing:n=>n()?l`
          transition: none;
        `:l`
        transition: all 0.4s ease;
      `,devtoolsPanelContainerAnimation:(n,$)=>n?l`
          pointer-events: auto;
          transform: translateY(0);
        `:l`
        pointer-events: none;
        transform: translateY(${$}px);
      `,logo:l`
      cursor: pointer;
      display: flex;
      flex-direction: column;
      background-color: transparent;
      border: none;
      font-family: ${a.sans};
      gap: ${D.size[.5]};
      padding: 0px;
      &:hover {
        opacity: 0.7;
      }
      &:focus-visible {
        outline-offset: 4px;
        border-radius: ${o.radius.xs};
        outline: 2px solid ${t.blue[800]};
      }
    `,tanstackLogo:l`
      font-size: ${i.size.md};
      font-weight: ${i.weight.bold};
      line-height: ${i.lineHeight.xs};
      white-space: nowrap;
      color: ${t.gray[300]};
    `,routerLogo:l`
      font-weight: ${i.weight.semibold};
      font-size: ${i.size.xs};
      background: linear-gradient(to right, #84cc16, #10b981);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,devtoolsPanel:l`
      display: flex;
      font-size: ${g.sm};
      font-family: ${a.sans};
      background-color: ${t.darkGray[700]};
      color: ${t.gray[300]};

      @media (max-width: 700px) {
        flex-direction: column;
      }
      @media (max-width: 600px) {
        font-size: ${g.xs};
      }
    `,dragHandle:l`
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 4px;
      cursor: row-resize;
      z-index: 100000;
      &:hover {
        background-color: ${t.purple[400]}${u[90]};
      }
    `,firstContainer:l`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${t.gray[700]};
      display: flex;
      flex-direction: column;
    `,routerExplorerContainer:l`
      overflow-y: auto;
      flex: 1;
    `,routerExplorer:l`
      padding: ${D.size[2]};
    `,row:l`
      display: flex;
      align-items: center;
      padding: ${D.size[2]} ${D.size[2.5]};
      gap: ${D.size[2.5]};
      border-bottom: ${t.darkGray[500]} 1px solid;
      align-items: center;
    `,detailsHeader:l`
      font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      position: sticky;
      top: 0;
      z-index: 2;
      background-color: ${t.darkGray[600]};
      padding: 0px ${D.size[2]};
      font-weight: ${i.weight.medium};
      font-size: ${i.size.xs};
      min-height: ${D.size[8]};
      line-height: ${i.lineHeight.xs};
      text-align: left;
      display: flex;
      align-items: center;
    `,maskedBadge:l`
      background: ${t.yellow[900]}${u[70]};
      color: ${t.yellow[300]};
      display: inline-block;
      padding: ${D.size[0]} ${D.size[2.5]};
      border-radius: ${o.radius.full};
      font-size: ${i.size.xs};
      font-weight: ${i.weight.normal};
      border: 1px solid ${t.yellow[300]};
    `,maskedLocation:l`
      color: ${t.yellow[300]};
    `,detailsContent:l`
      padding: ${D.size[1.5]} ${D.size[2]};
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: ${i.size.xs};
    `,routeMatchesToggle:l`
      display: flex;
      align-items: center;
      border: 1px solid ${t.gray[500]};
      border-radius: ${o.radius.sm};
      overflow: hidden;
    `,routeMatchesToggleBtn:(n,$)=>{const b=[l`
        appearance: none;
        border: none;
        font-size: 12px;
        padding: 4px 8px;
        background: transparent;
        cursor: pointer;
        font-family: ${a.sans};
        font-weight: ${i.weight.medium};
      `];if(n){const x=l`
          background: ${t.darkGray[400]};
          color: ${t.gray[300]};
        `;b.push(x)}else{const x=l`
          color: ${t.gray[500]};
          background: ${t.darkGray[800]}${u[20]};
        `;b.push(x)}return $&&b.push(l`
          border-right: 1px solid ${D.colors.gray[500]};
        `),b},detailsHeaderInfo:l`
      flex: 1;
      justify-content: flex-end;
      display: flex;
      align-items: center;
      font-weight: ${i.weight.normal};
      color: ${t.gray[400]};
    `,matchRow:n=>{const v=[l`
        display: flex;
        border-bottom: 1px solid ${t.darkGray[400]};
        cursor: pointer;
        align-items: center;
        padding: ${r[1]} ${r[2]};
        gap: ${r[2]};
        font-size: ${g.xs};
        color: ${t.gray[300]};
      `];if(n){const b=l`
          background: ${t.darkGray[500]};
        `;v.push(b)}return v},matchIndicator:n=>{const v=[l`
        flex: 0 0 auto;
        width: ${r[3]};
        height: ${r[3]};
        background: ${t[n][900]};
        border: 1px solid ${t[n][500]};
        border-radius: ${o.radius.full};
        transition: all 0.25s ease-out;
        box-sizing: border-box;
      `];if(n==="gray"){const b=l`
          background: ${t.gray[700]};
          border-color: ${t.gray[400]};
        `;v.push(b)}return v},matchID:l`
      flex: 1;
      line-height: ${c.xs};
    `,ageTicker:n=>{const v=[l`
        display: flex;
        gap: ${r[1]};
        font-size: ${g.xs};
        color: ${t.gray[400]};
        font-variant-numeric: tabular-nums;
        line-height: ${c.xs};
      `];if(n){const b=l`
          color: ${t.yellow[400]};
        `;v.push(b)}return v},secondContainer:l`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${t.gray[700]};
      display: flex;
      flex-direction: column;
    `,thirdContainer:l`
      flex: 1 1 500px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      height: 100%;
      border-right: 1px solid ${t.gray[700]};

      @media (max-width: 700px) {
        border-top: 2px solid ${t.gray[700]};
      }
    `,fourthContainer:l`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      display: flex;
      flex-direction: column;
    `,routesContainer:l`
      overflow-x: auto;
      overflow-y: visible;
    `,routesRowContainer:(n,$)=>{const b=[l`
        display: flex;
        border-bottom: 1px solid ${t.darkGray[400]};
        align-items: center;
        padding: ${r[1]} ${r[2]};
        gap: ${r[2]};
        font-size: ${g.xs};
        color: ${t.gray[300]};
        cursor: ${$?"pointer":"default"};
        line-height: ${c.xs};
      `];if(n){const x=l`
          background: ${t.darkGray[500]};
        `;b.push(x)}return b},routesRow:n=>{const v=[l`
        flex: 1 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: ${g.xs};
        line-height: ${c.xs};
      `];if(!n){const b=l`
          color: ${t.gray[400]};
        `;v.push(b)}return v},routesRowInner:l`
      display: 'flex';
      align-items: 'center';
      flex-grow: 1;
      min-width: 0;
    `,routeParamInfo:l`
      color: ${t.gray[400]};
      font-size: ${g.xs};
      line-height: ${c.xs};
    `,nestedRouteRow:n=>l`
        margin-left: ${n?0:r[3.5]};
        border-left: ${n?"":`solid 1px ${t.gray[700]}`};
      `,code:l`
      font-size: ${g.xs};
      line-height: ${c.xs};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,matchesContainer:l`
      flex: 1 1 auto;
      overflow-y: auto;
    `,cachedMatchesContainer:l`
      flex: 1 1 auto;
      overflow-y: auto;
      max-height: 50%;
    `,maskedBadgeContainer:l`
      flex: 1;
      justify-content: flex-end;
      display: flex;
    `,matchDetails:l`
      display: flex;
      flex-direction: column;
      padding: ${D.size[2]};
      font-size: ${D.font.size.xs};
      color: ${D.colors.gray[300]};
      line-height: ${D.font.lineHeight.sm};
    `,matchStatus:(n,$)=>{const b=$&&n==="success"?$==="beforeLoad"?"purple":"blue":{pending:"yellow",success:"green",error:"red",notFound:"purple",redirected:"gray"}[n];return l`
        display: flex;
        justify-content: center;
        align-items: center;
        height: 40px;
        border-radius: ${D.border.radius.sm};
        font-weight: ${D.font.weight.normal};
        background-color: ${D.colors[b][900]}${D.alpha[90]};
        color: ${D.colors[b][300]};
        border: 1px solid ${D.colors[b][600]};
        margin-bottom: ${D.size[2]};
        transition: all 0.25s ease-out;
      `},matchDetailsInfo:l`
      display: flex;
      justify-content: flex-end;
      flex: 1;
    `,matchDetailsInfoLabel:l`
      display: flex;
    `,mainCloseBtn:l`
      background: ${t.darkGray[700]};
      padding: ${r[1]} ${r[2]} ${r[1]} ${r[1.5]};
      border-radius: ${o.radius.md};
      position: fixed;
      z-index: 99999;
      display: inline-flex;
      width: fit-content;
      cursor: pointer;
      appearance: none;
      border: 0;
      gap: 8px;
      align-items: center;
      border: 1px solid ${t.gray[500]};
      font-size: ${i.size.xs};
      cursor: pointer;
      transition: all 0.25s ease-out;

      &:hover {
        background: ${t.darkGray[500]};
      }
    `,mainCloseBtnPosition:n=>l`
        ${n==="top-left"?`top: ${r[2]}; left: ${r[2]};`:""}
        ${n==="top-right"?`top: ${r[2]}; right: ${r[2]};`:""}
        ${n==="bottom-left"?`bottom: ${r[2]}; left: ${r[2]};`:""}
        ${n==="bottom-right"?`bottom: ${r[2]}; right: ${r[2]};`:""}
      `,mainCloseBtnAnimation:n=>n?l`
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
      `:l`
          opacity: 1;
          pointer-events: auto;
          visibility: visible;
        `,routerLogoCloseButton:l`
      font-weight: ${i.weight.semibold};
      font-size: ${i.size.xs};
      background: linear-gradient(to right, #98f30c, #00f4a3);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,mainCloseBtnDivider:l`
      width: 1px;
      background: ${D.colors.gray[600]};
      height: 100%;
      border-radius: 999999px;
      color: transparent;
    `,mainCloseBtnIconContainer:l`
      position: relative;
      width: ${r[5]};
      height: ${r[5]};
      background: pink;
      border-radius: 999999px;
      overflow: hidden;
    `,mainCloseBtnIconOuter:l`
      width: ${r[5]};
      height: ${r[5]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      filter: blur(3px) saturate(1.8) contrast(2);
    `,mainCloseBtnIconInner:l`
      width: ${r[4]};
      height: ${r[4]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    `,panelCloseBtn:l`
      position: absolute;
      cursor: pointer;
      z-index: 100001;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
      background-color: ${t.darkGray[700]};
      &:hover {
        background-color: ${t.darkGray[500]};
      }

      top: 0;
      right: ${r[2]};
      transform: translate(0, -100%);
      border-right: ${t.darkGray[300]} 1px solid;
      border-left: ${t.darkGray[300]} 1px solid;
      border-top: ${t.darkGray[300]} 1px solid;
      border-bottom: none;
      border-radius: ${o.radius.sm} ${o.radius.sm} 0px 0px;
      padding: ${r[1]} ${r[1.5]} ${r[.5]} ${r[1.5]};

      &::after {
        content: ' ';
        position: absolute;
        top: 100%;
        left: -${r[2.5]};
        height: ${r[1.5]};
        width: calc(100% + ${r[5]});
      }
    `,panelCloseBtnIcon:l`
      color: ${t.gray[400]};
      width: ${r[2]};
      height: ${r[2]};
    `,navigateButton:l`
      background: none;
      border: none;
      padding: 0 0 0 4px;
      margin: 0;
      color: ${t.gray[400]};
      font-size: ${g.md};
      cursor: pointer;
      line-height: 1;
      vertical-align: middle;
      margin-right: 0.5ch;
      flex-shrink: 0;
      &:hover {
        color: ${t.blue[300]};
      }
    `}};function Me(){const e=xt(mt),[t]=ue(Nt(e));return t}const Vt=e=>{try{const t=localStorage.getItem(e);return typeof t=="string"?JSON.parse(t):void 0}catch{return}};function Ne(e,t){const[i,r]=ue();return Ge(()=>{const o=Vt(e);r(typeof o>"u"||o===null?typeof t=="function"?t():t:o)}),[i,o=>{r(a=>{let c=o;typeof o=="function"&&(c=o(a));try{localStorage.setItem(e,JSON.stringify(c))}catch{}return c})}]}var Jt=L('<span><svg xmlns=http://www.w3.org/2000/svg width=12 height=12 fill=none viewBox="0 0 24 24"><path stroke=currentColor stroke-linecap=round stroke-linejoin=round stroke-width=2 d="M9 18l6-6-6-6">'),Re=L("<div>"),Yt=L("<button><span> "),qt=L("<div><div><button> [<!> ... <!>]"),Kt=L("<button><span></span> 🔄 "),Wt=L("<span>:"),Zt=L("<span>");const vt=({expanded:e,style:t={}})=>{const i=kt();return(()=>{var r=Jt(),u=r.firstChild;return z(o=>{var a=i().expander,c=Q(i().expanderIcon(e));return a!==o.e&&d(r,o.e=a),c!==o.t&&s(u,"class",o.t=c),o},{e:void 0,t:void 0}),r})()};function Qt(e,t){if(t<1)return[];let i=0;const r=[];for(;i<e.length;)r.push(e.slice(i,i+t)),i=i+t;return r}function Xt(e){return Symbol.iterator in e}function Fe({value:e,defaultExpanded:t,pageSize:i=100,filterSubEntries:r,...u}){const[o,a]=ue(!!t),c=()=>a(S=>!S),g=Y(()=>typeof e()),l=Y(()=>{let S=[];const oe=C=>{const h=t===!0?{[C.label]:!0}:t==null?void 0:t[C.label];return{...C,value:()=>C.value,defaultExpanded:h}};return Array.isArray(e())?S=e().map((C,h)=>oe({label:h.toString(),value:C})):e()!==null&&typeof e()=="object"&&Xt(e())&&typeof e()[Symbol.iterator]=="function"?S=Array.from(e(),(C,h)=>oe({label:h.toString(),value:C})):typeof e()=="object"&&e()!==null&&(S=Object.entries(e()).map(([C,h])=>oe({label:C,value:h}))),r?r(S):S}),n=Y(()=>Qt(l(),i)),[$,v]=ue([]),[b,x]=ue(void 0),w=kt(),R=()=>{x(e()())},q=S=>O(Fe,Te({value:e,filterSubEntries:r},u,S));return(()=>{var S=Re();return p(S,(()=>{var oe=Z(()=>!!n().length);return()=>oe()?[(()=>{var C=Yt(),h=C.firstChild,G=h.firstChild;return C.$$click=()=>c(),p(C,O(vt,{get expanded(){return o()??!1}}),h),p(C,()=>u.label,h),p(h,()=>String(g).toLowerCase()==="iterable"?"(Iterable) ":"",G),p(h,()=>l().length,G),p(h,()=>l().length>1?"items":"item",null),z(ie=>{var se=w().expandButton,F=w().info;return se!==ie.e&&d(C,ie.e=se),F!==ie.t&&d(h,ie.t=F),ie},{e:void 0,t:void 0}),C})(),Z(()=>Z(()=>!!(o()??!1))()?Z(()=>n().length===1)()?(()=>{var C=Re();return p(C,()=>l().map((h,G)=>q(h))),z(()=>d(C,w().subEntries)),C})():(()=>{var C=Re();return p(C,()=>n().map((h,G)=>(()=>{var ie=qt(),se=ie.firstChild,F=se.firstChild,K=F.firstChild,ge=K.nextSibling,ce=ge.nextSibling,de=ce.nextSibling;return de.nextSibling,F.$$click=()=>v(H=>H.includes(G)?H.filter(X=>X!==G):[...H,G]),p(F,O(vt,{get expanded(){return $().includes(G)}}),K),p(F,G*i,ge),p(F,G*i+i-1,de),p(se,(()=>{var H=Z(()=>!!$().includes(G));return()=>H()?(()=>{var X=Re();return p(X,()=>h.map(ne=>q(ne))),z(()=>d(X,w().subEntries)),X})():null})(),null),z(H=>{var X=w().entry,ne=Q(w().labelButton,"labelButton");return X!==H.e&&d(se,H.e=X),ne!==H.t&&d(F,H.t=ne),H},{e:void 0,t:void 0}),ie})())),z(()=>d(C,w().subEntries)),C})():null)]:(()=>{var C=Z(()=>g()==="function");return()=>C()?O(Fe,{get label(){return(()=>{var h=Kt(),G=h.firstChild;return h.$$click=R,p(G,()=>u.label),z(()=>d(h,w().refreshValueBtn)),h})()},value:b,defaultExpanded:{}}):[(()=>{var h=Wt(),G=h.firstChild;return p(h,()=>u.label,G),h})()," ",(()=>{var h=Zt();return p(h,()=>Gt(e())),z(()=>d(h,w().value)),h})()]})()})()),z(()=>d(S,w().entry)),S})()}const er=e=>{const{colors:t,font:i,size:r}=D,{fontFamily:u,lineHeight:o,size:a}=i,c=e?ze.bind({target:e}):ze;return{entry:c`
      font-family: ${u.mono};
      font-size: ${a.xs};
      line-height: ${o.sm};
      outline: none;
      word-break: break-word;
    `,labelButton:c`
      cursor: pointer;
      color: inherit;
      font: inherit;
      outline: inherit;
      background: transparent;
      border: none;
      padding: 0;
    `,expander:c`
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: ${r[3]};
      height: ${r[3]};
      padding-left: 3px;
      box-sizing: content-box;
    `,expanderIcon:g=>g?c`
          transform: rotate(90deg);
          transition: transform 0.1s ease;
        `:c`
        transform: rotate(0deg);
        transition: transform 0.1s ease;
      `,expandButton:c`
      display: flex;
      gap: ${r[1]};
      align-items: center;
      cursor: pointer;
      color: inherit;
      font: inherit;
      outline: inherit;
      background: transparent;
      border: none;
      padding: 0;
    `,value:c`
      color: ${t.purple[400]};
    `,subEntries:c`
      margin-left: ${r[2]};
      padding-left: ${r[2]};
      border-left: 2px solid ${t.darkGray[400]};
    `,info:c`
      color: ${t.gray[500]};
      font-size: ${a["2xs"]};
      padding-left: ${r[1]};
    `,refreshValueBtn:c`
      appearance: none;
      border: 0;
      cursor: pointer;
      background: transparent;
      color: inherit;
      padding: 0;
      font-family: ${u.mono};
      font-size: ${a.xs};
    `}};function kt(){const e=xt(mt),[t]=ue(er(e));return t}Ze(["click"]);var tr=L("<div><div></div><div>/</div><div></div><div>/</div><div>");function Ve(e){const t=["s","min","h","d"],i=[e/1e3,e/6e4,e/36e5,e/864e5];let r=0;for(let o=1;o<i.length&&!(i[o]<1);o++)r=o;return new Intl.NumberFormat(navigator.language,{compactDisplay:"short",notation:"compact",maximumFractionDigits:0}).format(i[r])+t[r]}function qe({match:e,router:t}){const i=Me();if(!e)return null;const r=t().looseRoutesById[e.routeId];if(!r.options.loader)return null;const u=Date.now()-e.updatedAt,o=r.options.staleTime??t().options.defaultStaleTime??0,a=r.options.gcTime??t().options.defaultGcTime??30*60*1e3;return(()=>{var c=tr(),g=c.firstChild,l=g.nextSibling,n=l.nextSibling,$=n.nextSibling,v=$.nextSibling;return p(g,()=>Ve(u)),p(n,()=>Ve(o)),p(v,()=>Ve(a)),z(()=>d(c,Q(i().ageTicker(u>o)))),c})()}var rr=L("<button type=button>➔");function Ke({to:e,params:t,search:i,router:r}){const u=Me();return(()=>{var o=rr();return o.$$click=a=>{a.stopPropagation(),r().navigate({to:e,params:t,search:i})},s(o,"title",`Navigate to ${e}`),z(()=>d(o,u().navigateButton)),o})()}Ze(["click"]);var ir=L("<button><div>TANSTACK</div><div>TanStack Router v1"),nr=L("<div><div>"),lr=L("<code> "),je=L("<code>"),or=L("<div><div role=button><div>"),He=L("<div>"),sr=L('<div><button><svg xmlns=http://www.w3.org/2000/svg width=10 height=6 fill=none viewBox="0 0 10 6"><path stroke=currentColor stroke-linecap=round stroke-linejoin=round stroke-width=1.667 d="M1 1l4 4 4-4"></path></svg></button><div><div></div><div><div></div></div></div><div><div><div><span>Pathname</span></div><div><code></code></div><div><div><button type=button>Routes</button><button type=button>Matches</button></div><div><div>age / staleTime / gcTime</div></div></div><div>'),ar=L("<div><span>masked"),ht=L("<div role=button><div>"),dr=L("<div><div><div>Cached Matches</div><div>age / staleTime / gcTime</div></div><div>"),cr=L("<div><div>Match Details</div><div><div><div><div></div></div><div><div>ID:</div><div><code></code></div></div><div><div>State:</div><div></div></div><div><div>Last Updated:</div><div></div></div></div></div><div>Explorer</div><div>"),fr=L("<div>Loader Data"),ur=L("<div><div>Search Params</div><div>");function gr(e){const{className:t,...i}=e,r=Me();return(()=>{var u=ir(),o=u.firstChild,a=o.nextSibling;return Qe(u,Te(i,{get class(){return Q(r().logo,t?t():"")}}),!1,!0),z(c=>{var g=r().tanstackLogo,l=r().routerLogo;return g!==c.e&&d(o,c.e=g),l!==c.t&&d(a,c.t=l),c},{e:void 0,t:void 0}),u})()}function We(e){return(()=>{var t=nr(),i=t.firstChild;return t.style.setProperty("display","flex"),t.style.setProperty("align-items","center"),t.style.setProperty("width","100%"),p(t,()=>e.left,i),i.style.setProperty("flex-grow","1"),i.style.setProperty("min-width","0"),p(i,()=>e.children),p(t,()=>e.right,null),z(()=>d(t,e.class)),t})()}function _t({routerState:e,router:t,route:i,isRoot:r,activeId:u,setActiveId:o}){const a=Me(),c=Y(()=>e().pendingMatches||e().matches),g=Y(()=>e().matches.find($=>$.routeId===i.id)),l=Y(()=>{var $,v;try{if(($=g())!=null&&$.params){const b=(v=g())==null?void 0:v.params,x=i.path||gt(i.id);if(x.startsWith("$")){const w=x.slice(1);if(b[w])return`(${b[w]})`}}return""}catch{return""}}),n=Y(()=>{if(r||!i.path)return;const $=Object.assign({},...c().map(b=>b.params)),v=zt({path:i.fullPath,params:$,leaveWildcards:!1,leaveParams:!1,decodeCharMap:t().pathParamsDecodeCharMap});return v.isMissingParams?void 0:v.interpolatedPath});return(()=>{var $=or(),v=$.firstChild,b=v.firstChild;return v.$$click=()=>{g()&&o(u()===i.id?"":i.id)},p(v,O(We,{get class(){return Q(a().routesRow(!!g()))},get left(){return O(Mt,{get when(){return n()},children:x=>O(Ke,{get to(){return x()},router:t})})},get right(){return O(qe,{get match(){return g()},router:t})},get children(){return[(()=>{var x=lr(),w=x.firstChild;return p(x,()=>r?Je:i.path||gt(i.id),w),z(()=>d(x,a().code)),x})(),(()=>{var x=je();return p(x,l),z(()=>d(x,a().routeParamInfo)),x})()]}}),null),p($,(()=>{var x=Z(()=>{var w;return!!((w=i.children)!=null&&w.length)});return()=>x()?(()=>{var w=He();return p(w,()=>[...i.children].sort((R,q)=>R.rank-q.rank).map(R=>O(_t,{routerState:e,router:t,route:R,activeId:u,setActiveId:o}))),z(()=>d(w,a().nestedRouteRow(!!r))),w})():null})(),null),z(x=>{var w=`Open match details for ${i.id}`,R=Q(a().routesRowContainer(i.id===u(),!!g())),q=Q(a().matchIndicator(Ot(c(),i)));return w!==x.e&&s(v,"aria-label",x.e=w),R!==x.t&&d(v,x.t=R),q!==x.a&&d(b,x.a=q),x},{e:void 0,t:void 0,a:void 0}),$})()}const pr=function({...t}){const{isOpen:i=!0,setIsOpen:r,handleDragStart:u,router:o,routerState:a,shadowDOMTarget:c,...g}=t,{onCloseClick:l}=St(),n=Me(),{className:$,style:v,...b}=g;wt(o);const[x,w]=Ne("tanstackRouterDevtoolsShowMatches",!0),[R,q]=Ne("tanstackRouterDevtoolsActiveRouteId",""),S=Y(()=>[...a().pendingMatches??[],...a().matches,...a().cachedMatches].find(K=>K.routeId===R()||K.id===R())),oe=Y(()=>Object.keys(a().location.search).length),C=Y(()=>({...o(),state:a()})),h=Y(()=>Object.fromEntries(Tt(Object.keys(C()),["state","routesById","routesByPath","flatRoutes","options","manifest"].map(F=>K=>K!==F)).map(F=>[F,C()[F]]).filter(F=>typeof F[1]!="function"&&!["__store","basepath","injectedHtml","subscribers","latestLoadPromise","navigateTimeout","resetNextScroll","tempLocationKey","latestLocation","routeTree","history"].includes(F[0])))),G=Y(()=>{var F;return(F=S())==null?void 0:F.loaderData}),ie=Y(()=>S()),se=Y(()=>a().location.search);return(()=>{var F=sr(),K=F.firstChild,ge=K.firstChild,ce=K.nextSibling,de=ce.firstChild,H=de.nextSibling,X=H.firstChild,ne=ce.nextSibling,Ce=ne.firstChild,pe=Ce.firstChild;pe.firstChild;var B=pe.nextSibling,V=B.firstChild,W=B.nextSibling,N=W.firstChild,J=N.firstChild,ee=J.nextSibling,I=N.nextSibling,te=W.nextSibling;return Qe(F,Te({get class(){return Q(n().devtoolsPanel,"TanStackRouterDevtoolsPanel",$?$():"")},get style(){return v?v():""}},b),!1,!0),p(F,u?(()=>{var f=He();return Ft(f,"mousedown",u,!0),z(()=>d(f,n().dragHandle)),f})():null,K),K.$$click=f=>{r&&r(!1),l(f)},p(de,O(gr,{"aria-hidden":!0,onClick:f=>{r&&r(!1),l(f)}})),p(X,O(Fe,{label:"Router",value:h,defaultExpanded:{state:{},context:{},options:{}},filterSubEntries:f=>f.filter(k=>typeof k.value()!="function")})),p(pe,(()=>{var f=Z(()=>!!a().location.maskedLocation);return()=>f()?(()=>{var k=ar(),U=k.firstChild;return z(T=>{var y=n().maskedBadgeContainer,j=n().maskedBadge;return y!==T.e&&d(k,T.e=y),j!==T.t&&d(U,T.t=j),T},{e:void 0,t:void 0}),k})():null})(),null),p(V,()=>a().location.pathname),p(B,(()=>{var f=Z(()=>!!a().location.maskedLocation);return()=>f()?(()=>{var k=je();return p(k,()=>{var U;return(U=a().location.maskedLocation)==null?void 0:U.pathname}),z(()=>d(k,n().maskedLocation)),k})():null})(),null),J.$$click=()=>{w(!1)},ee.$$click=()=>{w(!0)},p(te,(()=>{var f=Z(()=>!x());return()=>f()?O(_t,{routerState:a,router:o,get route(){return o().routeTree},isRoot:!0,activeId:R,setActiveId:q}):(()=>{var k=He();return p(k,()=>{var U,T;return(T=(U=a().pendingMatches)!=null&&U.length?a().pendingMatches:a().matches)==null?void 0:T.map((y,j)=>(()=>{var _=ht(),A=_.firstChild;return _.$$click=()=>q(R()===y.id?"":y.id),p(_,O(We,{get left(){return O(Ke,{get to(){return y.pathname},get params(){return y.params},get search(){return y.search},router:o})},get right(){return O(qe,{match:y,router:o})},get children(){var P=je();return p(P,()=>`${y.routeId===Je?Je:y.pathname}`),z(()=>d(P,n().matchID)),P}}),null),z(P=>{var E=`Open match details for ${y.id}`,ae=Q(n().matchRow(y===S())),re=Q(n().matchIndicator(Ye(y)));return E!==P.e&&s(_,"aria-label",P.e=E),ae!==P.t&&d(_,P.t=ae),re!==P.a&&d(A,P.a=re),P},{e:void 0,t:void 0,a:void 0}),_})())}),k})()})()),p(ne,(()=>{var f=Z(()=>!!a().cachedMatches.length);return()=>f()?(()=>{var k=dr(),U=k.firstChild,T=U.firstChild,y=T.nextSibling,j=U.nextSibling;return p(j,()=>a().cachedMatches.map(_=>(()=>{var A=ht(),P=A.firstChild;return A.$$click=()=>q(R()===_.id?"":_.id),p(A,O(We,{get left(){return O(Ke,{get to(){return _.pathname},get params(){return _.params},get search(){return _.search},router:o})},get right(){return O(qe,{match:_,router:o})},get children(){var E=je();return p(E,()=>`${_.id}`),z(()=>d(E,n().matchID)),E}}),null),z(E=>{var ae=`Open match details for ${_.id}`,re=Q(n().matchRow(_===S())),fe=Q(n().matchIndicator(Ye(_)));return ae!==E.e&&s(A,"aria-label",E.e=ae),re!==E.t&&d(A,E.t=re),fe!==E.a&&d(P,E.a=fe),E},{e:void 0,t:void 0,a:void 0}),A})())),z(_=>{var A=n().cachedMatchesContainer,P=n().detailsHeader,E=n().detailsHeaderInfo;return A!==_.e&&d(k,_.e=A),P!==_.t&&d(U,_.t=P),E!==_.a&&d(y,_.a=E),_},{e:void 0,t:void 0,a:void 0}),k})():null})(),null),p(F,(()=>{var f=Z(()=>{var k;return!!(S()&&((k=S())!=null&&k.status))});return()=>f()?(()=>{var k=cr(),U=k.firstChild,T=U.nextSibling,y=T.firstChild,j=y.firstChild,_=j.firstChild,A=j.nextSibling,P=A.firstChild,E=P.nextSibling,ae=E.firstChild,re=A.nextSibling,fe=re.firstChild,$e=fe.nextSibling,xe=re.nextSibling,be=xe.firstChild,me=be.nextSibling,ve=T.nextSibling,ye=ve.nextSibling;return p(_,(()=>{var m=Z(()=>{var M,le;return!!(((M=S())==null?void 0:M.status)==="success"&&((le=S())!=null&&le.isFetching))});return()=>{var M;return m()?"fetching":(M=S())==null?void 0:M.status}})()),p(ae,()=>{var m;return(m=S())==null?void 0:m.id}),p($e,(()=>{var m=Z(()=>{var M;return!!((M=a().pendingMatches)!=null&&M.find(le=>{var ke;return le.id===((ke=S())==null?void 0:ke.id)}))});return()=>m()?"Pending":a().matches.find(M=>{var le;return M.id===((le=S())==null?void 0:le.id)})?"Active":"Cached"})()),p(me,(()=>{var m=Z(()=>{var M;return!!((M=S())!=null&&M.updatedAt)});return()=>{var M;return m()?new Date((M=S())==null?void 0:M.updatedAt).toLocaleTimeString():"N/A"}})()),p(k,(()=>{var m=Z(()=>!!G());return()=>m()?[(()=>{var M=fr();return z(()=>d(M,n().detailsHeader)),M})(),(()=>{var M=He();return p(M,O(Fe,{label:"loaderData",value:G,defaultExpanded:{}})),z(()=>d(M,n().detailsContent)),M})()]:null})(),ve),p(ye,O(Fe,{label:"Match",value:ie,defaultExpanded:{}})),z(m=>{var M,le,ke=n().thirdContainer,Ue=n().detailsHeader,Se=n().matchDetails,Be=n().matchStatus((M=S())==null?void 0:M.status,(le=S())==null?void 0:le.isFetching),Ae=n().matchDetailsInfoLabel,we=n().matchDetailsInfo,Pe=n().matchDetailsInfoLabel,Ee=n().matchDetailsInfo,Le=n().matchDetailsInfoLabel,De=n().matchDetailsInfo,Oe=n().detailsHeader,Ie=n().detailsContent;return ke!==m.e&&d(k,m.e=ke),Ue!==m.t&&d(U,m.t=Ue),Se!==m.a&&d(y,m.a=Se),Be!==m.o&&d(j,m.o=Be),Ae!==m.i&&d(A,m.i=Ae),we!==m.n&&d(E,m.n=we),Pe!==m.s&&d(re,m.s=Pe),Ee!==m.h&&d($e,m.h=Ee),Le!==m.r&&d(xe,m.r=Le),De!==m.d&&d(me,m.d=De),Oe!==m.l&&d(ve,m.l=Oe),Ie!==m.u&&d(ye,m.u=Ie),m},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0}),k})():null})(),null),p(F,(()=>{var f=Z(()=>!!oe());return()=>f()?(()=>{var k=ur(),U=k.firstChild,T=U.nextSibling;return p(T,O(Fe,{value:se,get defaultExpanded(){return Object.keys(a().location.search).reduce((y,j)=>(y[j]={},y),{})}})),z(y=>{var j=n().fourthContainer,_=n().detailsHeader,A=n().detailsContent;return j!==y.e&&d(k,y.e=j),_!==y.t&&d(U,y.t=_),A!==y.a&&d(T,y.a=A),y},{e:void 0,t:void 0,a:void 0}),k})():null})(),null),z(f=>{var k=n().panelCloseBtn,U=n().panelCloseBtnIcon,T=n().firstContainer,y=n().row,j=n().routerExplorerContainer,_=n().routerExplorer,A=n().secondContainer,P=n().matchesContainer,E=n().detailsHeader,ae=n().detailsContent,re=n().detailsHeader,fe=n().routeMatchesToggle,$e=!x(),xe=Q(n().routeMatchesToggleBtn(!x(),!0)),be=x(),me=Q(n().routeMatchesToggleBtn(!!x(),!1)),ve=n().detailsHeaderInfo,ye=Q(n().routesContainer);return k!==f.e&&d(K,f.e=k),U!==f.t&&s(ge,"class",f.t=U),T!==f.a&&d(ce,f.a=T),y!==f.o&&d(de,f.o=y),j!==f.i&&d(H,f.i=j),_!==f.n&&d(X,f.n=_),A!==f.s&&d(ne,f.s=A),P!==f.h&&d(Ce,f.h=P),E!==f.r&&d(pe,f.r=E),ae!==f.d&&d(B,f.d=ae),re!==f.l&&d(W,f.l=re),fe!==f.u&&d(N,f.u=fe),$e!==f.c&&(J.disabled=f.c=$e),xe!==f.w&&d(J,f.w=xe),be!==f.m&&(ee.disabled=f.m=be),me!==f.f&&d(ee,f.f=me),ve!==f.y&&d(I,f.y=ve),ye!==f.g&&d(te,f.g=ye),f},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0,c:void 0,w:void 0,m:void 0,f:void 0,y:void 0,g:void 0}),F})()};Ze(["click","mousedown"]);var vr=L('<svg xmlns=http://www.w3.org/2000/svg enable-background="new 0 0 634 633"viewBox="0 0 634 633"><g transform=translate(1)><linearGradient x1=-641.486 x2=-641.486 y1=856.648 y2=855.931 gradientTransform="matrix(633 0 0 -633 406377 542258)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#6bdaff></stop><stop offset=0.319 stop-color=#f9ffb5></stop><stop offset=0.706 stop-color=#ffa770></stop><stop offset=1 stop-color=#ff7373></stop></linearGradient><circle cx=316.5 cy=316.5 r=316.5 fill-rule=evenodd clip-rule=evenodd></circle><defs><filter width=454 height=396.9 x=-137.5 y=412 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=-137.5 y=412 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=89.5 cy=610.5 fill=#015064 fill-rule=evenodd stroke=#00CFE2 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=316.5 y=412 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=316.5 y=412 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=543.5 cy=610.5 fill=#015064 fill-rule=evenodd stroke=#00CFE2 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=-137.5 y=450 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=-137.5 y=450 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=89.5 cy=648.5 fill=#015064 fill-rule=evenodd stroke=#00A8B8 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=316.5 y=450 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=316.5 y=450 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=543.5 cy=648.5 fill=#015064 fill-rule=evenodd stroke=#00A8B8 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=-137.5 y=486 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=-137.5 y=486 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=89.5 cy=684.5 fill=#015064 fill-rule=evenodd stroke=#007782 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=316.5 y=486 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=316.5 y=486 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=543.5 cy=684.5 fill=#015064 fill-rule=evenodd stroke=#007782 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=176.9 height=129.3 x=272.2 y=308 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=176.9 height=129.3 x=272.2 y=308 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><g><path fill=none stroke=#000 stroke-linecap=round stroke-linejoin=bevel stroke-width=11 d="M436 403.2l-5 28.6m-140-90.3l-10.9 62m52.8-19.4l-4.3 27.1"></path><linearGradient x1=-645.656 x2=-646.499 y1=854.878 y2=854.788 gradientTransform="matrix(-184.159 -32.4722 11.4608 -64.9973 -128419.844 34938.836)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ee2700></stop><stop offset=1 stop-color=#ff008e></stop></linearGradient><path fill-rule=evenodd d="M344.1 363l97.7 17.2c5.8 2.1 8.2 6.2 7.1 12.1-1 5.9-4.7 9.2-11 9.9l-106-18.7-57.5-59.2c-3.2-4.8-2.9-9.1.8-12.8 3.7-3.7 8.3-4.4 13.7-2.1l55.2 53.6z"clip-rule=evenodd></path><path fill=#D8D8D8 fill-rule=evenodd stroke=#FFF stroke-linecap=round stroke-linejoin=bevel stroke-width=7 d="M428.3 384.5l.9-6.5m-33.9 1.5l.9-6.5m-34 .5l.9-6.1m-38.9-16.1l4.2-3.9m-25.2-16.1l4.2-3.9"clip-rule=evenodd></path></g><defs><filter width=280.6 height=317.4 x=73.2 y=113.9 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=280.6 height=317.4 x=73.2 y=113.9 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><g><linearGradient x1=-646.8 x2=-646.8 y1=854.844 y2=853.844 gradientTransform="matrix(-100.1751 48.8587 -97.9753 -200.879 19124.773 203538.61)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#a17500></stop><stop offset=1 stop-color=#5d2100></stop></linearGradient><path fill-rule=evenodd d="M192.3 203c8.1 37.3 14 73.6 17.8 109.1 3.8 35.4 2.8 75.2-2.9 119.2l61.2-16.7c-15.6-59-25.2-97.9-28.6-116.6-3.4-18.7-10.8-51.8-22.2-99.6l-25.3 4.6"clip-rule=evenodd></path><linearGradient x1=-635.467 x2=-635.467 y1=852.115 y2=851.115 gradientTransform="matrix(92.6873 4.8575 2.0257 -38.6535 57323.695 36176.047)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M195 183.9s-12.6-22.1-36.5-29.9c-15.9-5.2-34.4-1.5-55.5 11.1 15.9 14.3 29.5 22.6 40.7 24.9 16.8 3.6 51.3-6.1 51.3-6.1z"clip-rule=evenodd></path><linearGradient x1=-636.573 x2=-636.573 y1=855.444 y2=854.444 gradientTransform="matrix(109.9945 5.7646 6.3597 -121.3507 64719.133 107659.336)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5s-47.5-8.5-83.2 15.7c-23.8 16.2-34.3 49.3-31.6 99.3 30.3-27.8 52.1-48.5 65.2-61.9 19.8-20 49.6-53.1 49.6-53.1z"clip-rule=evenodd></path><linearGradient x1=-632.145 x2=-632.145 y1=854.174 y2=853.174 gradientTransform="matrix(62.9558 3.2994 3.5021 -66.8246 37035.367 59284.227)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M195 183.9c-.8-21.9 6-38 20.6-48.2 14.6-10.2 29.8-15.3 45.5-15.3-6.1 21.4-14.5 35.8-25.2 43.4-10.7 7.5-24.4 14.2-40.9 20.1z"clip-rule=evenodd></path><linearGradient x1=-638.224 x2=-638.224 y1=853.801 y2=852.801 gradientTransform="matrix(152.4666 7.9904 3.0934 -59.0251 94939.86 55646.855)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5c31.9-30 64.1-39.7 96.7-29 32.6 10.7 50.8 30.4 54.6 59.1-35.2-5.5-60.4-9.6-75.8-12.1-15.3-2.6-40.5-8.6-75.5-18z"clip-rule=evenodd></path><linearGradient x1=-637.723 x2=-637.723 y1=855.103 y2=854.103 gradientTransform="matrix(136.467 7.1519 5.2165 -99.5377 82830.875 89859.578)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5c35.8-7.6 65.6-.2 89.2 22 23.6 22.2 37.7 49 42.3 80.3-39.8-9.7-68.3-23.8-85.5-42.4-17.2-18.5-32.5-38.5-46-59.9z"clip-rule=evenodd></path><linearGradient x1=-631.79 x2=-631.79 y1=855.872 y2=854.872 gradientTransform="matrix(60.8683 3.19 8.7771 -167.4773 31110.818 145537.61)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5c-33.6 13.8-53.6 35.7-60.1 65.6-6.5 29.9-3.6 63.1 8.7 99.6 27.4-40.3 43.2-69.6 47.4-88 4.2-18.3 5.5-44.1 4-77.2z"clip-rule=evenodd></path><path fill=none stroke=#2F8A00 stroke-linecap=round stroke-width=8 d="M196.5 182.3c-14.8 21.6-25.1 41.4-30.8 59.4-5.7 18-9.4 33-11.1 45.1"></path><path fill=none stroke=#2F8A00 stroke-linecap=round stroke-width=8 d="M194.8 185.7c-24.4 1.7-43.8 9-58.1 21.8-14.3 12.8-24.7 25.4-31.3 37.8m99.1-68.9c29.7-6.7 52-8.4 67-5 15 3.4 26.9 8.7 35.8 15.9m-110.8-5.9c20.3 9.9 38.2 20.5 53.9 31.9 15.7 11.4 27.4 22.1 35.1 32"></path></g><defs><filter width=532 height=633 x=50.5 y=399 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=532 height=633 x=50.5 y=399 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><linearGradient x1=-641.104 x2=-641.278 y1=856.577 y2=856.183 gradientTransform="matrix(532 0 0 -633 341484.5 542657)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#fff400></stop><stop offset=1 stop-color=#3c8700></stop></linearGradient><ellipse cx=316.5 cy=715.5 fill-rule=evenodd clip-rule=evenodd rx=266 ry=316.5></ellipse><defs><filter width=288 height=283 x=391 y=-24 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=288 height=283 x=391 y=-24 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><g><g transform="translate(397 -24)"><linearGradient x1=-1036.672 x2=-1036.672 y1=880.018 y2=879.018 gradientTransform="matrix(227 0 0 -227 235493 199764)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffdf00></stop><stop offset=1 stop-color=#ff9d00></stop></linearGradient><circle cx=168.5 cy=113.5 r=113.5 fill-rule=evenodd clip-rule=evenodd></circle><linearGradient x1=-1017.329 x2=-1018.602 y1=658.003 y2=657.998 gradientTransform="matrix(30 0 0 -1 30558 771)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M30 113H0"></path><linearGradient x1=-1014.501 x2=-1015.774 y1=839.985 y2=839.935 gradientTransform="matrix(26.5 0 0 -5.5 26925 4696.5)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M33.5 79.5L7 74"></path><linearGradient x1=-1016.59 x2=-1017.862 y1=852.671 y2=852.595 gradientTransform="matrix(29 0 0 -8 29523 6971)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M34 146l-29 8"></path><linearGradient x1=-1011.984 x2=-1013.257 y1=863.523 y2=863.229 gradientTransform="matrix(24 0 0 -13 24339 11407)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M45 177l-24 13"></path><linearGradient x1=-1006.673 x2=-1007.946 y1=869.279 y2=868.376 gradientTransform="matrix(20 0 0 -19 20205 16720)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M67 204l-20 19"></path><linearGradient x1=-992.85 x2=-993.317 y1=871.258 y2=870.258 gradientTransform="matrix(13.8339 0 0 -22.8467 13825.796 20131.938)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M94.4 227l-13.8 22.8"></path><linearGradient x1=-953.835 x2=-953.965 y1=871.9 y2=870.9 gradientTransform="matrix(7.5 0 0 -24.5 7278 21605)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M127.5 243.5L120 268"></path><linearGradient x1=244.504 x2=244.496 y1=871.898 y2=870.898 gradientTransform="matrix(.5 0 0 -24.5 45.5 21614)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M167.5 252.5l.5 24.5">');function $t(){const e=Ut();return(()=>{var t=vr(),i=t.firstChild,r=i.firstChild,u=r.nextSibling,o=u.nextSibling,a=o.firstChild,c=o.nextSibling,g=c.firstChild,l=c.nextSibling,n=l.nextSibling,$=n.firstChild,v=n.nextSibling,b=v.firstChild,x=v.nextSibling,w=x.nextSibling,R=w.firstChild,q=w.nextSibling,S=q.firstChild,oe=q.nextSibling,C=oe.nextSibling,h=C.firstChild,G=C.nextSibling,ie=G.firstChild,se=G.nextSibling,F=se.nextSibling,K=F.firstChild,ge=F.nextSibling,ce=ge.firstChild,de=ge.nextSibling,H=de.nextSibling,X=H.firstChild,ne=H.nextSibling,Ce=ne.firstChild,pe=ne.nextSibling,B=pe.nextSibling,V=B.firstChild,W=B.nextSibling,N=W.firstChild,J=W.nextSibling,ee=J.firstChild,I=ee.nextSibling,te=I.nextSibling,f=J.nextSibling,k=f.firstChild,U=f.nextSibling,T=U.firstChild,y=U.nextSibling,j=y.firstChild,_=j.nextSibling,A=_.nextSibling,P=A.nextSibling,E=P.nextSibling,ae=E.nextSibling,re=ae.nextSibling,fe=re.nextSibling,$e=fe.nextSibling,xe=$e.nextSibling,be=xe.nextSibling,me=be.nextSibling,ve=me.nextSibling,ye=ve.nextSibling,m=y.nextSibling,M=m.firstChild,le=m.nextSibling,ke=le.firstChild,Ue=le.nextSibling,Se=Ue.nextSibling,Be=Se.nextSibling,Ae=Be.firstChild,we=Be.nextSibling,Pe=we.firstChild,Ee=we.nextSibling,Le=Ee.firstChild,De=Le.firstChild,Oe=De.nextSibling,Ie=Oe.nextSibling,Xe=Ie.nextSibling,et=Xe.nextSibling,tt=et.nextSibling,rt=tt.nextSibling,it=rt.nextSibling,nt=it.nextSibling,lt=nt.nextSibling,ot=lt.nextSibling,st=ot.nextSibling,at=st.nextSibling,dt=at.nextSibling,ct=dt.nextSibling,ft=ct.nextSibling,ut=ft.nextSibling,Ct=ut.nextSibling;return s(r,"id",`a-${e}`),s(u,"fill",`url(#a-${e})`),s(a,"id",`b-${e}`),s(c,"id",`c-${e}`),s(g,"filter",`url(#b-${e})`),s(l,"mask",`url(#c-${e})`),s($,"id",`d-${e}`),s(v,"id",`e-${e}`),s(b,"filter",`url(#d-${e})`),s(x,"mask",`url(#e-${e})`),s(R,"id",`f-${e}`),s(q,"id",`g-${e}`),s(S,"filter",`url(#f-${e})`),s(oe,"mask",`url(#g-${e})`),s(h,"id",`h-${e}`),s(G,"id",`i-${e}`),s(ie,"filter",`url(#h-${e})`),s(se,"mask",`url(#i-${e})`),s(K,"id",`j-${e}`),s(ge,"id",`k-${e}`),s(ce,"filter",`url(#j-${e})`),s(de,"mask",`url(#k-${e})`),s(X,"id",`l-${e}`),s(ne,"id",`m-${e}`),s(Ce,"filter",`url(#l-${e})`),s(pe,"mask",`url(#m-${e})`),s(V,"id",`n-${e}`),s(W,"id",`o-${e}`),s(N,"filter",`url(#n-${e})`),s(J,"mask",`url(#o-${e})`),s(I,"id",`p-${e}`),s(te,"fill",`url(#p-${e})`),s(k,"id",`q-${e}`),s(U,"id",`r-${e}`),s(T,"filter",`url(#q-${e})`),s(y,"mask",`url(#r-${e})`),s(j,"id",`s-${e}`),s(_,"fill",`url(#s-${e})`),s(A,"id",`t-${e}`),s(P,"fill",`url(#t-${e})`),s(E,"id",`u-${e}`),s(ae,"fill",`url(#u-${e})`),s(re,"id",`v-${e}`),s(fe,"fill",`url(#v-${e})`),s($e,"id",`w-${e}`),s(xe,"fill",`url(#w-${e})`),s(be,"id",`x-${e}`),s(me,"fill",`url(#x-${e})`),s(ve,"id",`y-${e}`),s(ye,"fill",`url(#y-${e})`),s(M,"id",`z-${e}`),s(le,"id",`A-${e}`),s(ke,"filter",`url(#z-${e})`),s(Ue,"id",`B-${e}`),s(Se,"fill",`url(#B-${e})`),s(Se,"mask",`url(#A-${e})`),s(Ae,"id",`C-${e}`),s(we,"id",`D-${e}`),s(Pe,"filter",`url(#C-${e})`),s(Ee,"mask",`url(#D-${e})`),s(De,"id",`E-${e}`),s(Oe,"fill",`url(#E-${e})`),s(Ie,"id",`F-${e}`),s(Xe,"stroke",`url(#F-${e})`),s(et,"id",`G-${e}`),s(tt,"stroke",`url(#G-${e})`),s(rt,"id",`H-${e}`),s(it,"stroke",`url(#H-${e})`),s(nt,"id",`I-${e}`),s(lt,"stroke",`url(#I-${e})`),s(ot,"id",`J-${e}`),s(st,"stroke",`url(#J-${e})`),s(at,"id",`K-${e}`),s(dt,"stroke",`url(#K-${e})`),s(ct,"id",`L-${e}`),s(ft,"stroke",`url(#L-${e})`),s(ut,"id",`M-${e}`),s(Ct,"stroke",`url(#M-${e})`),t})()}var hr=L("<button type=button><div><div></div><div></div></div><div>-</div><div>TanStack Router");function xr({initialIsOpen:e,panelProps:t={},closeButtonProps:i={},toggleButtonProps:r={},position:u="bottom-left",containerElement:o="footer",router:a,routerState:c,shadowDOMTarget:g}){const[l,n]=ue();let $;const[v,b]=Ne("tanstackRouterDevtoolsOpen",e),[x,w]=Ne("tanstackRouterDevtoolsHeight",null),[R,q]=ue(!1),[S,oe]=ue(!1),C=It(),h=Me(),G=(B,V)=>{if(V.button!==0)return;oe(!0);const W={originalHeight:(B==null?void 0:B.getBoundingClientRect().height)??0,pageY:V.pageY},N=ee=>{const I=W.pageY-ee.pageY,te=W.originalHeight+I;w(te),te<70?b(!1):b(!0)},J=()=>{oe(!1),document.removeEventListener("mousemove",N),document.removeEventListener("mouseUp",J)};document.addEventListener("mousemove",N),document.addEventListener("mouseup",J)};v(),Ge(()=>{q(v()??!1)}),Ge(()=>{var B,V,W;if(R()){const N=(V=(B=l())==null?void 0:B.parentElement)==null?void 0:V.style.paddingBottom,J=()=>{var ee;const I=$.getBoundingClientRect().height;(ee=l())!=null&&ee.parentElement&&n(te=>(te!=null&&te.parentElement&&(te.parentElement.style.paddingBottom=`${I}px`),te))};if(J(),typeof window<"u")return window.addEventListener("resize",J),()=>{var ee;window.removeEventListener("resize",J),(ee=l())!=null&&ee.parentElement&&typeof N=="string"&&n(I=>(I.parentElement.style.paddingBottom=N,I))}}else(W=l())!=null&&W.parentElement&&n(N=>(N!=null&&N.parentElement&&N.parentElement.removeAttribute("style"),N))}),Ge(()=>{if(l()){const B=l(),V=getComputedStyle(B).fontSize;B==null||B.style.setProperty("--tsrd-font-size",V)}});const{style:ie={},...se}=t,{style:F={},onClick:K,...ge}=i,{onClick:ce,class:de,...H}=r;if(!C())return null;const X=Y(()=>x()??500),ne=Y(()=>Q(h().devtoolsPanelContainer,h().devtoolsPanelContainerVisibility(!!v()),h().devtoolsPanelContainerResizing(S),h().devtoolsPanelContainerAnimation(R(),X()+16))),Ce=Y(()=>({height:`${X()}px`,...ie||{}})),pe=Y(()=>Q(h().mainCloseBtn,h().mainCloseBtnPosition(u),h().mainCloseBtnAnimation(!!v()),de));return O(Et,{component:o,ref:n,class:"TanStackRouterDevtools",get children(){return[O(Bt.Provider,{value:{onCloseClick:K??(()=>{})},get children(){return O(pr,Te({ref(B){var V=$;typeof V=="function"?V(B):$=B}},se,{router:a,routerState:c,className:ne,style:Ce,get isOpen(){return R()},setIsOpen:b,handleDragStart:B=>G($,B),shadowDOMTarget:g}))}}),(()=>{var B=hr(),V=B.firstChild,W=V.firstChild,N=W.nextSibling,J=V.nextSibling,ee=J.nextSibling;return Qe(B,Te(H,{"aria-label":"Open TanStack Router Devtools",onClick:I=>{b(!0),ce&&ce(I)},get class(){return pe()}}),!1,!0),p(W,O($t,{})),p(N,O($t,{})),z(I=>{var te=h().mainCloseBtnIconContainer,f=h().mainCloseBtnIconOuter,k=h().mainCloseBtnIconInner,U=h().mainCloseBtnDivider,T=h().routerLogoCloseButton;return te!==I.e&&d(V,I.e=te),f!==I.t&&d(W,I.t=f),k!==I.a&&d(N,I.a=k),U!==I.o&&d(J,I.o=U),T!==I.i&&d(ee,I.i=T),I},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0}),B})()]}})}export{xr as FloatingTanStackRouterDevtools,xr as default};
