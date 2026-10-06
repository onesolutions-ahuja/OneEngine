export default function ContainerV1({ node, children }) {
  const columns = Math.max(1, Math.min(4, Number(node?.columns) || 2));
  return <div className="cpb-container-grid" style={{gridTemplateColumns:`repeat(${columns}, minmax(0, 1fr))`,gap:(Number(node?.spacing)||3)*4}}>{children}</div>;
}
