import { useEffect, useMemo, useRef, useState } from "react";
const labels={ready:"Pronto",partial:"Parcial",review:"Revisão necessária",failed:"Falha"};
const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).split("|").at(-1)||"Falha inesperada.";
export default function App(){
 const [doc,setDoc]=useState<ReaderDocument|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[query,setQuery]=useState(""),[tab,setTab]=useState<"content"|"original">("content"),[preview,setPreview]=useState<ReaderPreview|null>(null);
 const previewHost=useRef<HTMLDivElement>(null);
 const results=useMemo(()=>!doc||!query.trim()?[]:[...doc.turns.map((x,i)=>({id:`turn-${i}`,type:"Mensagem",label:x.author,text:x.text})),...doc.blocks.map(x=>({id:x.id,type:x.type,label:x.type,text:x.text||x.href||x.alt||""}))].filter(x=>x.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0,50),[doc,query]);
 async function load(run:()=>Promise<ReaderDocument|null>){setBusy(true);setError("");setNotice("");try{const d=await run();if(d){await window.readerAPI?.previewHide();setDoc(d);setPreview(d.preview||null);setTab("content")}}catch(e){setError(message(e))}finally{setBusy(false)}}
 useEffect(() => {
   const api = window.readerAPI;
   if (!api) return;
   if (tab !== "original" || !doc) {
     void api.previewHide().catch(e => setError(message(e)));
     return;
   }
   let active = true;
   const host = previewHost.current;
   if (!host) return;
   const fail = (e: unknown) => { if (active) setError(message(e)); };
   const update = () => {
     const box = host.getBoundingClientRect();
     void api.previewBounds({ x: box.x, y: box.y, width: box.width, height: box.height }).catch(fail);
   };
   const observer = new ResizeObserver(update);
   observer.observe(host);
   window.addEventListener("resize", update);
   window.addEventListener("scroll", update, true);
   update();
   void api.previewShow(doc.id).then(info => {
     if (active) { setPreview(info); update(); }
   }).catch(fail);
   return () => {
     active = false;
     observer.disconnect();
     window.removeEventListener("resize", update);
     window.removeEventListener("scroll", update, true);
     void api.previewHide().catch(() => {});
   };
 }, [tab, doc]);
 useEffect(()=>{if(tab==="original")previewHost.current?.closest(".reader")?.scrollTo(0,0)},[tab]);
 useEffect(()=>()=>{void window.readerAPI?.previewHide()},[]);
 const choose=()=>window.readerAPI?load(()=>window.readerAPI!.choose()):setError("Abra o aplicativo Electron para acessar arquivos locais.");
 async function openExternal(){if(!doc||!window.readerAPI)return;try{await window.readerAPI.openExternal(doc.id)}catch(e){setError(message(e))}}
 async function exportMd(){if(!doc||!window.readerAPI)return;try{const p=await window.readerAPI.exportMarkdown(doc.id);if(p)setNotice(`Markdown salvo em ${p}`)}catch(e){setError(message(e))}}
 function drop(e:React.DragEvent){e.preventDefault();const file=e.dataTransfer.files[0];if(!file)return;if(!window.readerAPI)return setError("Arrastar arquivos exige o aplicativo Electron.");void load(()=>window.readerAPI!.importFile(file))}
 return <main className="shell" onDragOver={e=>e.preventDefault()} onDrop={drop}><header><div className="brand"><span className="mark">L</span><div><strong>Leitor local</strong><small>Arquivo inteligente · privado no seu computador</small></div></div><button className="primary" onClick={choose} disabled={busy}>{busy?"Importando…":"Importar HTML"}</button></header>
 {!doc?<section className="empty"><div className="emptyIcon">⌁</div><p className="eyebrow">UM ARQUIVO POR VEZ</p><h1>Traga uma página salva<br/>de volta à vida.</h1><p>Arraste um <b>.html</b> salvo pelo navegador ou escolha o arquivo.</p><button className="primary large" onClick={choose}>Escolher página HTML</button><span>Limite de 20 MiB · processamento local</span>{error&&<div className="error">{error}</div>}</section>:<div className="workspace"><aside><p className="eyebrow">DOCUMENTO</p><h2>{doc.title}</h2><div className={`status ${doc.status}`}>{labels[doc.status]}</div><dl><dt>Origem</dt><dd>{doc.source_name}</dd><dt>Tipo</dt><dd>{doc.detected_type}</dd><dt>Data detectada</dt><dd>{doc.captured_at||"Não informada"}</dd><dt>Confiança</dt><dd>{Math.round(doc.confidence*100)}%</dd></dl><p className="eyebrow">RECURSOS</p><div className="resourceStats"><span>{doc.resources.filter(r=>r.status==="found").length} encontrados</span><span>{doc.resources.filter(r=>r.status==="missing").length} ausentes</span><span>{doc.resources.filter(r=>r.status==="blocked").length} bloqueados</span></div>{doc.diagnostics.map(d=><div className="diagnostic" key={d.code}>{d.message}</div>)}</aside><section className="reader"><div className="toolbar"><div className="tabs"><button className={tab==="content"?"active":""} onClick={()=>setTab("content")}>Conteúdo extraído</button><button className={tab==="original"?"active":""} onClick={()=>setTab("original")}>Página original</button></div><button className="export" onClick={exportMd}>Exportar Markdown</button></div>
 {tab==="content"?<><div className="search"><input aria-label="Buscar no documento" placeholder="Buscar texto, links, tabelas ou código…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<span>{results.length} ocorrência(s)</span>}</div>{query&&<div className="results">{results.map(r=><button key={r.id} onClick={()=>globalThis.document.getElementById(r.id)?.scrollIntoView({behavior:"smooth"})}><small>{r.type}</small><b>{r.label}</b><span>{r.text.slice(0,120)}</span></button>)}</div>}<article>{doc.turns.length?doc.turns.map((t,i)=><section id={`turn-${i}`} className={`turn ${t.author==="usuário"?"user":"ai"}`} key={i}><label>{t.author}</label><div>{t.text}</div></section>):doc.blocks.map(b=><Block block={b} key={b.id}/>)}</article></>:<div className="original"><div className="fidelity" title={preview?.reasons.join(" ")}>Página salva · JavaScript e recursos locais habilitados. Conexões externas bloqueadas. <button className="inlineLink" onClick={openExternal}>Abrir arquivo no navegador</button></div><div ref={previewHost} className="nativePreview" aria-label="Página original incorporada"/></div>}{(error||notice)&&<div className={error?"toast error":"toast"}>{error||notice}</div>}</section></div>}</main>}
function Block({block:b}:{block:ReaderBlock}){if(b.type==="heading")return <h2 id={b.id}>{b.text}</h2>;if(b.type==="code")return <pre id={b.id}><code>{b.text}</code></pre>;if(b.type==="table")return <div className="tableWrap" id={b.id}><table><tbody>{b.rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div>;if(b.type==="link")return <p id={b.id}><a>{b.text||b.href}</a></p>;return <p id={b.id}>{b.text||b.alt}</p>}
