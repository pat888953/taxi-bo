const STORAGE_KEY = "taxiboStreetMapRoutesV2";
const REPORT_STORAGE_KEY = "taxiboStreetMapReportsV1";
const HK_BOUNDS = L.latLngBounds([22.13, 113.80], [22.58, 114.45]);
const HK_CENTER = [22.3193, 114.1694];

const routeNameInput = document.querySelector("#routeName");
const routeStartInput = document.querySelector("#routeStart");
const routeDestinationInput = document.querySelector("#routeDestination");
const routeNotesInput = document.querySelector("#routeNotes");
const startRecordingButton = document.querySelector("#startRecording");
const stopRecordingButton = document.querySelector("#stopRecording");
const saveRouteButton = document.querySelector("#saveRoute");
const recordingStatus = document.querySelector("#recordingStatus");
const pointCount = document.querySelector("#pointCount");
const distanceCount = document.querySelector("#distanceCount");
const routeList = document.querySelector("#routeList");
const loadSampleButton = document.querySelector("#loadSample");
const exportRoutesButton = document.querySelector("#exportRoutes");
const importRoutesInput = document.querySelector("#importRoutes");
const storageMode = document.querySelector("#storageMode");
const reportTypeInput = document.querySelector("#reportType");
const reportConfidenceInput = document.querySelector("#reportConfidence");
const reportTitleInput = document.querySelector("#reportTitle");
const reportNotesInput = document.querySelector("#reportNotes");
const addReportButton = document.querySelector("#addReport");
const clearLocalReportsButton = document.querySelector("#clearLocalReports");
const reportList = document.querySelector("#reportList");
const routeStartLatInput = document.querySelector("#routeStartLat");
const routeStartLonInput = document.querySelector("#routeStartLon");
const routeEndLatInput = document.querySelector("#routeEndLat");
const routeEndLonInput = document.querySelector("#routeEndLon");
const setRouteStartButton = document.querySelector("#setRouteStart");
const setRouteEndButton = document.querySelector("#setRouteEnd");
const calculateRouteButton = document.querySelector("#calculateRoute");
const routePlannerStatus = document.querySelector("#routePlannerStatus");
const routeDirections = document.querySelector("#routeDirections");
const drivingModeToggle = document.querySelector("#drivingModeToggle");
const driveRecordButton = document.querySelector("#driveRecord");
const driveTrafficButton = document.querySelector("#driveTraffic");
const driveTunnelButton = document.querySelector("#driveTunnel");
const drivePickupButton = document.querySelector("#drivePickup");

