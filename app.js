const ROUTES_API = "/api/routes";
const GENERATE_ROUTE_API = "/api/generate-route";
const GENERATE_CUES_API = "/api/generate-cues";
const PREPARE_ROUTE_API = "/api/prepare-route";
const INCOMING_ORDER_API = "/api/incoming-order";
const ROUTE_RECORDING_API = "/api/route-recording";
const SPEED_WARNINGS_API = "/api/speed-warnings";
const DEFAULT_MAP_CENTER = [40.7128, -74.0060];

const destinationSelect = document.querySelector("#destinationSelect");
const destinationSearch = document.querySelector("#destinationSearch");
const destinationVoiceButton = document.querySelector("#destinationVoiceButton");
const photoRouteSelect = document.querySelector("#photoRouteSelect");
const refreshRoutesButton = document.querySelector("#refreshRoutesButton");
const photoRouteStatus = document.querySelector("#photoRouteStatus");
const reviewRouteButton = document.querySelector("#reviewRouteButton");
const prepareDestinationButton = document.querySelector("#prepareDestinationButton");
const exportRoutesButton = document.querySelector("#exportRoutesButton");
const importRoutesInput = document.querySelector("#importRoutesInput");
const mapPickerButton = document.querySelector("#mapPickerButton");
const createDataFileButton = document.querySelector("#createDataFileButton");
const openDataFileButton = document.querySelector("#openDataFileButton");
const saveDataFileButton = document.querySelector("#saveDataFileButton");
const dataFileStatus = document.querySelector("#dataFileStatus");
const simulationSlider = document.querySelector("#simulationSlider");
const simulationPrevButton = document.querySelector("#simulationPrevButton");
const simulationNextButton = document.querySelector("#simulationNextButton");
const simulationResetButton = document.querySelector("#simulationResetButton");
const simulationStatus = document.querySelector("#simulationStatus");
const simulationUpcoming = document.querySelector("#simulationUpcoming");
const liveDriveStartButton = document.querySelector("#liveDriveStartButton");
const liveDriveSimulateButton = document.querySelector("#liveDriveSimulateButton");
const liveDriveStopButton = document.querySelector("#liveDriveStopButton");
const liveDriveStatus = document.querySelector("#liveDriveStatus");
const liveDriveUpcoming = document.querySelector("#liveDriveUpcoming");
const routeRecorder = document.querySelector("#routeRecorder");
const routeRecorderBadge = document.querySelector("#routeRecorderBadge");
const routeRecorderState = document.querySelector("#routeRecorderState");
const recordingElapsed = document.querySelector("#recordingElapsed");
const recordingDistance = document.querySelector("#recordingDistance");
const recordingPointCount = document.querySelector("#recordingPointCount");
const recordingCompletion = document.querySelector("#recordingCompletion");
const recordedRouteVariant = document.querySelector("#recordedRouteVariant");
const saveRecordedRouteButton = document.querySelector("#saveRecordedRouteButton");
const discardRecordingButton = document.querySelector("#discardRecordingButton");
const speedAwareness = document.querySelector("#speedAwareness");
const currentSpeed = document.querySelector("#currentSpeed");
const speedWarningBadge = document.querySelector("#speedWarningBadge");
const speedWarningTitle = document.querySelector("#speedWarningTitle");
const speedWarningStatus = document.querySelector("#speedWarningStatus");
const speedWarningLabel = document.querySelector("#speedWarningLabel");
const speedWarningLimit = document.querySelector("#speedWarningLimit");
const speedWarningRadius = document.querySelector("#speedWarningRadius");
const addSpeedWarningButton = document.querySelector("#addSpeedWarningButton");
const speedWarningManagerStatus = document.querySelector("#speedWarningManagerStatus");
const speedWarningList = document.querySelector("#speedWarningList");
const routeFormState = document.querySelector("#routeFormState");
const routeSubmitButton = document.querySelector("#routeSubmitButton");
const routeCancelEditButton = document.querySelector("#routeCancelEditButton");
const generateRouteButton = document.querySelector("#generateRouteButton");
const generateRouteStatus = document.querySelector("#generateRouteStatus");
const photoFormState = document.querySelector("#photoFormState");
const photoSubmitButton = document.querySelector("#photoSubmitButton");
const photoCancelEditButton = document.querySelector("#photoCancelEditButton");
const stopLookupInput = document.querySelector("#stopLookupInput");
const stopLookupButton = document.querySelector("#stopLookupButton");
const lookupStatus = document.querySelector("#lookupStatus");
const routeSummary = document.querySelector("#routeSummary");
const routeMapState = document.querySelector("#routeMapState");
const photoLatitudeInput = document.querySelector("#photoLatitude");
const photoLongitudeInput = document.querySelector("#photoLongitude");
const photoStepSelect = document.querySelector("#photoStep");
const cueCoordinateStatus = document.querySelector("#cueCoordinateStatus");
const photoFileInput = document.querySelector("#photoFile");
const photoPasteZone = document.querySelector("#photoPasteZone");
const photoPreview = document.querySelector("#photoPreview");
const clearPhotoButton = document.querySelector("#clearPhotoButton");
const photoInputStatus = document.querySelector("#photoInputStatus");
const routePhotos = document.querySelector("#routePhotos");
const routeForm = document.querySelector("#routeForm");
const photoForm = document.querySelector("#photoForm");
const routeList = document.querySelector("#routeList");
const refreshRouteLibraryButton = document.querySelector("#refreshRouteLibraryButton");
const routeLibraryStatus = document.querySelector("#routeLibraryStatus");
const topCuePreview = document.querySelector("#topCuePreview");
const photoCardTemplate = document.querySelector("#photoCardTemplate");
const cueCaptureDialog = document.querySelector("#cueCaptureDialog");
const cueCaptureTitle = document.querySelector("#cueCaptureTitle");
const cueCaptureCoordinates = document.querySelector("#cueCaptureCoordinates");
const openCueStreetViewButton = document.querySelector("#openCueStreetViewButton");
const cueCaptureFileInput = document.querySelector("#cueCaptureFileInput");
const cueCapturePasteZone = document.querySelector("#cueCapturePasteZone");
const cueCapturePreview = document.querySelector("#cueCapturePreview");
const cueCaptureStatus = document.querySelector("#cueCaptureStatus");
const uploadCueCaptureButton = document.querySelector("#uploadCueCaptureButton");

let routes = [];
let map;
let mapMarkers = [];
let routeLine;
let liveDriveMarker;
let liveDriveAccuracyCircle;
let liveDriveNextCueMarker;
let liveDriveAheadLine;
let liveDriveRecordedLine;
let filteredRoutes = [];
let isMapPicking = false;
let mapPickMarker;
let editingRouteId = null;
let editingPhoto = null;
let deferredInstallPrompt = null;
let lookupAbortController = null;
let routeAbortController = null;
let routeGeocodeAbortController = null;
let simulationIndex = 0;
let dataFileHandle = null;
let isSavingToDisk = false;
let pendingPhotoDataUrl = null;
let pendingGeneratedCues = [];
let preparedRoute = null;
let destinationRecognition = null;
let isListeningForDestination = false;
let liveDriveWatchId = null;
let liveDrivePosition = null;
let liveDriveTimeoutId = null;
let liveDriveSimulationId = null;
let liveDriveSimulationIndex = 0;
let lastIncomingOrderId = sessionStorage.getItem("taxiBoLastIncomingOrderId") || "";
let incomingOrderPollInFlight = false;
let activeRouteRecording = null;
let completedRouteRecording = null;
let recordingFlushTimeoutId = null;
let recordingFlushInFlight = false;
let recordingFlushPromise = null;
let hasCheckedInterruptedRecording = false;
let speedWarnings = [];
let lastSpeedSample = null;
let speedAudioContext = null;
let lastSpeedAlert = { id: "", at: 0, overspeed: false };
let lastSpokenCueId = "";
let captureCueId = "";
let captureImageData = null;

render();
initializeMap();
setupInstallPrompt();
setupDestinationVoiceInput();
loadRoutes();
loadSpeedWarnings();
startIncomingOrderPolling();
renderRouteRecorder();
window.startLiveDriveSimulation = startLiveDriveSimulation;

reviewRouteButton.addEventListener("click", () => {
  preparedRoute = null;
  displaySelectedRoute();
});

prepareDestinationButton.addEventListener("click", () => {
  prepareRouteFromDestination();
});

destinationVoiceButton.addEventListener("click", () => {
  toggleDestinationVoiceInput();
});

destinationSearch.addEventListener("input", () => {
  preparedRoute = null;
  if (destinationSearch.value.trim()) {
    routeSummary.className = "route-summary empty-state";
    routeSummary.textContent = "Click Go to generate a route and match saved photo cues from SQLite.";
  } else {
    displaySelectedRoute();
  }
});

destinationSelect.addEventListener("change", () => {
  preparedRoute = null;
  displaySelectedRoute();
});

exportRoutesButton.addEventListener("click", () => {
  exportRoutes();
});

createDataFileButton.addEventListener("click", async () => {
  await createDataFile();
});

openDataFileButton.addEventListener("click", async () => {
  await openDataFile();
});

saveDataFileButton.addEventListener("click", async () => {
  await saveRoutesToDisk(true);
});

importRoutesInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  try {
    const importedRoutes = await importRoutes(file);
    routes = importedRoutes;
    await saveRoutes();
    destinationSearch.value = "";
    render();
    displaySelectedRoute();
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `<strong>Import complete.</strong><br>${routes.length} route${routes.length === 1 ? "" : "s"} loaded into Taxi Bo.`;
  } catch (error) {
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `<strong>Import failed.</strong><br>${escapeHtml(error.message)}`;
  } finally {
    importRoutesInput.value = "";
  }
});

mapPickerButton.addEventListener("click", () => {
  isMapPicking = !isMapPicking;
  updateMapPickerButton();
});

stopLookupButton.addEventListener("click", () => {
  lookupStopPlace();
});

stopLookupInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupStopPlace();
  }
});

photoPasteZone.addEventListener("paste", async (event) => {
  const clipboardItems = event.clipboardData?.items;

  if (!clipboardItems?.length) {
    return;
  }

  for (const item of clipboardItems) {
    if (item.type.startsWith("image/")) {
      event.preventDefault();
      const file = item.getAsFile();

      if (!file) {
        continue;
      }

      await usePhotoFile(file, "Pasted screenshot ready to save.");
      return;
    }
  }

  updatePhotoInputStatus("Clipboard did not contain an image. Copy a screenshot first.", true);
  resetPhotoPastePrompt();
});

photoPasteZone.addEventListener("click", () => {
  photoPasteZone.focus();
});

photoPasteZone.addEventListener("focus", () => {
  if (!pendingPhotoDataUrl) {
    resetPhotoPastePrompt();
  }
});

photoPasteZone.addEventListener("input", () => {
  if (!pendingPhotoDataUrl) {
    resetPhotoPastePrompt();
  }
});

photoFileInput.addEventListener("change", async () => {
  const file = photoFileInput.files?.[0];

  if (!file) {
    return;
  }

  await usePhotoFile(file, `Selected file: ${file.name}`);
});

clearPhotoButton.addEventListener("click", () => {
  clearSelectedPhoto();
});

if (simulationSlider) {
  simulationSlider.addEventListener("input", () => {
    simulationIndex = Number(simulationSlider.value);
    renderSimulation();
  });
}

if (simulationPrevButton) {
  simulationPrevButton.addEventListener("click", () => {
    simulationIndex = Math.max(0, simulationIndex - 1);
    simulationSlider.value = String(simulationIndex);
    renderSimulation();
  });
}

if (simulationNextButton) {
  simulationNextButton.addEventListener("click", () => {
    const route = routes.find((item) => item.id === destinationSelect.value);
    const photoCount = route?.photos?.length ?? 0;
    simulationIndex = Math.min(photoCount, simulationIndex + 1);
    simulationSlider.value = String(simulationIndex);
    renderSimulation();
  });
}

if (simulationResetButton) {
  simulationResetButton.addEventListener("click", () => {
    simulationIndex = 0;
    simulationSlider.value = "0";
    renderSimulation();
  });
}

liveDriveStartButton.addEventListener("click", () => {
  armSpeedAudio();
  startLiveDrive();
});

liveDriveSimulateButton.addEventListener("click", () => {
  armSpeedAudio();
  startLiveDriveSimulation();
});

addSpeedWarningButton.addEventListener("click", () => {
  addSpeedWarningAtCurrentLocation();
});

topCuePreview.addEventListener("click", (event) => {
  const audioControl = event.target.closest(".cue-audio-button");
  if (audioControl) {
    speakCueTitle(audioControl.dataset.cueTitle, true);
    return;
  }

  const image = event.target.closest(".top-cue-image, .top-cue-image-wrap");
  const cueCard = image?.closest("[data-cue-id]");
  if (cueCard) {
    openCueCapture(cueCard.dataset.cueId);
  }
});

openCueStreetViewButton.addEventListener("click", () => openCueStreetView());

cueCapturePasteZone.addEventListener("click", () => cueCapturePasteZone.focus());

cueCapturePasteZone.addEventListener("paste", async (event) => {
  const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
  const file = imageItem?.getAsFile();
  if (file) {
    event.preventDefault();
    await setCueCaptureImage(file);
  }
});

cueCaptureFileInput.addEventListener("change", async () => {
  const file = cueCaptureFileInput.files?.[0];
  if (file) {
    await setCueCaptureImage(file);
  }
});

uploadCueCaptureButton.addEventListener("click", () => uploadCueCapture());

cueCaptureDialog.addEventListener("close", () => resetCueCapture());

liveDriveStopButton.addEventListener("click", () => {
  stopLiveDrive();
});

saveRecordedRouteButton.addEventListener("click", () => {
  saveCompletedRecordingAsRoute();
});

discardRecordingButton.addEventListener("click", () => {
  discardCompletedRecording();
});

window.addEventListener("pagehide", () => {
  flushRouteRecording(true);
});

routeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(routeForm);
  const routePayload = {
    name: formData.get("routeName").toString().trim(),
    variant: formData.get("routeVariant").toString().trim() || "Standard",
    start: formData.get("routeStart").toString().trim(),
    destination: formData.get("routeDestination").toString().trim(),
    timeWindow: formData.get("routeTimeWindow").toString().trim(),
    trafficPattern: formData.get("routeTrafficPattern").toString().trim(),
    notes: formData.get("routeNotes").toString().trim(),
    startLatitude: parseOptionalNumber(formData.get("routeStartLatitude")),
    startLongitude: parseOptionalNumber(formData.get("routeStartLongitude")),
    destinationLatitude: parseOptionalNumber(formData.get("routeDestinationLatitude")),
    destinationLongitude: parseOptionalNumber(formData.get("routeDestinationLongitude")),
    routeGeometry: parseRouteGeometryInput(formData.get("routeGeometry")),
    routeDistanceMeters: parseOptionalNumber(formData.get("routeDistanceMeters")),
    routeDurationSeconds: parseOptionalNumber(formData.get("routeDurationSeconds"))
  };

  if (editingRouteId) {
    const route = routes.find((item) => item.id === editingRouteId);

    if (!route) {
      return;
    }

    Object.assign(route, routePayload);
    if (pendingGeneratedCues.length) {
      route.photos = pendingGeneratedCues.map(normalizeImportedPhoto);
      pendingGeneratedCues = [];
    }
    await saveRoutes();
    destinationSearch.value = "";
    render();
    destinationSelect.value = route.id;
    photoRouteSelect.value = route.id;
    updatePhotoRouteStatus();
    renderPhotoStepOptions(route.id);
    displayRoute(route);
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `<strong>Route updated.</strong><br>${escapeHtml(formatRouteLabel(route))}`;
    if (route.routeGeometry?.length) {
      setGenerateRouteStatus(`Generated route saved to SQLite with ${route.photos.length} turn cue${route.photos.length === 1 ? "" : "s"}.`);
    }
    resetRouteForm();
    return;
  }

  const route = {
    id: crypto.randomUUID(),
    ...routePayload,
    photos: pendingGeneratedCues.map(normalizeImportedPhoto)
  };
  pendingGeneratedCues = [];

  routes.unshift(route);
  await saveRoutes();
  resetRouteForm();
  simulationIndex = 0;
  destinationSearch.value = "";
  render();
  destinationSelect.value = route.id;
  photoRouteSelect.value = route.id;
  updatePhotoRouteStatus();
  renderPhotoStepOptions(route.id);
  displayRoute(route);
  routeSummary.className = "route-summary";
  routeSummary.innerHTML = `<strong>Route saved.</strong><br>${escapeHtml(formatRouteLabel(route))}`;
  if (route.routeGeometry?.length) {
    setGenerateRouteStatus(`Generated route saved to SQLite with ${route.photos.length} turn cue${route.photos.length === 1 ? "" : "s"}.`);
  }
});

