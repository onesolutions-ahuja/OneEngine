import { randomUUID } from "node:crypto";

const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

export function clientIp(req) {
  const value = String(req?.ip || req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "").split(",")[0].trim();
  return value.replace(/^::ffff:/, "") || null;
}

export async function loadSecuritySettings(db, companyId) {
  if (!companyId) return null;
  const result = await db(
    `SELECT * FROM identity_security_settings WHERE company_id=$1`,
    [companyId]
  );
  if (result.rows[0]) return result.rows[0];
  const inserted = await db(
    `INSERT INTO identity_security_settings(company_id) VALUES($1)
     ON CONFLICT(company_id) DO UPDATE SET company_id=EXCLUDED.company_id
     RETURNING *`,
    [companyId]
  );
  return inserted.rows[0];
}

export async function resolveAccessPolicy(db, { companyId, userId, roleId }) {
  if (!companyId) return null;
  const result = await db(
    `SELECT *
       FROM identity_access_policies
      WHERE company_id=$1 AND active=TRUE
        AND (
          (scope_type='USER' AND scope_id=$2)
          OR (scope_type='ROLE' AND scope_id=$3)
          OR (scope_type='COMPANY' AND scope_id IS NULL)
        )
      ORDER BY CASE scope_type WHEN 'USER' THEN 3 WHEN 'ROLE' THEN 2 ELSE 1 END DESC,
               priority ASC, updated_at DESC
      LIMIT 1`,
    [companyId, userId || null, roleId || null]
  );
  return result.rows[0] || null;
}

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    day: String(parts.weekday || "").toLowerCase(),
    minutes: Number(parts.hour || 0) * 60 + Number(parts.minute || 0),
  };
}

function hhmmMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function loginHoursAllowed(policy, now = new Date(), fallbackTimeZone = "UTC") {
  const hours = policy?.login_hours && typeof policy.login_hours === "object" ? policy.login_hours : {};
  if (!Object.keys(hours).length) return true;
  const timeZone = policy?.timezone || fallbackTimeZone || "UTC";
  let parts;
  try { parts = zonedParts(now, timeZone); } catch { parts = zonedParts(now, "UTC"); }
  const rule = hours[parts.day];
  if (!rule) return true;
  if (rule.enabled === false || rule.blocked === true) return false;
  const start = hhmmMinutes(rule.start);
  const end = hhmmMinutes(rule.end);
  if (start == null || end == null) return true;
  if (start === end) return false;
  if (start < end) return parts.minutes >= start && parts.minutes < end;
  return parts.minutes >= start || parts.minutes < end;
}

export function validateLoginHours(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Login hours must be an object");
  const normalized = {};
  for (const [key, rule] of Object.entries(value)) {
    const day = String(key).toLowerCase();
    if (!DAY_KEYS.includes(day)) throw new Error(`Unsupported login-hours day: ${key}`);
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error(`Invalid login-hours rule for ${day}`);
    if (rule.enabled === false || rule.blocked === true) {
      normalized[day] = { enabled: false, start: "00:00", end: "00:00" };
      continue;
    }
    const start = hhmmMinutes(rule.start);
    const end = hhmmMinutes(rule.end);
    if (start == null || end == null) throw new Error(`Login hours for ${day} require HH:MM start and end`);
    normalized[day] = { enabled: true, start: rule.start, end: rule.end };
  }
  return normalized;
}

export async function ipMatchesRanges(db, { companyId, policyId = null, type, ip }) {
  if (!ip || !companyId) return false;
  const result = await db(
    `SELECT EXISTS(
       SELECT 1 FROM identity_security_ip_ranges
        WHERE company_id=$1 AND range_type=$2 AND active=TRUE
          AND (($3::uuid IS NULL AND policy_id IS NULL) OR policy_id=$3)
          AND family(start_ip)=family($4::inet)
          AND $4::inet >= start_ip AND $4::inet <= end_ip
     ) AS matches,
     COUNT(*)::int AS range_count
     FROM identity_security_ip_ranges
     WHERE company_id=$1 AND range_type=$2 AND active=TRUE
       AND (($3::uuid IS NULL AND policy_id IS NULL) OR policy_id=$3)`,
    [companyId, type, policyId, ip]
  );
  return { matches: result.rows[0]?.matches === true, count: Number(result.rows[0]?.range_count || 0) };
}

