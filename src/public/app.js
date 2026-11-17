(function () {
  "use strict";

  // Same column names as the CSV import schema, so an exported file can be uploaded again.
  const CSV_COLUMNS = [
    "listing_id", "name", "type", "address", "lat", "lon", "monthly_rent",
    "available_slots", "gender_policy", "contact", "last_updated", "notes"
  ];
  const PAGE_SIZE = 6;
  const MAX_COMPARE = 3;
  const SAVED_KEY = "boardfinder.saved";
  const PANEL_KEY = "boardfinder.panelCollapsed";
  const NOTE_PREVIEW_CHARS = 70;

  // Quick-pick places: [exact hub name from /api/landmarks, friendly label]. The first 5 show; the rest sit under "More".
  const POPULAR_PLACES = [
    ["UM Matina Campus", "UM Matina"],
    ["Ateneo de Davao University (Jacinto)", "Ateneo de Davao"],
    ["USeP Obrero", "USeP"],
    ["SM City Davao (Ecoland)", "SM City Davao"],
    ["Davao City Hall (Downtown)", "Downtown / City Hall"],
    ["UIC Bajada", "UIC"],
    ["Toril (Poblacion)", "Toril"],
    ["Buhangin (Milan)", "Buhangin"]
  ];
  const POPULAR_SHOWN = 5;
  // [value sent to the server, dropdown label, short label]. "" means no price limit.
  const BUDGET_OPTIONS = [
    ["2000", "Up to ₱2,000", "₱2,000"], ["3000", "Up to ₱3,000", "₱3,000"],
    ["4000", "Up to ₱4,000", "₱4,000"], ["5000", "Up to ₱5,000", "₱5,000"],
    ["", "₱5,000 and up (no limit)", "no limit"]
  ];
  const TYPE_OPTIONS = [
    ["ALL", "Any"], ["Boarding House", "Boarding house"], ["Dorm", "Dorm"],
    ["Bedspace", "Bedspace"], ["Room", "Room"], ["Apartment", "Apartment"]
  ];
  const GENDER_OPTIONS = [["ANY", "Anyone"], ["Female", "Female only"], ["Male", "Male only"]];
  const DEFAULTS = { budget: "4000", type: "ALL", gender: "ANY", includeFull: false };
  const SHEET_HEIGHTS = ["peek", "half", "full"];

  const ICONS = {
    pin: "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z M12 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
    walk: "M13.5 3.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z M9 21l2-6 3 3v5 M11 15l-1-5 3-2 3 4h3 M8 12l2-4",
    phone: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
    heart: "M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z",
    nav: "M3 11l18-8-8 18-2-8-8-2z"
  };

  const $ = function (id) { return document.getElementById(id); };

  const appState = {
    csvText: null,
    fileName: "",
    dataset: "demo",
    morePlaces: false,
    sheet: "half",
    panelCollapsed: false,
    allListings: null,          // the FULL loaded dataset (not filtered); loaded on demand for Add Listing
    landmarks: [],
    results: [],                // what the server returned for the current filters
    view: [],                   // results after the "Saved" chip; this is what cards, table and map show
    lastData: null,
    place: { mode: "hub", name: "UM Matina Campus", label: "UM Matina" },
    filters: Object.assign({}, DEFAULTS),
    sortBy: "distance",
    showAll: false,
    savedOnly: false,
    saved: [],
    compare: [],
    selectedIndex: -1,
    requestSeq: 0,
    debounceId: null
  };

  const el = {
    csvUpload: $("csvUpload"), moreBtn: $("moreMenuBtn"), moreList: $("moreMenuList"),
    addToggle: $("addListingToggleBtn"), uploadBtn: $("uploadCsvBtn"), exportBtn: $("exportCsvBtn"), datasetBtn: $("datasetBtn"), testCaseSelect: $("testCaseSelect"),
    addPanel: $("addListingPanel"), addForm: $("addListingForm"), pickHint: $("pickOnMapHint"), pickBanner: $("pickBanner"),
    placeInput: $("placeSearchInput"), placeResults: $("placeSearchResults"), placeChips: $("placeChips"),
    locationMsg: $("locationMsg"), privacyNote: $("privacyNote"),
    filtersBtn: $("filtersBtn"), filtersPanel: $("filtersPanel"), filterBadge: $("filterBadge"),
    budgetSelect: $("budgetSelect"), typeSelect: $("typeSelect"), genderSelect: $("genderSelect"), includeFull: $("includeFullCheck"),
    title: $("resultsTitle"), summary: $("resultsSummary"), dataSource: $("dataSource"),
    section: $("resultsSection"), errorBanner: $("errorBanner"), errorText: $("errorText"),
    sortDistance: $("sortDistanceBtn"), sortRent: $("sortRentBtn"), savedChip: $("savedChip"), savedLabel: $("savedLabel"),
    loading: $("loadingState"), sheetHandle: $("sheetHandle"), panelToggle: $("panelToggleBtn"),
    skippedBanner: $("skippedBanner"), skippedCount: $("skippedCountText"), skippedBtn: $("toggleSkippedBtn"), skippedList: $("skippedList"),
    comparePanel: $("comparePanel"), compareBody: $("compareBody"), compareOpen: $("compareOpenBtn"), compareMsg: $("compareMsg"),
    cards: $("cardsList"), showMore: $("showMoreBtn"),
    empty: $("emptyState"), emptyText: $("emptyText"), raiseBtn: $("raiseBudgetBtn")
  };

  /* ---------- small helpers ---------- */

  function mk(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function mkButton(className, text, onClick) {
    const b = mk("button", className, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function icon(name, size) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size || 18));
    svg.setAttribute("height", String(size || 18));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICONS[name]);
    svg.appendChild(path);
    return svg;
  }

  function iconButton(name, label, onClick) {
    const b = mk("button", "icon-btn");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.appendChild(icon(name, 20));
    b.addEventListener("click", onClick);
    return b;
  }

  function showError(message) {
    el.errorText.textContent = message ? String(message) : "";
    el.errorBanner.classList.toggle("hidden", !message);
  }

  // Today's date in Asia/Manila (UTC+8, no daylight saving). Same rule as the server.
  function manilaToday() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }

  function friendlyUpdated(dateText) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ""));
    if (!m) {
      return "Update date unknown";
    }
    const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(manilaToday());
    const days = Math.round((Date.UTC(+t[1], +t[2] - 1, +t[3]) - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000);
    if (days <= 0) {
      return "Updated today";
    }
    if (days === 1) {
      return "Updated yesterday";
    }
    return days < 60 ? "Updated " + days + " days ago" : "Updated " + Math.round(days / 30) + " months ago";
  }

  function genderText(value) {
    const v = String(value || "");
    if (v === "Female") {
      return "Female only";
    }
    return v === "Male" ? "Male only" : (v || "Mixed");
  }

  function formatPrice(item) {
    return "₱" + Number(item.monthly_rent || 0).toLocaleString();
  }

  function distanceText(item) {
    return window.BoardMap.formatDistance(item.distance_m);
  }

  function walkText(item) {
    return "~" + window.BoardMap.walkMinutes(item.distance_m) + " min walk";
  }

  function makeDirectionsLink(item, className, label) {
    const a = mk("a", className);
    a.appendChild(icon("nav", 18));
    a.appendChild(document.createTextNode(label));
    a.href = window.BoardMap.directionsUrl(item);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function topLabel() {
    return appState.sortBy === "rent" ? "★ Lowest price" : "★ Closest";
  }

  /* ---------- saved rooms (localStorage, always in try/catch) ---------- */

  function loadSaved() {
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      const list = raw ? JSON.parse(raw) : [];
      appState.saved = Array.isArray(list) ? list.filter(function (x) { return typeof x === "string"; }) : [];
    } catch (err) {
      appState.saved = [];
    }
  }

  function persistSaved() {
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(appState.saved));
    } catch (err) {
      // Storage blocked (private mode): saving still works until the page is closed.
    }
  }

  function isSaved(item) {
    return appState.saved.indexOf(item.listing_id) !== -1;
  }

  function toggleSaved(item) {
    const at = appState.saved.indexOf(item.listing_id);
    if (at === -1) {
      appState.saved.push(item.listing_id);
    } else {
      appState.saved.splice(at, 1);
    }
    persistSaved();
    syncSavedUi();
    if (appState.savedOnly) {
      refreshAll();
    }
  }

  function syncSavedUi() {
    el.savedLabel.textContent = "Saved (" + appState.saved.length + ")";
    el.savedChip.setAttribute("aria-pressed", appState.savedOnly ? "true" : "false");
    const hearts = document.querySelectorAll("[data-save-id]");
    for (let i = 0; i < hearts.length; i += 1) {
      const on = appState.saved.indexOf(hearts[i].dataset.saveId) !== -1;
      hearts[i].classList.toggle("is-on", on);
      hearts[i].setAttribute("aria-pressed", on ? "true" : "false");
      hearts[i].setAttribute("aria-label", on ? "Remove from saved" : "Save this room");
      hearts[i].title = on ? "Remove from saved" : "Save this room";
    }
  }

  /* ---------- filters (dropdowns inside the Filters panel) ---------- */

  function fillSelect(select, options) {
    select.textContent = "";
    options.forEach(function (opt) {
      const o = mk("option", "", opt[1]);
      o.value = opt[0];
      select.appendChild(o);
    });
  }

  function activeFilterCount() {
    const f = appState.filters;
    return (f.budget !== "" ? 1 : 0) + (f.type !== "ALL" ? 1 : 0) + (f.gender !== "ANY" ? 1 : 0) + (f.includeFull ? 1 : 0);
  }

  // Make the dropdowns, checkbox and the little badge on the Filters button match appState.filters.
  function syncFilterUi() {
    el.budgetSelect.value = appState.filters.budget;
    el.typeSelect.value = appState.filters.type;
    el.genderSelect.value = appState.filters.gender;
    el.includeFull.checked = appState.filters.includeFull;
    const n = activeFilterCount();
    el.filterBadge.textContent = String(n);
    el.filterBadge.classList.toggle("hidden", n === 0);
    el.filtersBtn.setAttribute("aria-label", n === 0 ? "Filters" : "Filters (" + n + " active)");
  }

  function setFiltersOpen(open) {
    el.filtersPanel.classList.toggle("hidden", !open);
    el.filtersBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function clearFilters() {
    appState.filters = { budget: "", type: "ALL", gender: "ANY", includeFull: false };
    appState.savedOnly = false;
    syncFilterUi();
    syncSavedUi();
    runRank();
  }

  /* ---------- place selection ---------- */

  function updatePlaceUi() {
    el.title.textContent = "Rooms near " + appState.place.label;
    const chips = el.placeChips.querySelectorAll("button[data-hub]");
    for (let i = 0; i < chips.length; i += 1) {
      const on = appState.place.mode === "hub" && chips[i].dataset.hub === appState.place.name;
      chips[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function setPlaceHub(name, label) {
    appState.place = { mode: "hub", name: name, label: label };
    updatePlaceUi();
  }

  function setPlaceCustom(lat, lon, label) {
    appState.place = { mode: "custom", name: "Custom", label: label, lat: lat, lon: lon };
    updatePlaceUi();
  }

  function renderPlaceChips() {
    el.placeChips.textContent = "";
    const known = {};
    appState.landmarks.forEach(function (h) { known[h.name] = true; });
    const places = POPULAR_PLACES.filter(function (p) { return known[p[0]]; });
    const shown = appState.morePlaces ? places : places.slice(0, POPULAR_SHOWN);
    shown.forEach(function (p) {
      const chip = mkButton("chip", p[1], function () {
        setPlaceHub(p[0], p[1]);
        el.locationMsg.textContent = "";
        runRank();
      });
      chip.dataset.hub = p[0];
      el.placeChips.appendChild(chip);
    });
    if (places.length > POPULAR_SHOWN) {
      const more = mkButton("chip chip-more", appState.morePlaces ? "Fewer" : "More", function () {
        appState.morePlaces = !appState.morePlaces;
        renderPlaceChips();
      });
      more.setAttribute("aria-expanded", appState.morePlaces ? "true" : "false");
      el.placeChips.appendChild(more);
    }
    updatePlaceUi();
  }

  /* ---------- selection / highlight ---------- */

  function visibleCount() {
    return appState.showAll ? appState.view.length : Math.min(PAGE_SIZE, appState.view.length);
  }

  function highlightResult(index, shouldScroll) {
    if (index >= visibleCount()) {
      appState.showAll = true;
      renderList();
    }
    appState.selectedIndex = index;
    const nodes = el.section.querySelectorAll("[data-index]");
    for (let i = 0; i < nodes.length; i += 1) {
      const on = Number(nodes[i].dataset.index) === index;
      nodes[i].classList.toggle("is-selected", on);
      const visible = nodes[i].offsetParent !== null;
      if (on && shouldScroll && visible) {
        nodes[i].scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  function isPhone() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function selectFromUser(idx) {
    highlightResult(idx, false);
    window.BoardMap.focusListing(idx);
  }

  /* ---------- rendering: banners ---------- */

  function renderSkipped(errors) {
    el.skippedList.textContent = "";
    const has = Array.isArray(errors) && errors.length > 0;
    el.skippedBanner.classList.toggle("hidden", !has);
    if (!has) {
      return;
    }
    el.skippedCount.textContent = errors.length + (errors.length === 1 ? " row" : " rows") + " in the file were skipped.";
    errors.forEach(function (msg) {
      el.skippedList.appendChild(mk("li", "", msg));
    });
  }

  function datasetLabel() {
    if (appState.dataset === "research") {
      return "real listings (research)";
    }
    return appState.dataset === "demo" ? "demo data" : "test case " + appState.dataset;
  }

  function renderDataSource() {
    el.dataSource.textContent = "";
    if (!appState.fileName) {
      el.dataSource.textContent = "Using " + datasetLabel();
      el.datasetBtn.textContent = appState.dataset === "research" ? "Use demo listings" : "Use real listings (research)";
      el.testCaseSelect.value = appState.dataset.indexOf("tc") === 0 || appState.dataset === "demo" ? appState.dataset : "";
      return;
    }
    el.dataSource.appendChild(document.createTextNode("Using file: " + appState.fileName + " · "));
    el.dataSource.appendChild(mkButton("link-btn", "Reset to demo data", resetToDemo));
  }

  /* ---------- rendering: cards ---------- */

  function makeNote(item) {
    const text = String(item.notes || "");
    if (!text) {
      return null;
    }
    const wrap = mk("p", "card-note");
    if (text.length <= NOTE_PREVIEW_CHARS) {
      wrap.textContent = text;
      return wrap;
    }
    const body = document.createTextNode(text.slice(0, NOTE_PREVIEW_CHARS).trimEnd() + "… ");
    wrap.appendChild(body);
    let open = false;
    const toggle = mkButton("read-more", "Read more", function () {
      open = !open;
      body.textContent = open ? text + " " : text.slice(0, NOTE_PREVIEW_CHARS).trimEnd() + "… ";
      toggle.textContent = open ? "Show less" : "Read more";
    });
    wrap.appendChild(toggle);
    return wrap;
  }

  function copyTextToClipboard(text, onDone, onFail) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onDone, function () { fallbackCopy(text, onDone, onFail); });
      return;
    }
    fallbackCopy(text, onDone, onFail);
  }

  function fallbackCopy(text, onDone, onFail) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand && document.execCommand("copy");
      document.body.removeChild(area);
      if (ok) {
        onDone();
      } else if (onFail) {
        onFail();
      }
    } catch (err) {
      if (onFail) {
        onFail();
      }
    }
  }

  function makeContactReveal(item) {
    const box = mk("div", "contact-reveal hidden");
    const text = String(item.contact || "").trim();
    box.appendChild(mk("span", "", text || "No contact listed"));
    if (item.source_url && /^https?:\/\//i.test(String(item.source_url))) {
      const srcLink = mk("a", "", item.source_name ? "Source (" + item.source_name + ")" : "Open source");
      srcLink.href = String(item.source_url);
      srcLink.target = "_blank";
      srcLink.rel = "noopener noreferrer";
      box.appendChild(srcLink);
    }
    const firstNumber = /\+?\d[\d\s()-]{5,}\d/.exec(text);   // "(082) 226-2568 / 0922-..." -> the first number only
    const digits = firstNumber ? firstNumber[0].replace(/[^0-9+]/g, "") : "";
    if (digits.length >= 7) {
      const call = mk("a", "", "Call");
      call.href = "tel:" + digits;
      box.appendChild(call);
    }
    if (text) {
      const copy = mkButton("read-more", "Copy", function () {
        copyTextToClipboard(text, function () { copy.textContent = "Copied"; }, function () { copy.textContent = "Copy unavailable"; });
      });
      box.appendChild(copy);
    }
    return box;
  }

  function hasUnconfirmedSlots(item) {
    return Boolean(item.slots_unconfirmed) || /slots not stated/i.test(String(item.notes || ""));
  }

  function hasApproximatePin(item) {
    return item.coord_accuracy === "street" || item.coord_accuracy === "approximate";
  }

  function formatListingDetails(item) {
    const parts = [
      String(item.name || "Listing") + " (" + (item.type || "Room") + ", " + genderText(item.gender_policy) + ")",
      formatPrice(item) + " per month · " + distanceText(item) + " (" + walkText(item) + ")",
      "Address: " + String(item.address || ""),
      "Contact: " + String(item.contact || "No contact listed"),
      "Confirmed: " + String(item.date_accessed || item.last_updated || "")
    ];
    if (item.source_url) {
      parts.push("Source: " + String(item.source_url));
    }
    return parts.join("\n");
  }

  function makeCopyDetailsButton(item) {
    const btn = mkButton("read-more copy-details-btn", "Copy details", function () {
      copyTextToClipboard(
        formatListingDetails(item),
        function () {
          btn.textContent = "Copied!";
          window.setTimeout(function () { btn.textContent = "Copy details"; }, 1800);
        },
        function () {
          btn.textContent = "Copy unavailable";
          window.setTimeout(function () { btn.textContent = "Copy details"; }, 1800);
        }
      );
    });
    return btn;
  }

  function makeSaveButton(item) {
    const btn = iconButton("heart", "Save this room", function () { toggleSaved(item); });
    btn.dataset.saveId = item.listing_id;
    return btn;
  }

  function makeCompareCheck(item) {
    const label = mk("label", "compare-check");
    const box = mk("input");
    box.type = "checkbox";
    box.checked = appState.compare.indexOf(item.listing_id) !== -1;
    box.addEventListener("change", function () {
      toggleCompare(item.listing_id, box);
    });
    label.appendChild(box);
    label.appendChild(document.createTextNode("Compare"));
    return label;
  }

  function makeMeta(item) {
    const meta = mk("div", "card-meta");
    meta.appendChild(mk("strong", "meta-item", distanceText(item)));
    meta.appendChild(mk("span", "meta-item meta-soft", walkText(item) + " · straight-line"));
    const hint = mk("p", "meta-hint hidden", window.BoardMap.distanceHint);
    const q = mkButton("hint-btn", "?", function () {
      const hidden = hint.classList.toggle("hidden");
      q.setAttribute("aria-expanded", hidden ? "false" : "true");
    });
    q.setAttribute("aria-label", "About distance and walking time");
    q.setAttribute("aria-expanded", "false");
    meta.appendChild(q);
    meta.appendChild(hint);
    return meta;
  }

  function makeBadges(item) {
    const row = mk("div", "badge-row");
    const slots = Number(item.available_slots || 0);
    if (slots <= 0) {
      row.appendChild(mk("span", "badge badge-full", "Fully booked"));
    } else if (hasUnconfirmedSlots(item)) {
      row.appendChild(mk("span", "badge badge-warn", "Availability not confirmed"));
    } else if (slots === 1) {
      row.appendChild(mk("span", "badge badge-warn", "Only 1 slot left"));
    } else {
      row.appendChild(mk("span", "badge badge-open", slots + " slots left"));
    }
    row.appendChild(mk("span", "badge", genderText(item.gender_policy)));
    row.appendChild(mk("span", "badge", item.type || "Room"));
    const confirmedDate = String(item.date_accessed || item.last_updated || "").trim();
    if (confirmedDate) {
      row.appendChild(mk("span", "badge", "Confirmed " + confirmedDate));
    }
    if (hasApproximatePin(item)) {
      row.appendChild(mk("span", "badge badge-warn", "Pin is approximate"));
    }
    if (item.stale) {
      row.appendChild(mk("span", "badge badge-warn", "Not updated recently"));
    }
    return row;
  }

  function buildCard(item, idx) {
    const card = mk("article", "listing-card");
    card.dataset.index = String(idx);
    card.dataset.id = item.listing_id;
    if (idx === 0) {
      card.classList.add("is-best");
    }

    const top = mk("div", "card-top");
    const lead = mk("div", "card-lead");
    if (idx === 0) {
      lead.appendChild(mk("span", "badge-top", topLabel()));
    }
    const nameBtn = mkButton("card-name", "", function () { selectFromUser(idx); });
    nameBtn.title = "Show on map";
    nameBtn.appendChild(mk("span", "rank-badge", idx + 1));
    nameBtn.appendChild(mk("span", "name-text", item.name || "Listing"));
    lead.appendChild(nameBtn);
    top.appendChild(lead);
    const price = mk("div", "card-price");
    price.appendChild(mk("span", "price-main", formatPrice(item)));
    price.appendChild(mk("span", "price-unit", "per month"));
    top.appendChild(price);
    card.appendChild(top);

    card.appendChild(makeMeta(item));
    card.appendChild(makeBadges(item));
    const note = makeNote(item);
    if (note) {
      card.appendChild(note);
    }
    const foot = mk("div", "card-foot");
    foot.appendChild(mk("p", "card-updated", friendlyUpdated(item.last_updated)));
    const footRight = mk("div", "card-foot-actions");
    footRight.appendChild(makeCopyDetailsButton(item));
    footRight.appendChild(makeCompareCheck(item));
    foot.appendChild(footRight);
    card.appendChild(foot);

    const reveal = makeContactReveal(item);
    const actions = mk("div", "card-actions");
    actions.appendChild(makeDirectionsLink(item, "btn btn-primary", "Directions"));
    actions.appendChild(makeSaveButton(item));
    const phone = iconButton("phone", "Show number", function () {
      const hidden = reveal.classList.toggle("hidden");
      phone.setAttribute("aria-expanded", hidden ? "false" : "true");
    });
    phone.setAttribute("aria-expanded", "false");
    actions.appendChild(phone);
    card.appendChild(actions);
    card.appendChild(reveal);

    card.addEventListener("click", function (ev) {
      if (ev.target === card) {
        selectFromUser(idx);
      }
    });
    return card;
  }

  /* ---------- rendering: list, summary, empty state ---------- */

  function renderList() {
    el.cards.textContent = "";
    const shown = visibleCount();
    for (let idx = 0; idx < shown; idx += 1) {
      el.cards.appendChild(buildCard(appState.view[idx], idx));
    }
    const rest = appState.view.length - shown;
    el.showMore.classList.toggle("hidden", rest <= 0);
    el.showMore.textContent = "Show " + rest + " more " + (rest === 1 ? "room" : "rooms");
    syncSavedUi();
    highlightQuiet();
  }

  function highlightQuiet() {
    const nodes = el.section.querySelectorAll("[data-index]");
    for (let i = 0; i < nodes.length; i += 1) {
      nodes[i].classList.toggle("is-selected", Number(nodes[i].dataset.index) === appState.selectedIndex);
    }
  }

  function sortWords() {
    return appState.sortBy === "rent" ? "lowest price first" : "closest first";
  }

  function buildSummary() {
    const total = appState.view.length;
    if (total === 0) {
      return "No rooms to show near " + appState.place.label + ".";
    }
    const budget = appState.filters.budget;
    const within = budget ? " · within ₱" + Number(budget).toLocaleString() : "";
    const label = appState.savedOnly ? "saved rooms" : "rooms";
    return "Showing " + visibleCount() + " of " + total + " " + label + within + " · " + sortWords();
  }

  function nextBudgetStep() {
    const current = appState.filters.budget;
    if (!current) {
      return null;
    }
    for (let i = 0; i < BUDGET_OPTIONS.length; i += 1) {
      const v = BUDGET_OPTIONS[i][0];
      if (v === "" || Number(v) > Number(current)) {
        return BUDGET_OPTIONS[i];
      }
    }
    return null;
  }

  function renderEmpty() {
    const none = appState.view.length === 0 && !appState.loading;
    el.empty.classList.toggle("hidden", !none);
    if (!none) {
      return;
    }
    const step = nextBudgetStep();
    if (appState.savedOnly) {
      el.emptyText.textContent = "You have not saved any of these rooms yet. Tap the heart on a card to save it.";
    } else {
      el.emptyText.textContent = "No rooms match near " + appState.place.label + ". Try a higher budget or clear your filters.";
    }
    el.raiseBtn.classList.toggle("hidden", appState.savedOnly || !step);
    if (step && !appState.savedOnly) {
      el.raiseBtn.textContent = step[0] === "" ? "Remove budget limit" : "Raise budget to " + step[2];
      el.raiseBtn.dataset.value = step[0];
    }
  }

  function refreshAll() {
    appState.view = appState.savedOnly
      ? appState.results.filter(isSaved)
      : appState.results;
    appState.selectedIndex = -1;
    el.summary.textContent = "";
    updatePlaceUi();
    renderList();
    el.summary.textContent = buildSummary();
    renderEmpty();
    el.exportBtn.disabled = appState.results.length === 0;
    renderCompare();
    if (appState.lastData) {
      window.BoardMap.updateView(appState.lastData.landmark, appState.view);
    }
  }

  function setLoading(on) {
    appState.loading = on;
    el.loading.classList.toggle("hidden", !on);
    el.section.setAttribute("aria-busy", on ? "true" : "false");
    el.section.classList.toggle("is-loading", on);
  }

  /* ---------- compare ---------- */

  function toggleCompare(id, checkbox) {
    const at = appState.compare.indexOf(id);
    if (at !== -1) {
      appState.compare.splice(at, 1);
    } else if (appState.compare.length >= MAX_COMPARE) {
      checkbox.checked = false;
      el.compareMsg.textContent = "You can compare up to " + MAX_COMPARE + " rooms. Untick one first.";
      return;
    } else {
      appState.compare.push(id);
    }
    renderCompare();
  }

  function compareItems() {
    const found = [];
    appState.compare.forEach(function (id) {
      for (let i = 0; i < appState.results.length; i += 1) {
        if (appState.results[i].listing_id === id) {
          found.push(appState.results[i]);
        }
      }
    });
    return found;
  }

  function showNumberCell(item) {
    const td = mk("td");
    const text = String(item.contact || "").trim() || "No contact listed";
    const btn = mkButton("read-more", "Show number", function () {
      btn.textContent = text;
    });
    td.appendChild(btn);
    return td;
  }

  function compareRow(label, getValue) {
    const tr = mk("tr");
    tr.appendChild(mk("th", "", label)).setAttribute("scope", "row");
    compareItems().forEach(function (item) {
      tr.appendChild(mk("td", "", getValue(item)));
    });
    return tr;
  }

  function buildCompareTable() {
    const items = compareItems();
    const table = mk("table", "compare-table");
    const head = mk("tr");
    head.appendChild(mk("th", "", "")).setAttribute("scope", "col");
    items.forEach(function (item) {
      head.appendChild(mk("th", "", item.name)).setAttribute("scope", "col");
    });
    const thead = mk("thead");
    thead.appendChild(head);
    table.appendChild(thead);
    const body = mk("tbody");
    body.appendChild(compareRow("Price", function (i) { return formatPrice(i) + " per month"; }));
    body.appendChild(compareRow("Distance", distanceText));
    body.appendChild(compareRow("Walk time", walkText));
    body.appendChild(compareRow("Slots", function (i) {
      if (Number(i.available_slots) <= 0) {
        return "Fully booked";
      }
      return hasUnconfirmedSlots(i) ? "Availability not confirmed" : i.available_slots + " left";
    }));
    body.appendChild(compareRow("For", function (i) { return genderText(i.gender_policy); }));
    body.appendChild(compareRow("Type", function (i) { return i.type; }));
    body.appendChild(compareRow("Updated", function (i) { return friendlyUpdated(i.last_updated); }));
    const contactRow = mk("tr");
    contactRow.appendChild(mk("th", "", "Contact")).setAttribute("scope", "row");
    items.forEach(function (item) { contactRow.appendChild(showNumberCell(item)); });
    body.appendChild(contactRow);
    const dirRow = mk("tr");
    dirRow.appendChild(mk("th", "", "Directions")).setAttribute("scope", "row");
    items.forEach(function (item) {
      const td = mk("td");
      td.appendChild(makeDirectionsLink(item, "table-link", "Directions"));
      dirRow.appendChild(td);
    });
    body.appendChild(dirRow);
    table.appendChild(body);
    return table;
  }

  function renderCompare() {
    const items = compareItems();
    const ids = items.map(function (i) { return i.listing_id; });
    appState.compare = appState.compare.filter(function (id) { return ids.indexOf(id) !== -1; });
    const n = appState.compare.length;
    el.compareOpen.textContent = "Compare (" + n + ")";
    el.compareOpen.classList.toggle("hidden", n < 2 || !el.comparePanel.classList.contains("hidden"));
    el.compareMsg.textContent = n === 1 ? "Tick one more room to compare." : "";
    if (n < 2) {
      el.comparePanel.classList.add("hidden");
    }
    if (!el.comparePanel.classList.contains("hidden")) {
      el.compareBody.textContent = "";
      el.compareBody.appendChild(buildCompareTable());
    }
    const boxes = el.cards.querySelectorAll(".compare-check input");
    for (let i = 0; i < boxes.length; i += 1) {
      const id = boxes[i].closest("article").dataset.id;
      boxes[i].checked = appState.compare.indexOf(id) !== -1;
    }
  }

  function openCompare() {
    el.comparePanel.classList.remove("hidden");
    renderCompare();
  }

  function closeCompare() {
    el.comparePanel.classList.add("hidden");
    renderCompare();
  }

  /* ---------- API ---------- */

  function buildPayload(overrides) {
    const place = appState.place;
    const payload = {
      csv_text: appState.csvText,
      dataset: appState.dataset,
      landmark: place.mode === "hub" ? place.name : "Custom",
      custom_lat: place.mode === "custom" ? String(place.lat) : "",
      custom_lon: place.mode === "custom" ? String(place.lon) : "",
      budget: appState.filters.budget,
      room_type: appState.filters.type,
      gender: appState.filters.gender,
      include_full: appState.filters.includeFull,
      sort_by: appState.sortBy
    };
    return Object.assign(payload, overrides || {});
  }

  async function postRank(payload) {
    const resp = await fetch("/api/rank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    return { resp: resp, data: data };
  }

  // Returns true when the server accepted the request.
  async function runRank(opts) {
    if (!(opts && opts.keepError)) {
      showError("");
    }
    const seq = appState.requestSeq + 1;
    appState.requestSeq = seq;
    setLoading(true);
    try {
      const out = await postRank(buildPayload());
      if (seq !== appState.requestSeq) {
        return false;
      }
      if (!out.resp.ok || !out.data.ok) {
        showError(out.data.error || "Something went wrong (HTTP " + out.resp.status + "). Please check your filters.");
        return false;
      }
      appState.lastData = out.data;
      appState.results = Array.isArray(out.data.results) ? out.data.results : [];
      appState.showAll = false;
      renderSkipped(out.data.errors);
      renderDataSource();
      setLoading(false);
      refreshAll();
      window.BoardTrace.load(out.data.trace, out.data.counts, out.data.formulas, out.data.trace_truncated, out.data.matched);
      return true;
    } catch (err) {
      if (seq === appState.requestSeq) {
        showError("Can't reach the server. Check your connection and try again.");
      }
      return false;
    } finally {
      if (seq === appState.requestSeq) {
        setLoading(false);
      }
    }
  }

  function scheduleRank(delay) {
    if (appState.debounceId !== null) {
      window.clearTimeout(appState.debounceId);
    }
    appState.debounceId = window.setTimeout(function () {
      appState.debounceId = null;
      runRank();
    }, delay);
  }

  async function loadLandmarks() {
    try {
      const resp = await fetch("/api/landmarks");
      if (!resp.ok) {
        throw new Error("HTTP " + resp.status);
      }
      const data = await resp.json();
      appState.landmarks = Array.isArray(data.landmarks) ? data.landmarks : [];
      renderPlaceChips();
      window.BoardMap.setHubs(appState.landmarks);
    } catch (err) {
      showError("Couldn't load Davao places. Please refresh the page.");
    }
  }

  /* ---------- CSV: export, upload, reset ---------- */

  const PHONE_LIKE = /^\+?[0-9][0-9\s()-]{5,}$/;

  function escapeCsvCell(rawValue, guardFormula) {
    let text = String(rawValue === null || rawValue === undefined ? "" : rawValue);
    if (guardFormula && text.length > 0 && !PHONE_LIKE.test(text)) {
      const first = text.charAt(0);
      // Spreadsheet formula guard: a cell starting with = + - @ (or tab / CR) gets a leading apostrophe.
      if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
        text = "'" + text;
      }
    }
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function buildCsvText(rows, guardFormula) {
    const lines = [CSV_COLUMNS.join(",")];
    rows.forEach(function (row) {
      lines.push(CSV_COLUMNS.map(function (col) { return escapeCsvCell(row[col], guardFormula); }).join(","));
    });
    return lines.join("\r\n");
  }

  function exportResults() {
    if (appState.results.length === 0) {
      return;
    }
    const text = "﻿" + buildCsvText(appState.results, true);   // BOM so Excel reads UTF-8
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "boardfinder-davao-results.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleUpload(file) {
    const previous = { csvText: appState.csvText, fileName: appState.fileName };
    const text = await file.text();
    appState.csvText = text;
    appState.fileName = file.name;
    appState.allListings = null;
    const ok = await runRank();
    if (!ok) {
      appState.csvText = previous.csvText;
      appState.fileName = previous.fileName;
      await runRank({ keepError: true });
    }
  }

  function resetToDemo() {
    appState.csvText = null;
    appState.fileName = "";
    appState.allListings = null;
    runRank();
  }

  // Optional second dataset: real listings gathered from public sources (data/listings_research.csv).
  function switchDataset(name) {
    appState.dataset = name;
    appState.csvText = null;
    appState.fileName = "";
    appState.allListings = null;
    const research = name === "research";
    // Those rooms are around Ateneo (Jacinto) and cost more, so start there with no price limit.
    appState.filters.budget = research ? "" : DEFAULTS.budget;
    appState.filters.type = DEFAULTS.type;
    appState.filters.includeFull = DEFAULTS.includeFull;
    // Course test case tc1 is specified as: budget 4000, Female, sorted by distance.
    appState.filters.gender = name === "tc1" ? "Female" : DEFAULTS.gender;
    const hub = research ? POPULAR_PLACES[1] : POPULAR_PLACES[0];
    setPlaceHub(hub[0], hub[1]);
    syncFilterUi();
    runRank();
  }

  /* ---------- add listing ---------- */

  // The FULL dataset (all valid rows), not just the filtered results.
  async function ensureAllListings() {
    if (appState.allListings) {
      return appState.allListings;
    }
    const first = appState.landmarks.length > 0 ? appState.landmarks[0].name : "UM Matina Campus";
    const out = await postRank(buildPayload({
      landmark: first, custom_lat: "", custom_lon: "", budget: "", room_type: "ALL",
      gender: "ANY", include_full: true, sort_by: "distance"
    }));
    if (!out.resp.ok || !out.data.ok) {
      throw new Error(out.data.error || "Could not load the current rooms");
    }
    appState.allListings = out.data.results;
    return appState.allListings;
  }

  function fieldError(id, message) {
    const input = $(id);
    const err = $(id + "Err");
    if (err) {
      err.textContent = message || "";
    }
    if (message) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
    return message ? input : null;
  }

  function wholeNumber(text) {
    return /^\d+$/.test(text) ? Number(text) : NaN;
  }

  function validateAddForm() {
    const v = function (id) { return $(id).value.trim(); };
    const lat = Number(v("addLat"));
    const lon = Number(v("addLon"));
    const rent = wholeNumber(v("addRent"));
    const slots = wholeNumber(v("addSlots"));
    const problems = [
      fieldError("addName", v("addName") ? "" : "Enter the room name."),
      fieldError("addAddress", v("addAddress") ? "" : "Enter the address."),
      fieldError("addContact", v("addContact") ? "" : "Enter a contact number."),
      fieldError("addLat", v("addLat") !== "" && lat >= 6.9 && lat <= 7.6 ? "" : "Latitude must be between 6.90 and 7.60 (Davao City)."),
      fieldError("addLon", v("addLon") !== "" && lon >= 125.2 && lon <= 125.75 ? "" : "Longitude must be between 125.20 and 125.75 (Davao City)."),
      fieldError("addRent", rent >= 1 && rent <= 100000 ? "" : "Enter a whole number from 1 to 100000."),
      fieldError("addSlots", slots >= 0 && slots <= 500 ? "" : "Enter a whole number from 0 to 500.")
    ].filter(function (input) { return input !== null; });
    if (problems.length > 0) {
      problems[0].focus();
      return false;
    }
    return true;
  }

  function newListingRow() {
    const v = function (id) { return $(id).value.trim(); };
    return {
      listing_id: "ADD-" + Date.now().toString(36),
      name: v("addName"), type: $("addType").value, address: v("addAddress"),
      lat: v("addLat"), lon: v("addLon"), monthly_rent: v("addRent"), available_slots: v("addSlots"),
      gender_policy: $("addGender").value, contact: v("addContact"),
      last_updated: manilaToday(), notes: v("addNotes")
    };
  }

  async function submitAddListing(ev) {
    ev.preventDefault();
    if (!validateAddForm()) {
      return;
    }
    try {
      const rows = (await ensureAllListings()).concat([newListingRow()]);
      appState.csvText = buildCsvText(rows, false);
      appState.allListings = null;     // re-read next time so a rejected row never lingers
      if (!appState.fileName) {
        appState.fileName = datasetLabel() + " + your added rooms";
      }
    } catch (err) {
      showError(err.message);
      return;
    }
    el.addForm.reset();
    $("addSlots").value = "1";
    closeAddDrawer();
    runRank();
  }

  function closeAddDrawer() {
    el.addPanel.classList.add("hidden");
    el.addPanel.classList.remove("is-away");
    el.pickBanner.classList.add("hidden");
    el.pickHint.textContent = "";
    window.BoardMap.setPickMode(false, null);
  }

  // While picking a location the dialog steps aside so the whole map can be tapped.
  function startPickOnMap() {
    el.addPanel.classList.add("is-away");
    el.pickBanner.classList.remove("hidden");
    window.BoardMap.setPickMode(true, function (lat, lon) {
      $("addLat").value = lat.toFixed(6);
      $("addLon").value = lon.toFixed(6);
      fieldError("addLat", "");
      fieldError("addLon", "");
      el.pickHint.textContent = "Picked (" + lat.toFixed(5) + ", " + lon.toFixed(5) + ")";
      el.pickBanner.classList.add("hidden");
      el.addPanel.classList.remove("is-away");
    });
  }

  function cancelPickOnMap() {
    window.BoardMap.setPickMode(false, null);
    el.pickBanner.classList.add("hidden");
    el.addPanel.classList.remove("is-away");
  }

  /* ---------- place search & geolocation ---------- */

  const SUGGEST_DELAY_MS = 250;
  const NO_PLACE_HELP = "Try a nearby school or mall, or tap the map.";
  const PRIVACY_WITH_PHOTON = "We don't store your location. Place search uses OpenStreetMap and Photon.";
  const suggest = { items: [], active: -1, timer: null, abort: null, seq: 0, query: "" };

  function loadedListings() {
    return appState.allListings || appState.results || [];
  }

  function closeSuggestions() {
    suggest.items = [];
    suggest.active = -1;
    el.placeResults.textContent = "";
    el.placeResults.classList.add("hidden");
    el.placeInput.setAttribute("aria-expanded", "false");
    el.placeInput.removeAttribute("aria-activedescendant");
  }

  function setActiveSuggestion(index) {
    const rows = el.placeResults.children;
    if (suggest.active >= 0 && rows[suggest.active]) {
      rows[suggest.active].setAttribute("aria-selected", "false");
      rows[suggest.active].classList.remove("is-active");
    }
    suggest.active = index;
    if (index >= 0 && rows[index]) {
      rows[index].setAttribute("aria-selected", "true");
      rows[index].classList.add("is-active");
      rows[index].scrollIntoView({ block: "nearest" });
      el.placeInput.setAttribute("aria-activedescendant", rows[index].id);
    } else {
      el.placeInput.removeAttribute("aria-activedescendant");
    }
  }

  function pickSuggestion(place) {
    setPlaceCustom(place.lat, place.lon, place.name || "your search");
    el.placeInput.value = place.name;
    el.locationMsg.textContent = "";
    closeSuggestions();
    runRank();
  }

  function renderSuggestions(places) {
    el.placeResults.textContent = "";
    suggest.items = places;
    suggest.active = -1;
    places.forEach(function (place, i) {
      const li = mk("li", "suggest-row");
      li.id = "placeOption" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.appendChild(mk("span", "suggest-name", place.name));
      li.appendChild(mk("span", "suggest-sub", place.sub));
      li.addEventListener("mousedown", function (ev) { ev.preventDefault(); });   // keep focus in the input
      li.addEventListener("click", function () { pickSuggestion(place); });
      el.placeResults.appendChild(li);
    });
    el.placeResults.classList.toggle("hidden", places.length === 0);
    el.placeInput.setAttribute("aria-expanded", places.length ? "true" : "false");
  }

  function noPlaceMessage(query, failed) {
    const first = failed
      ? "Online place search isn't available right now."
      : "We couldn't find \"" + query + "\" in Davao City.";
    return first + " " + NO_PLACE_HELP;
  }

  // Show instant local matches, then add online ones. `full` (Search button / Enter) also asks Nominatim.
  async function updateSuggestions(query, full) {
    suggest.seq += 1;
    suggest.query = query;
    const mySeq = suggest.seq;
    if (suggest.abort) {
      suggest.abort.abort();
    }
    const controller = new AbortController();
    suggest.abort = controller;

    const local = window.BoardMap.searchLocal(query, loadedListings());
    renderSuggestions(local);
    el.locationMsg.textContent = "";
    let places = local;
    let failed = false;
    try {
      const online = await window.BoardMap.searchOnline(query, controller.signal, { nominatim: full });
      failed = online.failed;
      places = window.BoardMap.mergeSuggestions([local, online.places]);
      el.privacyNote.textContent = PRIVACY_WITH_PHOTON;
    } catch (err) {
      if (err && err.name === "AbortError") {
        return places;                       // a newer search owns the list now
      }
      failed = true;
    }
    if (mySeq !== suggest.seq) {
      return places;
    }
    renderSuggestions(places);
    if (places.length === 0) {
      el.locationMsg.textContent = noPlaceMessage(query, failed);
    }
    return places;
  }

  function onPlaceInput() {
    window.clearTimeout(suggest.timer);
    const query = el.placeInput.value.trim();
    if (query.length < 2) {
      suggest.seq += 1;
      if (suggest.abort) {
        suggest.abort.abort();
      }
      closeSuggestions();
      return;
    }
    suggest.timer = window.setTimeout(function () { updateSuggestions(query, false); }, SUGGEST_DELAY_MS);
  }

  // Enter or the Search button: use the highlighted suggestion, else the first one.
  async function handlePlaceSearch() {
    window.clearTimeout(suggest.timer);
    const query = el.placeInput.value.trim();
    if (!query) {
      el.locationMsg.textContent = "Type a school, mall or barangay first. ";
      return;
    }
    showError("");
    let places = suggest.items;
    if (places.length === 0 || suggest.query !== query) {
      places = await updateSuggestions(query, true);
    }
    if (places.length > 0) {
      pickSuggestion(places[suggest.active >= 0 ? suggest.active : 0]);
    }
  }

  function onPlaceKeydown(ev) {
    const count = suggest.items.length;
    if (ev.key === "Escape" && count > 0) {
      ev.stopPropagation();                  // close the list only, not the Filters panel
      closeSuggestions();
    } else if (ev.key === "ArrowDown" && count > 0) {
      ev.preventDefault();
      setActiveSuggestion((suggest.active + 1) % count);
    } else if (ev.key === "ArrowUp" && count > 0) {
      ev.preventDefault();
      setActiveSuggestion(suggest.active <= 0 ? count - 1 : suggest.active - 1);
    }
  }

  function inDavao(lat, lon) {
    return lat >= 6.90 && lat <= 7.60 && lon >= 125.20 && lon <= 125.75;
  }

  function useMyLocation() {
    el.locationMsg.textContent = "";
    if (!navigator.geolocation) {
      el.locationMsg.textContent = "Your browser can't share your location. Pick a place above or tap the map.";
      return;
    }
    el.locationMsg.textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        if (!inDavao(pos.coords.latitude, pos.coords.longitude)) {
          el.locationMsg.textContent = "You're outside Davao City — pick a place above to see nearby rooms.";
          return;
        }
        setPlaceCustom(pos.coords.latitude, pos.coords.longitude, "your location");
        el.locationMsg.textContent = "Using your current location.";
        runRank();
      },
      function () {
        el.locationMsg.textContent = "We couldn't get your location. Pick a place above or tap the map instead.";
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  /* ---------- events ---------- */

  function setMenu(open) {
    el.moreList.classList.toggle("hidden", !open);
    el.moreBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setSort(mode) {
    appState.sortBy = mode;
    el.sortDistance.classList.toggle("is-active", mode === "distance");
    el.sortRent.classList.toggle("is-active", mode === "rent");
    el.sortDistance.setAttribute("aria-pressed", mode === "distance" ? "true" : "false");
    el.sortRent.setAttribute("aria-pressed", mode === "rent" ? "true" : "false");
    runRank();
  }

  /* ---------- bottom sheet (phones): peek / half / full ---------- */

  function sheetPixels(name) {
    if (name === "peek") {
      return 190;
    }
    return name === "full" ? Math.max(260, window.innerHeight - 150) : Math.min(420, Math.round(window.innerHeight * 0.5));
  }

  function setSheet(name) {
    appState.sheet = name;
    document.documentElement.style.setProperty("--sheet-h", sheetPixels(name) + "px");
    el.sheetHandle.setAttribute("aria-label", "Resize the results list (now " + name + ")");
  }

  function bindSheetEvents() {
    let startY = 0;
    let startH = 0;
    let moved = false;
    el.sheetHandle.addEventListener("pointerdown", function (ev) {
      startY = ev.clientY;
      startH = el.section.getBoundingClientRect().height;
      moved = false;
      el.section.classList.add("is-dragging");
      el.sheetHandle.setPointerCapture(ev.pointerId);
    });
    el.sheetHandle.addEventListener("pointermove", function (ev) {
      if (!el.section.classList.contains("is-dragging")) {
        return;
      }
      moved = moved || Math.abs(ev.clientY - startY) > 6;
      const h = Math.max(sheetPixels("peek"), Math.min(sheetPixels("full"), startH + (startY - ev.clientY)));
      document.documentElement.style.setProperty("--sheet-h", h + "px");
    });
    el.sheetHandle.addEventListener("pointerup", function () {
      el.section.classList.remove("is-dragging");
      if (!moved) {
        return;   // a plain tap is handled by the click listener below
      }
      const h = el.section.getBoundingClientRect().height;
      let best = "half";
      SHEET_HEIGHTS.forEach(function (name) {
        if (Math.abs(sheetPixels(name) - h) < Math.abs(sheetPixels(best) - h)) {
          best = name;
        }
      });
      setSheet(best);
    });
    // Tap or Enter/Space: step to the next height (keyboard users have no drag).
    el.sheetHandle.addEventListener("click", function (ev) {
      if (ev.detail > 0 && moved) {
        moved = false;
        return;
      }
      setSheet(SHEET_HEIGHTS[(SHEET_HEIGHTS.indexOf(appState.sheet) + 1) % SHEET_HEIGHTS.length]);
    });
    window.addEventListener("resize", function () {
      setSheet(appState.sheet);
      syncPanelToggle();
    });
  }

  /* ---------- collapsible results panel (desktop only) ---------- */

  function syncPanelToggle() {
    const collapsed = appState.panelCollapsed && !isPhone();
    document.body.classList.toggle("panel-collapsed", collapsed);
    el.panelToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const label = collapsed ? "Show results panel" : "Hide results panel";
    el.panelToggle.setAttribute("aria-label", label);
    el.panelToggle.title = label;
  }

  function setPanelCollapsed(collapsed) {
    if (isPhone() || appState.panelCollapsed === collapsed) {
      return;   // phones keep the bottom sheet
    }
    appState.panelCollapsed = collapsed;
    try {
      window.localStorage.setItem(PANEL_KEY, collapsed ? "1" : "0");
    } catch (err) {
      // Storage blocked: the choice just lasts until the page closes.
    }
    setMenu(false);
    syncPanelToggle();
    // Refit once the search bar has finished sliding, so the map uses the new free width.
    window.setTimeout(function () { window.BoardMap.refit(); }, 230);
  }

  function loadPanelState() {
    try {
      appState.panelCollapsed = window.localStorage.getItem(PANEL_KEY) === "1";
    } catch (err) {
      appState.panelCollapsed = false;
    }
    syncPanelToggle();
    el.panelToggle.addEventListener("click", function () { setPanelCollapsed(!appState.panelCollapsed); });
  }

  function bindMenuEvents() {
    el.moreBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      setMenu(el.moreList.classList.contains("hidden"));
    });
    document.addEventListener("click", function (ev) {
      if (!el.moreList.contains(ev.target)) {
        setMenu(false);
      }
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !el.moreList.classList.contains("hidden")) {
        setMenu(false);
        el.moreBtn.focus();
      }
    });
    el.uploadBtn.addEventListener("click", function () {
      setMenu(false);
      el.csvUpload.click();
    });
    el.csvUpload.addEventListener("change", function () {
      const file = el.csvUpload.files && el.csvUpload.files[0];
      el.csvUpload.value = "";
      if (file) {
        handleUpload(file);
      }
    });
    el.exportBtn.addEventListener("click", function () {
      setMenu(false);
      exportResults();
    });
    el.addToggle.addEventListener("click", function () {
      setMenu(false);
      el.addPanel.classList.remove("hidden");
      $("addName").focus();
    });
    el.datasetBtn.addEventListener("click", function () {
      setMenu(false);
      switchDataset(appState.dataset === "research" ? "demo" : "research");
    });
  }

  function bindTestCaseEvents() {
    el.testCaseSelect.addEventListener("change", function () {
      const name = el.testCaseSelect.value;
      if (name) {
        setMenu(false);
        switchDataset(name);
      }
    });
  }

  function bindAddListingEvents() {
    $("addListingCloseBtn").addEventListener("click", closeAddDrawer);
    $("addListingCancelBtn").addEventListener("click", closeAddDrawer);
    el.addForm.addEventListener("submit", submitAddListing);
    $("pickOnMapBtn").addEventListener("click", startPickOnMap);
    $("pickCancelBtn").addEventListener("click", cancelPickOnMap);
  }

  function bindFilterEvents() {
    fillSelect(el.budgetSelect, BUDGET_OPTIONS);
    fillSelect(el.typeSelect, TYPE_OPTIONS);
    fillSelect(el.genderSelect, GENDER_OPTIONS);
    el.budgetSelect.addEventListener("change", function () {
      appState.filters.budget = el.budgetSelect.value;
      syncFilterUi();
      runRank();
    });
    el.typeSelect.addEventListener("change", function () {
      appState.filters.type = el.typeSelect.value;
      syncFilterUi();
      runRank();
    });
    el.genderSelect.addEventListener("change", function () {
      appState.filters.gender = el.genderSelect.value;
      syncFilterUi();
      runRank();
    });
    el.includeFull.addEventListener("change", function () {
      appState.filters.includeFull = el.includeFull.checked;
      syncFilterUi();
      runRank();
    });
    el.filtersBtn.addEventListener("click", function () {
      setFiltersOpen(el.filtersPanel.classList.contains("hidden"));
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") {
        return;
      }
      if (!el.filtersPanel.classList.contains("hidden")) {
        setFiltersOpen(false);
        el.filtersBtn.focus();
      } else if (!el.addPanel.classList.contains("hidden")) {
        closeAddDrawer();
      } else if (!el.comparePanel.classList.contains("hidden")) {
        closeCompare();
      }
    });
    $("clearFiltersBtn").addEventListener("click", clearFilters);
    $("emptyClearBtn").addEventListener("click", clearFilters);
    el.raiseBtn.addEventListener("click", function () {
      appState.filters.budget = el.raiseBtn.dataset.value || "";
      syncFilterUi();
      runRank();
    });
    $("useLocationBtn").addEventListener("click", useMyLocation);
    $("searchForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      handlePlaceSearch();
    });
    el.placeInput.addEventListener("input", onPlaceInput);
    el.placeInput.addEventListener("keydown", onPlaceKeydown);
    document.addEventListener("click", function (ev) {
      if (!$("searchStack").contains(ev.target)) {
        closeSuggestions();
      }
    });
  }

  function bindResultEvents() {
    el.sortDistance.addEventListener("click", function () { setSort("distance"); });
    el.sortRent.addEventListener("click", function () { setSort("rent"); });
    el.savedChip.addEventListener("click", function () {
      appState.savedOnly = !appState.savedOnly;
      refreshAll();
    });
    el.showMore.addEventListener("click", function () {
      appState.showAll = true;
      renderList();
      el.summary.textContent = buildSummary();
    });
    $("retryBtn").addEventListener("click", function () { runRank(); });
    el.skippedBtn.addEventListener("click", function () {
      const hidden = el.skippedList.classList.toggle("hidden");
      el.skippedBtn.textContent = hidden ? "View details" : "Hide details";
      el.skippedBtn.setAttribute("aria-expanded", hidden ? "false" : "true");
    });
    el.compareOpen.addEventListener("click", openCompare);
    $("compareCloseBtn").addEventListener("click", closeCompare);
  }

  function bindMapEvents() {
    window.BoardMap.setHandlers({
      onTargetClick: function (lat, lon, label) {
        setPlaceCustom(lat, lon, label || "your pin");
        el.locationMsg.textContent = "";
        runRank();
      },
      onSelectListing: function (idx) {
        setPanelCollapsed(false);   // show the card the user just picked
        if (isPhone() && appState.sheet === "peek") {
          setSheet("half");
        }
        highlightResult(idx, true);
      },
      isSaved: isSaved,
      toggleSaved: toggleSaved
    });
  }

  function init() {
    loadSaved();
    bindMenuEvents();
    bindSheetEvents();
    setSheet(appState.sheet);
    loadPanelState();
    bindAddListingEvents();
    bindTestCaseEvents();
    bindFilterEvents();
    bindResultEvents();
    bindMapEvents();
    syncFilterUi();
    syncSavedUi();
    el.exportBtn.disabled = true;
    loadLandmarks().then(function () { return runRank(); });
  }

  init();
})();
