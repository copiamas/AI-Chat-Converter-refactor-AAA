export {};
declare global {
  interface Window { electronAPI?: { convert: (data: { html: string; fileName: string; options: Record<string, unknown> }) => Promise<{ markdown: string; fileName: string; outputName: string }> } }
  interface ReaderResource { original:string; local_path:string|null; kind:string; status:"found"|"missing"|"blocked"|"remote" }
  interface ReaderBlock { id:string; type:string; text:string; level:number|null; language:string|null; href:string|null; src:string|null; alt:string|null; rows:string[][] }
  interface ReaderPreview { limited:boolean; reasons:string[] }
  interface ReaderDocument { schema_version:number; id:string; source_path:string; source_name:string; title:string; origin:string|null; captured_at:string|null; detected_type:string; confidence:number; status:"ready"|"partial"|"review"|"failed"; blocks:ReaderBlock[]; turns:{author:string;text:string}[]; resources:ReaderResource[]; diagnostics:{level:string;code:string;message:string}[]; preview?:ReaderPreview }
  interface Window { readerAPI?: { choose():Promise<ReaderDocument|null>; importFile(file:File):Promise<ReaderDocument>; exportMarkdown(id:string):Promise<string|null>; previewShow(id:string):Promise<ReaderPreview>; previewHide():Promise<void>; previewBounds(bounds:{x:number;y:number;width:number;height:number}):Promise<void>; openExternal(id:string):Promise<boolean> } }
}