const map = L.map("map", {
  center: HK_CENTER,
  zoom: 12,
  maxBounds: HK_BOUNDS.pad(0.45),
  maxBoundsViscosity: 0.7
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const hongKongFrame = L.rectangle(HK_BOUNDS, {
  color: "#087450",
  weight: 2,
  fill: false,
  dashArray: "6 6"
}).addTo(map);
hongKongFrame.bindTooltip("TaxiBoStreetMap HK working area", { sticky: true });

let routes = [];
let reports = [];
let apiAvailable = false;
let watchId = null;
let recordingPoints = [];
let recordingLine = null;
let routeLayers = [];
let reportLayers = [];
let calculatedRouteLayer = null;

startRecordingButton.addEventListener("click", startRecording);
stopRecordingButton.addEventListener("click", stopRecording);
saveRouteButton.addEventListener("click", saveCurrentRoute);
loadSampleButton.addEventListener("click", loadSampleRoutes);
exportRoutesButton.addEventListener("click", exportRoutes);
importRoutesInput.addEventListener("change", importRoutes);
addReportButton.addEventListener("click", addReportAtMapCenter);
clearLocalReportsButton.addEventListener("click", clearLocalReports);
setRouteStartButton.addEventListener("click", () => setRoutePointFromMapCenter("start"));
setRouteEndButton.addEventListener("click", () => setRoutePointFromMapCenter("end"));
calculateRouteButton.addEventListener("click", calculateTaxiRoute);
drivingModeToggle.addEventListener("click", toggleDrivingMode);
driveRecordButton.addEventListener("click", toggleDriveRecording);
driveTrafficButton.addEventListener("click", () => addQuickReport("traffic", "Traffic slowdown"));
driveTunnelButton.addEventListener("click", () => addQuickReport("tunnel_delay", "Tunnel delay"));
drivePickupButton.addEventListener("click", () => addQuickReport("pickup_hotspot", "Pickup hotspot"));

initialize();

async function initialize() {
  setRecordingButtons();
  apiAvailable = await checkApi();
  storageMode.textContent = apiAvailable ? "PostGIS storage" : "Local fallback";
  storageMode.classList.toggle("offline", !apiAvailable);
  routes = apiAvailable ? await fetchRoutesFromApi() : loadRoutesFromLocalStorage();
  reports = apiAvailable ? await fetchReportsFromApi() : loadReportsFromLocalStorage();
  renderRoutes();
  renderReports();
  renderRecording();
}

function startRecording() {
  if (!navigator.geolocation) {
    setStatus("This browser does not support GPS location.", false);
    return;
  }

  recordingPoints = [];
  renderRecording();
  setStatus("Recording started. Keep this page open while driving.", true);

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const point = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number(position.coords.accuracy || 0),
        speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        recordedAt: new Date().toISOString()
      };

      if (!isInsideHongKong(point)) {
        setStatus("GPS point ignored because it is outside the Hong Kong map area.", false);
        return;
      }

      const previous = recordingPoints[recordingPoints.length - 1];
      if (previous && distanceMeters(previous, point) < 8) {
        return;
      }

      recordingPoints.push(point);
      renderRecording();
      setStatus(`Recording live route: ${recordingPoints.length} GPS points saved in memory.`, true);
    },
    (error) => {
      setStatus(error.message || "Could not read GPS location.", false);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 12000
    }
  );
  setRecordingButtons();
}

function stopRecording() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  setStatus(recordingPoints.length ? "Recording stopped. Add route details, then save." : "Recording stopped.", true);
  setRecordingButtons();
}

async function saveCurrentRoute() {
  const route = normalizeRoute({
    id: crypto.randomUUID(),
    name: routeNameInput.value,
    start: routeStartInput.value,
    destination: routeDestinationInput.value,
    notes: routeNotesInput.value,
    createdAt: new Date().toISOString(),
    points: recordingPoints
  });

  if (!route.name || !route.destination) {
    setStatus("Enter a route name and destination before saving.", false);
    return;
  }

  if (route.points.length < 2) {
    setStatus("At least two GPS points are needed before saving a route.", false);
    return;
  }

  const saved = apiAvailable ? await createRouteInApi(route) : route;
  if (!saved) return;

  routes.unshift(saved);
  saveRoutesToLocalStorage(routes);
  renderRoutes(saved.id);
  recordingPoints = [];
  routeNameInput.value = "";
  routeStartInput.value = "";
  routeDestinationInput.value = "";
  routeNotesInput.value = "";
  renderRecording();
  setStatus(apiAvailable ? "Route saved to PostGIS." : "Route saved to local fallback storage.", true);
}

function renderRecording() {
  pointCount.textContent = String(recordingPoints.length);
  distanceCount.textContent = (totalDistance(recordingPoints) / 1000).toFixed(1);

  if (recordingLine) {
    recordingLine.remove();
    recordingLine = null;
  }

  if (recordingPoints.length) {
    const latLngs = recordingPoints.map(toLatLng);
    recordingLine = L.polyline(latLngs, {
      color: "#d78a1f",
      weight: 6,
      opacity: 0.92
    }).addTo(map);
    map.fitBounds(recordingLine.getBounds(), { padding: [24, 24] });
  }
  setRecordingButtons();
}

