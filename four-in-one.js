const OFFERS_API = "/api/incoming-order";
const ACCEPTED_TRIP_API = "/api/accepted-trip";

const offerGrid = document.querySelector("#offerGrid");
const inboxStatus = document.querySelector("#inboxStatus");
const offerCount = document.querySelector("#offerCount");
const refreshOffers = document.querySelector("#refreshOffers");

let offers = [];
let polling = false;

refreshOffers.addEventListener("click", () => loadOffers());
loadOffers();
window.setInterval(loadOffers, 3000);

async function loadOffers() {
  if (polling) return;
  polling = true;
  try {
    const response = await fetch(OFFERS_API, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Order inbox unavailable.");
    offers = Array.isArray(result.orders) ? result.orders : [];
    renderOffers();
  } catch (error) {
    inboxStatus.hidden = false;
    inboxStatus.textContent = error.message || "Could not load fleet offers.";
  } finally {
    polling = false;
  }
}

function renderOffers() {
  offerGrid.innerHTML = "";
  offerCount.textContent = offers.length ? `${offers.length} current offer${offers.length === 1 ? "" : "s"}` : "Waiting for fleet scans";
  inboxStatus.hidden = offers.length > 0;
  inboxStatus.textContent = "No current offers. Scan an unlocked order with a fleet adapter.";

  offers.forEach((offer) => {
    const age = Date.now() - parseServerTime(offer.capturedAt || offer.createdAt);
    const stale = !Number.isFinite(age) || age > 120000;
    const card = document.createElement("article");
    card.className = `offer-card${stale ? " stale" : ""}`;
    card.innerHTML = `
      <div class="offer-head"><span class="fleet-name">${escapeHtml(offer.source || "Fleet app")}</span><span class="offer-age">${formatAge(age)}</span></div>
      <div class="offer-route">
        <div class="offer-place"><span>Pickup</span><strong>${escapeHtml(offer.pickup || "Not recognized")}</strong></div>
        <div class="offer-place"><span>To</span><strong>${escapeHtml(offer.destination || "Not recognized")}</strong></div>
      </div>
      <div class="offer-meta">
        <div><span>Fare</span><strong>${escapeHtml(offer.fare || "-")}</strong></div>
        <div><span>Wait</span><strong>${escapeHtml(offer.waitingTime || "-")}</strong></div>
        <div><span>Access</span><strong>${escapeHtml(offer.lockStatus || "unknown")}</strong></div>
      </div>
      <p class="offer-note">${stale ? "This scan is over two minutes old. Scan again before acting." : "Open the original app, accept there, then confirm below."}</p>
      <div class="offer-actions">
        <button class="primary open-order" type="button" ${stale ? "disabled" : ""}>Open ${escapeHtml(offer.source || "fleet app")}</button>
        <button class="accepted confirm-order" type="button" ${stale ? "disabled" : ""}>I accepted this order</button>
        <button class="dismiss-order" type="button">Dismiss</button>
      </div>`;
    card.querySelector(".open-order").addEventListener("click", () => openFleetApp(offer));
    card.querySelector(".confirm-order").addEventListener("click", (event) => confirmAcceptedTrip(offer, event.currentTarget, card));
    card.querySelector(".dismiss-order").addEventListener("click", () => dismissOffer(offer.id));
    offerGrid.append(card);
  });
}

function openFleetApp(offer) {
  if ((offer.source || "").toLowerCase().includes("flytaxi")) {
    window.location.href = "intent://open#Intent;package=com.flytaxi;end";
  }
}

async function confirmAcceptedTrip(offer, button, card) {
  button.disabled = true;
  button.textContent = "Confirming...";
  try {
    const verifyResponse = await fetch(`${OFFERS_API}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: offer.id, fingerprint: offer.fingerprint })
    });
    const verification = await verifyResponse.json();
    if (!verifyResponse.ok || !verification.valid) throw new Error(verification.reason || "Offer changed. Scan again.");

    const tripResponse = await fetch(ACCEPTED_TRIP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: offer.source,
        sourceOrderId: offer.id,
        pickup: offer.pickup,
        destination: offer.destination,
        acceptedAt: new Date().toISOString()
      })
    });
    const tripResult = await tripResponse.json();
    if (!tripResponse.ok || !tripResult.ok) throw new Error(tripResult.error || "Could not send accepted trip to TaxiBo Cue.");
    await acknowledgeOffer(offer.id);
    card.innerHTML = `<div class="offer-route"><strong>Accepted trip sent to TaxiBo Cue</strong><span>${escapeHtml(offer.pickup)} to ${escapeHtml(offer.destination)}</span></div><div class="offer-actions"><a class="accepted" href="index.html">Open TaxiBo Cue</a></div>`;
  } catch (error) {
    card.classList.add("stale");
    card.querySelector(".offer-note").textContent = error.message || "Could not confirm this offer.";
    button.textContent = "Scan again";
  }
}

async function dismissOffer(id) {
  await acknowledgeOffer(id);
  offers = offers.filter((offer) => offer.id !== id);
  renderOffers();
}

async function acknowledgeOffer(id) {
  await fetch(`${OFFERS_API}/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
}

function parseServerTime(value) {
  if (!value) return NaN;
  const normalized = /Z$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).getTime();
}

function formatAge(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "Time unknown";
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
