export function cx(...values) {
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).join(' ')
}

export function Toggle({checked=false,onChange,disabled=false,...props}){
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`mac-switch ${checked?'is-on':''}`}
      onClick={() => onChange?.({ target: { checked: !checked } })}
      {...props}
    >
      <span />
    </button>
  )
}
