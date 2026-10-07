import React, { Suspense } from "react";

const modules = import.meta.glob("../../components/custom/**/*.jsx");
const styles = import.meta.glob("../../components/custom/**/*.css");

const clean = (path) => String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");

export function CustomComponentModule({ registration, ...props }) {
  const componentPath = clean(registration?.componentPath);
  const cssPath = clean(registration?.cssPath);
  const importer = modules[`../../components/custom/${componentPath}`];
  if (!importer) return <div className="cpb-empty">Custom component module not found: {componentPath}</div>;
  if (cssPath) styles[`../../components/custom/${cssPath}`]?.();
  const Component = React.lazy(importer);
  return <Suspense fallback={<div className="cpb-empty">Loading component…</div>}><Component {...props} config={props.config || {}} records={props.records || props.data || []} registration={registration} /></Suspense>;
}
