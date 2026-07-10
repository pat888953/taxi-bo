const ACADEMY_QUESTION_API = "/api/academy/question";
const ACADEMY_ATTEMPT_API = "/api/academy/attempt";
const ACADEMY_PHOTO_API = "/api/academy/photo";
const ACADEMY_STATS_API = "/api/academy/stats";

const academyAccuracy = document.querySelector("#academyAccuracy");
const academyProgress = document.querySelector("#academyProgress");
const academyQuestionCount = document.querySelector("#academyQuestionCount");
const academyQuestionTitle = document.querySelector("#academyQuestionTitle");
const academyRouteBadge = document.querySelector("#academyRouteBadge");
const academyState = document.querySelector("#academyState");
const academyQuestion = document.querySelector("#academyQuestion");
const academyPhotoWrap = document.querySelector("#academyPhotoWrap");
const academyPhoto = document.querySelector("#academyPhoto");
const academyPhotoNotice = document.querySelector("#academyPhotoNotice");
const academyPhotoFile = document.querySelector("#academyPhotoFile");
const academyPhotoChooseButton = document.querySelector("#academyPhotoChooseButton");
const academyPhotoPasteZone = document.querySelector("#academyPhotoPasteZone");
const academyPhotoPreview = document.querySelector("#academyPhotoPreview");
const academyPhotoUploadButton = document.querySelector("#academyPhotoUploadButton");
const academyPhotoStatus = document.querySelector("#academyPhotoStatus");
const academyPrompt = document.querySelector("#academyPrompt");
const academyContext = document.querySelector("#academyContext");
const academyChoices = document.querySelector("#academyChoices");
const academyFeedback = document.querySelector("#academyFeedback");
const academySubmitButton = document.querySelector("#academySubmitButton");
const academyNextButton = document.querySelector("#academyNextButton");
const academyHistory = document.querySelector("#academyHistory");

let currentQuestion = null;
let selectedAnswer = "";
let answered = false;
let pendingPhotoDataUrl = "";

loadAcademy();

academySubmitButton.addEventListener("click", submitAnswer);
academyNextButton.addEventListener("click", loadQuestion);
academyPhotoWrap.addEventListener("click", () => academyPhotoFile.click());
academyPhotoWrap.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    academyPhotoFile.click();
  }
});
academyPhotoChooseButton.addEventListener("click", () => academyPhotoFile.click());
academyPhotoFile.addEventListener("change", async () => {
  const file = academyPhotoFile.files?.[0];
  if (file) {
    await setPendingAcademyPhoto(file);
  }
});
academyPhotoPasteZone.addEventListener("click", () => academyPhotoPasteZone.focus());
academyPhotoPasteZone.addEventListener("paste", async (event) => {
  const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
  const file = imageItem?.getAsFile();
  if (!file) {
    academyPhotoStatus.className = "form-state";
    academyPhotoStatus.textContent = "Clipboard did not contain an image. Copy a screenshot first.";
    return;
  }
  event.preventDefault();
  await setPendingAcademyPhoto(file);
});
academyPhotoUploadButton.addEventListener("click", uploadAcademyPhoto);

async function loadAcademy() {
  await Promise.all([loadQuestion(), loadStats()]);
}

async function loadQuestion() {
  currentQuestion = null;
  selectedAnswer = "";
  answered = false;
  resetPendingAcademyPhoto();
  academySubmitButton.disabled = true;
  academyFeedback.textContent = "";
  academyFeedback.className = "academy-feedback";
  academyQuestion.hidden = true;
  academyState.textContent = "Choosing a saved street photo from the database...";
  academyState.className = "form-state empty-state";

  try {
    const response = await fetch(ACADEMY_QUESTION_API, { cache: "no-store" });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not load an Academy question.");
    }

    if (!result.available) {
      academyQuestionTitle.textContent = "No Academy questions yet";
      academyRouteBadge.textContent = "Needs photos";
      academyState.textContent = result.message;
      return;
    }

    currentQuestion = result.question;
    renderQuestion(currentQuestion);
  } catch (error) {
    academyQuestionTitle.textContent = "Academy is not ready";
    academyRouteBadge.textContent = "Offline";
    academyState.textContent = error.message || "Could not load the Academy module.";
    academyState.className = "form-state";
  }
}

function renderQuestion(question) {
  academyQuestionTitle.textContent = question.title || "Street-photo question";
  academyRouteBadge.textContent = `Step ${question.step || "?"}`;
  academyState.textContent = "Choose the best answer, then submit.";
  academyState.className = "form-state empty-state";
  academyPhoto.src = question.image;
  academyPhoto.alt = question.title || "Street photo question";
  academyPhotoWrap.classList.toggle("needs-picture", Boolean(question.imageNeedsReplacement));
  academyPhotoNotice.textContent = question.imageNeedsReplacement
    ? "Sample image - click to add real street photo"
    : "Click to replace picture";
  academyPhotoStatus.className = question.imageNeedsReplacement ? "form-state" : "form-state empty-state";
  academyPhotoStatus.textContent = question.imageNeedsReplacement
    ? "This Academy question is using a Taxi Bo Sample placeholder. Add a real street photo here."
    : "Click the picture, choose a file, or paste a screenshot if you want to replace this cue photo.";
  academyPrompt.textContent = question.prompt;
  academyContext.textContent = `${question.routeName || "Saved route"} · ${question.start || "Start"} → ${question.destination || "Destination"}`;
  academyChoices.innerHTML = "";

  question.choices.forEach((choice, index) => {
    const choiceId = `academyChoice${index}`;
    const label = document.createElement("label");
    label.className = "academy-choice";
    label.htmlFor = choiceId;

    const input = document.createElement("input");
    input.id = choiceId;
    input.type = "radio";
    input.name = "academyAnswer";
    input.value = choice;

    const span = document.createElement("span");
    span.textContent = choice;

    input.addEventListener("change", () => {
      selectedAnswer = choice;
      academySubmitButton.disabled = answered;
    });

    label.append(input, span);
    academyChoices.append(label);
  });

  academyQuestion.hidden = false;
}

