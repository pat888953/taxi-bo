const INCOMING_ORDER_API = "/api/incoming-order";
const AUTO_SEND_CONFIDENCE = 0.88;

const orderScreenshot = document.querySelector("#orderScreenshot");
const screenshotPreviewWrap = document.querySelector("#screenshotPreviewWrap");
const screenshotPreview = document.querySelector("#screenshotPreview");
const orderText = document.querySelector("#orderText");
const phoneDestination = document.querySelector("#phoneDestination");
const extractDestinationButton = document.querySelector("#extractDestinationButton");
const sendDestinationButton = document.querySelector("#sendDestinationButton");
const phoneState = document.querySelector("#phoneState");
const phoneReview = document.querySelector("#phoneReview");
const lastSentPanel = document.querySelector("#lastSentPanel");
const lastSentDestination = document.querySelector("#lastSentDestination");

let isProcessingOrder = false;
let previewUrl = "";

orderScreenshot.addEventListener("change", async () => {
  const file = orderScreenshot.files?.[0];

  if (!file) {
    clearPreview();
    return;
  }

  clearPreview();
  previewUrl = URL.createObjectURL(file);
  screenshotPreview.src = previewUrl;
  screenshotPreviewWrap.hidden = false;
  lastSentPanel.hidden = true;
  updatePhoneState("Reading the order screenshot...");
  await readScreenshotText(file);
});

extractDestinationButton.addEventListener("click", () => {
  const destination = extractDestination(orderText.value);

  if (!destination) {
    updatePhoneState("Could not find a destination. Type the drop-off address below.", true);
    phoneDestination.focus();
    return;
  }

  phoneDestination.value = destination;
  updatePhoneState("Destination found. Check it, then send it.");
});

sendDestinationButton.addEventListener("click", () => {
  sendDestination(false);
});

phoneDestination.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendDestination(false);
  }
});

async function readScreenshotText(file) {
  if (isProcessingOrder) {
    return;
  }

  isProcessingOrder = true;
  orderScreenshot.disabled = true;

  try {
    const image = await fileToDataUrl(file);
    const response = await fetch("/api/ocr-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not read this screenshot.");
    }

    const text = String(result.ocr?.text || "").trim();
    const destination = String(result.ocr?.destination || extractDestination(text)).trim();
    const confidence = Number(result.ocr?.confidence);
    orderText.value = text;

    if (!destination) {
      phoneReview.open = true;
      updatePhoneState("The screenshot was read, but the destination needs checking.", true);
      return;
    }

    phoneDestination.value = destination;

    if (Number.isFinite(confidence) && confidence >= AUTO_SEND_CONFIDENCE) {
      updatePhoneState(`Destination found: ${destination}. Sending to tablet...`);
      await sendDestination(true);
      return;
    }

    phoneReview.open = true;
    updatePhoneState("OCR confidence is low. Check the destination, then send it.", true);
  } catch (error) {
    phoneReview.open = true;
    updatePhoneState(error.message || "Could not read this screenshot. Type the destination below.", true);
  } finally {
    isProcessingOrder = false;
    orderScreenshot.disabled = false;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Could not open the selected screenshot.")));
    reader.readAsDataURL(file);
  });
}

async function sendDestination(automatic = false) {
  const destination = phoneDestination.value.trim();

  if (!destination) {
    phoneReview.open = true;
    updatePhoneState("Enter the destination address before sending.", true);
    phoneDestination.focus();
    return;
  }

  sendDestinationButton.disabled = true;
  updatePhoneState("Sending destination to the tablet...");

  try {
    const response = await fetch(INCOMING_ORDER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination,
        rawText: orderText.value.trim(),
        source: automatic ? "phone-ocr-auto" : "phone-review"
      })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not send destination.");
    }

    lastSentDestination.textContent = destination;
    lastSentPanel.hidden = false;
    phoneReview.open = false;
    updatePhoneState("Sent. Choose the next screenshot when another order arrives.");
    navigator.vibrate?.([120, 70, 120]);
    resetOrderFields();
  } catch (error) {
    phoneReview.open = true;
    updatePhoneState(error.message || "Could not send destination to the tablet.", true);
  } finally {
    sendDestinationButton.disabled = false;
  }
}

function resetOrderFields() {
  orderText.value = "";
  phoneDestination.value = "";
  orderScreenshot.value = "";
  clearPreview();
}

function clearPreview() {
  screenshotPreviewWrap.hidden = true;
  screenshotPreview.removeAttribute("src");

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }
}

function extractDestination(text) {
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(normalizeOcrLine)
    .filter(Boolean);
  const addressWords = /\b(rd|road|st|street|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pkwy|parkway|hwy|highway|chapel hill|carrboro|durham|raleigh|graham|nc|north carolina|hong kong)\b/i;
  const noiseWords = /\b(accept|restaurant|pickup|delivery|total|minute|minutes|min|mile|miles|guarantee|guaranteed)\b/i;
  const candidates = [];

  lines.forEach((line, index) => {
    if (!addressWords.test(line) || noiseWords.test(line)) {
      return;
    }

    const previous = lines[index - 1] || "";
    const combined = previous && addressWords.test(previous) && !noiseWords.test(previous)
      ? `${previous} ${line}`
      : line;
    candidates.push(cleanAddress(combined));
  });

  return candidates.at(-1) || "";
}

function cleanAddress(address) {
  return String(address || "")
    .replace(/^[\s\-:|]+/, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOcrLine(line) {
  return String(line || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function updatePhoneState(message, isError = false) {
  phoneState.className = isError ? "form-state" : "form-state empty-state";
  phoneState.textContent = message;
}
