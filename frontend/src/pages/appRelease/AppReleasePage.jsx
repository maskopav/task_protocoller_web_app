// src/pages/appRelease/AppReleasePage.jsx — the desktop release this server
// serves and the install links to hand to a clinic (docs/app_release_page/spec.md).
// Master or can_see_technical (App.jsx gates the route, the server re-checks).
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyField, EmptyState, Icon, KeyValue, PageHeader, Section, useToast } from "../../components/ui";
import { fetchAppRelease } from "../../api/appRelease";
import { apiErrorMessage } from "../../utils/apiError";
import { formatDateTime } from "../../utils/formatDate";
import { formatBytes } from "../clinics/clinicLogic";
import { joinLink, linkBase } from "./appReleaseLogic";
import "./appRelease.css";

function BundleCard({ bundle, base, onCopied }) {
  const { t } = useTranslation("appRelease");
  const stable = joinLink(base, bundle.latestPath);
  const versioned = joinLink(base, bundle.versionedPath);
  return (
    <div className="apprelease-card" data-testid={`apprelease-bundle-${bundle.name}`}>
      <h3 className="apprelease-h3">{bundle.name}</h3>
      <KeyValue
        cols={2}
        items={[
          { label: t("size"), value: formatBytes(bundle.size) },
          { label: t("sha256"), value: <span className="apprelease-hash" data-testid="apprelease-sha256">{bundle.sha256 || "—"}</span> },
        ]}
      />
      <div className="apprelease-link">
        <span className="apprelease-link-label">{t("stableLink")}</span>
        <div data-testid="apprelease-stable-link">
          <CopyField value={stable} label={t("stableLink")} onCopied={onCopied} />
        </div>
      </div>
      <div className="apprelease-link">
        <span className="apprelease-link-label">{t("versionedLink")}</span>
        <a href={versioned} data-testid="apprelease-versioned-link">{versioned}</a>
      </div>
    </div>
  );
}

export default function AppReleasePage() {
  const { t, i18n } = useTranslation("appRelease");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchAppRelease());
    } catch (err) {
      setFailed(true);
      toast.error(apiErrorMessage(err, tc));
    }
  }, [toast, tc]);

  useEffect(() => { load(); }, [load]);

  const onCopied = useCallback(() => toast.success(t("copied")), [toast, t]);

  let body;
  if (failed) body = <EmptyState icon="alert" title={t("loadFailed")} />;
  else if (data === null) body = <EmptyState title={t("loading")} />;
  else if (!data.release) {
    body = <EmptyState icon="download" title={t("empty.title")} description={t("empty.description")} data-testid="apprelease-empty" />;
  } else {
    const { release } = data;
    const { base, fallback } = linkBase(data.publicBaseUrl);
    body = (
      <>
        <Section title={t("served")}>
          <KeyValue
            cols={2}
            items={[
              { label: t("version"), value: <span data-testid="apprelease-version">{release.version}</span> },
              { label: t("publishedAt"), value: release.publishedAt ? formatDateTime(release.publishedAt, i18n.language) : "—" },
            ]}
          />
        </Section>
        {fallback && (
          <div className="apprelease-warn" role="note" data-testid="apprelease-no-public-base">
            <Icon name="alert" />
            <p>{t("noPublicBase", { base })}</p>
          </div>
        )}
        <Section title={t("bundles")} hint={t("bundlesHint")}>
          {release.bundles.length === 0 ? (
            <EmptyState icon="download" title={t("noBundles")} />
          ) : (
            <div className="apprelease-list">
              {release.bundles.map((b) => <BundleCard key={b.name} bundle={b} base={base} onCopied={onCopied} />)}
            </div>
          )}
        </Section>
      </>
    );
  }

  return (
    <div className="apprelease-page" data-testid="app-release-page">
      <PageHeader title={t("title")} sub={t("sub")} />
      {body}
    </div>
  );
}