async function setPendingAcademyPhoto(file) {
  if (!file.type.startsWith("image/")) {
    academyPhotoStatus.className = "form-state";
    academyPhotoStatus.textContent = "Choose or paste an image file.";
    return;
  }

  pendingPhotoDataUrl = await fileToDataUrl(file);
  academyPhotoPreview.src = pendingPhotoDataUrl;
  academyPhotoPreview.hidden = false;
  academyPhotoUploadButton.disabled = false;
  academyPhotoPasteZone.classList.add("has-image");
  academyPhotoStatus.className = "form-state";
  academyPhotoStatus.textContent = "New picture ready. Select Upload picture to save it to this Academy question.";
}

async function uploadAcademyPhoto() {
  if (!currentQuestion || !pendingPhotoDataUrl) {
    return;
  }

  academyPhotoUploadButton.disabled = true;
  academyPhotoStatus.className = "form-state empty-state";
  academyPhotoStatus.textContent = "Uploading picture to this cue...";

  try {
    const response = await fetch(ACADEMY_PHOTO_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        image: pendingPhotoDataUrl,
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not upload this picture.");
    }

    currentQuestion.image = result.photo.image;
    currentQuestion.imageNeedsReplacement = false;
    academyPhoto.src = result.photo.image;
    academyPhotoWrap.classList.remove("needs-picture");
    academyPhotoNotice.textContent = "Click to replace picture";
    resetPendingAcademyPhoto();
    academyPhotoStatus.className = "form-state empty-state";
    academyPhotoStatus.textContent = "Picture saved. This Academy question now has a real cue photo.";
    await loadStats();
  } catch (error) {
    academyPhotoUploadButton.disabled = false;
    academyPhotoStatus.className = "form-state";
    academyPhotoStatus.textContent = error.message || "Could not upload this picture.";
  }
}

function resetPendingAcademyPhoto() {
  pendingPhotoDataUrl = "";
  academyPhotoFile.value = "";
  academyPhotoPreview.removeAttribute("src");
  academyPhotoPreview.hidden = true;
  academyPhotoPasteZone.classList.remove("has-image");
  academyPhotoUploadButton.disabled = true;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

async function submitAnswer() {
  if (!currentQuestion || !selectedAnswer || answered) {
    return;
  }

  academySubmitButton.disabled = true;
  academyFeedback.textContent = "Checking your answer...";
  academyFeedback.className = "academy-feedback";

  try {
    const response = await fetch(ACADEMY_ATTEMPT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        selectedAnswer,
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not save this Academy attempt.");
    }

    answered = true;
    markChoices(result.attempt);
    academyFeedback.className = `academy-feedback ${result.attempt.correct ? "is-correct" : "is-wrong"}`;
    academyFeedback.textContent = result.attempt.correct
      ? "Correct. Nice — that cue is locked into memory."
      : `Not quite. Correct answer: ${result.attempt.correctAnswer}`;
    await loadStats();
  } catch (error) {
    academySubmitButton.disabled = false;
    academyFeedback.className = "academy-feedback is-wrong";
    academyFeedback.textContent = error.message || "Could not submit this answer.";
  }
}

function markChoices(attempt) {
  academyChoices.querySelectorAll(".academy-choice").forEach((label) => {
    const input = label.querySelector("input");
    input.disabled = true;
    label.classList.toggle("is-correct", input.value === attempt.correctAnswer);
    label.classList.toggle("is-wrong", input.checked && input.value !== attempt.correctAnswer);
  });
}

async function loadStats() {
  try {
    const response = await fetch(ACADEMY_STATS_API, { cache: "no-store" });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not load Academy stats.");
    }

    renderStats(result.stats);
  } catch (error) {
    academyProgress.textContent = error.message || "Progress unavailable.";
  }
}

function renderStats(stats) {
  academyAccuracy.textContent = `${stats.accuracy || 0}%`;
  academyProgress.textContent = `${stats.correctAttempts || 0} correct of ${stats.totalAttempts || 0} attempts`;
  academyQuestionCount.textContent = `${stats.totalQuestions || 0} photo${stats.totalQuestions === 1 ? "" : "s"}`;

  if (!stats.recent?.length) {
    academyHistory.className = "academy-history empty-state";
    academyHistory.textContent = "Answer questions to build your practice history.";
    return;
  }

  academyHistory.className = "academy-history";
  academyHistory.innerHTML = "";

  stats.recent.forEach((attempt) => {
    const item = document.createElement("article");
    item.className = `academy-history-item ${attempt.correct ? "is-correct" : "is-wrong"}`;

    const status = document.createElement("span");
    status.textContent = attempt.correct ? "Correct" : "Review";

    const title = document.createElement("strong");
    title.textContent = attempt.title;

    const context = document.createElement("p");
    context.textContent = `${attempt.routeName}${attempt.destination ? ` · ${attempt.destination}` : ""}`;

    item.append(status, title, context);
    academyHistory.append(item);
  });
}
