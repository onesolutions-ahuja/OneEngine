export function resolvePackagePlan(packageKey, packages) {
  const byKey = new Map(packages.map((pkg) => [pkg.packageKey || pkg.package_key, pkg]));
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(key) {
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`Package dependency cycle detected at ${key}`);
    const pkg = byKey.get(key);
    if (!pkg) throw new Error(`Package dependency not found: ${key}`);
    visiting.add(key);
    for (const dependency of pkg.dependencies || []) {
      const dependencyKey = typeof dependency === "string" ? dependency : dependency.packageKey || dependency.package_key;
      if (!dependencyKey) throw new Error(`Invalid dependency declared by ${key}`);
      if (!(typeof dependency === "object" && dependency.optional === true)) {
        const required = byKey.get(dependencyKey);
        if (required && typeof dependency === "object") {
          const minVersion = dependency.minVersion || dependency.min_version;
          const maxVersion = dependency.maxVersion || dependency.max_version;
          if (minVersion && comparePackageVersions(required.version, minVersion) < 0) {
            throw new Error(`Package ${key} requires ${dependencyKey} version ${minVersion} or later`);
          }
          if (maxVersion && comparePackageVersions(required.version, maxVersion) > 0) {
            throw new Error(`Package ${key} requires ${dependencyKey} version ${maxVersion} or earlier`);
          }
          const versionRange = dependency.versionRange || dependency.version_range;
          if (versionRange && !satisfiesPackageVersion(required.version, versionRange)) {
            throw new Error(`Package ${key} requires ${dependencyKey} version range ${versionRange}`);
          }
        }
        visit(dependencyKey);
      }
    }

    visiting.delete(key);
    visited.add(key);
    ordered.push(pkg);
  }

  visit(packageKey);
  return ordered;
}

export function satisfiesPackageVersion(version, range) {
  const value = String(range || "").trim();
  if (!value) return true;
  const comparators = value.split(/\s*,\s*|\s+/).filter(Boolean);
  return comparators.every((comparator) => {
    const match = comparator.match(/^(>=|<=|>|<|=|\^|~)?(\d+\.\d+\.\d+(?:[-+].*)?)$/);
    if (!match) throw new Error(`Invalid package version range: ${range}`);
    const [, operator = "=", target] = match;
    const compared = comparePackageVersions(version, target);
    if (operator === ">=") return compared >= 0;
    if (operator === "<=") return compared <= 0;
    if (operator === ">") return compared > 0;
    if (operator === "<") return compared < 0;
    if (operator === "^") {
      const base = target.split(".").map(Number);
      const upper = base[0] > 0 ? [base[0] + 1, 0, 0] : base[1] > 0 ? [0, base[1] + 1, 0] : [0, 0, base[2] + 1];
      return compared >= 0 && comparePackageVersions(version, upper.join(".")) < 0;
    }
    if (operator === "~") {
      const base = target.split(".").map(Number);
      const upper = [base[0], base[1] + 1, 0];
      return compared >= 0 && comparePackageVersions(version, upper.join(".")) < 0;
    }
    return compared === 0;
  });
}

export function comparePackageVersions(left, right) {
  const parse = (version) => {
    const match = String(version || "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) throw new Error(`Invalid semantic package version: ${version}`);
    return match.slice(1).map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function resolveFeaturePlan(packageDefinitionEntry, requestedFeatures = []) {
  const features = Array.isArray(packageDefinitionEntry?.manifest?.optionalFeatures)
    ? packageDefinitionEntry.manifest.optionalFeatures
    : [];
  const byKey = new Map(features.map((feature) => [feature.key, feature]));
  const selected = [];
  for (const key of requestedFeatures) {
    const feature = byKey.get(key);
    if (!feature) throw new Error(`Optional feature not found: ${key}`);
    selected.push(feature);
    for (const dependency of feature.dependencies || []) {
      if (!selected.some((item) => item.key === dependency)) {
        const dependencyFeature = byKey.get(dependency);
        if (!dependencyFeature) throw new Error(`Feature dependency not found: ${dependency}`);
        selected.push(dependencyFeature);
      }
    }
  }
  return selected;
}

