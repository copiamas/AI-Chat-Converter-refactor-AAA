// Patch the OpenDesign artifact so the "original page" tab works inside Electron.
//
// The upstream OpenDesign build produces an HTML reader that pre-processes the
// imported document in two passes:
//   - cleanContent(): produces the "extracted content" view (the safe one).
//   - prepare(): produces `doc.original`, which is the source HTML shown in
//     the "original page" tab. The upstream prepare() is destructive: it
//     strips <iframe>, <link rel=stylesheet>, href, src, srcset, every form
//     attribute, and finally injects a CSP `default-src 'none'` into <head>.
//     The Electron preview then blocks the page.
//
// What this patch does:
//   1. Replaces prepare()'s sanitizer with a minimal XSS-only one: drop
//      <script>, drop on* attributes, drop any CSP/refresh meta tags. iframe,
//      <link rel=stylesheet>, href, src, srcset, <style>, inline images etc.
//      are preserved so the document renders.
//   2. Publishes the currently-open document to `window.__activeReaderDoc`
//      so the bridge script below can find it.
//   3. Appends a small bridge script that listens for clicks on the
//      "original" / "content" tabs and forwards them to the Electron
//      `readerAPI.previewShow` IPC when running inside Electron. When
//      `readerAPI` is missing the tab keeps the original iframe srcdoc.
//
// Bridge notes:
//   - Our capture-phase click handler runs BEFORE OpenDesign's own onclick
//     handler (`$('originalTab').onclick=...`). When our handler runs,
//     `originalPanel.hidden` is still true, so getBoundingClientRect() would
//     return all zeros. The fix is to defer bounds lookup + preview show to
//     setTimeout(0) — by then the tab switch has happened and the panel is
//     laid out.
//   - `getBounds()` falls back to document.body when the panel is hidden,
//     so a stale preview can still be repositioned even before the user
//     switches tabs.
//   - We hide the in-page iframe via CSS instead of clearing its srcdoc,
//     so it acts as a free fallback if `previewShow` fails.
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('usage: patch-opendesign.cjs <path-to-index.html>');
  process.exit(2);
}
if (!fs.existsSync(target)) {
  console.error(`[patch] file not found: ${target}`);
  process.exit(2);
}

let html = fs.readFileSync(target, 'utf8');

// ---- 1. Replace prepare() sanitizer block -----------------------------------
const START = "parsed.querySelectorAll('script,iframe,object,embed,form,base,link,meta[http-equiv],audio,video,source,svg,template').forEach(n=>n.remove());";
const END = 'parsed.head.prepend(policy);';

const startIdx = html.indexOf(START);
const endIdx = startIdx >= 0 ? html.indexOf(END, startIdx) : -1;

const REPLACEMENT =
  "parsed.querySelectorAll('script').forEach(n=>n.remove());" +
  "parsed.querySelectorAll('meta[http-equiv=\"content-security-policy\"]').forEach(n=>n.remove());" +
  "parsed.querySelectorAll('meta[http-equiv=\"refresh\"]').forEach(n=>n.remove());" +
  "parsed.querySelectorAll('*').forEach(el=>{" +
  "for(const attr of Array.from(el.attributes))if(/^on/i.test(attr.name))el.removeAttribute(attr.name);" +
  "});";

if (startIdx >= 0 && endIdx >= 0) {
  html = html.slice(0, startIdx) + REPLACEMENT + html.slice(endIdx + END.length);
} else if (html.includes("parsed.querySelectorAll('script').forEach(n=>n.remove());")) {
  console.log('[patch] sanitizer already applied, skipping replacement');
} else {
  console.error('[patch] prepare() sanitizer block not found');
  process.exit(1);
}

// ---- 2. Publish active document on openDoc() --------------------------------
const OPENDOC_ANCHOR = 'function openDoc(doc){\n   active=doc;';
const OPENDOC_NEW = "function openDoc(doc){window.__activeReaderDoc=doc;\n   active=doc;";

if (html.indexOf(OPENDOC_ANCHOR) !== -1) {
  html = html.replace(OPENDOC_ANCHOR, OPENDOC_NEW);
} else if (html.includes('function openDoc(doc){window.__activeReaderDoc=doc;')) {
  console.log('[patch] openDoc() bridge already applied, skipping replacement');
} else {
  console.error('[patch] openDoc() prologue not found');
  process.exit(1);
}

