import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Circle, LoaderCircle, PackageCheck, Store, Truck } from "lucide-react";
import "./ClientWebShopPage.css";

const ORDER_STEPS = [
  { key: "RECEIVED", label: "Order received", icon: Check },
  { key: "PREPARING", label: "Preparing", icon: PackageCheck },
  { key: "READY_FOR_PICKUP", label: "Ready for pickup", icon: Store },
  { key: "READY_FOR_DELIVERY", label: "Out for delivery", icon: Truck },
  { key: "COLLECTED", label: "Collected", icon: Check },
  { key: "DELIVERED", label: "Delivered", icon: Check },
];

const STATUS_LABELS = {
  RECEIVED: "Order received",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  READY_FOR_PICKUP: "Ready for pickup",
  READY_FOR_DELIVERY: "Out for delivery",
  COLLECTED: "Collected",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REJECTED: "Cancelled",
};

export default function ClientWebOrderTrackingPage() {
  const { slug, token } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/client-web-shop/public/${encodeURIComponent(slug)}/orders/tracking/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Order not found");
        if (active) setOrder(result.data);
      })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [slug, token]);

  if (error) return <main className="shop-page shop-message"><div><Circle size={28} /><h1>Order unavailable</h1><p>{error}</p></div></main>;
  if (!order) return <main className="shop-page shop-message"><LoaderCircle className="shop-spinner" size={30} aria-label="Loading order status" /></main>;

  const cancelled = ["CANCELLED", "REJECTED"].includes(order.status);
  const activeSteps = order.fulfilmentType === "DELIVERY" || order.fulfilmentType === "OWN_DELIVERY"
    ? ORDER_STEPS.filter(({ key }) => !["READY_FOR_PICKUP", "COLLECTED"].includes(key))
    : ORDER_STEPS.filter(({ key }) => !["READY_FOR_DELIVERY", "DELIVERED"].includes(key));
  const currentIndex = activeSteps.findIndex(({ key }) => key === order.status);
  const currentLabel = STATUS_LABELS[order.status] || "Order updated";

  return (
    <main className="shop-page shop-message">
      <section className="shop-tracking" aria-live="polite">
        <p className="shop-kicker">{order.fulfilmentType === "DELIVERY" || order.fulfilmentType === "OWN_DELIVERY" ? "Delivery update" : "Pickup update"}</p>
        <h1>{currentLabel}</h1>
        <p>Order reference <strong>{order.reference}</strong></p>
        <ol className="shop-tracking-steps">
          {activeSteps.map((step, index) => {
            const Icon = step.icon;
            const done = !cancelled && currentIndex >= index;
            return <li key={step.key} className={done ? "done" : ""}>
              <span>{done ? <Icon size={16} /> : <Circle size={16} />}</span><b>{step.label}</b>
            </li>;
          })}
          {cancelled && <li className="cancelled"><span><Circle size={16} /></span><b>{currentLabel}</b></li>}
        </ol>
      </section>
    </main>
  );
}