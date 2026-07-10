const TAXIBO_STORAGE_MODE_KEY = "taxiBoStorageMode";

const inHouseMaintenanceSwitch = document.querySelector("#inHouseMaintenanceSwitch");
const settingsModeBadge = document.querySelector("#settingsModeBadge");
const settingsStatus = document.querySelector("#settingsStatus");

function getStorageMode() {
  return localStorage.getItem(TAXIBO_STORAGE_MODE_KEY) === "local" ? "local" : "cloud";
}

function setStorageMode(mode) {
  localStorage.setItem(TAXIBO_STORAGE_MODE_KEY, mode === "local" ? "local" : "cloud");
}

function renderSettings() {
  const mode = getStorageMode();
  const isLocal = mode === "local";

  inHouseMaintenanceSwitch.checked = isLocal;
  settingsModeBadge.textContent = isLocal ? "In-house" : "Drive mode";
  settingsStatus.className = "form-state empty-state";
  settingsStatus.textContent = isLocal
    ? "In-house maintenance is ON. Route/photo edits save to local SQLite and are pending cloud sync."
    : "Drive mode is ON. Route/photo edits save directly to PostgreSQL when the cloud database is connected.";
}

async function checkDatabaseHealth() {
  const mode = getStorageMode();

  try {
    const response = await fetch("/api/health", {
      cache: "no-store",
      headers: {
        "X-TaxiBo-Storage-Mode": mode,
      },
    });
    const health = await response.json();

    if (!response.ok || !health.ok) {
      throw new Error(health.error || "Database health check failed.");
    }

    settingsStatus.textContent += ` Current API target: ${health.database}${health.cloudConfigured ? "" : " (cloud not configured)"}.`;
  } catch (error) {
    settingsStatus.className = "form-state";
    settingsStatus.textContent = `${settingsStatus.textContent} Health check failed: ${error.message}`;
  }
}

inHouseMaintenanceSwitch.addEventListener("change", async () => {
  setStorageMode(inHouseMaintenanceSwitch.checked ? "local" : "cloud");
  renderSettings();
  await checkDatabaseHealth();
});

renderSettings();
checkDatabaseHealth();