function renderRoutes(focusRouteId = "") {
  routeLayers.forEach((layer) => layer.remove());
  routeLayers = [];
  routeList.innerHTML = "";

  if (!routes.length) {
    routeList.innerHTML = `<p class="status-line">No TaxiBoStreetMap routes yet. Record one, or load the sample.</p>`;
    return;
  }

  routes.forEach((route, index) => {
    const color = index % 2 === 0 ? "#087450" : "#2f72a8";
    const latLngs = route.points.map(toLatLng);
    const rawLine = L.polyline(latLngs, {
      color,
      weight: route.id === focusRouteId ? 7 : 4,
      opacity: route.matchedPoints.length ? 0.28 : route.id === focusRouteId ? 0.95 : 0.55,
      dashArray: route.matchedPoints.length ? "6 8" : null
    }).addTo(map);
    rawLine.bindPopup(`<strong>${escapeHtml(route.name)}</strong><br>${escapeHtml(route.destination)}<br>Raw GPS: ${formatDistance(route.distanceMeters)}`);
    routeLayers.push(rawLine);

    if (route.matchedPoints.length) {
      const matchedLine = L.polyline(route.matchedPoints.map(toLatLng), {
        color: "#b33939",
        weight: route.id === focusRouteId ? 8 : 5,
        opacity: route.id === focusRouteId ? 0.95 : 0.72
      }).addTo(map);
      matchedLine.bindPopup(`<strong>${escapeHtml(route.name)}</strong><br>Matched road route<br>${escapeHtml(route.destination)}`);
      routeLayers.push(matchedLine);
    }

    const first = latLngs[0];
    const last = latLngs[latLngs.length - 1];
    if (first) {
      routeLayers.push(L.circleMarker(first, {
        radius: 6,
        color,
        fillColor: "#fff",
        fillOpacity: 1,
        weight: 3
      }).addTo(map));
    }
    if (last) {
      routeLayers.push(L.marker(last).addTo(map).bindPopup(escapeHtml(route.destination)));
    }

    const card = document.createElement("article");
    card.className = `route-card ${route.reviewStatus || "draft"}`;
    card.innerHTML = `
      <h3>${escapeHtml(route.name)}</h3>
      <p>${escapeHtml(route.start || "Unknown start")} to ${escapeHtml(route.destination)}</p>
      <div class="tag-row">
        <span class="tag">${route.points.length} GPS points</span>
        <span class="tag">${formatDistance(route.distanceMeters)}</span>
        <span class="tag">${escapeHtml(route.reviewStatus || "draft")}</span>
        <span class="tag">trust ${Number(route.trustScore || 0).toFixed(0)}</span>
        <span class="tag">${escapeHtml(route.matchStatus || "pending")}</span>
      </div>
      ${route.matchError ? `<p>${route.matchStatus === "matched" ? "Matched with fallback route." : escapeHtml(route.matchError)}</p>` : ""}
      ${route.notes ? `<p>${escapeHtml(route.notes)}</p>` : ""}
      <div class="route-card-actions">
        <button class="secondary-button" type="button" data-view="${route.id}">View</button>
        <button class="secondary-button" type="button" data-match="${route.id}">Match</button>
        <button class="secondary-button" type="button" data-review="trusted" data-route="${route.id}">Trust</button>
        <button class="secondary-button" type="button" data-review="draft" data-route="${route.id}">Draft</button>
        <button class="secondary-button" type="button" data-review="rejected" data-route="${route.id}">Reject</button>
        <button class="danger-button" type="button" data-delete="${route.id}">Delete</button>
      </div>
    `;
    routeList.append(card);
  });

  routeList.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => viewRoute(button.dataset.view));
  });
  routeList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteRoute(button.dataset.delete));
  });
  routeList.querySelectorAll("[data-review]").forEach((button) => {
    button.addEventListener("click", () => reviewRoute(button.dataset.route, button.dataset.review));
  });
  routeList.querySelectorAll("[data-match]").forEach((button) => {
    button.addEventListener("click", () => matchSavedRoute(button.dataset.match));
  });

  if (focusRouteId) {
    viewRoute(focusRouteId);
  } else if (routes.length) {
    const group = L.featureGroup(routeLayers.filter((layer) => typeof layer.getBounds === "function"));
    map.fitBounds(group.getBounds(), { padding: [24, 24] });
  }
}