export async function accessDecision(db, { companyId, userId, roleId, ip, now = new Date() }) {
  if (!companyId) return { allowed: true, settings: null, policy: null, trustedNetwork: false };
  const [settings, policy, company] = await Promise.all([
    loadSecuritySettings(db, companyId),
    resolveAccessPolicy(db, { companyId, userId, roleId }),
    db("SELECT timezone FROM companies WHERE id=$1", [companyId]),
  ]);
  const timezone = policy?.timezone || company.rows[0]?.timezone || "UTC";
  if (!loginHoursAllowed(policy, now, timezone)) {
    return { allowed: false, code: "LOGIN_HOURS_RESTRICTED", reason: "Login is not permitted at this time", settings, policy };
  }
  if (policy?.enforce_login_ip) {
    const range = await ipMatchesRanges(db, { companyId, policyId: policy.id, type: "LOGIN_ALLOWED", ip });
    if (range.count === 0) {
      return { allowed: false, code: "LOGIN_IP_POLICY_EMPTY", reason: "Login IP policy has no allowed ranges", settings, policy };
    }
    if (!range.matches) {
      return { allowed: false, code: "LOGIN_IP_RESTRICTED", reason: "Login from this IP address is not permitted", settings, policy };
    }
  }
  const trusted = await ipMatchesRanges(db, { companyId, policyId: null, type: "TRUSTED", ip });
  return { allowed: true, settings, policy, trustedNetwork: trusted.matches };
}

export function passwordPolicyError(password, settings) {
  const value = String(password || "");
  const minimum = Math.max(8, Number(settings?.minimum_password_length || 12));
  if (value.length < minimum) return `Password must be at least ${minimum} characters`;
  const mode = settings?.password_complexity || "THREE_OF_FOUR";
  const lower = /[a-z]/.test(value);
  const upper = /[A-Z]/.test(value);
  const number = /[0-9]/.test(value);
  const special = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(value);
  const groups = [lower, upper, number, special].filter(Boolean).length;
  if (mode === "ALPHA_NUMERIC" && (!/[A-Za-z]/.test(value) || !number)) return "Password must include alphabetic and numeric characters";
  if (mode === "ALPHA_NUMERIC_SPECIAL" && (!/[A-Za-z]/.test(value) || !number || !special)) return "Password must include alphabetic, numeric, and special characters";
  if (mode === "NUM_UPPER_LOWER" && (!number || !upper || !lower)) return "Password must include a number, uppercase letter, and lowercase letter";
  if (mode === "NUM_UPPER_LOWER_SPECIAL" && (!number || !upper || !lower || !special)) return "Password must include a number, uppercase letter, lowercase letter, and special character";
  if (mode === "THREE_OF_FOUR" && groups < 3) return "Password must include at least 3 of: lowercase, uppercase, number, special character";
  return null;
}

export async function assertPasswordAllowed(db, { companyId, userId, password, bcrypt, enforceMinimumLifetime = false }) {
  const settings = await loadSecuritySettings(db, companyId);
  const error = passwordPolicyError(password, settings);
  if (error) return { ok: false, message: error, settings };
  const currentPassword = await db("SELECT password_hash FROM users WHERE id=$1 AND company_id=$2 LIMIT 1", [userId, companyId]);
  if (currentPassword.rows[0]?.password_hash && await bcrypt.compare(password, currentPassword.rows[0].password_hash)) {
    return { ok: false, message: "New password must be different from the current password", settings };
  }
  const state = await db("SELECT password_changed_at FROM identity_user_security_state WHERE user_id=$1", [userId]);
  const changedAt = state.rows[0]?.password_changed_at;
  if (enforceMinimumLifetime && changedAt && Number(settings.minimum_password_lifetime_hours || 0) > 0) {
    const ageMs = Date.now() - new Date(changedAt).getTime();
    if (ageMs < Number(settings.minimum_password_lifetime_hours) * 3600000) {
      return { ok: false, message: `Password can't be changed again until the minimum password lifetime has elapsed`, settings };
    }
  }
  const count = Number(settings.password_history_count || 0);
  if (count > 0) {
    const history = await db(
      "SELECT password_hash FROM identity_password_history WHERE user_id=$1 ORDER BY changed_at DESC LIMIT $2",
      [userId, count]
    );
    for (const row of history.rows) {
      if (await bcrypt.compare(password, row.password_hash)) {
        return { ok: false, message: `Password can't match any of your last ${count} passwords`, settings };
      }
    }
  }
  return { ok: true, settings };
}

