import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Settings } from "../hooks/useSettings";
import type { useProviders } from "../hooks/useProviders";
import type { ModelConfig } from "../api";
const statusLabel = {
  connected: "Connected",
  unavailable: "Not connected",
  authentication_required: "Authentication required",
  rate_limited: "Rate limited",
};
export function ModelPicker({
  label,
  value,
  onChange,
  models,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  models: ModelConfig[];
}) {
  return (
    <label className="setting-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select a model</option>
        {value && !models.some((m) => m.id === value) && (
          <option value={value}>{value} · unavailable</option>
        )}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.displayName} · {model.provider}
          </option>
        ))}
      </select>
    </label>
  );
}
export default function SettingsPage({
  settings,
  setSettings,
  catalog,
  onBack,
}: {
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  catalog: ReturnType<typeof useProviders>;
  onBack: () => void;
}) {
  const [tab, setTab] = useState(
    location.pathname.endsWith("/ai") ? "AI" : "General",
  );
  const [showAll, setShowAll] = useState(false);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const models = catalog.models
    .map((model) => {
      const source = catalog.providers.find(
        (p) => p.id === model.provider,
      )?.source;
      return {
        ...model,
        displayName:
          model.displayName +
          (source === "fallback"
            ? " (fallback)"
            : source === "cached"
              ? " (cached)"
              : ""),
      };
    })
    .sort(
      (a, b) =>
        Number(b.provider === settings.primaryProvider) -
        Number(a.provider === settings.primaryProvider),
    )
    .filter(
      (model) =>
        showAll ||
        (catalog.providers
          .flatMap((p) => p.models)
          .find((m) => m.id === model.id)?.capabilities?.text ??
          !/embed|whisper|tts|transcrib|dall-e|moderation|segmen|image|audio|speech|realtime|veo|imagen/i.test(
            model.model,
          )),
    );
  return (
    <main className="settings-page">
      <header>
        <button onClick={onBack}>← Courtroom</button>
        <h1>Settings</h1>
        <span className="metadata">Saved on this device</span>
      </header>
      <nav aria-label="Settings sections">
        {["General", "AI", "Appearance", "Advanced"].map((section) => (
          <button
            key={section}
            aria-current={tab === section ? "page" : undefined}
            onClick={() => {
              setTab(section);
              history.replaceState(
                null,
                "",
                section === "AI" ? "/settings/ai" : "/settings",
              );
            }}
          >
            {section}
          </button>
        ))}
      </nav>
      {tab === "AI" && (
        <section>
          <div className="section-title">
            <h2>AI connections</h2>
            <button
              onClick={() => void catalog.refresh(true)}
              disabled={catalog.loading}
            >
              {catalog.loading ? "Loading available models…" : "Refresh models"}
            </button>
          </div>
          {catalog.error && <p role="alert">{catalog.error}</p>}
          <label className="setting-field">
            <span>Primary provider</span>
            <select
              value={settings.primaryProvider}
              onChange={(e) => update("primaryProvider", e.target.value)}
            >
              {catalog.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))}
            </select>
          </label>
          <p className="metadata">
            Stage selections are explicit. Changing the primary provider does
            not replace a selected model.
          </p>
          {catalog.providers
            .filter((p) => p.id === settings.primaryProvider)
            .map((p) => (
              <p className="catalog-status" key={p.id}>
                {p.source === "live"
                  ? "Available models"
                  : p.source === "cached"
                    ? "Could not refresh models. Showing cached models."
                    : "Fallback model list"}
                {p.source === "fallback" && p.models.length === 0
                  ? " · No verified models available"
                  : ""}
              </p>
            ))}
          <ModelPicker
            label="Role Generator"
            value={settings.roleGeneratorModelId}
            onChange={(v) => update("roleGeneratorModelId", v)}
            models={models}
          />
          <ModelPicker
            label="Default Expert"
            value={settings.defaultExpertModelId}
            onChange={(v) => update("defaultExpertModelId", v)}
            models={models}
          />
          <ModelPicker
            label="Judge · required"
            value={settings.judgeModelId}
            onChange={(v) => update("judgeModelId", v)}
            models={models}
          />
          <label className="check-field">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Show all models
          </label>
          <details>
            <summary>Per-role model overrides</summary>
            {Array.from({ length: 5 }, (_, i) => (
              <ModelPicker
                key={i}
                label={`Expert ${i + 1}`}
                value={settings.expertModelOverrides[i] || ""}
                onChange={(v) =>
                  update("expertModelOverrides", {
                    ...settings.expertModelOverrides,
                    [i]: v,
                  })
                }
                models={models}
              />
            ))}
          </details>
          <h2>Provider connections</h2>
          {catalog.providers.map((provider) => (
            <article className="provider-connection" key={provider.id}>
              <div>
                <strong>{provider.displayName}</strong>
                <span className={`connection-status ${provider.health.status}`}>
                  {statusLabel[provider.health.status]}
                </span>
              </div>
              {provider.health.message && <p>{provider.health.message}</p>}
              {provider.error && (
                <p className="metadata">
                  {provider.error}{" "}
                  {provider.source === "cached"
                    ? "Showing cached models."
                    : "Fallback model list."}
                </p>
              )}
              {provider.usage && (
                <div className="usage-windows">
                  <h3>Muse usage</h3>
                  {[
                    ["5-hour window", provider.usage.fiveHourWindow],
                    ["Weekly", provider.usage.weeklyWindow],
                  ].map(([label, window]) => {
                    if (!window || typeof window === "string") return null;
                    return (
                      <label key={String(label)}>
                        {String(label)} <b>{window.usedPercent}%</b>
                        <progress
                          max={100}
                          value={Math.min(100, window.usedPercent)}
                        />
                        <small>
                          Resets {new Date(window.resetsAtMs).toLocaleString()}
                        </small>
                      </label>
                    );
                  })}
                  <small>
                    As of{" "}
                    {new Date(provider.usage.observedAtMs).toLocaleString()}
                  </small>
                </div>
              )}
              {provider.id === "muse" && !provider.usage && (
                <p className="metadata">Subscription usage unavailable.</p>
              )}
            </article>
          ))}
          <p className="metadata">
            Credentials stay in the server environment. Muse uses your local
            browser sign-in. Paid providers are used only when explicitly
            selected for a stage.
          </p>
        </section>
      )}
      {tab === "General" && (
        <section>
          <h2>Deliberation</h2>
          <label className="setting-field">
            <span>Maximum debate rounds</span>
            <select
              value={settings.maxDebateRounds}
              onChange={(e) =>
                update("maxDebateRounds", Number(e.target.value))
              }
            >
              {[1, 2, 3].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <p>
            Debates end early when the council reaches agreement or has nothing
            new to add.
          </p>
        </section>
      )}
      {tab === "Appearance" && (
        <section>
          <h2>Motion</h2>
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => update("reducedMotion", e.target.checked)}
            />
            Reduce character animation
          </label>
        </section>
      )}
      {tab === "Advanced" && (
        <section>
          <h2>Spending & output</h2>
          <label className="setting-field">
            <span>Maximum cost per council (USD)</span>
            <input
              type="number"
              min="0.001"
              step="0.01"
              placeholder="No limit"
              value={settings.maxCost}
              onChange={(e) => update("maxCost", e.target.value)}
            />
          </label>
          <p className="metadata">
            A paid budget requires known model prices. Optional rounds are
            removed before the Judge.
          </p>
          <details>
            <summary>Output token budgets</summary>
            {Object.entries(settings.tokenBudgets).map(([key, value]) => (
              <label className="setting-field" key={key}>
                <span>{key.replace(/([A-Z])/g, " $1")}</span>
                <input
                  type="number"
                  min={50}
                  max={2000}
                  value={value}
                  onChange={(e) =>
                    update("tokenBudgets", {
                      ...settings.tokenBudgets,
                      [key]: Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </details>
        </section>
      )}
    </main>
  );
}