// ---- 3. Append bridge script ------------------------------------------------
if (html.indexOf('readerAPI.previewShow') !== -1) {
  console.log('[patch] bridge script already present, skipping append');
} else {
  const BRIDGE = [
    '<script>',
    '  (function(){',
    '    var api=window.readerAPI;',
    '    var frame=document.getElementById("originalFrame");',
    '    var originalPanel=document.getElementById("originalPanel");',
    '    function getBounds(){',
    '      var el=(originalPanel&&!originalPanel.hidden)?originalPanel:document.body;',
    '      var r=el.getBoundingClientRect();',
    '      if(r.width<50||r.height<50)return null;',
    '      return {x:Math.round(r.left),y:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)};',
    '    }',
    '    function showOriginal(){',
    '      var doc=window.__activeReaderDoc;',
    '      if(!doc)return;',
    '      if(api&&doc.id){',
    '        if(frame){frame.srcdoc=doc.original;frame.style.visibility="visible";}',
    '        setTimeout(function(){',
    '          var b=getBounds();',
    '          if(b){api.previewBounds(b).catch(function(){});}',
    '          api.previewShow(doc.id).then(function(info){if(!info||!info.expired){if(frame)frame.style.visibility="hidden";}}).catch(function(){if(frame)frame.style.visibility="visible";});',
    '        },0);',
    '      }else if(frame){',
    '        frame.style.visibility="visible";',
    '        frame.srcdoc=doc.original;',
    '      }',
    '    }',
    '    function hideOriginal(){',
    '      if(frame)frame.style.visibility="visible";',
    '      if(api){try{api.previewHide();}catch(e){}}',
    '    }',
    '    function reposition(){',
    '      if(!api)return;',
    '      var sel=document.querySelector(\'[role="tab"][aria-selected="true"]\');',
    '      if(sel&&sel.id==="originalTab"){',
    '        var b=getBounds();',
    '        if(b){api.previewBounds(b).catch(function(){});}',
    '      }',
    '    }',
    '    document.querySelectorAll(\'[role="tab"]\').forEach(function(tab){',
    '      tab.addEventListener("click",function(){',
    '        if(tab.id==="originalTab")showOriginal();',
    '        else if(tab.id==="contentTab")hideOriginal();',
    '      },true);',
    '    });',
    '    var tablist=document.querySelector(\'[role="tablist"]\');',
    '    if(tablist)tablist.addEventListener("keydown",function(){',
    '      setTimeout(function(){',
    '        var sel=document.querySelector(\'[role="tab"][aria-selected="true"]\');',
    '        if(sel&&sel.id==="originalTab")showOriginal();',
    '        else hideOriginal();',
    '      },0);',
    '    },true);',
    '    window.addEventListener("resize",reposition);',
    '    var detailsBtn=document.getElementById("detailsButton");',
    '    if(detailsBtn)detailsBtn.addEventListener("click",function(){setTimeout(reposition,50);});',
    '    var menuBtn=document.getElementById("menuButton");',
    '    if(menuBtn)menuBtn.addEventListener("click",function(){setTimeout(reposition,50);});',
    '  })();',
    '</script>'
  ].join('');
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyEnd < 0) {
    console.error('[patch] </body> not found');
    process.exit(1);
  }
  html = html.slice(0, bodyEnd) + BRIDGE + html.slice(bodyEnd);
}

// ---- 4. Make conversation authorship explicit in extracted content ---------
// OpenDesign's generic extractor keeps labels such as "Você enviou:" and
// "Resposta do Modo IA:" as ordinary paragraphs. Group those paragraphs into
// readable user/AI cards so the author is unambiguous in the content tab.
const CONVERSATION_CSS = String.raw`.conversation-turn{margin:28px 0;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface)}.conversation-role-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 14px;font-size:12px;line-height:1.3}.conversation-role-bar strong{font-weight:650}.conversation-role-bar span{opacity:.82}.conversation-turn.user{border-color:oklch(55% .12 155 / .55)}.conversation-turn.user .conversation-role-bar{background:linear-gradient(135deg,oklch(78% .13 160),oklch(68% .13 155));color:oklch(18% .04 155)}.conversation-turn.ai{border-color:oklch(58% .12 255 / .55)}.conversation-turn.ai .conversation-role-bar{background:linear-gradient(135deg,oklch(62% .14 255),oklch(54% .16 275));color:white}.conversation-message{padding:16px 18px 18px}.conversation-message>*:first-child{margin-top:0}.conversation-message>*:last-child{margin-bottom:0}.conversation-turn.ai .conversation-message{background:oklch(25% .03 255 / .24)}`;
if (!html.includes('.conversation-turn{')) {
  const styleEnd = html.indexOf('</style>');
  if (styleEnd < 0) {
    console.error('[patch] </style> not found');
    process.exit(1);
  }
  html = html.slice(0, styleEnd) + CONVERSATION_CSS + html.slice(styleEnd);
}

