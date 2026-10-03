import {useEffect,useRef,useState} from 'react'
function clean(source) {
 const doc=new DOMParser().parseFromString(String(source||''),'text/html')
 const allowed=new Set(['P','BR','B','STRONG','I','EM','U','UL','OL','LI','DIV','SPAN'])
 for(const element of [...doc.body.querySelectorAll('*')]){
  if(!allowed.has(element.tagName)){element.replaceWith(doc.createTextNode(element.textContent||''));continue}
  for(const attribute of [...element.attributes])element.removeAttribute(attribute.name)
 }
 return doc.body.innerHTML
}
export default function RichText({value='',onChange,label='Text'}) {
 const editor=useRef(null),[rich,setRich]=useState(true)
 useEffect(()=>{if(editor.current&&document.activeElement!==editor.current)editor.current.innerHTML=clean(value)},[value,rich])
 const command=(name)=>{editor.current?.focus();document.execCommand(name,false);onChange(clean(editor.current?.innerHTML||''))}
 return <div className="b3-richtext"><div className="b3-richtext-toolbar"><button type="button" aria-label="Bold" onMouseDown={e=>e.preventDefault()} onClick={()=>command('bold')}><b>B</b></button><button type="button" aria-label="Italic" onMouseDown={e=>e.preventDefault()} onClick={()=>command('italic')}><i>I</i></button><button type="button" aria-label="Underline" onMouseDown={e=>e.preventDefault()} onClick={()=>command('underline')}><u>U</u></button><button type="button" aria-label="Bulleted list" onClick={()=>command('insertUnorderedList')}>• List</button><button type="button" aria-label="Toggle rich text source" onClick={()=>setRich(v=>!v)}>{rich?'View Source':'Rich Text'}</button></div>{rich?<div ref={editor} role="textbox" aria-label={label} aria-multiline="true" contentEditable suppressContentEditableWarning onInput={()=>onChange(clean(editor.current.innerHTML))} onPaste={e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));onChange(clean(editor.current.innerHTML))}}/>:<textarea aria-label={label} rows={7} value={value} onChange={e=>onChange(e.target.value)}/>}</div>
}
