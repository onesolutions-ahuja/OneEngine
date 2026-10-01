import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const scanRoots = ["server", "src", "scripts", "tests"];
const extensions = new Set([".js",".jsx",".mjs",".cjs",".ts",".tsx"]);
const skipDirs = new Set(["node_modules","dist","build",".git","coverage"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (extensions.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const runtimeForbiddenTokens = [
  "is_platform_developer",
  "isPlatformDeveloper",
  "is_superadmin",
  "platform.manage",
  "canManagePlatform",
  "platform_developer_company_access",
  "PLATFORM_MANAGE_PERMISSION",
];

const runtimePrefixes = [
  path.join(root, "server", "routes") + path.sep,
  path.join(root, "server", "services") + path.sep,
  path.join(root, "src") + path.sep,
];
const runtimeFiles = new Set([
  path.join(root, "server", "server.js"),
]);

const genericAccessFilesWithoutOneEngineOverride = new Set([
  "server/services/platformReportSecurity.js",
  "server/services/platformSearch.js",
  "server/services/platformObjectNavigation.js",
]);

const findings = [];
for (const base of scanRoots) {
  for (const file of walk(path.join(root, base))) {
    const text = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    const isRuntime = runtimeFiles.has(file) || runtimePrefixes.some((prefix) => file.startsWith(prefix));
    if (!isRuntime) continue;

    if (genericAccessFilesWithoutOneEngineOverride.has(relative) && text.includes("oneengine.manage")) {
      findings.push({
        file: relative,
        line: text.slice(0, text.indexOf("oneengine.manage")).split("\n").length,
        rule: "generic-access-bypass",
        token: "oneengine.manage must not replace granular Object/module RBAC",
      });
    }

    for (const token of runtimeForbiddenTokens) {
      let from = 0;
      while (true) {
        const index = text.indexOf(token, from);
        if (index < 0) break;
        const line = text.slice(0, index).split("\n").length;
        findings.push({ file: relative, line, rule: "legacy-authority-token", token });
        from = index + token.length;
      }
    }

    if (relative.startsWith("server/")) {
      const lines = text.split("\n");
      const suspicious = [
        /(?:role_name|roleName|role\.name|api_key|username|email)[^\n]{0,100}(?:===|==|\.includes\()[^\n]{0,100}(?:admin|administrator|owner|superadmin|engine_manager|platform_developer)/i,
        /(?:admin|administrator|owner|superadmin|engine_manager|platform_developer)[^\n]{0,100}(?:===|==|\.includes\()[^\n]{0,100}(?:role_name|roleName|role\.name|api_key|username|email)/i,
        /(?:permission|authorize|hasPermission)[^\n]{0,160}\|\|[^\n]{0,160}(?:roleName|role_name|username|email|isPlatform|is_platform)/i,
      ];
      lines.forEach((lineText, idx) => {
        if (suspicious.some((re) => re.test(lineText))) {
          findings.push({
            file: relative,
            line: idx + 1,
            rule: "possible-identity-authority",
            token: lineText.trim().slice(0, 220),
          });
        }
      });
    }
  }
}

if (findings.length) {
  console.error("RBAC authority audit failed. Runtime authority must come only from permission codes.");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.token}`);
  }
  process.exit(1);
}

console.log("RBAC authority audit passed: no legacy identity/role-name authority paths found.");
