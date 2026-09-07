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
const hdeRefreshButton = document.querySelector("#hdeRefreshButton");
const hdeState = document.querySelector("#hdeState");
const hdeCorridorCount = document.querySelector("#hdeCorridorCount");
const hdeOpenCount = document.querySelector("#hdeOpenCount");
const hdeRecordingCount = document.querySelector("#hdeRecordingCount");
const hdeHighCount = document.querySelector("#hdeHighCount");
const hdeIssueForm = document.querySelector("#hdeIssueForm");
const hdeIssueStart = document.querySelector("#hdeIssueStart");
const hdeIssueDestination = document.querySelector("#hdeIssueDestination");
const hdeIssueVia = document.querySelector("#hdeIssueVia");
const hdeIssueType = document.querySelector("#hdeIssueType");
const hdeIssueMessage = document.querySelector("#hdeIssueMessage");
const hdeIssueFilter = document.querySelector("#hdeIssueFilter");
const hdeIssueList = document.querySelector("#hdeIssueList");

let hdeIssues = [];

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

async function fetchLocationCuesFrom(url, headers = {}) {
  const { response, result } = await fetchJson(`${url}/api/location-cues?syncRead=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...headers },
  }, "Read Location Cues");
  if (!response.ok || !result.ok || !Array.isArray(result.cues)) {
    throw new Error(result.error || `Could not read Location Cues from ${url}.`);
  }
  return result.cues;
}

async function writeLocationCuesTo(url, cues, headers = {}) {
  const { response, result } = await fetchJson(`${url}/api/location-cues`, {
    method: "PUT",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
    body: JSON.stringify(cues),
  }, "Write Location Cues");
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Could not write Location Cues to ${url}.`);
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
    const [routes, locationCues] = await Promise.all([
      fetchRoutesFrom(window.location.origin, localHeaders()),
      fetchLocationCuesFrom(window.location.origin, localHeaders()),
    ]);
    setSyncStatus(`Uploading ${routes.length} routes, ${countCues(routes)} route photos, and ${locationCues.length} Location Cues to ${cloudUrl}...`);
    await writeRoutesTo(cloudUrl, routes);
    await writeLocationCuesTo(cloudUrl, locationCues);
    localStorage.setItem("taxiBoLastCloudSyncAt", new Date().toISOString());
    setSyncStatus(`Sync complete. Cloud now has ${routes.length} routes, ${countCues(routes)} route photos, and ${locationCues.length} Location Cues.`);
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
    const [routes, locationCues] = await Promise.all([
      fetchRoutesFrom(cloudUrl),
      fetchLocationCuesFrom(cloudUrl),
    ]);
    setSyncStatus(`Writing ${routes.length} cloud routes, ${countCues(routes)} route photos, and ${locationCues.length} Location Cues to local SQLite...`);
    await writeRoutesTo(window.location.origin, routes, localHeaders());
    await writeLocationCuesTo(window.location.origin, locationCues, localHeaders());
    setSyncStatus(`Pull complete. Local SQLite now has ${routes.length} routes, ${countCues(routes)} route photos, and ${locationCues.length} Location Cues.`);
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

function hdeHeaders(extra = {}) {
  return { ...extra, "X-TaxiBo-Storage-Mode": getStorageMode() };
}

async function loadHybridEngine(refresh = false) {
  hdeRefreshButton.disabled = true;
  hdeState.textContent = "Reading Hybrid Drive Engine...";
  try {
    const [statusResponse, issueResponse] = await Promise.all([
      fetch(`/api/hybrid-engine/status${refresh ? "?refresh=1" : ""}`, { cache: "no-store", headers: hdeHeaders() }),
      fetch("/api/hybrid-engine/issues", { cache: "no-store", headers: hdeHeaders() }),
    ]);
    const [statusResult, issueResult] = await Promise.all([statusResponse.json(), issueResponse.json()]);
    if (!statusResponse.ok || !statusResult.ok) throw new Error(statusResult.error || "Could not load HDE status.");
    if (!issueResponse.ok || !issueResult.ok) throw new Error(issueResult.error || "Could not load HDE issues.");

    hdeIssues = issueResult.issues || [];
    const active = hdeIssues.filter((issue) => issue.status !== "resolved");
    hdeCorridorCount.textContent = statusResult.status.corridorCount || 0;
    hdeOpenCount.textContent = active.length;
    hdeRecordingCount.textContent = active.filter((issue) => issue.recordingNeeded).length;
    hdeHighCount.textContent = active.filter((issue) => issue.severity === "high").length;
    hdeState.textContent = `Engine v${statusResult.status.version} · ${statusResult.status.corridorCount} proven corridors · ${active.length} active issues.`;
    renderHdeIssues();
  } catch (error) {
    hdeState.className = "form-state";
    hdeState.textContent = error.message || "Could not load Hybrid Drive Engine.";
  } finally {
    hdeRefreshButton.disabled = false;
  }
}

function filteredHdeIssues() {
  const filter = hdeIssueFilter.value;
  if (filter === "all") return hdeIssues;
  if (filter === "recording-needed") return hdeIssues.filter((issue) => issue.recordingNeeded && issue.status !== "resolved");
  if (filter === "high") return hdeIssues.filter((issue) => issue.severity === "high" && issue.status !== "resolved");
  return hdeIssues.filter((issue) => issue.status !== "resolved");
}

function hdeReportText(issue) {
  const location = Number.isFinite(Number(issue.latitude))
    ? `${Number(issue.latitude).toFixed(6)}, ${Number(issue.longitude).toFixed(6)}`
    : "Not captured";
  return [
    "TaxiBo Hybrid Drive Engine issue",
    `Issue ID: ${issue.id}`,
    `Status: ${issue.status} · Severity: ${issue.severity}`,
    `Type: ${issue.issueType}`,
    `Start: ${issue.start || "Not supplied"}`,
    `Destination: ${issue.destination || "Not supplied"}`,
    `Via/problem location: ${issue.via || location}`,
    `Engine state: ${issue.engineState} · Confidence: ${Math.round(Number(issue.confidence || 0) * 100)}%`,
    `Recording needed: ${issue.recordingNeeded ? "Yes" : "No"}`,
    `Problem: ${issue.message}`,
    "Please reproduce this route, inspect recorded-corridor matches, and recommend or implement the safest correction.",
  ].join("\n");
}

function escapeSettingsHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function renderHdeIssues() {
  const issues = filteredHdeIssues();
  if (!issues.length) {
    hdeIssueList.innerHTML = `<div class="form-state empty-state">No issues match this filter.</div>`;
    return;
  }
  hdeIssueList.innerHTML = issues.map((issue) => `
    <article class="hde-issue-card is-${escapeSettingsHtml(issue.severity)}">
      <div class="hde-issue-card-head"><span>${escapeSettingsHtml(issue.severity)} · ${escapeSettingsHtml(issue.status)}</span><strong>${escapeSettingsHtml(issue.title)}</strong></div>
      <p>${escapeSettingsHtml(issue.start || "Unknown start")} → ${escapeSettingsHtml(issue.destination || "Unknown destination")}${issue.via ? ` · via ${escapeSettingsHtml(issue.via)}` : ""}</p>
      <p>${escapeSettingsHtml(issue.message)}</p>
      <small>${issue.recordingNeeded ? "Recording needed" : "Route review"} · ${Math.round(Number(issue.confidence || 0) * 100)}% confidence · seen ${issue.occurrenceCount || 1} time${issue.occurrenceCount === 1 ? "" : "s"}</small>
      <div class="hde-issue-actions">
        <button class="secondary-button small-button" type="button" data-hde-copy="${issue.id}">Copy for Codex</button>
        ${issue.status !== "recording" && issue.status !== "resolved" ? `<button class="secondary-button small-button" type="button" data-hde-status="recording" data-hde-id="${issue.id}">Recording planned</button>` : ""}
        ${issue.status !== "resolved" ? `<button class="secondary-button small-button" type="button" data-hde-status="resolved" data-hde-id="${issue.id}">Resolve</button>` : `<button class="secondary-button small-button" type="button" data-hde-status="open" data-hde-id="${issue.id}">Reopen</button>`}
      </div>
    </article>
  `).join("");

  hdeIssueList.querySelectorAll("[data-hde-copy]").forEach((button) => button.addEventListener("click", async () => {
    const issue = hdeIssues.find((item) => item.id === button.dataset.hdeCopy);
    await navigator.clipboard.writeText(hdeReportText(issue));
    hdeState.textContent = "Issue report copied. Paste it directly into Codex.";
  }));
  hdeIssueList.querySelectorAll("[data-hde-status]").forEach((button) => button.addEventListener("click", () => updateHdeIssueStatus(button.dataset.hdeId, button.dataset.hdeStatus)));
}

async function updateHdeIssueStatus(id, status) {
  const response = await fetch("/api/hybrid-engine/issues/status", {
    method: "POST", headers: hdeHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id, status }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Could not update issue.");
  await loadHybridEngine();
}

async function submitHdeIssue(event) {
  event.preventDefault();
  const payload = {
    title: hdeIssueType.options[hdeIssueType.selectedIndex].text,
    issueType: hdeIssueType.value,
    severity: hdeIssueType.value === "route-loop" || hdeIssueType.value === "wrong-level" ? "high" : "medium",
    start: hdeIssueStart.value.trim(), destination: hdeIssueDestination.value.trim(), via: hdeIssueVia.value.trim(),
    message: hdeIssueMessage.value.trim(), recordingNeeded: hdeIssueType.value === "recording-needed",
  };
  const response = await fetch("/api/hybrid-engine/issues", {
    method: "POST", headers: hdeHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Could not add HDE issue.");
  hdeIssueForm.reset();
  await loadHybridEngine();
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
hdeRefreshButton.addEventListener("click", () => loadHybridEngine(true));
hdeIssueFilter.addEventListener("change", renderHdeIssues);
hdeIssueForm.addEventListener("submit", (event) => submitHdeIssue(event).catch((error) => {
  hdeState.className = "form-state";
  hdeState.textContent = error.message || "Could not add HDE issue.";
}));

cloudTargetUrl.value = localStorage.getItem(TAXIBO_CLOUD_TARGET_KEY) || "https://taxi-bo.onrender.com";
renderSettings();
checkDatabaseHealth();
loadHybridEngine();

// Photo-free route packages for the local NaviDrive app.
const naviExportSelect = document.querySelector('#naviExportRoute');
const naviExportButton = document.querySelector('#exportNaviDrive');
const naviExportStatus = document.querySelector('#naviExportStatus');
let naviExportRoutes = [];
let naviExportLoad = 0;
async function loadNaviExportRoutes() {
 const request = ++naviExportLoad;
 naviExportButton.disabled = true;
 naviExportStatus.textContent = 'Loading saved routes...';
 try {
  const response = await fetch('/api/routes?images=0', {cache:'no-store', headers:{'X-TaxiBo-Storage-Mode':getStorageMode()}});
  if (!response.ok) throw new Error('Could not load routes. Use Refresh routes to retry.');
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Invalid route list.');
  if (request !== naviExportLoad) return;
  naviExportRoutes = data;
  naviExportSelect.replaceChildren();
  for (const route of data) {
   const option = document.createElement('option'); option.value=route.id; option.textContent=route.name || route.destination || 'Untitled route'; naviExportSelect.append(option);
  }
  naviExportButton.disabled = !data.length;
  naviExportStatus.textContent = data.length ? 'Choose a route to export.' : 'No saved routes in this storage mode. Save a route in Cue first.';
 } catch(error) { if(request === naviExportLoad) { naviExportRoutes=[]; naviExportSelect.replaceChildren(); naviExportStatus.textContent=error.message; } }
}
document.querySelector('#refreshNaviRoutes').addEventListener('click',loadNaviExportRoutes);
inHouseMaintenanceSwitch.addEventListener('change',loadNaviExportRoutes);
naviExportButton.addEventListener('click',()=>{
 try {
  const selected=naviExportRoutes.find(r=>String(r.id)===naviExportSelect.value);
  if(!selected) throw Error('Choose a saved route first.');
  const {photos,...route}=selected;
  const geometry=route.routeGeometry?.length>=2 ? route.routeGeometry : route.recordedTrackPoints;
  if(!geometry || geometry.length<2) throw Error('This route has no geometry. Prepare and save it in Cue first.');
  const blob=new Blob([JSON.stringify({format:'taxibo-cue-route',version:1,exportedAt:new Date().toISOString(),route})],{type:'application/json'});
  if(blob.size>40*1024*1024) throw Error('Route package exceeds 40 MB.');
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='taxibo-cue-route-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  naviExportStatus.textContent='Exported. Open local NaviDrive and use Import Cue JSON to load the downloaded file.';
 } catch(error) {naviExportStatus.textContent=error.message;}
});
loadNaviExportRoutes();
