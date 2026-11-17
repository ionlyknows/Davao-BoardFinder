(function () {
  "use strict";

  const stepInfoEl = document.getElementById("traceStepInfo");
  const stateStripEl = document.getElementById("traceStateStrip");
  const countsBarEl = document.getElementById("traceCountsBar");
  const nextBtn = document.getElementById("traceNextBtn");
  const runBtn = document.getElementById("traceRunBtn");
  const resetBtn = document.getElementById("traceResetBtn");

  const traceState = {
    steps: [],
    index: -1,
    counts: { comparisons: 0, shifts: 0 },
    formulas: { best: 0, worst: 0 },
    truncated: false,
    matched: 0,
    timerId: null
  };

  function stopTimer() {
    if (traceState.timerId !== null) {
      window.clearInterval(traceState.timerId);
      traceState.timerId = null;
    }
    runBtn.textContent = "Run All";
  }

  function makeMetaSpan(label, value) {
    const span = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label + ": ";
    span.appendChild(strong);
    span.appendChild(document.createTextNode(value));
    return span;
  }

  function formatKey(keyVal) {
    if (keyVal === null || keyVal === undefined) {
      return "-";
    }
    if (typeof keyVal === "object") {
      const idPart = keyVal.id ? String(keyVal.id) : "";
      const namePart = keyVal.name ? String(keyVal.name) : "";
      if (idPart && namePart) {
        return idPart + " (" + namePart + ")";
      }
      return idPart || namePart || JSON.stringify(keyVal);
    }
    return String(keyVal);
  }

  function formatItem(item) {
    if (item === null || item === undefined) {
      return "";
    }
    if (typeof item === "object") {
      return item.id ? String(item.id) : (item.name ? String(item.name) : JSON.stringify(item));
    }
    return String(item);
  }

  function renderCounts() {
    const c = traceState.counts || { comparisons: 0, shifts: 0 };
    const f = traceState.formulas || { best: 0, worst: 0 };
    countsBarEl.textContent =
      "Comparisons: " + (c.comparisons ?? 0) +
      " · Shifts: " + (c.shifts ?? 0) +
      " | Best (k-1): " + (f.best ?? 0) +
      " · Worst k(k-1)/2: " + (f.worst ?? 0);
  }

  function renderStep() {
    stepInfoEl.textContent = "";
    stateStripEl.textContent = "";

    if (traceState.truncated) {
      stepInfoEl.appendChild(
        makeMetaSpan(
          "Note",
          "Trace capped for k > 50 (" + traceState.matched + " matched). Counts and formulas remain exact."
        )
      );
      updateButtons();
      return;
    }

    if (traceState.steps.length === 0) {
      const msg = traceState.matched <= 1
        ? "No trace steps needed for " + traceState.matched + " matched listing(s)."
        : "Run a search to inspect the trace.";
      stepInfoEl.appendChild(makeMetaSpan("Note", msg));
      updateButtons();
      return;
    }

    if (traceState.index < 0) {
      stepInfoEl.appendChild(
        makeMetaSpan("Ready", "Step 0 of " + traceState.steps.length + ". Click Next or Run All.")
      );
      updateButtons();
      return;
    }

    const entry = traceState.steps[traceState.index];
    const indicesArr = Array.isArray(entry.indices) ? entry.indices : [];
    const indicesText = indicesArr.length > 0 ? "[" + indicesArr.join(", ") + "]" : "-";

    stepInfoEl.appendChild(makeMetaSpan("Pass", String(entry.pass ?? "-")));
    stepInfoEl.appendChild(
      makeMetaSpan("Step", String(entry.step ?? (traceState.index + 1)) + " / " + traceState.steps.length)
    );
    stepInfoEl.appendChild(makeMetaSpan("Action", String(entry.action ?? "-")));
    stepInfoEl.appendChild(makeMetaSpan("Indices", indicesText));
    stepInfoEl.appendChild(makeMetaSpan("Key", formatKey(entry.key)));
    stepInfoEl.appendChild(makeMetaSpan("Note", String(entry.note ?? "-")));

    const arr = Array.isArray(entry.state) ? entry.state : [];
    for (let idx = 0; idx < arr.length; idx += 1) {
      const chip = document.createElement("span");
      chip.className = "trace-chip";
      if (indicesArr.indexOf(idx) !== -1) {
        chip.classList.add("is-active");
      }
      chip.textContent = formatItem(arr[idx]);
      stateStripEl.appendChild(chip);
    }

    updateButtons();
  }

  function updateButtons() {
    const hasSteps = !traceState.truncated && traceState.steps.length > 0;
    const atEnd = traceState.index >= traceState.steps.length - 1;
    nextBtn.disabled = !hasSteps || atEnd;
    runBtn.disabled = !hasSteps || (atEnd && traceState.timerId === null);
    resetBtn.disabled = !hasSteps || traceState.index < 0;
  }

  function next() {
    if (traceState.index < traceState.steps.length - 1) {
      traceState.index += 1;
      renderStep();
      return true;
    }
    return false;
  }

  function reset() {
    stopTimer();
    traceState.index = -1;
    renderStep();
  }

  function runAll() {
    if (traceState.timerId !== null) {
      stopTimer();
      updateButtons();
      return;
    }
    if (traceState.steps.length === 0 || traceState.truncated) {
      return;
    }
    if (traceState.index >= traceState.steps.length - 1) {
      traceState.index = -1;
    }
    runBtn.textContent = "Pause";
    traceState.timerId = window.setInterval(function () {
      const advanced = next();
      if (!advanced || traceState.index >= traceState.steps.length - 1) {
        stopTimer();
        updateButtons();
      }
    }, 350);
    updateButtons();
  }

  function load(steps, counts, formulas, truncated, matched) {
    stopTimer();
    traceState.steps = Array.isArray(steps) ? steps : [];
    traceState.counts = counts || { comparisons: 0, shifts: 0 };
    traceState.formulas = formulas || { best: 0, worst: 0 };
    traceState.truncated = Boolean(truncated);
    traceState.matched = Number(matched) || 0;
    traceState.index = traceState.steps.length > 0 ? 0 : -1;
    renderCounts();
    renderStep();
  }

  nextBtn.addEventListener("click", function () {
    stopTimer();
    next();
  });
  runBtn.addEventListener("click", runAll);
  resetBtn.addEventListener("click", reset);

  window.BoardTrace = {
    load: load,
    next: next,
    runAll: runAll,
    reset: reset
  };
})();
