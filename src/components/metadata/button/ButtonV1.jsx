export default function ButtonV1({ node, builderMode = false, onClick }) {
  return <button
    type="button"
    className={`onepos-btn ${node?.variant === "secondary" ? "onepos-btn-secondary" : "onepos-btn-primary"}`}
    disabled={builderMode}
    onClick={builderMode ? undefined : () => onClick?.(node)}
  >{node?.label || "Button"}</button>;
}