routeCancelEditButton.addEventListener("click", () => {
  resetRouteForm();
});

generateRouteButton.addEventListener("click", () => {
  generateRouteFromCurrentLocation();
});

refreshRoutesButton.addEventListener("click", () => {
  loadRoutes();
});

refreshRouteLibraryButton.addEventListener("click", () => {
  loadRoutes();
});

photoRouteSelect.addEventListener("change", () => {
  updatePhotoRouteStatus();
  resetPhotoForm(photoRouteSelect.value);
});

photoStepSelect.addEventListener("change", () => {
  useSelectedCue();
});

photoForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const routeId = photoRouteSelect.value;
  const route = routes.find((item) => item.id === routeId);

  if (!route) {
    return;
  }

  const file = photoFileInput.files?.[0];

  if (!file && !pendingPhotoDataUrl && !editingPhoto) {
    updatePhotoInputStatus("Paste a screenshot or choose a file before saving this photo stop.", true);
    photoPasteZone.focus();
    return;
  }

  const formData = new FormData(photoForm);
  let image = pendingPhotoDataUrl ?? (file ? await fileToDataUrl(file) : null);
  const photoPayload = {
    step: Number(formData.get("photoStep")),
    title: formData.get("photoTitle").toString().trim(),
    instruction: formData.get("photoInstruction").toString().trim(),
    notes: formData.get("photoNotes").toString().trim(),
    image,
    latitude: parseOptionalNumber(formData.get("photoLatitude")),
    longitude: parseOptionalNumber(formData.get("photoLongitude"))
  };

  if (editingPhoto && editingPhoto.routeId === routeId) {
    const photo = route.photos.find((item) => item.id === editingPhoto.photoId);

    if (!photo) {
      return;
    }

    image = image ?? photo.image;
    photoPayload.image = image;
    Object.assign(photo, photoPayload);
  } else {
    route.photos.push({
      id: crypto.randomUUID(),
      ...photoPayload
    });
  }

  route.photos.sort((a, b) => a.step - b.step);
  await saveRoutes();
  simulationIndex = Math.min(simulationIndex, route.photos.length);
  resetPhotoForm(routeId, route.photos.length + 1);
  renderPhotoStepOptions(routeId);
  renderRouteList();
  displayRoute(route);
});

photoCancelEditButton.addEventListener("click", () => {
  resetPhotoForm(photoRouteSelect.value);
});

async function loadRoutes() {
  try {
    const response = await fetch(ROUTES_API, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("The route database is not available.");
    }

    const savedRoutes = await response.json();
    routes = Array.isArray(savedRoutes) ? savedRoutes.map(normalizeImportedRoute) : [];
    render();
    displaySelectedRoute();
    updatePhotoRouteStatus();
    updateRouteLibraryStatus();
    await recoverInterruptedRouteRecording();
  } catch (error) {
    routes = [];
    render();
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `
      <strong>Database not connected.</strong><br>
      Start Taxi Bo from PowerShell with:<br>
      <code>cd "C:\\Users\\as400\\Desktop\\Python 2\\TAXI Bo"</code><br>
      <code>&amp; "C:\\Users\\as400\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe" server.py 8020</code><br>
      Then open <code>http://127.0.0.1:8020/index.html</code>.
    `;
    updateDataFileStatus(error.message || "The route database is not available.", true);
    updatePhotoRouteStatus("Could not load routes from SQLite.", true);
    updateRouteLibraryStatus("Could not load routes from SQLite. Make sure you opened the app from server.py, not a static file server.", true);
  }
}

async function saveRoutes() {
  const response = await fetch(ROUTES_API, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    cache: "no-store",
    body: JSON.stringify(routes)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error.error || "Could not save routes to the SQLite database.";
    updateDataFileStatus(message, true);
    throw new Error(message);
  }

  updateDataFileStatus();
  updateRouteLibraryStatus("Saved route library to SQLite.");
  await saveRoutesToDisk(false);
}

function render() {
  renderDestinationSelect();
  renderPhotoRouteSelect();
  renderRouteList();
  updateMapPickerButton();
  updateRouteFormState();
  updatePhotoFormState();
  updateDataFileStatus();
  updatePhotoInputStatus(pendingPhotoDataUrl ? "Photo ready to save." : "No photo selected yet.");
}

function initializeMap() {
  if (!window.L) {
    routeMapState.textContent = "Map library could not load. The photo timeline still works.";
    return;
  }

  map = L.map("routeMap", {
    scrollWheelZoom: true
  }).setView(DEFAULT_MAP_CENTER, 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  map.on("click", (event) => {
    if (!isMapPicking) {
      return;
    }

    const { lat, lng } = event.latlng;
    photoLatitudeInput.value = lat.toFixed(6);
    photoLongitudeInput.value = lng.toFixed(6);
    setMapPickMarker([lat, lng]);
    isMapPicking = false;
    updateMapPickerButton();
    setLookupStatus(`Picked coordinates ${lat.toFixed(6)}, ${lng.toFixed(6)} for the next photo stop.`);
    reverseLookupCoordinates(lat, lng);
  });
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = "<strong>Install available.</strong><br>Add Taxi Bo to your home screen for faster route recall on mobile.";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = "<strong>Taxi Bo installed.</strong><br>The app can now open like a normal mobile app.";
  });
}

function setupDestinationVoiceInput() {
  if (!destinationVoiceButton) {
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    destinationVoiceButton.disabled = true;
    destinationVoiceButton.title = "Voice input is not supported in this browser.";
    destinationVoiceButton.textContent = "Mic off";
    return;
  }

  destinationRecognition = new SpeechRecognition();
  destinationRecognition.lang = "en-US";
  destinationRecognition.interimResults = true;
  destinationRecognition.continuous = false;

  destinationRecognition.addEventListener("start", () => {
    isListeningForDestination = true;
    destinationVoiceButton.classList.add("listening");
    destinationVoiceButton.textContent = "Listening";
    routeSummary.className = "route-summary empty-state";
    routeSummary.textContent = "Listening for destination address...";
  });

  destinationRecognition.addEventListener("result", (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();

    if (transcript) {
      destinationSearch.value = transcript;
      destinationSearch.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  destinationRecognition.addEventListener("error", (event) => {
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `<strong>Voice input stopped.</strong><br>${escapeHtml(formatSpeechError(event.error))}`;
  });

  destinationRecognition.addEventListener("end", () => {
    isListeningForDestination = false;
    destinationVoiceButton.classList.remove("listening");
    destinationVoiceButton.textContent = "Mic";
  });
}

function toggleDestinationVoiceInput() {
  if (!destinationRecognition) {
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `<strong>Voice input is not available.</strong><br>Type the destination address instead.`;
    return;
  }

  if (isListeningForDestination) {
    destinationRecognition.stop();
    return;
  }

  try {
    destinationRecognition.start();
  } catch {
    destinationRecognition.stop();
  }
}

function formatSpeechError(error) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Allow microphone permission in the browser, or type the address manually.";
  }

  if (error === "no-speech") {
    return "No speech was heard. Try again, or type the address manually.";
  }

  return "Type the address manually if voice input is unavailable.";
}

async function lookupStopPlace() {
  const query = stopLookupInput.value.trim();

  if (!query) {
    setLookupStatus("Type a place or address before using place lookup.", true);
    return;
  }

  try {
    const result = await geocodePlace(query);

    if (!result) {
      return;
    }

    photoLatitudeInput.value = result.latitude.toFixed(6);
    photoLongitudeInput.value = result.longitude.toFixed(6);
    if (!document.querySelector("#photoNotes").value.trim()) {
      document.querySelector("#photoNotes").value = result.label;
    }

    setLookupStatus(`Filled coordinates from "${result.label}".`);

    if (map) {
      const latLng = [result.latitude, result.longitude];
      map.setView(latLng, 15);
      setMapPickMarker(latLng);
    }
  } catch (error) {
    setLookupStatus(error.message, true);
  }
}

function renderDestinationSelect() {
  const previousValue = destinationSelect.value;
  destinationSelect.innerHTML = "";
  filteredRoutes = routes;

  if (!filteredRoutes.length) {
    const option = new Option("No saved routes yet", "");
    destinationSelect.append(option);
    return;
  }

  filteredRoutes.forEach((route) => {
    const option = new Option(formatRouteLabel(route), route.id);
    destinationSelect.append(option);
  });

  const hasPrevious = filteredRoutes.some((route) => route.id === previousValue);
  destinationSelect.value = hasPrevious ? previousValue : filteredRoutes[0].id;
}

function renderPhotoRouteSelect() {
  const previousValue = photoRouteSelect.value;
  photoRouteSelect.innerHTML = "";

  if (!routes.length) {
    const option = new Option("Create a route first", "");
    photoRouteSelect.append(option);
    updatePhotoRouteStatus("No saved routes in SQLite yet. Generate a route first.");
    return;
  }

  routes.forEach((route) => {
    const option = new Option(formatRoutePickerLabel(route), route.id);
    option.title = formatRouteLabel(route);
    photoRouteSelect.append(option);
  });

  const hasPrevious = routes.some((route) => route.id === previousValue);
  photoRouteSelect.value = hasPrevious ? previousValue : routes[0].id;

  updatePhotoRouteStatus();
  renderPhotoStepOptions(photoRouteSelect.value);
}

function updatePhotoRouteStatus(message, isError = false) {
  if (message) {
    photoRouteStatus.className = isError ? "form-state" : "form-state empty-state";
    photoRouteStatus.textContent = message;
    return;
  }

  const selectedRoute = routes.find((route) => route.id === photoRouteSelect.value);

  if (!selectedRoute) {
    photoRouteStatus.className = "form-state empty-state";
    photoRouteStatus.textContent = "No database route selected.";
    return;
  }

  photoRouteStatus.className = "form-state empty-state";
  photoRouteStatus.textContent = `${routes.length} saved route${routes.length === 1 ? "" : "s"} loaded from SQLite. Selected: ${formatRoutePickerLabel(selectedRoute)}.`;
}

function renderPhotoStepOptions(routeId = photoRouteSelect.value, selectedStep = null) {
  const route = routes.find((item) => item.id === routeId);
  photoStepSelect.innerHTML = "";

  if (!route) {
    photoStepSelect.append(new Option("No route", ""));
    updateCueCoordinateStatus();
    return;
  }

  const orderedPhotos = route.photos.slice().sort((a, b) => a.step - b.step);

  orderedPhotos.forEach((photo) => {
    const label = `${photo.step} - ${photo.title || "Cue"}`;
    const option = new Option(label, String(photo.step));
    option.dataset.photoId = photo.id;
    photoStepSelect.append(option);
  });

  const nextStep = orderedPhotos.length ? Math.max(...orderedPhotos.map((photo) => photo.step)) + 1 : 1;
  photoStepSelect.append(new Option(`${nextStep} - New cue`, String(nextStep)));

  photoStepSelect.value = String(selectedStep ?? nextStep);
  updateCueCoordinateStatus();
}

function useSelectedCue() {
  const route = routes.find((item) => item.id === photoRouteSelect.value);
  const step = Number(photoStepSelect.value);
  const cue = route?.photos.find((photo) => photo.step === step);

  if (!route || !cue) {
    editingPhoto = null;
    document.querySelector("#photoTitle").value = "";
    document.querySelector("#photoInstruction").value = "";
    document.querySelector("#photoNotes").value = "";
    photoLatitudeInput.value = "";
    photoLongitudeInput.value = "";
    clearSelectedPhoto(false);
    updatePhotoFormState();
    updateCueCoordinateStatus();
    return;
  }

  startPhotoEdit(route.id, cue.id);
}

function renderRouteList() {
  routeList.innerHTML = "";

  if (!routes.length) {
    routeList.innerHTML = `<div class="route-summary empty-state">No routes saved yet.</div>`;
    updateRouteLibraryStatus("No routes in SQLite yet. Generate and save a route above.");
    return;
  }

  routes.forEach((route) => {
    const article = document.createElement("article");
    article.className = "route-item";

    const photoCount = route.photos.length;

    article.innerHTML = `
      <div>
        <h3>${escapeHtml(route.name || "Untitled route")}</h3>
        <p class="route-destination">Destination: ${escapeHtml(route.destination)}</p>
        <p class="route-meta">${escapeHtml(formatRouteContext(route))}</p>
      </div>
      <div class="route-item-actions">
        <span class="pill">${photoCount} photo${photoCount === 1 ? "" : "s"}</span>
        <button class="secondary-button small-button route-review-button" data-route-id="${route.id}" type="button">View</button>
        <button class="secondary-button small-button route-cues-button" data-route-id="${route.id}" type="button">${photoCount ? "Rebuild cues" : "Generate cues"}</button>
        <button class="secondary-button small-button route-edit-button" data-route-id="${route.id}" type="button">Regenerate</button>
        <button class="secondary-button small-button route-delete-button" data-route-id="${route.id}" type="button">Delete from DB</button>
      </div>
    `;

    article.querySelector(".route-review-button").addEventListener("click", () => {
      destinationSelect.value = route.id;
      displayRoute(route);
    });

    article.querySelector(".route-edit-button").addEventListener("click", () => {
      startRouteEdit(route.id);
    });

    article.querySelector(".route-cues-button").addEventListener("click", () => {
      generateCuesForSavedRoute(route.id);
    });

    article.querySelector(".route-delete-button").addEventListener("click", () => {
      deleteRoute(route.id);
    });

    routeList.append(article);
  });

  updateRouteLibraryStatus();
}

function updateRouteLibraryStatus(message, isError = false) {
  if (message) {
    routeLibraryStatus.className = isError ? "form-state" : "form-state empty-state";
    routeLibraryStatus.textContent = message;
    return;
  }

  const routeCount = routes.length;
  const cueCount = routes.reduce((total, route) => total + route.photos.length, 0);
  routeLibraryStatus.className = "form-state empty-state";
  routeLibraryStatus.textContent = `${routeCount} route${routeCount === 1 ? "" : "s"} and ${cueCount} cue${cueCount === 1 ? "" : "s"} loaded from SQLite. Use Regenerate or Delete from DB to maintain saved routes.`;
}

function displaySelectedRoute() {
  const route = routes.find((item) => item.id === destinationSelect.value);

  if (!route) {
    routeSummary.textContent = destinationSearch.value.trim()
      ? "No saved route matches this text. Click Go to generate a route and match saved photo cues by coordinates."
      : "Pick a destination to review the saved route.";
    routeSummary.className = "route-summary empty-state";
    routePhotos.innerHTML = "";
    clearMap();
    routeMapState.textContent = "Add latitude and longitude to photo stops to draw them on the map.";
    routeMapState.className = "route-map-state empty-state";
    renderTopCuePreview();
    renderSimulation();
    return;
  }

  displayRoute(route);
}

function displayRoute(route) {
  renderTopCuePreview(route);
  routeSummary.className = "route-summary";
  routeSummary.innerHTML = `
    <strong>${escapeHtml(route.name || "Untitled route")}</strong><br>
    Destination: ${escapeHtml(route.destination)}<br>
    ${escapeHtml(formatRouteContext(route))}
  `;

  drawRouteMap(route);
  routePhotos.innerHTML = "";
  simulationIndex = Math.min(simulationIndex, route.photos.length);
  if (simulationSlider) {
    simulationSlider.max = String(route.photos.length);
    simulationSlider.value = String(simulationIndex);
  }
  renderSimulation(route);
  renderLiveDrive(route);

  if (!route.photos.length) {
    routePhotos.innerHTML = `<div class="route-summary empty-state">This route has no junction photos yet.</div>`;
    return;
  }

  route.photos
    .slice()
    .sort((a, b) => a.step - b.step)
    .forEach((photo) => {
      const fragment = photoCardTemplate.content.cloneNode(true);
      const image = fragment.querySelector(".photo-card-image");
      const step = fragment.querySelector(".photo-card-step");
      const title = fragment.querySelector(".photo-card-title");
      const instruction = fragment.querySelector(".photo-card-instruction");
      const notes = fragment.querySelector(".photo-card-notes");
      const coordinates = fragment.querySelector(".photo-card-coordinates");
      const editButton = fragment.querySelector(".photo-edit-button");
      const deleteButton = fragment.querySelector(".photo-delete-button");

      image.src = photo.image;
      image.alt = photo.title;
      step.textContent = `Step ${photo.step}`;
      title.textContent = photo.title;
      instruction.textContent = photo.instruction || "No turn instruction added.";
      notes.textContent = photo.notes || "No landmark notes added.";
      coordinates.textContent = Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude)
        ? `Coordinates: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`
        : "Coordinates not set.";

      editButton.addEventListener("click", () => {
        startPhotoEdit(route.id, photo.id);
      });

      deleteButton.addEventListener("click", () => {
        deletePhoto(route.id, photo.id);
      });

      routePhotos.append(fragment);
    });
}

