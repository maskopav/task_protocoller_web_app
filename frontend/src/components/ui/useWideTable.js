// src/components/ui/useWideTable.js
import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Tells whether a table is wider than its wrapper. Only then the wrapper gets `overflow-x: auto`
 * (class `ui-tbl-wrap-wide`): a scroll container would pin sticky headers inside the wrapper
 * instead of the page, so a table that fits must not be one.
 * Usage: const { wrapRef, tableRef, wrapClass } = useWideTable(rowsPresent);
 * `watch` re-attaches the observers when the table is mounted/unmounted (e.g. empty -> rows).
 */
export function useWideTable(watch = true) {
  const wrapRef = useRef(null);
  const tableRef = useRef(null);
  const [wide, setWide] = useState(false);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const table = tableRef.current;
    if (!wrap || !table) return;
    setWide(table.scrollWidth > wrap.clientWidth + 1);
  }, []);

  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (tableRef.current) ro.observe(tableRef.current);
    return () => ro.disconnect();
  }, [measure, watch]);

  return { wrapRef, tableRef, wrapClass: wide ? " ui-tbl-wrap-wide" : "" };
}
