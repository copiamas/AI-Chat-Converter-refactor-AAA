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

if (startIdx < 0 || endIdx < 0) {
  console.error('[patch] prepare() sanitizer block not found');
  process.exit(1);
}

const REPLACEMENT =
  "parsed.querySelectorAll('script').forEach(n=>n.remove());" +
  "parsed.querySelectorAll('meta[http-equiv=\"content-security-policy\"]').forEach(n=>n.remove());" +
  "parsed.querySelectorAll('meta[http-equiv=\"refresh\"]').forEach(n=>n.remove());" +
  "parsed.querySelectorAll('*').forEach(el=>{" +
  "for(const attr of Array.from(el.attributes))if(/^on/i.test(attr.name))el.removeAttribute(attr.name);" +
  "});";

html = html.slice(0, startIdx) + REPLACEMENT + html.slice(endIdx + END.length);

// ---- 2. Publish active document on openDoc() --------------------------------
const OPENDOC_ANCHOR = 'function openDoc(doc){\n   active=doc;';
const OPENDOC_NEW = "function openDoc(doc){window.__activeReaderDoc=doc;\n   active=doc;";

if (html.indexOf(OPENDOC_ANCHOR) === -1) {
  console.error('[patch] openDoc() prologue not found');
  process.exit(1);
}
html = html.replace(OPENDOC_ANCHOR, OPENDOC_NEW);

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
    '        if(frame)frame.style.visibility="hidden";',
    '        setTimeout(function(){',
    '          var b=getBounds();',
    '          if(b){api.previewBounds(b).catch(function(){});}',
    '          api.previewShow(doc.id).catch(function(){});',
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

fs.writeFileSync(target, html, 'utf8');
console.log(`[patch] patched ${path.basename(target)} (${html.length} bytes)`);