function getActiveRoute() {
  return preparedRoute || routes.find((item) => item.id === destinationSelect.value);
}

function renderTopCuePreview(route = getActiveRoute()) {
  if (!topCuePreview) {
    return;
  }

  const cues = route?.photos
    ?.slice()
    .sort((a, b) => a.step - b.step) || [];

  renderCuePreviewCards(cues);
}

function renderCuePreviewCards(cues) {
  if (!topCuePreview) {
    return;
  }

  if (!cues.length) {
    topCuePreview.innerHTML = [1, 2, 3]
      .map((number) => `
        <article class="top-cue-card photo-card empty-cue">
          <div class="top-cue-image placeholder-cue">${number}</div>
          <div class="top-cue-copy">
            <span>Photo cue ${number}</span>
            <strong>Choose a saved route</strong>
            <p>The first three route photos will appear here.</p>
          </div>
        </article>
      `)
      .join("");
    return;
  }

  topCuePreview.innerHTML = cues
    .map((cue, index) => `
      <article class="top-cue-card">
        <img class="top-cue-image" src="${escapeHtml(cue.image)}" alt="${escapeHtml(cue.title || `Photo cue ${index + 1}`)}">
        <div class="top-cue-copy">
          <span>Next ${index + 1} · Step ${cue.step}</span>
          <strong>${escapeHtml(cue.title || "Untitled cue")}</strong>
          <p>${escapeHtml(cue.instruction || cue.notes || "Review this visual cue before driving.")}</p>
        </div>
      </article>
    `)
    .join("");
}

function renderTopCuePreview(route = getActiveRoute()) {
  if (!topCuePreview) {
    return;
  }

  const cues = route?.photos
    ?.slice()
    .sort((a, b) => a.step - b.step) || [];

  if (!cues.length) {
    topCuePreview.innerHTML = [1, 2, 3]
      .map((number) => `
        <article class="top-cue-card empty-cue">
          <div class="top-cue-image-wrap placeholder-cue">${number}</div>
          <div class="top-cue-copy">
            <span>Photo cue ${number}</span>
            <strong>Choose a saved route</strong>
            <p>All route photos will appear in this scrollable bar.</p>
          </div>
        </article>
      `)
      .join("");
    return;
  }

  topCuePreview.innerHTML = cues
    .map((cue, index) => `
      <article class="top-cue-card photo-card" data-cue-id="${escapeHtml(cue.id)}" data-cue-title="${escapeHtml(cue.title || "Untitled cue")}">
        <div class="top-cue-image-wrap photo-card-image-wrap">
          <img class="top-cue-image photo-card-image" src="${escapeHtml(cue.image)}" alt="${escapeHtml(cue.title || `Photo cue ${index + 1}`)}">
        </div>
        <button class="cue-audio-button" type="button" data-cue-title="${escapeHtml(cue.title || "Untitled cue")}" aria-label="Speak cue title" title="Speak cue title">&#9654;</button>
        <div class="top-cue-copy photo-card-copy">
          <span class="photo-card-step">Upcoming ${index + 1} - Step ${cue.step}</span>
          <strong class="photo-card-title">${escapeHtml(cue.title || "Untitled cue")}</strong>
          <p class="photo-card-instruction">${escapeHtml(cue.instruction || "No turn instruction added.")}</p>
          <p class="photo-card-notes">${escapeHtml(cue.notes || "No landmark notes added.")}</p>
          <p class="top-cue-coordinates photo-card-coordinates">${formatPhotoCoordinates(cue)}</p>
        </div>
      </article>
    `)
    .join("");
}

function renderCuePreviewCards(cues) {
  if (!topCuePreview) {
    return;
  }

  if (!cues.length) {
    topCuePreview.innerHTML = [1, 2, 3]
      .map((number) => `
        <article class="top-cue-card photo-card empty-cue">
          <div class="top-cue-image-wrap placeholder-cue">${number}</div>
          <div class="top-cue-copy">
            <span>Photo cue ${number}</span>
            <strong>Choose a saved route</strong>
            <p>All route photos will appear in this scrollable bar.</p>
          </div>
        </article>
      `)
      .join("");
    return;
  }

  topCuePreview.innerHTML = cues
    .map((cue, index) => `
      <article class="top-cue-card photo-card" data-cue-id="${escapeHtml(cue.id)}" data-cue-title="${escapeHtml(cue.title || "Untitled cue")}">
        <div class="top-cue-image-wrap photo-card-image-wrap">
          <img class="top-cue-image photo-card-image" src="${escapeHtml(cue.image)}" alt="${escapeHtml(cue.title || `Photo cue ${index + 1}`)}">
        </div>
        <button class="cue-audio-button" type="button" data-cue-title="${escapeHtml(cue.title || "Untitled cue")}" aria-label="Speak cue title" title="Speak cue title">&#9654;</button>
        <div class="top-cue-copy photo-card-copy">
          <span class="photo-card-step">Upcoming ${index + 1} - Step ${cue.step}</span>
          <strong class="photo-card-title">${escapeHtml(cue.title || "Untitled cue")}</strong>
          <p class="photo-card-instruction">${escapeHtml(cue.instruction || "No turn instruction added.")}</p>
          <p class="photo-card-notes">${escapeHtml(cue.notes || "No landmark notes added.")}</p>
          <p class="top-cue-coordinates photo-card-coordinates">${formatPhotoCoordinates(cue)}</p>
        </div>
      </article>
    `)
    .join("");
}

function formatPhotoCoordinates(photo) {
  return Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude)
    ? `Coordinates: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`
    : "Coordinates not set.";
}

async function drawRouteMap(route) {
  if (!map) {
    return;
  }

  clearMap();

  const locatedPhotos = route.photos
    .slice()
    .sort((a, b) => a.step - b.step)
    .filter((photo) => Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude));

  if (!locatedPhotos.length) {
    await drawRouteEndpoints(route);
    return;
  }

  routeMapState.textContent = `${locatedPhotos.length} mapped stop${locatedPhotos.length === 1 ? "" : "s"} on this route.`;
  routeMapState.className = "route-map-state";

  const latLngs = locatedPhotos.map((photo) => [photo.latitude, photo.longitude]);

  locatedPhotos.forEach((photo) => {
    const marker = L.marker([photo.latitude, photo.longitude]).addTo(map);
    marker.bindPopup(`
      <strong>${escapeHtml(photo.title)}</strong><br>
      Step ${photo.step}<br>
      ${escapeHtml(photo.instruction || "No turn instruction added.")}
    `);
    mapMarkers.push(marker);
  });

  const routedLatLngs = await getRouteGeometry(latLngs);

  routeLine = L.polyline(routedLatLngs, {
    color: "#c35f2d",
    weight: 5,
    opacity: 0.84
  }).addTo(map);

  if (routedLatLngs.length === 1) {
    map.setView(routedLatLngs[0], 14);
    return;
  }

  map.fitBounds(routeLine.getBounds(), {
    padding: [32, 32]
  });
}

function clearMap() {
  cancelRouteRequest();
  cancelRouteGeocodeRequest();

  if (!map) {
    return;
  }

  mapMarkers.forEach((marker) => marker.remove());
  mapMarkers = [];

  if (routeLine) {
    routeLine.remove();
    routeLine = null;
  }

  if (mapPickMarker) {
    mapPickMarker.remove();
    mapPickMarker = null;
  }

  clearLiveDriveMap();
}

function getCaptureCue() {
  const activeCue = getActiveRoute()?.photos?.find((photo) => photo.id === captureCueId);
  if (activeCue) {
    return activeCue;
  }

  for (const route of routes) {
    const cue = route.photos.find((photo) => photo.id === captureCueId);
    if (cue) {
      return cue;
    }
  }

  return null;
}

function openCueCapture(cueId) {
  captureCueId = cueId;
  captureImageData = null;
  const cue = getCaptureCue();

  if (!cue) {
    return;
  }

  cueCaptureTitle.textContent = cue.title || `Photo cue ${cue.step}`;
  const hasCoordinates = Number.isFinite(cue.latitude) && Number.isFinite(cue.longitude);
  cueCaptureCoordinates.textContent = hasCoordinates
    ? `Coordinates: ${cue.latitude.toFixed(6)}, ${cue.longitude.toFixed(6)}`
    : "This cue does not have coordinates yet.";
  openCueStreetViewButton.disabled = !hasCoordinates;
  cueCaptureStatus.className = "form-state empty-state";
  cueCaptureStatus.textContent = hasCoordinates
    ? "Street View is opening at this cue. Capture the junction, then paste it below."
    : "Add coordinates to this cue before opening Street View.";
  cueCaptureDialog.showModal();
  cueCapturePasteZone.focus();

  if (hasCoordinates) {
    openCueStreetView(cue);
  }
}

function openCueStreetView(cue = getCaptureCue()) {
  if (!cue || !Number.isFinite(cue.latitude) || !Number.isFinite(cue.longitude)) {
    cueCaptureStatus.className = "form-state";
    cueCaptureStatus.textContent = "This cue has no coordinates to open in Street View.";
    return;
  }

  const url = new URL("https://www.google.com/maps/@");
  url.searchParams.set("api", "1");
  url.searchParams.set("map_action", "pano");
  url.searchParams.set("viewpoint", `${cue.latitude},${cue.longitude}`);
  const streetViewWindow = window.open(url.toString(), "_blank");
  if (streetViewWindow) {
    streetViewWindow.opener = null;
  }
  if (!streetViewWindow) {
    cueCaptureStatus.className = "form-state";
    cueCaptureStatus.textContent = "Chrome blocked the Street View tab. Select Open Google Street View to try again.";
  }
}

async function setCueCaptureImage(file) {
  if (!file.type.startsWith("image/")) {
    cueCaptureStatus.className = "form-state";
    cueCaptureStatus.textContent = "Choose or paste an image file.";
    return;
  }

  captureImageData = await fileToDataUrl(file);
  cueCapturePreview.src = captureImageData;
  cueCapturePreview.hidden = false;
  cueCapturePasteZone.classList.add("has-image");
  uploadCueCaptureButton.disabled = false;
  cueCaptureStatus.className = "form-state";
  cueCaptureStatus.textContent = "Screenshot ready. Upload it to replace this cue photo.";
}

async function uploadCueCapture() {
  if (!captureImageData || !captureCueId) {
    return;
  }

  let savedRoute = routes.find((route) => route.photos.some((photo) => photo.id === captureCueId));
  let savedCue = savedRoute?.photos.find((photo) => photo.id === captureCueId);
  let addedPreparedRoute = false;

  if (!savedCue && preparedRoute) {
    const preparedCue = preparedRoute.photos.find((photo) => photo.id === captureCueId);
    if (preparedCue) {
      savedRoute = preparedRoute;
      savedCue = preparedCue;
      if (!routes.some((route) => route.id === preparedRoute.id)) {
        routes.push(preparedRoute);
        addedPreparedRoute = true;
      }
    }
  }

  if (!savedCue) {
    cueCaptureStatus.className = "form-state";
    cueCaptureStatus.textContent = "Could not find this cue in the prepared or saved route.";
    return;
  }

  const previousImage = savedCue.image;
  uploadCueCaptureButton.disabled = true;
  cueCaptureStatus.className = "form-state empty-state";
  cueCaptureStatus.textContent = addedPreparedRoute
    ? "Saving this prepared route and cue photo to the database..."
    : "Uploading the cue photo to the database...";

  try {
    savedCue.image = captureImageData;
    await saveRoutes();
    render();
    destinationSelect.value = savedRoute.id;
    photoRouteSelect.value = savedRoute.id;
    displaySelectedRoute();
    cueCaptureDialog.close();
  } catch (error) {
    savedCue.image = previousImage;
    if (addedPreparedRoute) {
      routes = routes.filter((route) => route.id !== savedRoute.id);
    }
    cueCaptureStatus.className = "form-state";
    cueCaptureStatus.textContent = error.message || "Could not upload the cue photo.";
    uploadCueCaptureButton.disabled = false;
  }
}

function resetCueCapture() {
  captureCueId = "";
  captureImageData = null;
  cueCaptureFileInput.value = "";
  cueCapturePreview.removeAttribute("src");
  cueCapturePreview.hidden = true;
  cueCapturePasteZone.classList.remove("has-image");
  uploadCueCaptureButton.disabled = true;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

function createPlaceholderImage(color, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <rect width="640" height="480" fill="${color}" />
      <rect x="36" y="40" width="568" height="400" rx="28" fill="rgba(255,255,255,0.18)" />
      <path d="M0 390 L180 290 L300 345 L440 220 L640 360 V480 H0 Z" fill="rgba(46,34,26,0.22)" />
      <text x="52" y="96" fill="white" font-family="Segoe UI, Arial, sans-serif" font-size="30" opacity="0.9">Taxi Bo Sample</text>
      <text x="52" y="388" fill="white" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="700">${label}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseOptionalNumber(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRouteGeometryInput(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalized);
    return normalizeRouteGeometry(parsed);
  } catch {
    return [];
  }
}

function normalizeRouteGeometry(geometry) {
  if (!Array.isArray(geometry)) {
    return [];
  }

  return geometry
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null;
      }

      const latitude = Number(point[0]);
      const longitude = Number(point[1]);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
    })
    .filter(Boolean);
}