function viewRoute(routeId) {
  const route = routes.find((item) => item.id === routeId);
  if (!route) return;

  const latLngs = route.points.map(toLatLng);
  const matchedLatLngs = route.matchedPoints.map(toLatLng);
  const visibleLatLngs = matchedLatLngs.length ? matchedLatLngs : latLngs;
  if (visibleLatLngs.length) {
    map.fitBounds(L.latLngBounds(visibleLatLngs), { padding: [28, 28] });
  }
  setStatus(`Viewing ${route.name}: ${route.points.length} GPS points, ${route.matchStatus}.`, true);
}

async function deleteRoute(routeId) {
  const route = routes.find((item) => item.id === routeId);
  if (!route || !confirm(`Delete route "${route.name}"?`)) return;

  if (apiAvailable) {
    try {
      await fetch(`/api/routes/${routeId}`, { method: "DELETE" });
    } catch {
      setStatus("Could not delete from API. Check the server connection.", false);
      return;
    }
  }

  routes = routes.filter((item) => item.id !== routeId);
  saveRoutesToLocalStorage(routes);
  renderRoutes();
  setStatus("Route deleted.", true);
}

async function reviewRoute(routeId, reviewStatus) {
  const route = routes.find((item) => item.id === routeId);
  if (!route) return;

  const trustScore = reviewStatus === "trusted" ? 85 : reviewStatus === "rejected" ? 0 : 25;
  const review = { reviewStatus, trustScore };

  if (apiAvailable) {
    try {
      const response = await fetch(`/api/routes/${routeId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review)
      });
      if (!response.ok) throw new Error("Could not update route review.");
    } catch (error) {
      setStatus(error.message || "Could not update route review.", false);
      return;
    }
  }

  route.reviewStatus = review.reviewStatus;
  route.trustScore = review.trustScore;
  saveRoutesToLocalStorage(routes);
  renderRoutes(routeId);
  setStatus(`Route marked ${reviewStatus}.`, true);
}

async function matchSavedRoute(routeId) {
  const route = routes.find((item) => item.id === routeId);
  if (!route) return;

  route.matchStatus = "matching";
  route.matchError = "";
  renderRoutes(routeId);
  setStatus(`Matching ${route.name} to the road network...`, true);

  try {
    const response = await fetch(apiAvailable ? `/api/routes/${routeId}/match` : "/api/map-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: apiAvailable ? undefined : JSON.stringify(route)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || payload.details || "Map matching failed.");
    }

    route.matchStatus = payload.matchStatus || payload.status || "matched";
    route.matchError = payload.matchError || payload.error || "";
    route.matchedPoints = payload.matchedPoints || payload.geometry || [];
    saveRoutesToLocalStorage(routes);
    renderRoutes(routeId);
    setStatus(`Route matched: ${route.name}.`, true);
  } catch (error) {
    route.matchStatus = "failed";
    route.matchError = error.message || "Map matching failed.";
    saveRoutesToLocalStorage(routes);
    renderRoutes(routeId);
    setStatus(route.matchError, false);
  }
}

async function loadSampleRoutes() {
  const sample = normalizeRoute({
    id: crypto.randomUUID(),
    name: "Sample: Wong Tai Sin to Wan Chai via Hung Hom",
    start: "Wong Tai Sin",
    destination: "Tonnochy Road, Wan Chai",
    notes: "Demo route only. Replace with real taxi recordings.",
    createdAt: new Date().toISOString(),
    points: [
      [22.3416, 114.1938],
      [22.3347, 114.1884],
      [22.3236, 114.1857],
      [22.3117, 114.1782],
      [22.3034, 114.1801],
      [22.2946, 114.1795],
      [22.2879, 114.1758],
      [22.2804, 114.1769]
    ].map(([latitude, longitude]) => ({ latitude, longitude, accuracy: 10, speed: null, recordedAt: new Date().toISOString() }))
  });

  const saved = apiAvailable ? await createRouteInApi(sample) : sample;
  if (!saved) return;

  routes.unshift(saved);
  saveRoutesToLocalStorage(routes);
  renderRoutes(saved.id);
  setStatus("Sample Hong Kong taxi route loaded.", true);
}

function exportRoutes() {
  const blob = new Blob([JSON.stringify(routes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `taxibo-street-map-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importRoutes(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    if (file.size > 5_000_000) {
      throw new Error("JSON file is too large for this prototype importer.");
    }

    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported)) {
      throw new Error("JSON must be a route array.");
    }

    const normalizedRoutes = imported
      .map(normalizeRoute)
      .filter((route) => route.points.length >= 2);

    if (apiAvailable) {
      for (const route of normalizedRoutes) {
        const saved = await createRouteInApi(route);
        if (saved) routes.unshift(saved);
      }
    } else {
      routes = normalizedRoutes;
    }

    saveRoutesToLocalStorage(routes);
    renderRoutes();
    setStatus(`Imported ${normalizedRoutes.length} TaxiBoStreetMap routes.`, true);
  } catch (error) {
    setStatus(error.message || "Could not import routes.", false);
  } finally {
    importRoutesInput.value = "";
  }
}

function setRoutePointFromMapCenter(target) {
  const center = map.getCenter();
  const latInput = target === "start" ? routeStartLatInput : routeEndLatInput;
  const lonInput = target === "start" ? routeStartLonInput : routeEndLonInput;
  latInput.value = center.lat.toFixed(6);
  lonInput.value = center.lng.toFixed(6);
  setRoutePlannerStatus(`${target === "start" ? "Start" : "Destination"} set at map center.`, true);
}

async function calculateTaxiRoute() {
  const locations = [
    {
      latitude: Number(routeStartLatInput.value),
      longitude: Number(routeStartLonInput.value)
    },
    {
      latitude: Number(routeEndLatInput.value),
      longitude: Number(routeEndLonInput.value)
    }
  ];

  if (locations.some((location) => !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || !isInsideHongKong(location))) {
    setRoutePlannerStatus("Enter start and destination coordinates inside Hong Kong.", false);
    return;
  }

  calculateRouteButton.disabled = true;
  setRoutePlannerStatus("Asking Valhalla for a taxi route...", true);

  try {
    const response = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ costing: "taxi", locations })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not calculate route.");
    }

    renderCalculatedRoute(payload);
    const distance = Number(payload.summary?.distanceKilometers || 0).toFixed(1);
    const minutes = Math.round(Number(payload.summary?.durationSeconds || 0) / 60);
    setRoutePlannerStatus(`Taxi route calculated: ${distance} km, about ${minutes} min.`, true);
  } catch (error) {
    setRoutePlannerStatus(error.message || "Valhalla route request failed.", false);
  } finally {
    calculateRouteButton.disabled = false;
  }
}