export async function recordPasswordChange(db, { companyId, userId, previousHash, settings = null, revokeSessions = false, keepSessionId = null }) {
  if (previousHash) {
    await db(
      "INSERT INTO identity_password_history(company_id,user_id,password_hash) VALUES($1,$2,$3)",
      [companyId, userId, previousHash]
    );
  }
  await db(
    `INSERT INTO identity_user_security_state(user_id,company_id,password_changed_at,failed_login_attempts,locked_until,sessions_revoked_at,updated_at)
     VALUES($1,$2,NOW(),0,NULL,CASE WHEN $3 THEN NOW() ELSE NULL END,NOW())
     ON CONFLICT(user_id) DO UPDATE SET company_id=EXCLUDED.company_id,password_changed_at=NOW(),
       failed_login_attempts=0,locked_until=NULL,
       sessions_revoked_at=CASE WHEN $3 THEN NOW() ELSE identity_user_security_state.sessions_revoked_at END,
       updated_at=NOW()`,
    [userId, companyId, revokeSessions]
  );
  if (revokeSessions) {
    await db(
      `UPDATE identity_sessions SET revoked_at=NOW(),revoke_reason='PASSWORD_CHANGED'
       WHERE user_id=$1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id<>$2)`,
      [userId, keepSessionId]
    );
  }
  const policy = settings || await loadSecuritySettings(db, companyId);
  const count = Number(policy?.password_history_count || 0);
  if (count >= 0) {
    await db(
      `DELETE FROM identity_password_history
       WHERE user_id=$1 AND id NOT IN (
         SELECT id FROM identity_password_history WHERE user_id=$1 ORDER BY changed_at DESC LIMIT $2
       )`,
      [userId, Math.max(count, 1)]
    );
  }
}

export async function loginState(db, userId) {
  const result = await db("SELECT * FROM identity_user_security_state WHERE user_id=$1", [userId]);
  return result.rows[0] || null;
}

export async function registerFailedLogin(db, { user, settings }) {
  const max = Number(settings?.maximum_invalid_login_attempts || 0);
  const lockoutMinutes = Number(settings?.lockout_minutes || 0);
  const result = await db(
    `INSERT INTO identity_user_security_state(user_id,company_id,failed_login_attempts,last_failed_login_at,locked_until,updated_at)
     VALUES($1,$2,1,NOW(),CASE WHEN $3>0 AND 1 >= $3 THEN NOW()+($4::text||' minutes')::interval ELSE NULL END,NOW())
     ON CONFLICT(user_id) DO UPDATE SET
       company_id=EXCLUDED.company_id,
       failed_login_attempts=identity_user_security_state.failed_login_attempts+1,
       last_failed_login_at=NOW(),
       locked_until=CASE WHEN $3>0 AND identity_user_security_state.failed_login_attempts+1 >= $3
                         THEN NOW()+($4::text||' minutes')::interval ELSE identity_user_security_state.locked_until END,
       updated_at=NOW()
     RETURNING *`,
    [user.id, user.company_id || null, max, lockoutMinutes]
  );
  return result.rows[0];
}

export async function clearFailedLogin(db, user) {
  await db(
    `INSERT INTO identity_user_security_state(user_id,company_id,failed_login_attempts,locked_until,updated_at)
     VALUES($1,$2,0,NULL,NOW())
     ON CONFLICT(user_id) DO UPDATE SET failed_login_attempts=0,locked_until=NULL,updated_at=NOW()`,
    [user.id, user.company_id || null]
  );
}

