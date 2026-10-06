import express from "express";

/**
 * Retired compatibility router.
 *
 * The former /dashboard/summary implementation embedded Sales/Product SQL.
 * Dashboard runtime is now metadata-driven through routes/dashboardBuilder.js
 * and saved Report Builder definitions. This router intentionally registers no
 * routes and is not mounted by server.js.
 */
export default function createDashboardRouter() {
  return express.Router();
}
