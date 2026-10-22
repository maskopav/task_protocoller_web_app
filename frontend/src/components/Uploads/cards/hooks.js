import { useEffect, useState } from "react";
import { fetchDevices, fetchUploadSummary, fetchUploads } from "../../../api/uploads";

/**
 * Runs `load()` whenever `key` changes. Previous data stays visible while a new
 * request is in flight. A failure only flips status to "error": the cards show
 * a quiet message and never throw into the page that hosts them.
 */
function useLoad(load, key) {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    let live = true;
    setState((p) => ({ status: "loading", data: p.data }));
    Promise.resolve()
      .then(load)
      .then(
        (data) => live && setState({ status: "ready", data }),
        () => live && setState({ status: "error", data: null })
      );
    return () => { live = false; };
    // `load` is rebuilt every render; `key` identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** scope: {siteId?, projectId?}; no id means the caller's whole scope. */
export function useUploadSummary(scope = {}, days) {
  return useLoad(() => fetchUploadSummary({ ...scope, days }), `${scope.siteId ?? ""}|${scope.projectId ?? ""}|${days ?? ""}`);
}

/** The latest sessions of a site or project (the list endpoint's first page). */
export function useLatestUploads({ siteId, projectId }) {
  return useLoad(
    () => fetchUploads({ site: siteId, project: projectId, pageSize: 10, sort: "receivedAt", dir: "desc" }),
    `${siteId ?? ""}|${projectId ?? ""}`
  );
}

export function useDevices(siteId) {
  return useLoad(() => fetchDevices({ siteId }), `${siteId ?? ""}`);
}
