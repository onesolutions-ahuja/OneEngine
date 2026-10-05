import jwt from "jsonwebtoken";

// Generic restricted-session gate. Restricted tokens carry an explicit list of
// method/path scopes supplied by metadata/session policy; core runtime knows no app routes.
export function createRestrictedSessionGate() {
  return function restrictedSessionGate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return next();
    let payload;
    try { payload = jwt.decode(header.substring(7)); } catch { return next(); }
    if (!payload?.restricted_session) return next();
    const scopes = Array.isArray(payload.allowed_api_scopes) ? payload.allowed_api_scopes : [];
    const method = String(req.method || "GET").toUpperCase();
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const allowed = scopes.some((scope) => {
      if (!scope || typeof scope !== "object") return false;
      const scopeMethod = String(scope.method || "*").toUpperCase();
      const scopePath = String(scope.path || "");
      return (scopeMethod === "*" || scopeMethod === method) && scopePath === path;
    });
    if (allowed) return next();
    return res.status(403).json({ success:false, message:"Not available for this restricted session" });
  };
}
