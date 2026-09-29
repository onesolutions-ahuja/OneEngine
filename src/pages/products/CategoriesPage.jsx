import { useEffect, useState } from 'react'
import { Edit, Plus, RefreshCw, Save, X } from 'lucide-react'
import { apiRequest } from '../../services/api'

export default function CategoriesPage({ onBack }) {
  const [categories,setCategories]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [editingId,setEditingId]=useState('')
  const [editName,setEditName]=useState('')
  const [editOrder,setEditOrder]=useState(0)
  const [saving,setSaving]=useState(false)
  const [showNew,setShowNew]=useState(false)
  const [newName,setNewName]=useState('')
  const [newOrder,setNewOrder]=useState(0)

  const load=async()=>{
    try{
      setLoading(true);setError('')
      const r=await apiRequest('/api/categories?all=true')
      if(!r?.success)throw new Error(r?.message||'Unable to load categories')
      setCategories(Array.isArray(r.data)?r.data:[])
    }catch(err){setError(err?.message||'Unable to load categories')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  const startEdit=(category)=>{
    setEditingId(category.id)
    setEditName(category.name||'')
    setEditOrder(Number(category.display_order||0))
    setError('')
  }
  const cancelEdit=()=>{setEditingId('');setEditName('');setEditOrder(0)}
  const saveEdit=async()=>{
    if(!editName.trim())return setError('Category name is required')
    try{
      setSaving(true);setError('')
      const r=await apiRequest(`/api/categories/${encodeURIComponent(editingId)}`,{
        method:'PUT',
        body:JSON.stringify({name:editName.trim(),displayOrder:Number(editOrder)||0,active:true}),
      })
      if(!r?.success)throw new Error(r?.message||'Unable to update category')
      cancelEdit();await load()
    }catch(err){setError(err?.message||'Unable to update category')}
    finally{setSaving(false)}
  }
  const create=async()=>{
    if(!newName.trim())return
    try{
      setSaving(true);setError('')
      const r=await apiRequest('/api/categories',{method:'POST',body:JSON.stringify({name:newName.trim(),displayOrder:Number(newOrder)||0})})
      if(!r?.success)throw new Error(r?.message||'Unable to create category')
      setShowNew(false);setNewName('');setNewOrder(0);await load()
    }catch(err){setError(err?.message||'Unable to create category')}
    finally{setSaving(false)}
  }
  const deactivate=async(category)=>{
    if(!window.confirm(`Deactivate "${category.name}"? Products will be uncategorised.`))return
    try{
      setSaving(true);setError('')
      const r=await apiRequest(`/api/categories/${encodeURIComponent(category.id)}`,{method:'DELETE'})
      if(!r?.success)throw new Error(r?.message||'Unable to deactivate category')
      await load()
    }catch(err){setError(err?.message||'Unable to deactivate category')}
    finally{setSaving(false)}
  }

  return <section className="module-page categories-page">
    <header className="module-page-header">
      <div><span>Catalogue</span><h1>Categories</h1><p>Manage Product Master categories and display order.</p></div>
      <div className="module-header-actions">
        {onBack?<button type="button" onClick={onBack}>Back to Products</button>:null}
        <button type="button" onClick={load}><RefreshCw size={14}/> Refresh</button>
        <button type="button" className="module-primary-button" onClick={()=>setShowNew(true)}><Plus size={14}/> Add Category</button>
      </div>
    </header>
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}
    <section className="module-page-card">
      {loading?<div className="module-state">Loading categories…</div>:!categories.length?<div className="module-state">No categories. Create your first Product category.</div>:<div className="module-table-wrap no-border">
        <table>
          <thead><tr><th>Name</th><th>Display order</th><th>Products</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{categories.map(category=><tr key={category.id}>
            <td>{editingId===category.id?<input className="category-inline-input" value={editName} disabled={saving} onChange={e=>setEditName(e.target.value)}/>:<strong>{category.name}</strong>}</td>
            <td>{editingId===category.id?<input className="category-inline-number" type="number" min="0" value={editOrder} disabled={saving} onChange={e=>setEditOrder(Number(e.target.value))}/>:category.display_order||0}</td>
            <td>{category.product_count||0}</td>
            <td><span className={`module-status-pill ${category.active===false?'is-inactive':'is-active'}`}>{category.active===false?'Inactive':'Active'}</span></td>
            <td><div className="category-actions">{editingId===category.id?<>
              <button type="button" onClick={saveEdit} disabled={saving||!editName.trim()} title="Save"><Save size={13}/></button>
              <button type="button" onClick={cancelEdit} disabled={saving} title="Cancel"><X size={13}/></button>
            </>:<>
              <button type="button" onClick={()=>startEdit(category)} disabled={saving} title="Edit category"><Edit size={13}/></button>
              <button type="button" onClick={()=>deactivate(category)} disabled={saving||category.active===false} title="Deactivate category"><X size={13}/></button>
            </>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    {showNew?<div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setShowNew(false)}>
      <section className="module-modal category-modal">
        <header><div><strong>New Category</strong><span>Create a Product Master category.</span></div><button type="button" onClick={()=>setShowNew(false)}><X size={16}/></button></header>
        <div className="module-modal-body category-form">
          <label className="module-input-label"><span>Name</span><input value={newName} disabled={saving} placeholder="e.g. Seasonal" onChange={e=>setNewName(e.target.value)}/></label>
          <label className="module-input-label"><span>Display order</span><input type="number" min="0" value={newOrder} disabled={saving} onChange={e=>setNewOrder(Number(e.target.value))}/></label>
        </div>
        <footer className="module-modal-footer"><button type="button" onClick={()=>setShowNew(false)} disabled={saving}>Cancel</button><button type="button" className="module-primary-button" onClick={create} disabled={saving||!newName.trim()}>{saving?'Creating…':'Create'}</button></footer>
      </section>
    </div>:null}
  </section>
}
