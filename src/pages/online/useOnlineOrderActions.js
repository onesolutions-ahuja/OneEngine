import { useRef, useState } from "react";
import { apiRequest } from "../../services/api.js";

/**
 * Generic metadata-button coordinator for record cards.
 * Business lifecycle, validation, confirmation requirements and status changes
 * belong to button/action/Flow metadata, never this hook.
 */
export default function useOnlineOrderActions({ applyOrderUpdate, setError }) {
  const inFlight = useRef(new Set());
  const [busyActions, setBusyActions] = useState({});

  const runAction = async (order, button, inputs = {}) => {
    const buttonKey = button?.button_key || button?.buttonKey;
    if (!order?.id || !buttonKey || inFlight.current.has(order.id)) return null;
    inFlight.current.add(order.id);
    setBusyActions((current) => ({ ...current, [order.id]: buttonKey }));
    setError?.("");
    try {
      const response = await apiRequest(`/api/platform/objects/online_order/records/${encodeURIComponent(order.id)}/buttons/${encodeURIComponent(buttonKey)}/execute`, {
        method: "POST",
        body: JSON.stringify({ inputs }),
      });
      if (response?.success === false) throw new Error(response.message || "Configured action failed");
      const updated = response?.data?.record || response?.data?.order || null;
      if (updated) applyOrderUpdate?.(updated);
      return response;
    } catch (error) {
      setError?.(error?.message || "Configured action failed");
      return null;
    } finally {
      inFlight.current.delete(order.id);
      setBusyActions((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
    }
  };

  return { busyActions, runAction };
}
