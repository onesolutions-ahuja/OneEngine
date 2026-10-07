export function BrandIcon({ src = "", title = "" }) {
  if (!src) return null;
  return <img src={src} alt={title || ""} title={title || undefined} width="100%" height="100%" draggable="false" />;
}

export function WindowsIcon({ src = "", title = "Platform compatibility" }) {
  return <BrandIcon src={src} title={title} />;
}
