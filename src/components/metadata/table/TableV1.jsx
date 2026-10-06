import { ChevronLeft, ChevronRight } from "lucide-react";

function value(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function Pagination({ total, maxRecords, page, onPageChange }) {
  const pages = Math.max(1, Math.ceil((Number(total) || 0) / Math.max(1, maxRecords)));
  if (pages <= 1) return null;
  return <div className="flex items-center justify-end gap-2 pt-1">
    <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" disabled={page <= 1} onClick={() => onPageChange?.(Math.max(1, page - 1))}><ChevronLeft size={13}/> Previous</button>
    <span className="text-xs">Page {page} of {pages}</span>
    <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" disabled={page >= pages} onClick={() => onPageChange?.(Math.min(pages, page + 1))}>Next <ChevronRight size={13}/></button>
  </div>;
}

export default function TableV1({ node, builderMode = false, onRecordClick, data = {} }) {
  const collection = node?.collection || {};
  const records = Array.isArray(data.records) ? data.records : [];
  const fields = Array.isArray(data.fields) && data.fields.length ? data.fields : (collection.fields || []);
  const maxRecords = collection.maxRecords || 10;
  const shown = records.slice(0, maxRecords);
  const columns = (fields.length ? fields : Object.keys(shown[0] || {})).filter((field) => field !== "id").slice(0, 7);
  const placeholder = data.placeholder === true;
  return <div className="space-y-2">
    <div className="overflow-x-auto rounded-xl border" style={{borderColor:"var(--border-color, #e5e7eb)"}}>
      <table className="w-full text-left text-sm"><thead><tr style={{background:"var(--muted-background, #f8fafc)"}}>
        {columns.map((field)=><th key={field} className="px-3 py-2 text-xs font-semibold">{String(field).replace(/_/g," ")}</th>)}
      </tr></thead><tbody>
        {placeholder && !shown.length ? Array.from({length:3}).map((_,i)=><tr key={i}>{(columns.length?columns:["name","status","created_at"]).map((field)=><td key={field} className="px-3 py-2 text-xs">{String(field).replace(/_/g," ")} …</td>)}</tr>) : shown.map((record,i)=>{
          const clickable=node?.clickable!==false && node?.interaction?.type!=="none" && !builderMode;
          return <tr key={record.id||i} onClick={clickable?()=>onRecordClick?.({record,node}):undefined} className={clickable?"cursor-pointer transition-colors hover:bg-slate-50":undefined}>
            {columns.map((field)=><td key={field} className="border-t px-3 py-2 text-xs">{value(record[field])}</td>)}
          </tr>;
        })}
        {data.loading?<tr><td colSpan={Math.max(1,columns.length)} className="px-3 py-3 text-xs">Loading records…</td></tr>:null}
        {!data.loading&&data.error&&!shown.length?<tr><td colSpan={Math.max(1,columns.length)} className="px-3 py-3 text-xs">{data.error}</td></tr>:null}
      </tbody></table>
    </div>
    {!builderMode&&!placeholder?<Pagination total={data.total||0} maxRecords={maxRecords} page={data.page||1} onPageChange={data.onPageChange}/>:null}
  </div>;
}
