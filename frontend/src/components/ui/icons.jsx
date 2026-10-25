// src/components/ui/icons.jsx
// Inline SVG icon set (24x24 grid, stroke style). Paths are static, trusted strings.
import React from "react";
import { ICON_PATHS } from "./iconPaths.js";


/**
 * @param {string} name   key of ICON_PATHS
 * @param {number} [size] px, default 16
 * @param {string} [title] accessible name; without it the icon is aria-hidden
 */
export function Icon({ name, size, title, className = "", ...rest }) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  const dim = size ? { width: size, height: size } : undefined;
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": "true", focusable: "false" };
  const titleTag = title ? `<title>${title.replace(/[<&>]/g, "")}</title>` : "";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={`ui-icon ${className}`.trim()}
      {...dim}
      {...a11y}
      {...rest}
      dangerouslySetInnerHTML={{ __html: titleTag + paths }}
    />
  );
}