function renderCalculatedRoute(route) {
  if (calculatedRouteLayer) {
    calculatedRouteLayer.remove();
    calculatedRouteLayer = null;
  }

  const latLngs = Array.isArray(route.geometry) ? route.geometry.map(toLatLng) : [];
  if (latLngs.length) {
    calculatedRouteLayer = L.polyline(latLngs, {
      color: "#b33939",
      weight: 7,
      opacity: 0.86
    }).addTo(map);
    map.fitBounds(calculatedRouteLayer.getBounds(), { padding: [28, 28] });
  }

  const maneuvers = Array.isArray(route.maneuvers) ? route.maneuvers.slice(0, 8) : [];
  routeDirections.innerHTML = maneuvers.length
    ? `<ol class="directions-list">${maneuvers.map((step) => `<li>${escapeHtml(step.instruction || step.name || "Continue")}</li>`).join("")}</ol>`
    : `<p class="status-line">Route shape returned without turn instructions.</p>`;
}

function setRoutePlannerStatus(message, ok = false) {
  routePlannerStatus.textContent = message;
  routePlannerStatus.classList.toggle("ok", ok);
}

async function addReportAtMapCenter() {
  const center = map.getCenter();
  const report = normalizeReport({
    id: crypto.randomUUID(),
    reportType: reportTypeInput.value,
    title: reportTitleInput.value,
    notes: reportNotesInput.value,
    confidence: reportConfidenceInput.value,
    latitude: center.lat,
    longitude: center.lng,
    reportedAt: new Date().toISOString()
  });

  if (!report.title) {
    setStatus("Enter a report title before adding it.", false);
    return;
  }
  if (!isInsideHongKong(report)) {
    setStatus("Move the map center inside Hong Kong before adding a report.", false);
    return;
  }

  const saved = apiAvailable ? await createReportInApi(report) : report;
  if (!saved) return;

  reports.unshift(saved);
  saveReportsToLocalStorage(reports);
  renderReports(saved.id);
  reportTitleInput.value = "";
  reportNotesInput.value = "";
  setStatus(apiAvailable ? "Live report saved to PostGIS." : "Live report saved locally.", true);
}

