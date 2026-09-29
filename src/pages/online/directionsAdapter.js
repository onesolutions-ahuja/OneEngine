export function buildDirectionsUrl(destination, { platform = "web" } = {}) {
  const address = String(destination || "").trim();
  if (!address) throw new Error("A delivery destination is required");
  const encoded = encodeURIComponent(address);
  if (String(platform).toLowerCase() === "ios") return `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
}