function getFilteredRoutes() {
  const query = destinationSearch.value.trim().toLowerCase();

  if (!query) {
    return routes;
  }

  return routes.filter((route) => {
    const haystack = `${route.name} ${route.variant} ${route.start} ${route.destination} ${route.timeWindow} ${route.trafficPattern} ${route.notes}`.toLowerCase();
    return haystack.includes(query);
  });
}

function exportRoutes() {
  const blob = new Blob([JSON.stringify(routes, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `taxi-bo-routes-${timestamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importRoutes(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("The selected file does not contain a route list.");
  }

  return parsed.map(normalizeImportedRoute);
}

function normalizeImportedRoute(route) {
  return {
    id: typeof route.id === "string" && route.id ? route.id : crypto.randomUUID(),
    name: String(route.name ?? "Untitled route").trim(),
    variant: String(route.variant ?? "Standard").trim() || "Standard",
    start: String(route.start ?? "").trim(),
    destination: String(route.destination ?? "").trim(),
    timeWindow: String(route.timeWindow ?? "").trim(),
    trafficPattern: String(route.trafficPattern ?? "").trim(),
    notes: String(route.notes ?? "").trim(),
    startLatitude: parseOptionalNumber(route.startLatitude),
    startLongitude: parseOptionalNumber(route.startLongitude),
    destinationLatitude: parseOptionalNumber(route.destinationLatitude),
    destinationLongitude: parseOptionalNumber(route.destinationLongitude),
    routeGeometry: normalizeRouteGeometry(route.routeGeometry),
    routeDistanceMeters: parseOptionalNumber(route.routeDistanceMeters),
    routeDurationSeconds: parseOptionalNumber(route.routeDurationSeconds),
    photos: Array.isArray(route.photos) ? route.photos.map(normalizeImportedPhoto).sort((a, b) => a.step - b.step) : []
  };
}

function normalizeImportedPhoto(photo) {
  return {
    id: typeof photo.id === "string" && photo.id ? photo.id : crypto.randomUUID(),
    step: Number.isFinite(Number(photo.step)) ? Number(photo.step) : 1,
    title: String(photo.title ?? "Untitled stop").trim(),
    instruction: String(photo.instruction ?? "").trim(),
    notes: String(photo.notes ?? "").trim(),
    image: typeof photo.image === "string" && photo.image ? photo.image : createPlaceholderImage("#7a6651", "Imported stop"),
    latitude: parseOptionalNumber(photo.latitude),
    longitude: parseOptionalNumber(photo.longitude)
  };
}

function updateMapPickerButton() {
  mapPickerButton.textContent = isMapPicking ? "Click map to place stop" : "Enable map picking";
  mapPickerButton.className = isMapPicking ? "primary-button" : "secondary-button";
}

function setMapPickMarker(latLng) {
  if (!map) {
    return;
  }

  if (mapPickMarker) {
    mapPickMarker.setLatLng(latLng);
    return;
  }

  mapPickMarker = L.circleMarker(latLng, {
    radius: 8,
    color: "#2e221a",
    weight: 2,
    fillColor: "#c35f2d",
    fillOpacity: 0.92
  }).addTo(map);
}

function startRouteEdit(routeId) {
  const route = routes.find((item) => item.id === routeId);

  if (!route) {
    return;
  }

  editingRouteId = routeId;
  pendingGeneratedCues = [];
  document.querySelector("#routeName").value = route.name;
  document.querySelector("#routeVariant").value = route.variant || "Standard";
  document.querySelector("#routeStart").value = route.start;
  document.querySelector("#routeDestination").value = route.destination;
  document.querySelector("#routeTimeWindow").value = route.timeWindow || "";
  document.querySelector("#routeTrafficPattern").value = route.trafficPattern || "";
  document.querySelector("#routeNotes").value = route.notes;
  setRouteMapFields(route);
  updateRouteFormState();
  setGenerateRouteStatus("Loaded from SQLite. Change the name, start, or destination, then regenerate to update this database route.");
  document.querySelector("#routeName").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetRouteForm() {
  editingRouteId = null;
  routeForm.reset();
  setRouteMapFields({});
  updateRouteFormState();
}

function updateRouteFormState() {
  if (editingRouteId) {
    routeFormState.className = "form-state";
    routeFormState.textContent = "Editing this route. Generate again to replace the saved route line.";
    routeSubmitButton.textContent = "Update route";
    generateRouteButton.textContent = "Regenerate and update route";
    routeCancelEditButton.hidden = false;
    return;
  }

  routeFormState.className = "form-state empty-state";
  routeFormState.textContent = "Generate a route, save it to the database, then add photo cues below.";
  routeSubmitButton.textContent = "Save route";
  generateRouteButton.textContent = "Generate and save route";
  routeCancelEditButton.hidden = true;
}

function setRouteMapFields(route) {
  document.querySelector("#routeStartLatitude").value = Number.isFinite(route.startLatitude) ? route.startLatitude : "";
  document.querySelector("#routeStartLongitude").value = Number.isFinite(route.startLongitude) ? route.startLongitude : "";
  document.querySelector("#routeDestinationLatitude").value = Number.isFinite(route.destinationLatitude) ? route.destinationLatitude : "";
  document.querySelector("#routeDestinationLongitude").value = Number.isFinite(route.destinationLongitude) ? route.destinationLongitude : "";
  document.querySelector("#routeGeometry").value = route.routeGeometry?.length ? JSON.stringify(route.routeGeometry) : "";
  document.querySelector("#routeDistanceMeters").value = Number.isFinite(route.routeDistanceMeters) ? route.routeDistanceMeters : "";
  document.querySelector("#routeDurationSeconds").value = Number.isFinite(route.routeDurationSeconds) ? route.routeDurationSeconds : "";
}

function setGenerateRouteStatus(message, isError = false) {
  generateRouteStatus.className = isError ? "form-state" : "form-state empty-state";
  generateRouteStatus.textContent = message;
}

async function generateRouteFromCurrentLocation() {
  const start = document.querySelector("#routeStart").value.trim();
  const destination = document.querySelector("#routeDestination").value.trim();

  if (!destination) {
    setGenerateRouteStatus("Enter a destination before generating the route.", true);
    document.querySelector("#routeDestination").focus();
    return;
  }

  generateRouteButton.disabled = true;
  setGenerateRouteStatus(start ? "Finding start and destination..." : "Waiting for your current location...");

  try {
    let currentPosition = null;

    if (!start) {
      if (!navigator.geolocation) {
        throw new Error("Enter a start address. This browser does not support current-location lookup.");
      }

      const current = await getCurrentPosition();
      currentPosition = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      };
    }

    setGenerateRouteStatus("Generating driving route...");
    const generatedRoute = await generateRouteOnServer({
      start,
      destination,
      currentPosition
    });

    document.querySelector("#routeStart").value = generatedRoute.startLabel;
    document.querySelector("#routeDestination").value = generatedRoute.destinationLabel;

    const routeNameInput = document.querySelector("#routeName");
    if (!routeNameInput.value.trim()) {
      routeNameInput.value = `${generatedRoute.startLabel} to ${generatedRoute.destinationLabel}`;
    }

    setRouteMapFields({
      startLatitude: generatedRoute.start.latitude,
      startLongitude: generatedRoute.start.longitude,
      destinationLatitude: generatedRoute.destination.latitude,
      destinationLongitude: generatedRoute.destination.longitude,
      routeGeometry: generatedRoute.geometry,
      routeDistanceMeters: generatedRoute.distance,
      routeDurationSeconds: generatedRoute.duration
    });
    pendingGeneratedCues = createGeneratedCues(generatedRoute.cues || []);

    const noteInput = document.querySelector("#routeNotes");
    if (!noteInput.value.trim() && Number.isFinite(generatedRoute.distance)) {
      noteInput.value = `Generated route. Approx. ${formatDistance(generatedRoute.distance)}.`;
    }

    const cueCount = pendingGeneratedCues.length;
    setGenerateRouteStatus(`Route generated with ${cueCount} turn cue${cueCount === 1 ? "" : "s"}. Saving to SQLite...`);
    routeForm.requestSubmit();
  } catch (error) {
    const message = error?.code === 1
      ? "Location permission was denied. Allow location access to generate a route from here."
      : error.message || "Could not generate this route.";
    setGenerateRouteStatus(message, true);
  } finally {
    generateRouteButton.disabled = false;
  }
}

function createGeneratedCues(cues) {
  if (!Array.isArray(cues)) {
    return [];
  }

  return cues.map((cue, index) => {
    const title = String(cue.title || `Turn cue ${index + 1}`).trim();
    const instruction = String(cue.instruction || "").trim();
    return {
      id: crypto.randomUUID(),
      step: Number.isFinite(Number(cue.step)) ? Number(cue.step) : index + 1,
      title,
      instruction,
      notes: String(cue.notes || "Generated from the driving route. Replace with your own photo when ready.").trim(),
      image: createPlaceholderImage(getCueColor(instruction || title), title),
      latitude: parseOptionalNumber(cue.latitude),
      longitude: parseOptionalNumber(cue.longitude)
    };
  });
}

function getCueColor(text) {
  const normalized = String(text).toLowerCase();

  if (normalized.includes("left")) {
    return "#176b4d";
  }

  if (normalized.includes("right")) {
    return "#1f5f99";
  }

  if (normalized.includes("roundabout") || normalized.includes("rotary")) {
    return "#8c5a1f";
  }

  return "#4d6370";
}

async function generateRouteOnServer(payload) {
  const response = await fetch(GENERATE_ROUTE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let result = {};

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = {};
  }

  if (!response.ok || !result.ok) {
    if (response.status === 404 || response.status === 501) {
      throw new Error("Route generation is not available on this server. Restart with server.py and open the matching localhost port.");
    }

    throw new Error(result.error || responseText || "Could not generate this route.");
  }

  return result.route;
}

async function prepareRouteFromDestination() {
  const selectedRoute = routes.find((item) => item.id === destinationSelect.value);
  const typedDestination = destinationSearch.value.trim();
  const destination = typedDestination || selectedRoute?.destination || "";
  const start = typedDestination ? "" : selectedRoute?.start || "";
  let currentPosition = null;
  let locationContext = "";

  if (!destination) {
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `<strong>Enter a destination.</strong><br>Type where the taxi is going, then prepare the route.`;
    destinationSearch.focus();
    return;
  }

  prepareDestinationButton.disabled = true;
  routeSummary.className = "route-summary";
  routeSummary.innerHTML = `<strong>Preparing route.</strong><br>Generating from ${escapeHtml(start || "current location")} and matching saved photo cues near its turns...`;

  try {
    if (!start) {
      if (!navigator.geolocation) {
        throw new Error("Choose a saved route with a start point, or use a device/browser that supports current location.");
      }

      const current = await getCurrentPosition();
      currentPosition = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      };
      const accuracy = Number(current.coords.accuracy);
      locationContext = ` Start supplied by this device: ${current.coords.latitude.toFixed(5)}, ${current.coords.longitude.toFixed(5)}${Number.isFinite(accuracy) ? ` (accuracy about ${Math.round(accuracy)} m)` : ""}.`;
    }

    const generatedRoute = await prepareRouteOnServer({
      start,
      destination,
      currentPosition
    });
    const matchedCueCount = Number(generatedRoute.matchedCueCount || 0);
    const cueCount = Number(generatedRoute.cueCount || generatedRoute.cues?.length || 0);

    preparedRoute = normalizeImportedRoute({
      id: `prepared-${Date.now()}`,
      name: `Prepared: ${shortPlaceName(generatedRoute.destinationLabel || destination)}`,
      variant: "Prepared",
      start: generatedRoute.startLabel || start || "Current location",
      destination: generatedRoute.destinationLabel || destination,
      notes: `Prepared route. ${matchedCueCount} of ${cueCount} cues matched saved photos.`,
      startLatitude: generatedRoute.start?.latitude,
      startLongitude: generatedRoute.start?.longitude,
      destinationLatitude: generatedRoute.destination?.latitude,
      destinationLongitude: generatedRoute.destination?.longitude,
      routeGeometry: generatedRoute.geometry,
      routeDistanceMeters: generatedRoute.distance,
      routeDurationSeconds: generatedRoute.duration,
      photos: createPreparedCues(generatedRoute.cues || [])
    });

    displayRoute(preparedRoute);
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `
      <strong>${escapeHtml(preparedRoute.name)}</strong><br>
      Destination: ${escapeHtml(preparedRoute.destination)}<br>
      Matched ${matchedCueCount} saved photo cue${matchedCueCount === 1 ? "" : "s"} from SQLite across ${cueCount} generated turn cue${cueCount === 1 ? "" : "s"}. ${escapeHtml(formatRouteContext(preparedRoute))}${escapeHtml(locationContext)}
    `;
  } catch (error) {
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `<strong>Could not prepare this route.</strong><br>${escapeHtml(error.message || "Try a more specific destination.")}`;
  } finally {
    prepareDestinationButton.disabled = false;
  }
}

async function prepareRouteOnServer(payload) {
  const response = await fetch(PREPARE_ROUTE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let result = {};

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = {};
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || responseText || "Could not prepare this route.");
  }

  return result.route;
}

function startIncomingOrderPolling() {
  pollIncomingOrder();
  window.setInterval(pollIncomingOrder, 2500);
}

async function pollIncomingOrder() {
  if (incomingOrderPollInFlight) {
    return;
  }

  incomingOrderPollInFlight = true;

  try {
    const response = await fetch(INCOMING_ORDER_API, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return;
    }

    const result = await response.json();
    const order = result.order;

    if (!order?.id || order.id === lastIncomingOrderId || !order.destination) {
      return;
    }

    lastIncomingOrderId = order.id;
    sessionStorage.setItem("taxiBoLastIncomingOrderId", order.id);
    await acknowledgeIncomingOrder(order.id);
    useIncomingDestination(order.destination);
  } catch {
    // Keep polling quietly; the status panel is reserved for driver-facing route state.
  } finally {
    incomingOrderPollInFlight = false;
  }
}

async function acknowledgeIncomingOrder(orderId) {
  await fetch(`${INCOMING_ORDER_API}/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: orderId })
  }).catch(() => {});
}

function useIncomingDestination(destination) {
  const cleanDestination = String(destination || "").trim();

  if (!cleanDestination) {
    return;
  }

  preparedRoute = null;
  destinationSearch.value = cleanDestination;
  destinationSearch.dispatchEvent(new Event("input", { bubbles: true }));
  routeSummary.className = "route-summary";
  routeSummary.innerHTML = `<strong>Phone order received.</strong><br>${escapeHtml(cleanDestination)}<br>Preparing route now...`;
  prepareRouteFromDestination();
}

function createPreparedCues(cues) {
  return createGeneratedCues(cues).map((cue, index) => {
    const source = cues[index] || {};

    return {
      ...cue,
      image: source.image || cue.image,
      notes: source.matchedPhoto
        ? `${cue.notes} Matched saved photo${Number.isFinite(Number(source.matchDistanceMeters)) ? ` within ${Math.round(source.matchDistanceMeters)} m` : ""}.`
        : `${cue.notes} No saved photo matched this generated cue yet.`,
      matchedPhoto: Boolean(source.matchedPhoto),
      sourceRouteName: source.sourceRouteName || ""
    };
  });
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    });
  });
}

async function deleteRoute(routeId) {
  const route = routes.find((item) => item.id === routeId);

  if (!route || !confirm(`Delete "${route.name}" and all its cue records from the SQLite database?`)) {
    return;
  }

  routes = routes.filter((item) => item.id !== routeId);
  simulationIndex = 0;

  if (editingRouteId === routeId) {
    resetRouteForm();
  }

  if (editingPhoto && editingPhoto.routeId === routeId) {
    resetPhotoForm();
  }

  await saveRoutes();
  render();
  displaySelectedRoute();
  updateRouteLibraryStatus(`Deleted "${route.name}" from SQLite.`);
}

