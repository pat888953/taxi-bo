const ACADEMY_QUESTION_API = "/api/academy/question";
const ACADEMY_ATTEMPT_API = "/api/academy/attempt";
const ACADEMY_STATS_API = "/api/academy/stats";
const TAXIBO_STORAGE_MODE_KEY = "taxiBoStorageMode";

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
const academyPrompt = document.querySelector("#academyPrompt");
const academyContext = document.querySelector("#academyContext");
const academyChoices = document.querySelector("#academyChoices");
const academyFeedback = document.querySelector("#academyFeedback");
const academyEditPictureButton = document.querySelector("#academyEditPictureButton");
const academySubmitButton = document.querySelector("#academySubmitButton");
const academyNextButton = document.querySelector("#academyNextButton");
const academyHistory = document.querySelector("#academyHistory");

let currentQuestion = null;
let selectedAnswer = "";
let answered = false;

function storageHeaders(extra = {}) {
  return {
    ...extra,
    "X-TaxiBo-Storage-Mode": localStorage.getItem(TAXIBO_STORAGE_MODE_KEY) === "local" ? "local" : "cloud",
  };
}

loadAcademy();

academySubmitButton.addEventListener("click", submitAnswer);
academyNextButton.addEventListener("click", loadQuestion);
academyPhotoWrap.addEventListener("click", openCurrentQuestionInCueMaintenance);
academyPhotoWrap.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openCurrentQuestionInCueMaintenance();
  }
});
academyEditPictureButton.addEventListener("click", openCurrentQuestionInCueMaintenance);

async function loadAcademy() {
  await Promise.all([loadQuestion(), loadStats()]);
}

async function loadQuestion() {
  currentQuestion = null;
  selectedAnswer = "";
  answered = false;
  academySubmitButton.disabled = true;
  academyFeedback.textContent = "";
  academyFeedback.className = "academy-feedback";
  academyQuestion.hidden = true;
  academyState.textContent = "Choosing a saved street photo from the database...";
  academyState.className = "form-state empty-state";

  try {
    const response = await fetch(ACADEMY_QUESTION_API, {
      cache: "no-store",
      headers: storageHeaders(),
    });
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
    ? "Sample image - click to add real street photo in TaxiBo Cue"
    : "Click to edit picture in TaxiBo Cue";
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

function openCurrentQuestionInCueMaintenance() {
  if (!currentQuestion) {
    return;
  }

  const url = new URL("index.html", window.location.href);
  url.searchParams.set("editCue", currentQuestion.id);
  if (currentQuestion.routeId) {
    url.searchParams.set("routeId", currentQuestion.routeId);
  }
  url.searchParams.set("from", "academy");
  window.location.href = url.toString();
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
      headers: storageHeaders({ "Content-Type": "application/json" }),
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
    const response = await fetch(ACADEMY_STATS_API, {
      cache: "no-store",
      headers: storageHeaders(),
    });
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
