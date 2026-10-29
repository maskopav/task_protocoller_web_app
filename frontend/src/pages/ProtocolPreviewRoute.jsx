// src/pages/ProtocolPreviewRoute.jsx — #/studies/:projectId/protocols/:protocolId/preview.
// The Preview buttons hand the protocol over in the router state. A direct link or a reload has no
// state, so a saved protocol is loaded by id (F-079); an unsaved draft ("new") or a protocol that
// cannot be loaded goes back to the study's protocol list. The participant flow is not involved.
import React, { useContext, useEffect } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ParticipantInterfacePage from "./ParticipantInterfacePage";
import { ProtocolContext } from "../context/ProtocolContext";
import { useMappings } from "../context/MappingContext";
import { useToast } from "../components/ui";
import { loadMappedProtocol } from "./studies/protocolMapping";

export default function ProtocolPreviewRoute() {
  const { projectId, protocolId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useTranslation("studies");
  const { setSelectedProtocol } = useContext(ProtocolContext);
  const { mappings } = useMappings();

  const hasState = !!state?.protocol;
  const isNew = protocolId === "new";
  const mappingsReady = !!(mappings?.languages && mappings?.tasks);
  const listPath = `/studies/${projectId}/protocols`;

  useEffect(() => {
    if (hasState || isNew || !mappingsReady) return undefined;
    let live = true;
    (async () => {
      try {
        const mapped = await loadMappedProtocol(protocolId, mappings);
        if (!live) return;
        const protocol = { ...mapped, projectId };
        setSelectedProtocol(protocol);
        navigate(`${listPath}/${protocolId}/preview`, {
          replace: true,
          state: { protocol, testingMode: true, editingMode: false, returnTo: "dashboard" },
        });
      } catch (err) {
        console.error("Failed to load the protocol preview:", protocolId, err);
        if (!live) return;
        toast.error(t("editor.notFound"));
        navigate(listPath, { replace: true });
      }
    })();
    return () => { live = false; };
    // mappings only supply the language and task names
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasState, isNew, mappingsReady, protocolId, projectId]);

  if (hasState) return <ParticipantInterfacePage />;
  if (isNew) return <Navigate to={listPath} replace />;
  return <div className="studies-skeleton" aria-busy="true" aria-label={t("loading")} />;
}