function renderReports(focusReportId = "") {
  reportLayers.forEach((layer) => layer.remove());
  reportLayers = [];
  reportList.innerHTML = "";

  if (!reports.length) {
    reportList.innerHTML = `<p class="status-line">No live reports yet. Add one at the map center.</p>`;
    return;
  }

  reports.forEach((report) => {
    const marker = L.circleMarker([report.latitude, report.longitude], {
      radius: report.id === focusReportId ? 10 : 7,
      color: reportColor(report.reportType),
      fillColor: reportColor(report.reportType),
      fillOpacity: 0.78,
      weight: 2
    }).addTo(map);
    marker.bindPopup(`<strong>${escapeHtml(report.title)}</strong><br>${escapeHtml(report.reportType)}<br>confidence ${Number(report.confidence || 0).toFixed(0)}`);
    reportLayers.push(marker);

    const card = document.createElement("article");
    card.className = "route-card";
    card.innerHTML = `
      <h3>${escapeHtml(report.title)}</h3>
      <div class="tag-row">
        <span class="tag">${escapeHtml(report.reportType)}</span>
        <span class="tag">confidence ${Number(report.confidence || 0).toFixed(0)}</span>
      </div>
      ${report.notes ? `<p>${escapeHtml(report.notes)}</p>` : ""}
      <div class="route-card-actions">
        <button class="secondary-button" type="button" data-view-report="${report.id}">View</button>
        <button class="secondary-button" type="button" data-confirm-report="${report.id}">Confirm</button>
        <button class="danger-button" type="button" data-delete-report="${report.id}">Clear</button>
      </div>
    `;
    reportList.append(card);
  });

  reportList.querySelectorAll("[data-view-report]").forEach((button) => {
    button.addEventListener("click", () => viewReport(button.dataset.viewReport));
  });
  reportList.querySelectorAll("[data-delete-report]").forEach((button) => {
    button.addEventListener("click", () => deleteReport(button.dataset.deleteReport));
  });
  reportList.querySelectorAll("[data-confirm-report]").forEach((button) => {
    button.addEventListener("click", () => confirmReport(button.dataset.confirmReport));
  });
}