async function generateCuesForSavedRoute(routeId) {
  const route = routes.find((item) => item.id === routeId);

  if (!route) {
    return;
  }

  if (!hasRouteCueSource(route)) {
    updateRouteLibraryStatus(`"${route.name}" needs saved route geometry or endpoint coordinates before cues can be generated. Regenerate the route first.`, true);
    return;
  }

  if (route.photos.length && !confirm(`Replace ${route.photos.length} existing cue${route.photos.length === 1 ? "" : "s"} for "${route.name}" with generated turn cues?`)) {
    return;
  }

  updateRouteLibraryStatus(`Generating turn cues for "${route.name}"...`);

  try {
    const generated = await generateCuesOnServer(route);
    const generatedCues = createGeneratedCues(generated.cues || []);

    if (!generatedCues.length) {
      updateRouteLibraryStatus("The routing service returned no turn cues for this route.", true);
      return;
    }

    route.photos = generatedCues;

    if (generated.geometry?.length) {
      route.routeGeometry = normalizeRouteGeometry(generated.geometry);
    }

    if (Number.isFinite(generated.distance)) {
      route.routeDistanceMeters = generated.distance;
    }

    if (Number.isFinite(generated.duration)) {
      route.routeDurationSeconds = generated.duration;
    }

    await saveRoutes();
    render();
    destinationSelect.value = route.id;
    photoRouteSelect.value = route.id;
    updatePhotoRouteStatus();
    renderPhotoStepOptions(route.id);
    displayRoute(route);
    updateRouteLibraryStatus(`Saved ${generatedCues.length} generated turn cue${generatedCues.length === 1 ? "" : "s"} to SQLite for "${route.name}".`);
  } catch (error) {
    updateRouteLibraryStatus(error.message || "Could not generate turn cues.", true);
  }
}

function hasRouteCueSource(route) {
  return normalizeRouteGeometry(route.routeGeometry).length >= 3 ||
    (Number.isFinite(route.startLatitude) &&
    Number.isFinite(route.startLongitude) &&
    Number.isFinite(route.destinationLatitude) &&
    Number.isFinite(route.destinationLongitude));
}

async function generateCuesOnServer(route) {
  const response = await fetch(GENERATE_CUES_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    cache: "no-store",
    body: JSON.stringify({
      start: {
        latitude: route.startLatitude,
        longitude: route.startLongitude
      },
      destination: {
        latitude: route.destinationLatitude,
        longitude: route.destinationLongitude
      },
      geometry: route.routeGeometry
    })
  });

  const responseText = await response.text();
  let result = {};

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = {};
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || responseText || "Could not generate turn cues.");
  }

  return result.route;
}

function startPhotoEdit(routeId, photoId) {
  const route = routes.find((item) => item.id === routeId);
  const photo = route?.photos.find((item) => item.id === photoId);

  if (!route || !photo) {
    return;
  }

  editingPhoto = { routeId, photoId };
  photoRouteSelect.value = routeId;
  renderPhotoStepOptions(routeId, photo.step);
  document.querySelector("#photoTitle").value = photo.title;
  document.querySelector("#photoInstruction").value = photo.instruction;
  document.querySelector("#photoNotes").value = photo.notes;
  photoLatitudeInput.value = Number.isFinite(photo.latitude) ? photo.latitude : "";
  photoLongitudeInput.value = Number.isFinite(photo.longitude) ? photo.longitude : "";

  if (Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude)) {
    setMapPickMarker([photo.latitude, photo.longitude]);
  }

  updatePhotoFormState();
  updateCueCoordinateStatus(photo);
}

function resetPhotoForm(routeId = photoRouteSelect.value, suggestedStep = 1) {
  editingPhoto = null;
  photoForm.reset();

  if (routeId) {
    photoRouteSelect.value = routeId;
    const route = routes.find((item) => item.id === routeId);
    const nextStep = route ? route.photos.length + 1 : suggestedStep;
    renderPhotoStepOptions(routeId, nextStep);
  } else {
    renderPhotoStepOptions(routeId, suggestedStep);
  }

  photoLatitudeInput.value = "";
  photoLongitudeInput.value = "";
  clearSelectedPhoto(false);
  isMapPicking = false;
  if (mapPickMarker) {
    mapPickMarker.remove();
    mapPickMarker = null;
  }
  updateMapPickerButton();
  updatePhotoFormState();
  updateCueCoordinateStatus();
}

function updatePhotoFormState() {
  if (editingPhoto) {
    photoFormState.className = "form-state";
    photoFormState.textContent = "Editing a saved cue. Replace the image only if you want to change the rehearsal photo.";
    photoSubmitButton.textContent = "Update photo cue";
    photoCancelEditButton.hidden = false;
    return;
  }

  photoFormState.className = "form-state empty-state";
  photoFormState.textContent = "Add one cue at a time: what you will see, what to do there, and an optional map location.";
  photoSubmitButton.textContent = "Save photo cue";
  photoCancelEditButton.hidden = true;
}

function updateCueCoordinateStatus(photo = getSelectedCue()) {
  if (!photo || !Number.isFinite(photo.latitude) || !Number.isFinite(photo.longitude)) {
    cueCoordinateStatus.className = "cue-coordinate-status empty-state";
    cueCoordinateStatus.textContent = "Pick a generated cue to load its coordinates.";
    return;
  }

  const latitude = photo.latitude.toFixed(6);
  const longitude = photo.longitude.toFixed(6);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  cueCoordinateStatus.className = "cue-coordinate-status";
  cueCoordinateStatus.innerHTML = `Coordinates: ${latitude}, ${longitude} <a href="${mapsUrl}" target="_blank" rel="noopener">Open in Google Maps</a>`;
}

function getSelectedCue() {
  const route = routes.find((item) => item.id === photoRouteSelect.value);
  const step = Number(photoStepSelect.value);
  return route?.photos.find((photo) => photo.step === step) || null;
}

async function usePhotoFile(file, successMessage) {
  pendingPhotoDataUrl = await fileToDataUrl(file);
  photoPasteZone.innerHTML = "";
  photoPreview.src = pendingPhotoDataUrl;
  photoPreview.hidden = false;
  photoPasteZone.append(photoPreview);
  photoPasteZone.classList.add("has-photo");
  updatePhotoInputStatus(successMessage);
}

function clearSelectedPhoto(updateStatus = true) {
  pendingPhotoDataUrl = null;
  photoPreview.src = "";
  photoPreview.hidden = true;
  photoPasteZone.classList.remove("has-photo");
  resetPhotoPastePrompt();
  photoFileInput.value = "";

  if (updateStatus) {
    updatePhotoInputStatus("No photo selected yet.");
  }
}

function resetPhotoPastePrompt() {
  photoPasteZone.innerHTML = `
    <div class="photo-paste-copy">
      <strong>Drop in the cue image</strong>
      <span>Paste a screenshot, or choose a photo from your device.</span>
    </div>
  `;
}

function updatePhotoInputStatus(message, isError = false) {
  photoInputStatus.className = isError ? "form-state" : "form-state empty-state";
  photoInputStatus.textContent = message;
}

async function deletePhoto(routeId, photoId) {
  const route = routes.find((item) => item.id === routeId);
  const photo = route?.photos.find((item) => item.id === photoId);

  if (!route || !photo || !confirm(`Delete photo stop "${photo.title}" from "${route.name}"?`)) {
    return;
  }

  route.photos = route.photos.filter((item) => item.id !== photoId);
  simulationIndex = Math.min(simulationIndex, route.photos.length);

  if (editingPhoto && editingPhoto.routeId === routeId && editingPhoto.photoId === photoId) {
    resetPhotoForm(routeId);
  }

  await saveRoutes();
  renderRouteList();
  displayRoute(route);
}

async function createDataFile() {
  if (!window.showSaveFilePicker) {
    updateDataFileStatus("This browser does not support direct local file saving. Use Export routes instead.", true);
    return;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "taxi-bo-routes.json",
      types: [
        {
          description: "JSON files",
          accept: { "application/json": [".json"] }
        }
      ]
    });

    dataFileHandle = handle;
    await writeRoutesToHandle(handle);
    updateDataFileStatus(`Connected data file: ${handle.name}. Route changes will now save to disk.`);
  } catch (error) {
    if (error?.name !== "AbortError") {
      updateDataFileStatus("Could not create the JSON data file.", true);
    }
  }
}

async function openDataFile() {
  if (!window.showOpenFilePicker) {
    updateDataFileStatus("This browser does not support opening a local data file directly. Use Import routes instead.", true);
    return;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "JSON files",
          accept: { "application/json": [".json"] }
        }
      ]
    });

    if (!handle) {
      return;
    }

    const file = await handle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      throw new Error("The selected JSON file does not contain a route list.");
    }

    routes = parsed.map(normalizeImportedRoute);
    dataFileHandle = handle;
    simulationIndex = 0;
    await saveRoutes();
    destinationSearch.value = "";
    render();
    displaySelectedRoute();
    updateDataFileStatus(`Opened data file: ${handle.name}.`);
    routeSummary.className = "route-summary";
    routeSummary.innerHTML = `<strong>Data file loaded.</strong><br>${routes.length} route${routes.length === 1 ? "" : "s"} loaded from ${escapeHtml(handle.name)}.`;
  } catch (error) {
    if (error?.name !== "AbortError") {
      updateDataFileStatus(error.message || "Could not open the JSON data file.", true);
    }
  }
}

async function saveRoutesToDisk(showSuccessMessage) {
  if (!dataFileHandle || isSavingToDisk) {
    return;
  }

  try {
    isSavingToDisk = true;
    await writeRoutesToHandle(dataFileHandle);
    updateDataFileStatus(`Saved to ${dataFileHandle.name}.`);

    if (showSuccessMessage) {
      routeSummary.className = "route-summary";
      routeSummary.innerHTML = `<strong>Data file saved.</strong><br>${escapeHtml(dataFileHandle.name)}`;
    }
  } catch (error) {
    updateDataFileStatus(error.message || "Could not save routes to the JSON data file.", true);
  } finally {
    isSavingToDisk = false;
  }
}

async function writeRoutesToHandle(handle) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(routes, null, 2));
  await writable.close();
}

function updateDataFileStatus(message, isError = false) {
  if (message) {
    dataFileStatus.className = isError ? "form-state" : "form-state empty-state";
    dataFileStatus.textContent = message;
    return;
  }

  if (dataFileHandle) {
    dataFileStatus.className = "form-state empty-state";
    dataFileStatus.textContent = `SQLite database is active. JSON backup file connected: ${dataFileHandle.name}.`;
    return;
  }

  dataFileStatus.className = "form-state empty-state";
  dataFileStatus.textContent = "SQLite database is active. JSON export/import is available for backups.";
}

function renderSimulation(route = routes.find((item) => item.id === destinationSelect.value)) {
  if (!simulationSlider || !simulationStatus || !simulationUpcoming) {
    return;
  }

  simulationUpcoming.innerHTML = "";

  if (!route) {
    simulationSlider.max = "0";
    simulationSlider.value = "0";
    simulationStatus.className = "form-state empty-state";
    simulationStatus.textContent = "Choose a route with photo stops to test upcoming photos.";
    return;
  }

  const orderedPhotos = route.photos.slice().sort((a, b) => a.step - b.step);
  const photoCount = orderedPhotos.length;
  simulationIndex = Math.min(simulationIndex, photoCount);
  simulationSlider.max = String(photoCount);
  simulationSlider.value = String(simulationIndex);

  if (!photoCount) {
    simulationStatus.className = "form-state empty-state";
    simulationStatus.textContent = "This route has no photo stops yet, so there is nothing to simulate.";
    return;
  }

  if (simulationIndex === 0) {
    simulationStatus.className = "form-state";
    simulationStatus.textContent = `Simulation is at the start of the route. The next 3 photos below are the first upcoming stops toward ${route.destination}.`;
  } else if (simulationIndex >= photoCount) {
    simulationStatus.className = "form-state";
    simulationStatus.textContent = `Simulation is beyond the last saved stop for ${route.destination}. No more upcoming photos remain.`;
  } else {
    const currentPhoto = orderedPhotos[simulationIndex - 1];
    simulationStatus.className = "form-state";
    simulationStatus.textContent = `Simulation is currently at step ${currentPhoto.step}: ${currentPhoto.title}. The next 3 upcoming photos are shown below.`;
  }

  const upcomingPhotos = orderedPhotos.slice(simulationIndex, simulationIndex + 3);

  if (!upcomingPhotos.length) {
    simulationUpcoming.innerHTML = `<div class="route-summary empty-state">No more upcoming photos after the current simulated position.</div>`;
    return;
  }

  upcomingPhotos.forEach((photo, index) => {
    const fragment = photoCardTemplate.content.cloneNode(true);
    const image = fragment.querySelector(".photo-card-image");
    const step = fragment.querySelector(".photo-card-step");
    const title = fragment.querySelector(".photo-card-title");
    const instruction = fragment.querySelector(".photo-card-instruction");
    const notes = fragment.querySelector(".photo-card-notes");
    const coordinates = fragment.querySelector(".photo-card-coordinates");
    const actions = fragment.querySelector(".photo-card-actions");

    image.src = photo.image;
    image.alt = photo.title;
    step.textContent = `Upcoming ${index + 1} · Step ${photo.step}`;
    title.textContent = photo.title;
    instruction.textContent = photo.instruction || "No turn instruction added.";
    notes.textContent = photo.notes || "No landmark notes added.";
    coordinates.textContent = Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude)
      ? `Coordinates: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`
      : "Coordinates not set.";
    actions.remove();

    simulationUpcoming.append(fragment);
  });
}

async function recoverInterruptedRouteRecording() {
  if (hasCheckedInterruptedRecording || activeRouteRecording || completedRouteRecording) {
    return;
  }

  hasCheckedInterruptedRecording = true;

  try {
    const response = await fetch(`${ROUTE_RECORDING_API}/active`, {
      headers: { Accept: "application/json", "Cache-Control": "no-store" },
      cache: "no-store"
    });
    const result = await response.json().catch(() => ({}));
    const saved = result.recording;

    if (!response.ok || !result.ok || !saved?.id || !Array.isArray(saved.points) || !saved.points.length) {
      return;
    }

    const sourceRoute = routes.find((route) => route.id === saved.sourceRouteId) || null;
    const startedAtMs = Date.parse(saved.startedAt) || saved.points[0].timestamp || Date.now();
    const lastTimestamp = saved.points.at(-1)?.timestamp || Date.now();
    completedRouteRecording = {
      id: saved.id,
      sourceRouteId: saved.sourceRouteId || "",
      routeName: saved.routeName || "Recovered drive",
      startLabel: saved.startLabel || "Recorded start",
      destination: saved.destination || "Recorded destination",
      startedAt: saved.startedAt,
      startedAtMs,
      endedAt: new Date().toISOString(),
      points: saved.points,
      distanceMeters: Number(saved.distanceMeters) || 0,
      durationSeconds: Math.max(Number(saved.durationSeconds) || 0, (lastTimestamp - startedAtMs) / 1000),
      sourceRoute,
      serverStarted: true,
      syncError: "",
      recovered: true
    };
    renderRouteRecorder();

    try {
      await persistRouteRecording(completedRouteRecording, "finish");
    } catch (error) {
      completedRouteRecording.syncError = error.message || "Recovered trip could not be finalized.";
      renderRouteRecorder();
    }
  } catch {
    // Route recording recovery is optional when the server is temporarily unavailable.
  }
}

