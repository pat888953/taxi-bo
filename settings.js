const TAXIBO_STORAGE_MODE_KEY = "taxiBoStorageMode";
const TAXIBO_CLOUD_TARGET_KEY = "taxiBoCloudTargetUrl";

const inHouseMaintenanceSwitch = document.querySelector("#inHouseMaintenanceSwitch");
const settingsModeBadge = document.querySelector("#settingsModeBadge");
const settingsStatus = document.querySelector("#settingsStatus");
const cloudTargetUrl = document.querySelector("#cloudTargetUrl");
const syncLocalToCloudButton = document.querySelector("#syncLocalToCloudButton");
const syncCloudToLocalButton = document.querySelector("#syncCloudToLocalButton");
const downloadLocalBackupButton = document.querySelector("#downloadLocalBackupButton");
const testCloudConnectionButton = document.querySelector("#testCloudConnectionButton");
const syncStatus = document.querySelector("#syncStatus");

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

function normalizeCloudUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");

  if (!raw) {
    return "";
  }

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function localHeaders(extra = {}) {
  return {
    ...extra,
    "X-TaxiBo-Storage-Mode": "local",
  };
}

function setSyncStatus(message, isError = false) {
  syncStatus.className = isError ? "form-state" : "form-state empty-state";
  syncStatus.textContent = message;
}

function ensureLocalServerPage() {
  if (window.location.protocol === "file:") {
    throw new Error("Open TaxiBo through python server.py first. Sync cannot run from a file:// page.");
  }
}

function explainFetchFailure(action, url) {
  return `${action} failed because the browser could not read ${url}. The cloud app may be healthy, but Render must be redeployed with the latest TaxiBo CORS/sync code before this browser page can sync with it.`;
}

function getCloudTarget() {
  const normalized = normalizeCloudUrl(cloudTargetUrl.value);

  if (!normalized) {
    throw new Error("Enter your Render TaxiBo URL first, for example https://taxi-bo.onrender.com.");
  }

  localStorage.setItem(TAXIBO_CLOUD_TARGET_KEY, normalized);
  cloudTargetUrl.value = normalized;
  return normalized;
}

async function fetchJson(url, options = {}, action = "Request") {
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(explainFetchFailure(action, url));
  }

  const result = await response.json().catch(() => ({}));
  return { response, result };
}

async function checkCloudConnection(cloudUrl) {
  const { response, result } = await fetchJson(
    `${cloudUrl}/api/health?syncCheck=${Date.now()}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    },
    "Cloud health check",
  );

  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Cloud health check failed at ${cloudUrl}.`);
  }

  return result;
}

async function fetchRoutesFrom(url, headers = {}) {
  const sameOrigin = new URL(url, window.location.href).origin === window.location.origin;
  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };

  if (sameOrigin) {
    requestHeaders["Cache-Control"] = "no-store";
  }

  const { response, result } = await fetchJson(`${url}/api/routes?syncRead=${Date.now()}`, {
    cache: "no-store",
    headers: requestHeaders,
  }, "Read routes");

  if (!response.ok || !Array.isArray(result)) {
    throw new Error(result.error || `Could not read routes from ${url}.`);
  }

  return result;
}

async function writeRoutesTo(url, routes, headers = {}) {
  const { response, result } = await fetchJson(`${url}/api/routes`, {
    method: "PUT",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
    body: JSON.stringify(routes),
  }, "Write routes");

  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `Could not write routes to ${url}.`);
  }

  return result;
}

function countCues(routes) {
  return routes.reduce((total, route) => total + (Array.isArray(route.photos) ? route.photos.length : 0), 0);
}

function downloadRoutesBackup(routes) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(routes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `taxibo-local-backup-${timestamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadLocalBackup() {
  ensureLocalServerPage();
  setSyncStatus("Preparing local SQLite backup...");
  const routes = await fetchRoutesFrom(window.location.origin, localHeaders());
  downloadRoutesBackup(routes);
  setSyncStatus(`Downloaded local backup with ${routes.length} routes and ${countCues(routes)} cue photos.`);
}

async function testCloudConnection() {
  const cloudUrl = getCloudTarget();
  testCloudConnectionButton.disabled = true;
  setSyncStatus(`Testing ${cloudUrl}...`);

  try {
    const health = await checkCloudConnection(cloudUrl);
    setSyncStatus(`Cloud connection OK. Render is using ${health.database}; cloud configured: ${health.cloudConfigured ? "yes" : "no"}.`);
  } catch (error) {
    setSyncStatus(error.message || "Cloud connection failed.", true);
  } finally {
    testCloudConnectionButton.disabled = false;
  }
}

async function syncLocalToCloud() {
  ensureLocalServerPage();
  const cloudUrl = getCloudTarget();
  syncLocalToCloudButton.disabled = true;
  setSyncStatus("Testing cloud connection before sync...");

  try {
    await checkCloudConnection(cloudUrl);
    setSyncStatus("Reading local SQLite routes before cloud sync...");
    const routes = await fetchRoutesFrom(window.location.origin, localHeaders());
    setSyncStatus(`Uploading ${routes.length} local routes and ${countCues(routes)} cue photos to ${cloudUrl}...`);
    await writeRoutesTo(cloudUrl, routes);
    localStorage.setItem("taxiBoLastCloudSyncAt", new Date().toISOString());
    setSyncStatus(`Sync complete. Cloud now has ${routes.length} routes and ${countCues(routes)} cue photos.`);
  } catch (error) {
    setSyncStatus(error.message || "Could not sync local data to cloud.", true);
  } finally {
    syncLocalToCloudButton.disabled = false;
  }
}

async function syncCloudToLocal() {
  ensureLocalServerPage();
  const cloudUrl = getCloudTarget();

  if (!confirm("Pull cloud to local will replace this laptop's local route database. Download a local backup first?")) {
    return;
  }

  syncCloudToLocalButton.disabled = true;
  setSyncStatus(`Testing cloud connection before pull...`);

  try {
    await checkCloudConnection(cloudUrl);
    setSyncStatus(`Reading cloud routes from ${cloudUrl}...`);
    const routes = await fetchRoutesFrom(cloudUrl);
    setSyncStatus(`Writing ${routes.length} cloud routes and ${countCues(routes)} cue photos to local SQLite...`);
    await writeRoutesTo(window.location.origin, routes, localHeaders());
    setSyncStatus(`Pull complete. Local SQLite now has ${routes.length} routes and ${countCues(routes)} cue photos.`);
  } catch (error) {
    setSyncStatus(error.message || "Could not pull cloud data to local.", true);
  } finally {
    syncCloudToLocalButton.disabled = false;
  }
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

cloudTargetUrl.addEventListener("change", () => {
  const normalized = normalizeCloudUrl(cloudTargetUrl.value);
  if (normalized) {
    localStorage.setItem(TAXIBO_CLOUD_TARGET_KEY, normalized);
    cloudTargetUrl.value = normalized;
  }
});

downloadLocalBackupButton.addEventListener("click", () => {
  downloadLocalBackup().catch((error) => setSyncStatus(error.message || "Could not download local backup.", true));
});

testCloudConnectionButton.addEventListener("click", testCloudConnection);
syncLocalToCloudButton.addEventListener("click", syncLocalToCloud);
syncCloudToLocalButton.addEventListener("click", syncCloudToLocal);

cloudTargetUrl.value = localStorage.getItem(TAXIBO_CLOUD_TARGET_KEY) || "https://taxi-bo.onrender.com";
renderSettings();
checkDatabaseHealth();
