import { useRef, useState } from "react";
import { apiRequest } from "../../services/api.js";

// UI request coordination only. The existing endpoints remain responsible for
// permissions, lifecycle validation, ORDER_BUSY, OTP and sale creation.
export default function useOnlineOrderActions({ applyOrderUpdate, otpRequired, setError, setMessage }) {
  const inFlight = useRef(new Set());
  const [busyActions, setBusyActions] = useState({});
  const [completeTarget, setCompleteTarget] = useState(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);

  const requestAction = async (order, action, body = {}) => {
    if (inFlight.current.has(order.id)) return null;
    inFlight.current.add(order.id);
    setBusyActions((current) => ({ ...current, [order.id]: action }));
    try {
      const internalKiosk = order?.platform === "one_kiosk";
      const endpoint = internalKiosk
        ? `/api/online/orders/generic/${order.id}/${action}`
        : `/api/online/orders/${order.id}/${action}`;
      const data = await apiRequest(endpoint, {
        method: "POST", body: JSON.stringify(body),
      });
      if (!data.success) {
        throw Object.assign(new Error(data.message || "Action failed"), { code: data.code });
      }
      applyOrderUpdate(data.data && data.data.order);
      /* No success toast: the card itself reflects the new status. Only
         failures surface messages (see runAction / submitComplete). */
      return data;
    } finally {
      inFlight.current.delete(order.id);
      setBusyActions((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
    }
  };

  const showOtp = (order, notice = "") => {
    setCompleteTarget(order);
    setOtpInput("");
    setOtpError(notice);
  };

  const runAction = async (order, action) => {
    if (inFlight.current.has(order.id)) return;
    if (action === "cancel" && !window.confirm("Cancel this order and release reserved stock?")) return;
    if (action === "complete" && otpRequired[order.platform]) {
      showOtp(order);
      return;
    }
    let collectionReference = "";
    if (
      action === "complete"
      && order?.platform === "one_kiosk"
      && order?.platform_data?.collectionVerificationRequired === true
    ) {
      collectionReference = window.prompt("Enter the customer's collection reference to confirm handover:") || "";
      if (!collectionReference.trim()) return;
    }
    setError("");
    const body = action === "cancel" ? { reason: "Cancelled by store" }
      : action === "reject" ? { reason: "Rejected by store" }
      : action === "complete" && collectionReference ? { collectionReference: collectionReference.trim() }
      : {};
    try {
      await requestAction(order, action, body);
    } catch (err) {
      if (err.code === "OTP_REQUIRED" && action === "complete") {
        showOtp(order, "The platform requires the handover OTP to complete this order.");
      } else {
        setError(err.message || "Action failed");
      }
    }
  };

  const submitComplete = async (event) => {
    event.preventDefault();
    if (!completeTarget || inFlight.current.has(completeTarget.id) || !otpInput.trim()) return;
    setOtpBusy(true);
    setOtpError("");
    try {
      const data = await requestAction(completeTarget, "complete", { otp: otpInput.trim() });
      if (data) setCompleteTarget(null);
    } catch (err) {
      setOtpError(err.code === "INVALID_OTP"
        ? "The platform rejected this OTP. Enter the correct handover code."
        : err.message || "Unable to complete order");
    } finally {
      setOtpBusy(false);
    }
  };

  return {
    busyActions, runAction, completeTarget, setCompleteTarget,
    otpInput, setOtpInput, otpError, otpBusy, submitComplete,
  };
}
