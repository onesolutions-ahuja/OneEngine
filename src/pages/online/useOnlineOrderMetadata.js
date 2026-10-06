import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api.js";

function matchesRule(rule, record) {
  if (!rule || typeof rule !== "object" || !Object.keys(rule).length) return true;
  const path = String(rule.path || "").replace(/^online_order\./, "");
  if (!path) return true;
  const value = path.split(".").reduce((current, key) => current?.[key], record);
  const operator = String(rule.operator || "equals").toLowerCase();
  if (operator === "equals") return String(value ?? "") === String(rule.value ?? "");
  if (operator === "not_equals") return String(value ?? "") !== String(rule.value ?? "");
  if (operator === "in") {
    const allowed = Array.isArray(rule.value) ? rule.value : String(rule.value ?? "").split(",").map((item) => item.trim());
    return allowed.map(String).includes(String(value ?? ""));
  }
  if (operator === "not_in") {
    const blocked = Array.isArray(rule.value) ? rule.value : String(rule.value ?? "").split(",").map((item) => item.trim());
    return !blocked.map(String).includes(String(value ?? ""));
  }
  return true;
}

export function actionKeyForButton(button) {
  const configured = String(button?.config?.uiAction || "").trim();
  if (configured) return configured;
  return String(button?.action_key || button?.target_key || "").trim();
}

export function buttonStyle(button) {
  switch (String(button?.variant || "").toLowerCase()) {
    case "danger": return "bg-red-50 text-red-600 hover:bg-red-100";
    case "primary": return "bg-blue-600 text-white hover:bg-blue-700";
    default: return "bg-slate-100 text-slate-600 hover:bg-slate-200";
  }
}

export function busyLabel(button) {
  return button?.config?.busyLabel || button?.config?.busy_label || "Processing...";
}

export default function useOnlineOrderMetadata() {
  const [buttons, setButtons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    apiRequest("/api/platform/runtime/objects/salesorder/buttons")
      .then((response) => {
        if (!live) return;
        if (!response?.success) throw new Error(response?.message || "Unable to load Online Order actions");
        setButtons((response.data || []).filter((button) => button?.config?.hiddenFromProviderQueue !== true && actionKeyForButton(button)));
      })
      .catch((reason) => {
        if (live) setError(reason?.message || "Unable to load Online Order actions");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, []);

  return useMemo(() => ({
    buttons,
    loading,
    error,
    actionsFor(order, { prepOnly = false } = {}) {
      return buttons.filter((button) => {
        if (!matchesRule(button.visibility_rule || button.visibilityRule, order)) return false;
        if (prepOnly && button?.config?.prepVisible === false) return false;
        return true;
      });
    },
  }), [buttons, loading, error]);
}