async function beginRouteRecording(route, position) {
  const firstPoint = createRecordingPoint(position);
  const startedAtMs = firstPoint.timestamp;

  activeRouteRecording = {
    id: crypto.randomUUID(),
    sourceRouteId: route.id || "",
    routeName: route.name || "Recorded drive",
    startLabel: route.start || "Current location",
    destination: route.destination || destinationSearch.value.trim(),
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    endedAt: null,
    points: [firstPoint],
    distanceMeters: 0,
    durationSeconds: 0,
    sourceRoute: route,
    serverStarted: false,
    syncError: ""
  };
  completedRouteRecording = null;
  renderRouteRecorder();

  try {
    await persistRouteRecording(activeRouteRecording, "start");
  } catch (error) {
    activeRouteRecording.syncError = error.message || "Database sync is waiting.";
    renderRouteRecorder();
  }
}

function appendRouteRecordingPoint(position) {
  const recording = activeRouteRecording;

  if (!recording) {
    return;
  }

  const point = createRecordingPoint(position);
  const previous = recording.points.at(-1);
  const elapsedMilliseconds = point.timestamp - previous.timestamp;
  recording.durationSeconds = Math.max(0, (point.timestamp - recording.startedAtMs) / 1000);

  if (elapsedMilliseconds <= 0 || (Number.isFinite(point.accuracy) && point.accuracy > 150)) {
    renderRouteRecorder();
    return;
  }

  const segmentDistance = haversineDistance(
    [previous.latitude, previous.longitude],
    [point.latitude, point.longitude]
  );
  const calculatedSpeed = segmentDistance / (elapsedMilliseconds / 1000);

  if (calculatedSpeed > 75 && segmentDistance > 100) {
    renderRouteRecorder();
    return;
  }

  const noiseThreshold = Math.max(3, Math.min(Number(point.accuracy) || 10, 24) / 2);
  const shouldKeepStationaryPoint = elapsedMilliseconds >= 15000;

  if (segmentDistance < noiseThreshold && !shouldKeepStationaryPoint) {
    renderRouteRecorder();
    return;
  }

  if (!Number.isFinite(point.speed)) {
    point.speed = calculatedSpeed;
  }

  if (segmentDistance >= noiseThreshold) {
    recording.distanceMeters += segmentDistance;
  }

  recording.points.push(point);
  recording.syncError = "";
  renderRouteRecorder();
  updateRecordedRouteLine();
  scheduleRecordingFlush();
}

