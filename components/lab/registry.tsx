"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * Registry for `custom` blocks — maps a component name (stored in the CMS)
 * to a live interactive component. Add experiments here.
 */
const registry: Record<string, ComponentType<any>> = {
  "ink-field": dynamic(() => import("./ink-field").then((m) => m.InkField), { ssr: false }),
  "doodle-pad": dynamic(() => import("./doodle-pad").then((m) => m.DoodlePad), { ssr: false }),
};

export function CustomBlock({
  component,
  props,
}: {
  component: string;
  props?: Record<string, any>;
}) {
  const Component = registry[component];
  if (!Component) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-faint">
        Unknown experiment: <code>{component}</code>
      </div>
    );
  }
  return <Component {...(props ?? {})} />;
}
