import Courtroom from "./courtroom/Courtroom";
import SettingsPage from "./settings/SettingsPage";
import { HistoryPage } from "./HistoryPage";
import { useCouncil } from "./hooks/useCouncil";
import { useSettings } from "./hooks/useSettings";
import { useProviders } from "./hooks/useProviders";
import { useRoute } from "./hooks/useRoute";
export default function App() {
  const { settings, setSettings } = useSettings();
  const catalog = useProviders();
  const court = useCouncil(settings);
  const { path, navigate } = useRoute();
  if (path.startsWith("/settings"))
    return (
      <SettingsPage
        settings={settings}
        setSettings={setSettings}
        catalog={catalog}
        onBack={() => navigate("/")}
      />
    );
  if (path === "/history")
    return <HistoryPage court={court} onBack={() => navigate("/")} />;
  return (
    <Courtroom
      court={court}
      onSettings={() => navigate("/settings/ai")}
      onHistory={() => navigate("/history")}
    />
  );
}