export async function writeLoginHistory(db, { user = null, identifier = null, status, reason = null, ip = null, userAgent = null, authMethod = "PASSWORD", sessionId = null }) {
  try {
    await db(
      `INSERT INTO identity_login_history(company_id,user_id,login_identifier,status,reason,ip_address,user_agent,auth_method,session_id)
       VALUES($1,$2,$3,$4,$5,$6::inet,$7,$8,$9)`,
      [user?.company_id || null, user?.id || null, identifier || user?.username || null, status, reason, ip, userAgent, authMethod, sessionId]
    );
  } catch (error) {
    console.error("identity login history write failed", error?.message || error);
  }
}

export async function createTrackedSession(db, { user, ip, userAgent, authMethod = "PASSWORD", settings = null }) {
  const config = settings || (user.company_id ? await loadSecuritySettings(db, user.company_id) : null);
  const hours = Math.max(1, Number(config?.maximum_session_hours || 12));
  const id = randomUUID();
  await db(
    `INSERT INTO identity_sessions(id,company_id,user_id,expires_at,ip_address,user_agent,auth_method)
     VALUES($1,$2,$3,NOW()+($4::text||' hours')::interval,$5::inet,$6,$7)`,
    [id, user.company_id || null, user.id, hours, ip, userAgent, authMethod]
  );
  return id;
}

export async function enforceTrackedSession(db, req) {
  const user = req.user;
  if (!user?.id || !user?.companyId) return { allowed: true };
  const ip = clientIp(req);
  const decision = await accessDecision(db, { companyId: user.companyId, userId: user.id, roleId: user.roleId, ip });
  if (!decision.allowed) return decision;

  const enforceIp = decision.settings?.enforce_login_ip_every_request === true;
  if (enforceIp && decision.policy?.enforce_login_ip) {
    const range = await ipMatchesRanges(db, { companyId: user.companyId, policyId: decision.policy.id, type: "LOGIN_ALLOWED", ip });
    if (!range.matches) return { allowed: false, code: "LOGIN_IP_RESTRICTED", reason: "Current IP address is outside the allowed login range" };
  }

  if (!user.sid) return { allowed: true, legacySession: true, decision };
  const sessionResult = await db(
    `SELECT * FROM identity_sessions WHERE id=$1 AND user_id=$2 AND company_id=$3 LIMIT 1`,
    [user.sid, user.id, user.companyId]
  );
  const session = sessionResult.rows[0];
  if (!session || session.revoked_at) return { allowed: false, code: "SESSION_REVOKED", reason: "Session has been revoked" };
  if (new Date(session.expires_at).getTime() <= Date.now()) return { allowed: false, code: "SESSION_EXPIRED", reason: "Session has expired" };

  const state = await loginState(db, user.id);
  if (state?.sessions_revoked_at && new Date(state.sessions_revoked_at).getTime() >= new Date(session.issued_at).getTime()) {
    return { allowed: false, code: "SESSION_REVOKED", reason: "Session has been revoked" };
  }

  const inactivityMinutes = Number(decision.settings?.session_inactivity_minutes || 0);
  if (inactivityMinutes > 0 && Date.now() - new Date(session.last_seen_at).getTime() > inactivityMinutes * 60000) {
    await db("UPDATE identity_sessions SET revoked_at=NOW(),revoke_reason='INACTIVITY_TIMEOUT' WHERE id=$1", [session.id]);
    return { allowed: false, code: "SESSION_INACTIVITY_TIMEOUT", reason: "Session expired due to inactivity" };
  }

  if (decision.settings?.lock_session_to_ip === true && session.ip_address && ip && String(session.ip_address) !== String(ip)) {
    await db("UPDATE identity_sessions SET revoked_at=NOW(),revoke_reason='IP_CHANGED' WHERE id=$1", [session.id]);
    return { allowed: false, code: "SESSION_IP_CHANGED", reason: "Session is locked to its original IP address" };
  }

  if (Date.now() - new Date(session.last_seen_at).getTime() > 60000) {
    await db("UPDATE identity_sessions SET last_seen_at=NOW() WHERE id=$1", [session.id]);
  }
  return { allowed: true, decision, session };
}
