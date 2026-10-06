const PROVIDER_BRANDS = new Map([
  ["uber_eats", "uber-eats"],
  ["deliveroo", "deliveroo"],
  ["just_eat", "just-eat"],
  ["shopify", "shopify"],
  ["xero_accounting", "xero-accounting"],
  ["xero", "xero"],
  ["sage_business_cloud_accounting", "sage-business-cloud-accounting"],
  ["sage_accounting", "sage-business-cloud-accounting"],
  ["sage", "sage"],
  ["whatsapp", "whatsapp"],
  ["one_connect_dojo", "dojo"],
  ["dojo", "dojo"],
  ["one_connect_sumup", "sumup"],
  ["sumup", "sumup"],
  ["one_connect_square", "square"],
  ["square", "square"],
  ["mews", "mews"],
  ["mews_pms", "mews"],
  ["fourth", "fourth"], ["deputy", "deputy"], ["caterbook", "caterbook"], ["go_upc", "go-upc"],
  ["adobe_commerce", "adobe-commerce"], ["magento", "adobe-commerce"],
  ["one_connect_bopp", "one-connect-bopp"], ["bopp", "one-connect-bopp"],
  ["one_connect_wonderful", "one-connect-wonderful"], ["wonderful", "one-connect-wonderful"],
  ["one_connect_vyne", "one-connect-vyne"], ["vyne", "one-connect-vyne"],
  ["one_connect_stripe", "one-connect-stripe"], ["stripe", "one-connect-stripe"],
  ["one_connect_google", "one-connect-google"], ["google", "one-connect-google"],
]);

export function isStorefrontPackage(item) {
  if (!item || item.visible !== true || item.system_only === true) return false;
  if (item.publication_state && item.publication_state !== "PUBLISHED") return false;
  return true;
}

export function storefrontStatus(item) {
  return String(item?.storefront_state || "AVAILABLE").toUpperCase();
}

export function installedPackageVersionState(item) {
  const installedVersion = item?.tenant_app_installed_version || "—";
  const latestVersion = item?.tenant_app_available_version || item?.version || installedVersion;
  const updateStatus = String(item?.tenant_app_update_status || "CURRENT").toUpperCase();
  const labels = {
    CURRENT: "Current",
    UPDATE_AVAILABLE: "Update available",
    QUEUED: "Queued",
    UPDATING: "Updating",
    FAILED: "Failed",
    CONFLICT: "Conflict",
    CURRENT_AFTER_UPDATE: "Current",
    ROLLBACK_REQUIRED: "Rollback required",
  };
  return {
    installedVersion,
    latestVersion,
    updateStatus,
    label: labels[updateStatus] || updateStatus,
    forced: item?.tenant_app_force_update === true,
    canUpdate: item?.tenant_app_can_update === true,
  };
}

export function packageIconUrl(item) {
  const manifest = item?.manifest || {};
  const provider = manifest.providerConnector || manifest.provider_connector || {};
  const assetKey = item?.icon_asset_key || item?.iconAssetKey || manifest.iconAssetKey || manifest.icon_asset_key;
  if (typeof assetKey === "string" && /^[a-z0-9-]+$/i.test(assetKey)) return `/icons/apps/${assetKey}.svg`;
  const value = item?.icon_url || item?.logo_url || manifest.iconUrl || manifest.icon_url || manifest.logoUrl || manifest.logo_url || manifest.icon || provider.iconUrl || provider.logoUrl;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function packageIconAssets(item) {
  const manifest = item?.manifest || {};
  const provider = manifest.providerConnector || manifest.provider_connector || {};
  const keys = [
    item?.icon_asset_key, item?.iconAssetKey, manifest.iconAssetKey, manifest.icon_asset_key,
    item?.package_key, provider.providerKey, provider.provider_key,
  ].filter((key) => typeof key === "string" && /^[a-z0-9_-]+$/i.test(key));
  return [...new Set(keys.flatMap((key) => {
    const filename = key.toLowerCase().replaceAll("_", "-");
    return ["svg", "png", "jpg", "jpeg"].map((extension) => `/icons/apps/${filename}.${extension}`);
  }))];
}

export function packageDependencies(item) {
  const manifest = item?.manifest || {};
  const dependencies = Array.isArray(item?.dependencies)
    ? item.dependencies
    : Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
  const optional = Array.isArray(manifest.optionalDependencies)
    ? manifest.optionalDependencies
    : Array.isArray(manifest.optional_dependencies) ? manifest.optional_dependencies : [];
  const keyOf = (dependency) => typeof dependency === "string"
    ? dependency
    : dependency?.packageKey || dependency?.package_key || dependency?.key || "";
  const optionalKeys = new Set(optional.map(keyOf).filter(Boolean));
  return dependencies.map((dependency) => ({
    key: keyOf(dependency),
    optional: dependency?.optional === true || optionalKeys.has(keyOf(dependency)),
  })).filter((dependency) => dependency.key);
}

export function filterStorePackages(packages, { search = "", category = "All", view = "All" } = {}) {
  const query = search.trim().toLowerCase();
  return (Array.isArray(packages) ? packages : []).filter((item) => {
    if (!isStorefrontPackage(item)) return false;
    const status = storefrontStatus(item);
    const installed = item?.is_installed === true;
    if (view === "Installed" && !installed) return false;
    if (view === "Available" && installed) return false;
    if (category !== "All" && (item.category || "Uncategorised") !== category) return false;
    if (!query) return true;
    return [item.name, item.publisher, item.description, item.category, item.package_key, status]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
}

export function packageBrandName(item) {
  const manifest = item?.manifest || {};
  const provider = manifest.providerConnector || manifest.provider_connector || {};
  const keys = [provider.providerKey, provider.provider_key, item?.package_key, item?.package_name, item?.name]
    .filter((key) => typeof key === "string")
    .map((key) => key.toLowerCase().trim().replace(/[\s-]+/g, "_"));
  for (const [alias, brand] of PROVIDER_BRANDS) {
    if (keys.some((key) => key === alias || key.startsWith(`${alias}_`))) return brand;
  }
  return null;
}