function viewReport(reportId) {
  const report = reports.find((item) => item.id === reportId);
  if (!report) return;

  map.setView([report.latitude, report.longitude], Math.max(map.getZoom(), 15));
  setStatus(`Viewing report: ${report.title}.`, true);
}

async function deleteReport(reportId) {
  if (apiAvailable) {
    try {
      await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
    } catch {
      setStatus("Could not clear report from API.", false);
      return;
    }
  }

  reports = reports.filter((report) => report.id !== reportId);
  saveReportsToLocalStorage(reports);
  renderReports();
  setStatus("Report cleared.", true);
}

async function confirmReport(reportId) {
  const report = reports.find((item) => item.id === reportId);
  if (!report) return;

  if (apiAvailable) {
    try {
      const response = await fetch(`/api/reports/${reportId}/confirm`, { method: "PATCH" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not confirm report.");
      Object.assign(report, normalizeReport(payload));
    } catch (error) {
      setStatus(error.message || "Could not confirm report.", false);
      return;
    }
  } else {
    report.confidence = Math.min(100, Number(report.confidence || 0) + 10);
  }

  saveReportsToLocalStorage(reports);
  renderReports(reportId);
  setStatus("Report confirmed.", true);
}

function toggleDrivingMode() {
  const enabled = document.body.classList.toggle("driving-mode");
  drivingModeToggle.textContent = enabled ? "Exit driving" : "Driving mode";
  setTimeout(() => map.invalidateSize(), 120);
}

function toggleDriveRecording() {
  if (watchId === null) {
    startRecording();
    driveRecordButton.textContent = "Stop";
  } else {
    stopRecording();
    driveRecordButton.textContent = "Record";
  }
}

async function addQuickReport(reportType, title) {
  const center = map.getCenter();
  const report = normalizeReport({
    id: crypto.randomUUID(),
    reportType,
    title,
    notes: "Quick driving report",
    confidence: 60,
    latitude: center.lat,
    longitude: center.lng,
    reportedAt: new Date().toISOString()
  });

  const saved = apiAvailable ? await createReportInApi(report) : report;
  if (!saved) return;

  reports.unshift(saved);
  saveReportsToLocalStorage(reports);
  renderReports(saved.id);
  setStatus(`${title} report added.`, true);
}

function clearLocalReports() {
  reports = [];
  saveReportsToLocalStorage(reports);
  renderReports();
  setStatus("Local reports cleared.", true);
}

async function checkApi() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    return response.ok && health.database === "connected";
  } catch {
    return false;
  }
}

async function fetchRoutesFromApi() {
  try {
    const response = await fetch("/api/routes");
    if (!response.ok) throw new Error("Could not fetch routes.");
    const apiRoutes = await response.json();
    return apiRoutes.map(normalizeRoute).filter((route) => route.points.length >= 2);
  } catch {
    setStatus("API is reachable, but routes could not be loaded. Using local fallback.", false);
    apiAvailable = false;
    storageMode.textContent = "Local fallback";
    storageMode.classList.add("offline");
    return loadRoutesFromLocalStorage();
  }
}

async function createRouteInApi(route) {
  try {
    const response = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(route)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not save route.");
    }
    return normalizeRoute(payload);
  } catch (error) {
    setStatus(error.message || "Could not save route to API.", false);
    return null;
  }
}

async function fetchReportsFromApi() {
  try {
    const response = await fetch("/api/reports");
    if (!response.ok) throw new Error("Could not fetch reports.");
    const apiReports = await response.json();
    return apiReports.map(normalizeReport).filter((report) => isInsideHongKong(report));
  } catch {
    return loadReportsFromLocalStorage();
  }
}

async function createReportInApi(report) {
  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not save report.");
    }
    return normalizeReport(payload);
  } catch (error) {
    setStatus(error.message || "Could not save report to API.", false);
    return null;
  }
}