function createRecordingPoint(position) {
  const coords = position?.coords || {};
  return {
    latitude: Number(coords.latitude),
    longitude: Number(coords.longitude),
    timestamp: Number(position?.timestamp) || Date.now(),
    accuracy: finiteOrNull(coords.accuracy),
    speed: Number(coords.speed) >= 0 ? finiteOrNull(coords.speed) : null,
    heading: finiteOrNull(coords.heading)
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scheduleRecordingFlush() {
  if (recordingFlushTimeoutId !== null) {
    return;
  }

  recordingFlushTimeoutId = window.setTimeout(() => {
    recordingFlushTimeoutId = null;
    flushRouteRecording();
  }, 12000);
}

async function flushRouteRecording(useBeacon = false) {
  const recording = activeRouteRecording;

  if (!recording || recordingFlushInFlight) {
    return;
  }

  if (useBeacon && recording.serverStarted && navigator.sendBeacon) {
    const body = new Blob([JSON.stringify(recordingPayload(recording))], { type: "application/json" });
    navigator.sendBeacon(`${ROUTE_RECORDING_API}/update`, body);
    return;
  }

  recordingFlushInFlight = true;
  recordingFlushPromise = persistRouteRecording(recording, "update");

  try {
    await recordingFlushPromise;
    recording.syncError = "";
  } catch (error) {
    recording.syncError = error.message || "Database sync is waiting.";
  } finally {
    recordingFlushInFlight = false;
    recordingFlushPromise = null;
    renderRouteRecorder();
  }
}

function finishRouteRecording() {
  const recording = activeRouteRecording;

  if (!recording) {
    return;
  }

  activeRouteRecording = null;
  completedRouteRecording = recording;
  recording.endedAt = new Date().toISOString();
  recording.durationSeconds = Math.max(
    recording.durationSeconds,
    (Date.now() - recording.startedAtMs) / 1000
  );

  if (recordingFlushTimeoutId !== null) {
    window.clearTimeout(recordingFlushTimeoutId);
    recordingFlushTimeoutId = null;
  }

  renderRouteRecorder();
  const pendingCheckpoint = recordingFlushPromise
    ? recordingFlushPromise.catch(() => {})
    : Promise.resolve();

  pendingCheckpoint
    .then(() => persistRouteRecording(recording, "finish"))
    .then(() => {
      recording.syncError = "";
      renderRouteRecorder();
    })
    .catch((error) => {
      recording.syncError = error.message || "The completed trip has not synced yet.";
      renderRouteRecorder();
    });
}

async function persistRouteRecording(recording, action) {
  if (!recording.serverStarted) {
    await postRouteRecording("start", recordingPayload(recording));
    recording.serverStarted = true;

    if (action === "start") {
      return;
    }
  }

  await postRouteRecording(action, recordingPayload(recording));
}

async function postRouteRecording(action, payload) {
  const response = await fetch(`${ROUTE_RECORDING_API}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Could not save the route recording.");
  }

  return result.recording;
}

function recordingPayload(recording) {
  return {
    id: recording.id,
    sourceRouteId: recording.sourceRouteId,
    routeName: recording.routeName,
    startLabel: recording.startLabel,
    destination: recording.destination,
    startedAt: recording.startedAt,
    endedAt: recording.endedAt,
    distanceMeters: recording.distanceMeters,
    durationSeconds: recording.durationSeconds,
    points: recording.points
  };
}

function renderRouteRecorder() {
  if (!routeRecorder) {
    return;
  }

  const recording = activeRouteRecording || completedRouteRecording;

  if (!recording) {
    routeRecorder.dataset.state = "idle";
    routeRecorderBadge.textContent = "Ready";
    routeRecorderState.textContent = "Route recording starts with live drive";
    recordingElapsed.textContent = "00:00";
    recordingDistance.textContent = "0.0 mi";
    recordingPointCount.textContent = "0";
    recordingCompletion.hidden = true;
    return;
  }

  recordingElapsed.textContent = formatRecordingDuration(recording.durationSeconds);
  recordingDistance.textContent = formatDistance(recording.distanceMeters);
  recordingPointCount.textContent = String(recording.points.length);

  if (activeRouteRecording) {
    routeRecorder.dataset.state = "recording";
    routeRecorderBadge.textContent = "REC";
    routeRecorderState.textContent = recording.syncError
      ? "Recording GPS - database sync will retry"
      : `Recording actual drive to ${shortPlaceName(recording.destination)}`;
    recordingCompletion.hidden = true;
    return;
  }

  routeRecorder.dataset.state = recording.syncError ? "error" : "completed";
  routeRecorderBadge.textContent = recording.syncError ? "Unsynced" : "Saved";
  routeRecorderState.textContent = recording.syncError
    ? "Trip complete, but database sync failed. Keep this page open and try saving the route."
    : recording.recovered
      ? "Interrupted drive recovered. Save it as a reusable route variant or discard it."
      : "Actual drive recorded. Save it as a reusable route variant or discard it.";
  recordingCompletion.hidden = false;
}

function formatRecordingDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const clock = [minutes, remainingSeconds].map((part) => String(part).padStart(2, "0")).join(":");
  return hours ? `${hours}:${clock}` : clock;
}

async function saveCompletedRecordingAsRoute() {
  const recording = completedRouteRecording;

  if (!recording || recording.points.length < 2) {
    routeRecorder.dataset.state = "error";
    routeRecorderState.textContent = "At least two reliable GPS points are needed to save this route.";
    return;
  }

  const variant = recordedRouteVariant.value.trim() || "Passenger shortcut";
  const sourceRoute = recording.sourceRoute || {};
  const first = recording.points[0];
  const last = recording.points.at(-1);
  const routeId = crypto.randomUUID();
  const recordedRoute = normalizeImportedRoute({
    id: routeId,
    name: `${sourceRoute.name || shortPlaceName(recording.destination)} - recorded`,
    variant,
    start: recording.startLabel || "Recorded start",
    destination: recording.destination,
    notes: `Actual drive recorded ${new Date(recording.startedAt).toLocaleString()}.`,
    startLatitude: first.latitude,
    startLongitude: first.longitude,
    destinationLatitude: last.latitude,
    destinationLongitude: last.longitude,
    routeGeometry: recording.points.map((point) => [point.latitude, point.longitude]),
    routeDistanceMeters: recording.distanceMeters,
    routeDurationSeconds: recording.durationSeconds,
    photos: Array.isArray(sourceRoute.photos)
      ? sourceRoute.photos.map((photo) => ({ ...photo, id: crypto.randomUUID() }))
      : []
  });

  saveRecordedRouteButton.disabled = true;
  discardRecordingButton.disabled = true;
  routeRecorderState.textContent = "Saving recorded route to the route library...";

  try {
    routes.push(recordedRoute);
    await saveRoutes();
    completedRouteRecording = null;
    preparedRoute = null;
    destinationSearch.value = "";
    render();
    destinationSelect.value = routeId;
    photoRouteSelect.value = routeId;
    displayRoute(recordedRoute);
    renderRouteRecorder();
    setLiveDriveStatus(`Saved actual drive as route variant "${variant}".`);
  } catch (error) {
    routes = routes.filter((route) => route.id !== routeId);
    routeRecorder.dataset.state = "error";
    routeRecorderState.textContent = error.message || "Could not save the recorded route.";
  } finally {
    saveRecordedRouteButton.disabled = false;
    discardRecordingButton.disabled = false;
  }
}

async function discardCompletedRecording() {
  const recording = completedRouteRecording;

  if (!recording) {
    return;
  }

  discardRecordingButton.disabled = true;

  try {
    if (recording.serverStarted) {
      await postRouteRecording("discard", { id: recording.id });
    }
    completedRouteRecording = null;
    recordedRouteVariant.value = "Passenger shortcut";
    renderRouteRecorder();
    setLiveDriveStatus("Recorded drive discarded.");
  } catch (error) {
    routeRecorder.dataset.state = "error";
    routeRecorderState.textContent = error.message || "Could not discard the recording.";
  } finally {
    discardRecordingButton.disabled = false;
  }
}

async function loadSpeedWarnings() {
  try {
    const response = await fetch(SPEED_WARNINGS_API, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not load speed warnings.");
    }
    speedWarnings = Array.isArray(result.warnings) ? result.warnings : [];
    renderSpeedWarningList();
  } catch (error) {
    speedWarningManagerStatus.className = "form-state";
    speedWarningManagerStatus.textContent = error.message || "Could not load speed warnings.";
  }
}

async function addSpeedWarningAtCurrentLocation() {
  if (!liveDrivePosition) {
    speedWarningManagerStatus.className = "form-state";
    speedWarningManagerStatus.textContent = "Start live GPS or simulation before marking a warning point.";
    return;
  }

  const payload = {
    label: speedWarningLabel.value.trim() || "Speed camera",
    latitude: liveDrivePosition.coords.latitude,
    longitude: liveDrivePosition.coords.longitude,
    speedLimitMph: Number(speedWarningLimit.value),
    radiusMeters: Number(speedWarningRadius.value)
  };

  addSpeedWarningButton.disabled = true;
  speedWarningManagerStatus.className = "form-state empty-state";
  speedWarningManagerStatus.textContent = "Saving warning point to the database...";

  try {
    const response = await fetch(SPEED_WARNINGS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not save this warning point.");
    }
    speedWarnings.unshift(result.warning);
    renderSpeedWarningList();
    speedWarningManagerStatus.className = "form-state";
    speedWarningManagerStatus.textContent = `${result.warning.label} saved at the current GPS position.`;
    updateSpeedAwareness(liveDrivePosition);
  } catch (error) {
    speedWarningManagerStatus.className = "form-state";
    speedWarningManagerStatus.textContent = error.message || "Could not save this warning point.";
  } finally {
    addSpeedWarningButton.disabled = !liveDrivePosition;
  }
}

async function deleteSpeedWarning(id) {
  try {
    const response = await fetch(`${SPEED_WARNINGS_API}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not delete this warning point.");
    }
    speedWarnings = speedWarnings.filter((warning) => warning.id !== id);
    renderSpeedWarningList();
    speedWarningManagerStatus.className = "form-state";
    speedWarningManagerStatus.textContent = "Warning point deleted from the database.";
    updateSpeedAwareness(liveDrivePosition);
  } catch (error) {
    speedWarningManagerStatus.className = "form-state";
    speedWarningManagerStatus.textContent = error.message || "Could not delete this warning point.";
  }
}

function renderSpeedWarningList() {
  if (!speedWarnings.length) {
    speedWarningList.innerHTML = '<div class="form-state empty-state">No speed-warning points saved yet.</div>';
    return;
  }

  speedWarningList.innerHTML = speedWarnings.map((warning) => `
    <div class="speed-warning-item">
      <div>
        <strong>${escapeHtml(warning.label)}</strong>
        <span>${Math.round(warning.speedLimitMph)} mph · warns within ${Math.round(warning.radiusMeters)} m · ${Number(warning.latitude).toFixed(5)}, ${Number(warning.longitude).toFixed(5)}</span>
      </div>
      <button class="secondary-button small-button" type="button" data-delete-speed-warning="${escapeHtml(warning.id)}">Delete</button>
    </div>
  `).join("");

  speedWarningList.querySelectorAll("[data-delete-speed-warning]").forEach((button) => {
    button.addEventListener("click", () => deleteSpeedWarning(button.dataset.deleteSpeedWarning));
  });
}

function updateSpeedAwareness(position) {
  addSpeedWarningButton.disabled = !position;

  if (!position) {
    currentSpeed.textContent = "--";
    speedAwareness.dataset.state = "idle";
    speedWarningBadge.textContent = "Monitoring";
    speedWarningTitle.textContent = "No nearby speed warning";
    speedWarningStatus.textContent = "Start live drive to monitor database warning points.";
    lastSpeedSample = null;
    return;
  }

  const speedMph = calculateSpeedMph(position);
  currentSpeed.textContent = Number.isFinite(speedMph) ? String(Math.round(speedMph)) : "--";

  if (!speedWarnings.length) {
    speedAwareness.dataset.state = "idle";
    speedWarningBadge.textContent = "No points";
    speedWarningTitle.textContent = "No speed warnings in the database";
    speedWarningStatus.textContent = "Open Manage warning points to mark a known camera or enforcement area.";
    return;
  }

  const here = [position.coords.latitude, position.coords.longitude];
  const nearest = speedWarnings
    .map((warning) => ({ warning, distance: haversineDistance(here, [Number(warning.latitude), Number(warning.longitude)]) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const isApproaching = nearest.distance <= Number(nearest.warning.radiusMeters);
  const isOverspeed = isApproaching && Number.isFinite(speedMph) && speedMph > Number(nearest.warning.speedLimitMph);

  if (!isApproaching) {
    speedAwareness.dataset.state = "idle";
    speedWarningBadge.textContent = "Monitoring";
    speedWarningTitle.textContent = `Nearest: ${nearest.warning.label}`;
    speedWarningStatus.textContent = `${formatMeters(nearest.distance)} away · ${Math.round(nearest.warning.speedLimitMph)} mph warning point.`;
    return;
  }

  speedAwareness.dataset.state = isOverspeed ? "overspeed" : "warning";
  speedWarningBadge.textContent = isOverspeed ? "Slow down" : "Warning ahead";
  speedWarningTitle.textContent = `${nearest.warning.label} · ${Math.round(nearest.warning.speedLimitMph)} mph`;
  speedWarningStatus.textContent = `${formatMeters(nearest.distance)} ahead${isOverspeed ? ` · currently ${Math.round(speedMph)} mph` : ""}.`;
  maybeSoundSpeedAlert(nearest.warning.id, isOverspeed);
}

function calculateSpeedMph(position) {
  const directSpeed = Number(position.coords.speed);
  let speedMetersPerSecond = Number.isFinite(directSpeed) && directSpeed >= 0 ? directSpeed : null;
  const sample = {
    latitude: Number(position.coords.latitude),
    longitude: Number(position.coords.longitude),
    timestamp: Number(position.timestamp) || Date.now()
  };

  if (speedMetersPerSecond === null && lastSpeedSample) {
    const elapsed = (sample.timestamp - lastSpeedSample.timestamp) / 1000;
    if (elapsed > 0) {
      const distance = haversineDistance(
        [lastSpeedSample.latitude, lastSpeedSample.longitude],
        [sample.latitude, sample.longitude]
      );
      const calculated = distance / elapsed;
      if (calculated <= 55) {
        speedMetersPerSecond = calculated;
      }
    }
  }

  lastSpeedSample = sample;
  return speedMetersPerSecond === null ? null : speedMetersPerSecond * 2.236936;
}

function armSpeedAudio() {
  try {
    speedAudioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (speedAudioContext.state === "suspended") {
      speedAudioContext.resume();
    }
  } catch (_error) {
    speedAudioContext = null;
  }
}

function maybeSoundSpeedAlert(warningId, overspeed) {
  const now = Date.now();
  const repeatAfter = overspeed ? 12000 : 60000;
  const shouldSound = lastSpeedAlert.id !== warningId
    || lastSpeedAlert.overspeed !== overspeed
    || now - lastSpeedAlert.at >= repeatAfter;

  if (!shouldSound || !speedAudioContext) {
    return;
  }

  lastSpeedAlert = { id: warningId, at: now, overspeed };
  const oscillator = speedAudioContext.createOscillator();
  const gain = speedAudioContext.createGain();
  oscillator.frequency.value = overspeed ? 880 : 620;
  gain.gain.setValueAtTime(0.0001, speedAudioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, speedAudioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, speedAudioContext.currentTime + 0.28);
  oscillator.connect(gain).connect(speedAudioContext.destination);
  oscillator.start();
  oscillator.stop(speedAudioContext.currentTime + 0.3);
}

async function startLiveDrive() {
  const route = getActiveRoute();

  if (!route) {
    setLiveDriveStatus("Choose a route before starting live drive.", true);
    return;
  }

  if (completedRouteRecording) {
    setLiveDriveStatus("Save or discard the completed recording before starting another live drive.", true);
    return;
  }

  if (!getLocatedCues(route).length) {
    setLiveDriveStatus("This route has no cue coordinates yet. Generate cues or add cue locations first.", true);
    return;
  }

  if (!window.isSecureContext) {
    setLiveDriveStatus("Live GPS needs a secure page. Open Taxi Bo from localhost, for example http://127.0.0.1:8020/index.html.", true);
    return;
  }

  if (!navigator.geolocation) {
    setLiveDriveStatus("This browser does not support GPS location tracking.", true);
    return;
  }

  stopLiveDrive(false);
  liveDrivePosition = null;
  renderLiveDrive(route);
  setLiveDriveStatus("Requesting location permission. Allow location access to start live drive mode.");
  liveDriveStartButton.disabled = true;
  liveDriveStopButton.disabled = false;
  scheduleLiveDriveWaitingMessage();

  try {
    const firstPosition = await getCurrentPosition();
    await beginRouteRecording(route, firstPosition);
    handleLivePosition(firstPosition, route);
    liveDriveWatchId = navigator.geolocation.watchPosition(
      (position) => handleLivePosition(position, route),
      (error) => handleLiveError(error),
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 12000
      }
    );
  } catch (error) {
    handleLiveError(error);
  }
}

function stopLiveDrive(updateStatus = true) {
  finishRouteRecording();
  clearLiveDriveTimeout();
  stopLiveDriveSimulation(false);
  clearLiveDriveMap();

  if (liveDriveWatchId !== null) {
    navigator.geolocation.clearWatch(liveDriveWatchId);
    liveDriveWatchId = null;
  }

  liveDriveStartButton.disabled = false;
  liveDriveSimulateButton.disabled = false;
  liveDriveStopButton.disabled = true;

  if (updateStatus) {
    liveDrivePosition = null;
    lastSpokenCueId = "";
    window.speechSynthesis?.cancel();
    updateSpeedAwareness(null);
    liveDriveUpcoming.innerHTML = "";
    setLiveDriveStatus("Live drive stopped.");
    setMapDriverMode(false);
  }
}

function startLiveDriveSimulation() {
  const route = getActiveRoute();

  setLiveDriveStatus("Simulation button clicked. Checking selected route...");

  if (!route) {
    setLiveDriveStatus("Choose a route before starting tablet simulation.", true);
    return;
  }

  const routeGeometry = normalizeRouteGeometry(route.routeGeometry);
  const locatedCues = getLocatedCues(route);

  setLiveDriveStatus(`Simulation found route "${route.name}" with ${routeGeometry.length} route points and ${locatedCues.length} cues.`);

  if (routeGeometry.length < 2) {
    setLiveDriveStatus("This route has no saved route line to simulate. Generate the route first.", true);
    return;
  }

  if (!locatedCues.length) {
    setLiveDriveStatus("This route has no cue coordinates yet. Generate cues before simulating tablet drive.", true);
    return;
  }

  stopLiveDrive(false);
  liveDriveSimulationIndex = 0;
  liveDriveStartButton.disabled = true;
  liveDriveSimulateButton.disabled = true;
  liveDriveStopButton.disabled = false;
  setLiveDriveStatus("Tablet simulation running. Moving along the saved route line and following it on the map...");

  const simulationPoints = sampleSimulationPath(routeGeometry, 90);

  const tick = () => {
    const point = simulationPoints[liveDriveSimulationIndex];
    liveDrivePosition = createSimulatedPosition(point);
    updateSpeedAwareness(liveDrivePosition);
    renderLiveDrive(route);
    liveDriveSimulationIndex += 1;

    if (liveDriveSimulationIndex >= simulationPoints.length) {
      stopLiveDriveSimulation(false);
      setLiveDriveStatus("Tablet simulation reached the end of the route.");
      liveDriveStartButton.disabled = false;
      liveDriveSimulateButton.disabled = false;
      liveDriveStopButton.disabled = true;
      return;
    }

    liveDriveSimulationId = window.setTimeout(tick, 800);
  };

  tick();
}

function stopLiveDriveSimulation(clearPosition = true) {
  if (liveDriveSimulationId !== null) {
    window.clearTimeout(liveDriveSimulationId);
    liveDriveSimulationId = null;
  }

  liveDriveSimulationIndex = 0;

  if (clearPosition) {
    liveDrivePosition = null;
  }
}

function createSimulatedPosition(point) {
  return {
    coords: {
      latitude: point[0],
      longitude: point[1],
      accuracy: 5,
      speed: 15.65
    },
    timestamp: Date.now()
  };
}

function sampleSimulationPath(points, count) {
  if (points.length <= count) {
    return points;
  }

  const sampled = [];

  for (let index = 0; index < count; index += 1) {
    const pointIndex = Math.round(index * (points.length - 1) / (count - 1));
    sampled.push(points[pointIndex]);
  }

  return sampled;
}

function handleLivePosition(position, route) {
  clearLiveDriveTimeout();
  liveDrivePosition = position;
  updateSpeedAwareness(position);
  appendRouteRecordingPoint(position);
  liveDriveStartButton.disabled = true;
  liveDriveStopButton.disabled = false;
  renderLiveDrive(route);
}

function handleLiveError(error) {
  clearLiveDriveTimeout();
  const message = error?.code === 1
    ? "Location permission was denied. Allow location access in the browser to use live drive mode."
    : error?.code === 2
      ? "The browser could not determine the taxi position. On Windows, turn on Location Services or use a device with GPS."
      : error?.code === 3
        ? "GPS timed out. Try again outdoors or on a phone/tablet with location enabled."
        : error.message || "Could not read the taxi position.";
  setLiveDriveStatus(message, true);
  stopLiveDrive(false);
}

function scheduleLiveDriveWaitingMessage() {
  clearLiveDriveTimeout();
  liveDriveTimeoutId = window.setTimeout(() => {
    setLiveDriveStatus("Still waiting for GPS. If no browser permission prompt appeared, check site permissions or Windows Location Services.", true);
  }, 7000);
}

function clearLiveDriveTimeout() {
  if (liveDriveTimeoutId !== null) {
    window.clearTimeout(liveDriveTimeoutId);
    liveDriveTimeoutId = null;
  }
}

function renderLiveDrive(route = getActiveRoute()) {
  liveDriveUpcoming.innerHTML = "";

  if (!route) {
    setLiveDriveStatus("Choose a route with cue coordinates, then start live drive.");
    return;
  }

  const locatedCues = getLocatedCues(route);

  if (!locatedCues.length) {
    setLiveDriveStatus("This route has no cue coordinates yet. Generate cues or add cue locations first.");
    return;
  }

  if (!liveDrivePosition) {
    setLiveDriveStatus("Live drive is ready. Start GPS tracking to show the next three cues.");
    renderCuePreviewCards(locatedCues);
    renderPhotoCards(locatedCues.slice(0, 3), liveDriveUpcoming, (photo, index) => `Upcoming ${index + 1} - Step ${photo.step}`);
    return;
  }

  const currentLatLng = [liveDrivePosition.coords.latitude, liveDrivePosition.coords.longitude];
  const upcoming = getUpcomingCuesForPosition(route, currentLatLng);
  const mapFollowError = updateLiveDriveMap(currentLatLng, liveDrivePosition.coords.accuracy, upcoming[0]);
  const accuracy = Number.isFinite(liveDrivePosition.coords.accuracy)
    ? ` GPS accuracy ${Math.round(liveDrivePosition.coords.accuracy)} m.`
    : "";
  const mapFollowStatus = mapFollowError ? ` Map follow unavailable: ${mapFollowError}` : "";

  if (!upcoming.length) {
    setLiveDriveStatus(`You appear to be beyond the last saved cue.${accuracy}${mapFollowStatus}`);
    renderCuePreviewCards([]);
    liveDriveUpcoming.innerHTML = `<div class="route-summary empty-state">No more upcoming cues on this route.</div>`;
    return;
  }

  const nearest = upcoming[0];
  const distance = haversineDistance(currentLatLng, [nearest.latitude, nearest.longitude]);
  if (distance <= 500 && lastSpokenCueId !== nearest.id) {
    lastSpokenCueId = nearest.id;
    speakCueTitle(nearest.title);
  }
  setLiveDriveStatus(`Live drive running. Next cue: step ${nearest.step}, about ${formatMeters(distance)} away.${accuracy}${mapFollowStatus}`);
  renderCuePreviewCards(upcoming);
  renderPhotoCards(upcoming.slice(0, 3), liveDriveUpcoming, (photo, index) => `Live next ${index + 1} - Step ${photo.step}`);
}

function speakCueTitle(title, force = false) {
  const text = String(title || "").trim();
  if (!text || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
    return;
  }

  if (force) {
    window.speechSynthesis.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = /[\u3400-\u9fff]/.test(text) ? "zh-HK" : "en-US";
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function updateLiveDriveMap(latLng, accuracy, nextCue) {
  if (!map) {
    return "map is not ready";
  }

  if (!window.L || typeof L.circleMarker !== "function") {
    return "map library is not ready";
  }

  if (!Array.isArray(latLng) || latLng.length !== 2 || !Number.isFinite(latLng[0]) || !Number.isFinite(latLng[1])) {
    return "taxi coordinates are invalid";
  }

  try {
    setMapDriverMode(true);

    if (!liveDriveMarker) {
      liveDriveMarker = L.circleMarker(latLng, {
        radius: 12,
        color: "#ffffff",
        weight: 4,
        fillColor: "#0f7a5a",
        fillOpacity: 1,
        pane: "markerPane"
      }).addTo(map);
      liveDriveMarker.bindTooltip("Taxi position", {
        permanent: false,
        direction: "top"
      });
    } else {
      liveDriveMarker.setLatLng(latLng);
    }

    updateNextCueMarker(nextCue);
    updateRouteAheadLine(latLng, nextCue);
    updateRecordedRouteLine();

    if (Number.isFinite(accuracy) && typeof L.circle === "function") {
      const radius = Math.max(5, Math.min(accuracy, 120));

      if (!liveDriveAccuracyCircle) {
        liveDriveAccuracyCircle = L.circle(latLng, {
          radius,
          color: "#0f7a5a",
          weight: 1,
          opacity: 0.35,
          fillColor: "#0f7a5a",
          fillOpacity: 0.1
        }).addTo(map);
      } else {
        liveDriveAccuracyCircle.setLatLng(latLng);
        liveDriveAccuracyCircle.setRadius(radius);
      }
    } else if (liveDriveAccuracyCircle) {
      liveDriveAccuracyCircle.remove();
      liveDriveAccuracyCircle = null;
    }

    if (map.getZoom() < 15) {
      map.setZoom(15, {
        animate: true
      });
    }

    map.panTo(latLng, {
      animate: true,
      duration: 0.45
    });
  } catch (error) {
    return error.message || "map could not move";
  }

  return "";
}

function updateNextCueMarker(nextCue) {
  if (!nextCue || !Number.isFinite(nextCue.latitude) || !Number.isFinite(nextCue.longitude)) {
    if (liveDriveNextCueMarker) {
      liveDriveNextCueMarker.remove();
      liveDriveNextCueMarker = null;
    }
    return;
  }

  const cueLatLng = [nextCue.latitude, nextCue.longitude];
  const cueHtml = `<span class="next-cue-marker-step">${nextCue.step}</span>`;
  const cueIcon = L.divIcon({
    className: "next-cue-marker",
    html: cueHtml,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

  if (!liveDriveNextCueMarker) {
    liveDriveNextCueMarker = L.marker(cueLatLng, {
      icon: cueIcon,
      zIndexOffset: 900
    }).addTo(map);
    liveDriveNextCueMarker.bindTooltip("Next cue", {
      permanent: false,
      direction: "top"
    });
  } else {
    liveDriveNextCueMarker.setLatLng(cueLatLng);
    liveDriveNextCueMarker.setIcon(cueIcon);
  }
}

function updateRouteAheadLine(latLng, nextCue) {
  if (!nextCue || !Number.isFinite(nextCue.latitude) || !Number.isFinite(nextCue.longitude)) {
    if (liveDriveAheadLine) {
      liveDriveAheadLine.remove();
      liveDriveAheadLine = null;
    }
    return;
  }

  const linePoints = [latLng, [nextCue.latitude, nextCue.longitude]];

  if (!liveDriveAheadLine) {
    liveDriveAheadLine = L.polyline(linePoints, {
      color: "#f2a51a",
      weight: 7,
      opacity: 0.88,
      dashArray: "12 10"
    }).addTo(map);
  } else {
    liveDriveAheadLine.setLatLngs(linePoints);
  }
}

function updateRecordedRouteLine() {
  if (!map || !window.L) {
    return;
  }

  const recording = activeRouteRecording || completedRouteRecording;
  const points = recording?.points?.map((point) => [point.latitude, point.longitude]) || [];

  if (points.length < 2) {
    return;
  }

  if (!liveDriveRecordedLine) {
    liveDriveRecordedLine = L.polyline(points, {
      color: "#0f7a5a",
      weight: 6,
      opacity: 0.9
    }).addTo(map);
  } else {
    liveDriveRecordedLine.setLatLngs(points);
  }
}

function setMapDriverMode(isActive) {
  const container = document.querySelector("#routeMap");

  if (container) {
    container.classList.toggle("driver-map", isActive);
  }
}

function clearLiveDriveMap() {
  setMapDriverMode(false);

  if (liveDriveMarker) {
    liveDriveMarker.remove();
    liveDriveMarker = null;
  }

  if (liveDriveAccuracyCircle) {
    liveDriveAccuracyCircle.remove();
    liveDriveAccuracyCircle = null;
  }

  if (liveDriveNextCueMarker) {
    liveDriveNextCueMarker.remove();
    liveDriveNextCueMarker = null;
  }

  if (liveDriveAheadLine) {
    liveDriveAheadLine.remove();
    liveDriveAheadLine = null;
  }

  if (liveDriveRecordedLine) {
    liveDriveRecordedLine.remove();
    liveDriveRecordedLine = null;
  }
}

function renderPhotoCards(photos, container, stepFormatter) {
  container.innerHTML = "";

  photos.forEach((photo, index) => {
    const fragment = photoCardTemplate.content.cloneNode(true);
    const image = fragment.querySelector(".photo-card-image");
    const step = fragment.querySelector(".photo-card-step");
    const title = fragment.querySelector(".photo-card-title");
    const instruction = fragment.querySelector(".photo-card-instruction");
    const notes = fragment.querySelector(".photo-card-notes");
    const coordinates = fragment.querySelector(".photo-card-coordinates");
    const actions = fragment.querySelector(".photo-card-actions");

    image.src = photo.image;
    image.alt = photo.title;
    step.textContent = stepFormatter(photo, index);
    title.textContent = photo.title;
    instruction.textContent = photo.instruction || "No turn instruction added.";
    notes.textContent = photo.notes || "No landmark notes added.";
    coordinates.textContent = Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude)
      ? `Coordinates: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`
      : "Coordinates not set.";
    actions.remove();

    container.append(fragment);
  });
}

function setLiveDriveStatus(message, isError = false) {
  liveDriveStatus.className = isError ? "form-state" : "form-state empty-state";
  liveDriveStatus.textContent = message;
}

function getLocatedCues(route) {
  return route.photos
    .slice()
    .sort((a, b) => a.step - b.step)
    .filter((photo) => Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude));
}

function getUpcomingCuesForPosition(route, currentLatLng) {
  const locatedCues = getLocatedCues(route);
  const routeGeometry = normalizeRouteGeometry(route.routeGeometry);

  if (routeGeometry.length < 2) {
    return locatedCues
      .map((cue) => ({
        cue,
        distance: haversineDistance(currentLatLng, [cue.latitude, cue.longitude])
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((item) => item.cue);
  }

  const routeMeasure = buildRouteMeasure(routeGeometry);
  const currentProgress = projectPointOntoRoute(currentLatLng, routeMeasure).progress;

  return locatedCues
    .map((cue) => ({
      cue,
      progress: projectPointOntoRoute([cue.latitude, cue.longitude], routeMeasure).progress
    }))
    .filter((item) => item.progress >= currentProgress - 35)
    .sort((a, b) => a.progress - b.progress)
    .map((item) => item.cue);
}

function buildRouteMeasure(points) {
  const cumulative = [0];

  for (let index = 1; index < points.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + haversineDistance(points[index - 1], points[index]);
  }

  return {
    points,
    cumulative
  };
}

function projectPointOntoRoute(point, routeMeasure) {
  let best = {
    distance: Infinity,
    progress: 0
  };

  for (let index = 0; index < routeMeasure.points.length - 1; index += 1) {
    const start = routeMeasure.points[index];
    const end = routeMeasure.points[index + 1];
    const projected = projectPointToSegment(point, start, end);
    const distance = haversineDistance(point, projected.point);

    if (distance < best.distance) {
      best = {
        distance,
        progress: routeMeasure.cumulative[index] + haversineDistance(start, projected.point)
      };
    }
  }

  return best;
}

function projectPointToSegment(point, start, end) {
  const scale = Math.cos((point[0] * Math.PI) / 180);
  const px = point[1] * scale;
  const py = point[0];
  const ax = start[1] * scale;
  const ay = start[0];
  const bx = end[1] * scale;
  const by = end[0];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;

  return {
    point: [
      ay + t * dy,
      (ax + t * dx) / scale
    ]
  };
}

function haversineDistance(first, second) {
  const earthRadius = 6371000;
  const lat1 = (first[0] * Math.PI) / 180;
  const lat2 = (second[0] * Math.PI) / 180;
  const deltaLat = ((second[0] - first[0]) * Math.PI) / 180;
  const deltaLng = ((second[1] - first[1]) * Math.PI) / 180;
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatMeters(meters) {
  if (!Number.isFinite(meters)) {
    return "";
  }

  if (meters < 1609.344) {
    return `${Math.round(meters)} m`;
  }

  return formatDistance(meters);
}

function formatRouteLabel(route) {
  const variant = route.variant || "Standard";
  const timeWindow = route.timeWindow ? `, ${route.timeWindow}` : "";
  const suffix = variant === "Standard" && !timeWindow ? "" : ` (${variant}${timeWindow ? timeWindow : ""})`;
  return `${route.name || "Untitled route"} -> ${shortPlaceName(route.destination)}${suffix}`;
}

function formatRoutePickerLabel(route) {
  const routeName = route.name?.trim() || `${shortPlaceName(route.start)} to ${shortPlaceName(route.destination)}`;
  const destination = shortPlaceName(route.destination);
  const distance = Number.isFinite(route.routeDistanceMeters) ? `, ${formatDistance(route.routeDistanceMeters)}` : "";
  return `${routeName} - ${destination}${distance}`;
}

function shortPlaceName(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "Unknown";
  }

  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2 && /^\d/.test(parts[0])) {
    return `${parts[0]} ${parts[1]}`;
  }

  return parts[0] || text;
}

function formatRouteContext(route) {
  const parts = [];

  if (route.timeWindow) {
    parts.push(`Best time: ${route.timeWindow}`);
  }

  if (route.trafficPattern) {
    parts.push(`Traffic: ${route.trafficPattern}`);
  }

  if (route.notes) {
    parts.push(route.notes);
  }

  if (Number.isFinite(route.routeDistanceMeters)) {
    parts.push(`Route: ${formatDistance(route.routeDistanceMeters)}`);
  }

  return parts.join(" | ") || "No route notes yet.";
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return "";
  }

  const miles = meters / 1609.344;
  return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
}

async function geocodePlace(query) {
  setLookupStatus(`Searching for "${query}"...`);
  return geocodeQuery(query, "lookup");
}

async function reverseLookupCoordinates(latitude, longitude) {
  try {
    cancelLookupRequest();
    lookupAbortController = new AbortController();

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal: lookupAbortController.signal
    });

    if (!response.ok) {
      return;
    }

    const result = await response.json();
    const label = String(result.display_name || "").trim();

    if (label && !document.querySelector("#photoNotes").value.trim()) {
      document.querySelector("#photoNotes").value = label;
    }

    if (label) {
      setLookupStatus(`Picked map location near ${label}.`);
    }
  } catch {
    setLookupStatus(`Picked coordinates ${latitude.toFixed(6)}, ${longitude.toFixed(6)} for the next photo stop.`);
  }
}

function cancelLookupRequest() {
  if (lookupAbortController) {
    lookupAbortController.abort();
    lookupAbortController = null;
  }
}

function cancelRouteGeocodeRequest() {
  if (routeGeocodeAbortController) {
    routeGeocodeAbortController.abort();
    routeGeocodeAbortController = null;
  }
}

function setLookupStatus(message, isError = false) {
  lookupStatus.className = isError ? "form-state" : "form-state empty-state";
  lookupStatus.textContent = message;
}

async function drawRouteEndpoints(route) {
  const start = route.start?.trim();
  const destination = route.destination?.trim();
  const savedGeometry = normalizeRouteGeometry(route.routeGeometry);
  const hasStartCoordinates = Number.isFinite(route.startLatitude) && Number.isFinite(route.startLongitude);
  const hasDestinationCoordinates = Number.isFinite(route.destinationLatitude) && Number.isFinite(route.destinationLongitude);

  if (savedGeometry.length) {
    const points = [];

    if (hasStartCoordinates) {
      const startLatLng = [route.startLatitude, route.startLongitude];
      const startMarker = L.marker(startLatLng).addTo(map);
      startMarker.bindPopup(`<strong>Start</strong><br>${escapeHtml(start || "Current location")}`);
      mapMarkers.push(startMarker);
      points.push(startLatLng);
    }

    if (hasDestinationCoordinates) {
      const destinationLatLng = [route.destinationLatitude, route.destinationLongitude];
      const destinationMarker = L.marker(destinationLatLng).addTo(map);
      destinationMarker.bindPopup(`<strong>Destination</strong><br>${escapeHtml(destination || "Destination")}`);
      mapMarkers.push(destinationMarker);
      points.push(destinationLatLng);
    }

    routeLine = L.polyline(savedGeometry, {
      color: "#176b4d",
      weight: 5,
      opacity: 0.86
    }).addTo(map);

    map.fitBounds(routeLine.getBounds(), { padding: [32, 32] });
    const distance = Number.isFinite(route.routeDistanceMeters) ? ` ${formatDistance(route.routeDistanceMeters)}.` : ".";
    routeMapState.textContent = `Showing saved driving route from the SQLite database${distance} Add photo stops to mark key junctions.`;
    routeMapState.className = "route-map-state";
    return;
  }

  if (!start && !destination) {
    routeMapState.textContent = "This route has no start or destination to place on the map yet.";
    routeMapState.className = "route-map-state empty-state";
    map.setView(DEFAULT_MAP_CENTER, 11);
    return;
  }

  routeMapState.textContent = "Finding route start and destination on the map...";
  routeMapState.className = "route-map-state";

  try {
    const startResult = hasStartCoordinates ? {
      latitude: route.startLatitude,
      longitude: route.startLongitude
    } : (start ? await geocodeQuery(start, "route") : null);
    const destinationResult = hasDestinationCoordinates ? {
      latitude: route.destinationLatitude,
      longitude: route.destinationLongitude
    } : (destination ? await geocodeQuery(destination, "route") : null);

    const points = [];

    if (startResult) {
      const startLatLng = [startResult.latitude, startResult.longitude];
      const startMarker = L.marker(startLatLng).addTo(map);
      startMarker.bindPopup(`<strong>Start</strong><br>${escapeHtml(start)}`);
      mapMarkers.push(startMarker);
      points.push(startLatLng);
    }

    if (destinationResult) {
      const destinationLatLng = [destinationResult.latitude, destinationResult.longitude];
      const destinationMarker = L.marker(destinationLatLng).addTo(map);
      destinationMarker.bindPopup(`<strong>Destination</strong><br>${escapeHtml(destination)}`);
      mapMarkers.push(destinationMarker);
      points.push(destinationLatLng);
    }

    if (!points.length) {
      throw new Error("No route endpoints could be mapped.");
    }

    if (points.length > 1) {
      const routedLatLngs = await getRouteGeometry(points);
      routeLine = L.polyline(routedLatLngs, {
        color: "#8d6c57",
        weight: 4,
        opacity: 0.72,
        dashArray: "8 10"
      }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [32, 32] });
      routeMapState.textContent = "Showing the route start and destination on the map. Add photo stops to replace this fallback with a detailed route.";
      return;
    }

    map.setView(points[0], 14);
    routeMapState.textContent = `Showing the ${startResult ? "start" : "destination"} location found from the saved route. Add photo stops or a more specific missing endpoint for a fuller route view.`;
  } catch {
    routeMapState.textContent = "Could not place the route start or destination on the map. Add photo-stop coordinates or try more specific place names.";
    routeMapState.className = "route-map-state empty-state";
    map.setView(DEFAULT_MAP_CENTER, 11);
  }
}

async function getRouteGeometry(latLngs) {
  if (latLngs.length < 2) {
    return latLngs;
  }

  try {
    routeMapState.className = "route-map-state";
    routeMapState.textContent = `Routing ${latLngs.length} mapped stop${latLngs.length === 1 ? "" : "s"} along roads...`;
    const roadRoute = await fetchRoadRoute(latLngs);

    routeMapState.className = "route-map-state";
    routeMapState.textContent = `Showing road route across ${latLngs.length} mapped stop${latLngs.length === 1 ? "" : "s"}.`;

    return roadRoute.geometry;
  } catch {
    routeMapState.className = "route-map-state";
    routeMapState.textContent = `Routing unavailable, showing a straight-line preview across ${latLngs.length} mapped stop${latLngs.length === 1 ? "" : "s"}.`;
    return latLngs;
  }
}

async function fetchRoadRoute(latLngs) {
  if (latLngs.length < 2) {
    return {
      geometry: latLngs,
      distance: null,
      duration: null
    };
  }

  cancelRouteRequest();
  routeAbortController = new AbortController();

  const coordinates = latLngs
    .map(([lat, lng]) => `${lng},${lat}`)
    .join(";");

  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    signal: routeAbortController.signal
  });

  if (!response.ok) {
    throw new Error("Routing service unavailable.");
  }

  const result = await response.json();
  const route = result?.routes?.[0];
  const coordinatesList = route?.geometry?.coordinates;

  if (!Array.isArray(coordinatesList) || !coordinatesList.length) {
    throw new Error("No routed geometry returned.");
  }

  return {
    geometry: coordinatesList
      .map((pair) => [Number(pair[1]), Number(pair[0])])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
    distance: Number.isFinite(route.distance) ? route.distance : null,
    duration: Number.isFinite(route.duration) ? route.duration : null
  };
}

function cancelRouteRequest() {
  if (routeAbortController) {
    routeAbortController.abort();
    routeAbortController = null;
  }
}

async function geocodeQuery(query, mode = "lookup") {
  if (mode === "lookup") {
    cancelLookupRequest();
    lookupAbortController = new AbortController();
  } else {
    cancelRouteGeocodeRequest();
    routeGeocodeAbortController = new AbortController();
  }

  const controller = mode === "lookup" ? lookupAbortController : routeGeocodeAbortController;
  const queryVariants = [query];

  if (!query.includes(",") && !/\b(usa|united states)\b/i.test(query)) {
    queryVariants.push(`${query}, USA`);
  }

  for (const variant of queryVariants) {
    const nominatimResult = await tryNominatimGeocode(variant, controller.signal);
    if (nominatimResult) {
      return nominatimResult;
    }

    const photonResult = await tryPhotonGeocode(variant, controller.signal);
    if (photonResult) {
      return photonResult;
    }
  }

  throw new Error("No matching place was found.");
}

async function tryNominatimGeocode(query, signal) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal
    });

    if (!response.ok) {
      return null;
    }

    const results = await response.json();

    if (!Array.isArray(results) || !results.length) {
      return null;
    }

    return normalizeGeocodeResult(results[0], query, "nominatim");
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    return null;
  }
}

async function tryPhotonGeocode(query, signal) {
  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    const feature = result?.features?.[0];

    if (!feature?.geometry?.coordinates) {
      return null;
    }

    return normalizeGeocodeResult(feature, query, "photon");
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    return null;
  }
}

function normalizeGeocodeResult(result, fallbackLabel, provider) {
  if (provider === "photon") {
    const [longitude, latitude] = result.geometry.coordinates;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const properties = result.properties || {};
    const labelParts = [
      properties.name,
      properties.city,
      properties.state,
      properties.country
    ].filter(Boolean);

    return {
      label: labelParts.join(", ") || fallbackLabel,
      latitude: Number(latitude),
      longitude: Number(longitude)
    };
  }

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    label: String(result.display_name || fallbackLabel),
    latitude,
    longitude
  };
}

displaySelectedRoute();