const CONVERSATION_HELPER = String.raw` function decorateConversation(content){
   const roleOf=text=>{
     if(/^\s*(?:Você enviou|Você disse|Usuário|Usuario|User)\s*:/i.test(text)) return 'user';
     if(/^\s*(?:Resposta do Modo IA|Resposta da IA|A IA respondeu|IA respondeu|Assistant|ChatGPT)\b[^:]*:/i.test(text)) return 'ai';
     return null;
   };
   const stripPrefix=(node,role)=>{
     const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);const text=walker.nextNode();if(!text)return;
     text.nodeValue=text.nodeValue.replace(role==='user'?/^\s*(?:Você enviou|Você disse|Usuário|Usuario|User)\s*:\s*/i:/^\s*(?:Resposta do Modo IA|Resposta da IA|A IA respondeu|IA respondeu|Assistant|ChatGPT)\b[^:]*:\s*/i,'');
   };
   let nodes=Array.from(content.children),i=0;
   while(i<nodes.length){
     const role=roleOf(nodes[i].textContent||'');if(!role){i++;continue;}
     const section=document.createElement('section');section.className='conversation-turn '+role;
     const bar=document.createElement('div');bar.className='conversation-role-bar';bar.innerHTML=role==='user'?'<strong>👤 Usuário</strong><span>Você enviou</span>':'<strong>🤖 IA</strong><span>A IA respondeu</span>';
     const message=document.createElement('div');message.className='conversation-message';const first=nodes[i];content.insertBefore(section,first);stripPrefix(first,role);
     let j=i;while(j<nodes.length){const nextRole=roleOf(nodes[j].textContent||'');if(j!==i&&nextRole)break;message.append(nodes[j]);j++;}
     section.append(bar,message);nodes.splice(i,j-i,section);i++;
   }
 }`;
if (!html.includes('function decorateConversation')) {
  const prepareAnchor = ' function prepare(raw, name, size, modified, sample=false){';
  const contentAnchor = ' const content=document.createElement(\'div\');content.append(cleanContent(root));';
  if (!html.includes(prepareAnchor) || !html.includes(contentAnchor)) {
    console.error('[patch] prepare() conversation anchors not found');
    process.exit(1);
  }
  html = html.replace(prepareAnchor, CONVERSATION_HELPER + prepareAnchor);
  html = html.replace(contentAnchor, contentAnchor + 'decorateConversation(content);');
}

// ---- 5. Register imported files in Electron for the original preview ------
const IMPORT_ANCHOR = 'const doc=prepare(raw,file.name,file.size,file.lastModified);if(token!==job)return;docs.unshift(doc);openDoc(doc);';
const IMPORT_NEW = 'const doc=prepare(raw,file.name,file.size,file.lastModified);const nativeDoc=window.readerAPI?.importFile?await window.readerAPI.importFile(file):null;if(nativeDoc?.id)doc.id=nativeDoc.id;if(token!==job)return;docs.unshift(doc);openDoc(doc);';
if (html.includes(IMPORT_ANCHOR)) {
  html = html.replace(IMPORT_ANCHOR, IMPORT_NEW);
} else if (html.includes('const nativeDoc=window.readerAPI?.importFile?await window.readerAPI.importFile(file):null;')) {
  console.log('[patch] Electron import registration already applied, skipping replacement');
} else {
  console.error('[patch] importFile() anchor not found');
  process.exit(1);
}

fs.writeFileSync(target, html, 'utf8');
console.log(`[patch] patched ${path.basename(target)} (${html.length} bytes)`);
