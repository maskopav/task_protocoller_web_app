// src/pages/library/LibraryEditorPage.jsx: the protocol editor on a library entry (spec 6.5, 6.10).
// Author and master only. Saving creates a new library version; copies in studies keep their content.
import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ProtocolEditor from "../../components/ProtocolEditor";
import { useMappings } from "../../context/MappingContext";
import { getLibraryEntry, listLibrary } from "../../api/library";
import { Button, EmptyState, useToast } from "../../components/ui";
import { mapProtocolWithNames } from "../studies/protocolMapping";
import NotAvailablePage from "../NotAvailablePage";
import "../studies/studies.css";
import "./library.css";

export default function LibraryEditorPage() {
  const { protocolId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useTranslation("library");
  const { mappings, refreshMappings } = useMappings();
  const mappingsReady = !!(mappings?.languages && mappings?.tasks);
  const [loaded, setLoaded] = useState(null); // { protocol, tasks, usedIn, variants }
  const [status, setStatus] = useState("loading"); // loading | ok | missing | forbidden | readonly

  useEffect(() => {
    if (!mappingsReady) return undefined;
    let live = true;
    setLoaded(null);
    setStatus("loading");
    (async () => {
      try {
        const [raw, groups] = await Promise.all([getLibraryEntry(protocolId), listLibrary().catch(() => [])]);
        if (!live) return;
        if (!raw.can_edit) { setStatus("readonly"); return; }
        const mapped = mapProtocolWithNames(raw, mappings);
        const group = groups.find((g) => g.protocol_group_id === raw.protocol_group_id);
        setLoaded({
          protocol: { ...mapped, projectId: null },
          tasks: mapped.tasks,
          usedIn: raw.used_in || 0,
          variants: Object.entries(group?.protocol_ids || {}).map(([code, id]) => ({ code, protocol_id: id })),
        });
        setStatus("ok");
      } catch (err) {
        if (live) setStatus(err?.status === 403 ? "forbidden" : "missing");
      }
    })();
    return () => { live = false; };
    // mappings only supply language and task names
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolId, mappingsReady]);

  const onSaved = async (result) => {
    await refreshMappings().catch((err) => console.error("Mappings refresh failed after save:", err));
    toast.success(t("edit.saved"));
    // Never navigate to /library/undefined: without an id, fall back to the list.
    navigate(result?.protocol_id ? `/library/${result.protocol_id}` : "/library", { replace: true });
  };

  if (status === "forbidden") return <NotAvailablePage />;
  if (status === "missing" || status === "readonly") {
    return (
      <EmptyState
        icon="library"
        title={status === "readonly" ? t("edit.notAuthor") : t("entry.notFound")}
        action={<Button as={Link} to={status === "readonly" ? `/library/${protocolId}` : "/library"}>{t("entry.back")}</Button>}
        data-testid="library-edit-blocked"
      />
    );
  }
  if (status === "loading" || !loaded) return <div className="library-skeleton" aria-busy="true" aria-label={t("loading")} />;

  return (
    <ProtocolEditor
      key={protocolId}
      library
      usedIn={loaded.usedIn}
      projectId={null}
      study={null}
      protocol={loaded.protocol}
      initialTasks={loaded.tasks}
      variants={loaded.variants}
      onSaved={onSaved}
    />
  );
}