function normalizeRoute(route) {
  const points = Array.isArray(route.points)
    ? route.points
        .map((point) => ({
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          accuracy: Number(point.accuracy || 0),
          speed: Number.isFinite(Number(point.speed)) ? Number(point.speed) : null,
          recordedAt: String(point.recordedAt || new Date().toISOString())
        }))
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && isInsideHongKong(point))
    : [];

  return {
    id: typeof route.id === "string" && route.id ? route.id : crypto.randomUUID(),
    name: String(route.name || "Untitled taxi route").trim(),
    start: String(route.start || "").trim(),
    destination: String(route.destination || "").trim(),
    notes: String(route.notes || "").trim(),
    createdAt: String(route.createdAt || new Date().toISOString()),
    reviewStatus: String(route.reviewStatus || "draft"),
    trustScore: Number(route.trustScore || 0),
    matchStatus: String(route.matchStatus || "pending"),
    matchError: String(route.matchError || ""),
    matchedPoints: normalizeGeometryPoints(route.matchedPoints || route.matchedGeometry),
    points,
    distanceMeters: totalDistance(points)
  };
}

function normalizeGeometryPoints(value) {
  if (Array.isArray(value)) {
    return value
      .map((point) => ({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude)
      }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && isInsideHongKong(point));
  }

  if (value?.type === "LineString" && Array.isArray(value.coordinates)) {
    return value.coordinates
      .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && isInsideHongKong(point));
  }

  return [];
}

function normalizeReport(report) {
  return {
    id: typeof report.id === "string" && report.id ? report.id : crypto.randomUUID(),
    reportType: String(report.reportType || "traffic").trim(),
    title: String(report.title || "").trim(),
    notes: String(report.notes || "").trim(),
    status: String(report.status || "active"),
    confidence: Math.max(0, Math.min(100, Number(report.confidence || 50))),
    latitude: Number(report.latitude),
    longitude: Number(report.longitude),
    reportedAt: String(report.reportedAt || new Date().toISOString()),
    expiresAt: report.expiresAt ? String(report.expiresAt) : null
  };
}

function loadRoutesFromLocalStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeRoute).filter((route) => route.points.length >= 2) : [];
  } catch {
    return [];
  }
}

function saveRoutesToLocalStorage(nextRoutes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRoutes));
}

function loadReportsFromLocalStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeReport).filter((report) => isInsideHongKong(report)) : [];
  } catch {
    return [];
  }
}

function saveReportsToLocalStorage(nextReports) {
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(nextReports));
}

function setRecordingButtons() {
  const isRecording = watchId !== null;
  startRecordingButton.disabled = isRecording;
  stopRecordingButton.disabled = !isRecording;
  saveRouteButton.disabled = recordingPoints.length < 2 || isRecording;
  driveRecordButton.textContent = isRecording ? "Stop" : "Record";
}

function isInsideHongKong(point) {
  return HK_BOUNDS.contains([point.latitude, point.longitude]);
}

function toLatLng(point) {
  return [point.latitude, point.longitude];
}

function totalDistance(points) {
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    meters += distanceMeters(points[index - 1], points[index]);
  }
  return meters;
}

function distanceMeters(first, second) {
  const earthRadius = 6371000;
  const lat1 = first.latitude * Math.PI / 180;
  const lat2 = second.latitude * Math.PI / 180;
  const deltaLat = (second.latitude - first.latitude) * Math.PI / 180;
  const deltaLng = (second.longitude - first.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return "0.0 km";
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function reportColor(type) {
  const colors = {
    traffic: "#d78a1f",
    accident: "#b33939",
    road_closure: "#6b4ca0",
    tunnel_delay: "#2f72a8",
    pickup_hotspot: "#087450",
    checkpoint: "#5e6472"
  };
  return colors[type] || "#d78a1f";
}

function setStatus(message, ok = false) {
  recordingStatus.textContent = message;
  recordingStatus.classList.toggle("ok", ok);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
