(function () {
  "use strict";

  const DAVAO_CENTER = { lat: 7.0731, lon: 125.6128 };
  const DAVAO_BOUNDS = {
    lat_min: 6.90,
    lat_max: 7.60,
    lon_min: 125.20,
    lon_max: 125.75
  };
  const RING_RADII_KM = [0.5, 1, 2, 3];   // offline SVG map only
  const WALK_M_PER_MIN = 80;
  const FIT_NEAREST = 10;          // the map zooms to your pin + this many nearest rooms
  const CLUSTER_CELL_PX = 44;      // pins closer than this (in pixels) are merged into one bubble
  const HUB_MIN_ZOOM = 15;         // landmark dots only appear when zoomed in this far
  const MAX_CLUSTER_ZOOM = 17;
  const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const NOMINATIM_BASE =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&bounded=1&viewbox=125.20,7.60,125.75,6.90&limit=6&q=";

  // Comprehensive Google-Maps-referenced Davao City landmarks (merged with /api/landmarks hubs)
  const EXTRA_DAVAO_LANDMARKS = [
    // Universities & Colleges
    { name: "Holy Cross of Davao College (HCDC)", lat: 7.0775, lon: 125.6164 },
    { name: "San Pedro College (SPC Main)", lat: 7.0780, lon: 125.6157 },
    { name: "Brokenshire College (Madapo)", lat: 7.0750, lon: 125.5962 },
    { name: "Rizal Memorial Colleges (RMC)", lat: 7.0769, lon: 125.6025 },
    { name: "Mapua Malayan Colleges Mindanao (MCM)", lat: 7.0640, lon: 125.5957 },
    { name: "Davao Medical School Foundation (DMSF)", lat: 7.0856, lon: 125.6083 },
    { name: "Philippine Women's College of Davao (PWC)", lat: 7.0571, lon: 125.5929 },
    { name: "Joji Ilagan International Schools (JIB)", lat: 7.0743, lon: 125.6177 },
    { name: "Lyceum of the Philippines Davao (LPU)", lat: 7.1408, lon: 125.6469 },
    { name: "Jose Maria College (JMC)", lat: 7.1334, lon: 125.6450 },
    { name: "Assumption College of Davao (Cabaguio)", lat: 7.0881, lon: 125.6242 },
    { name: "STI College Davao", lat: 7.0739, lon: 125.6128 },
    { name: "Agro-Industrial Foundation College (Ecoland)", lat: 7.0545, lon: 125.6037 },
    { name: "St. John Paul II College of Davao (Ecoland)", lat: 7.0534, lon: 125.5989 },
    { name: "UIC Bonifacio / Father Selga Campus", lat: 7.0686, lon: 125.6058 },
    { name: "Ateneo de Davao High School (Matina)", lat: 7.0598, lon: 125.5865 },
    { name: "Christian Colleges of Southeast Asia (CCSA Ma-a)", lat: 7.0825, lon: 125.5892 },
    { name: "Samson Polytechnic College of Davao", lat: 7.0795, lon: 125.6145 },
    // Hospitals & Medical Centers
    { name: "Davao Doctors Hospital (DDH)", lat: 7.0703, lon: 125.6044 },
    { name: "San Pedro Hospital", lat: 7.0789, lon: 125.6150 },
    { name: "Brokenshire Medical Center", lat: 7.0745, lon: 125.5972 },
    { name: "Metro Davao Medical & Research Center (MDMRC)", lat: 7.0999, lon: 125.6201 },
    { name: "Adventist Hospital Davao (Bangkal)", lat: 7.0614, lon: 125.5610 },
    { name: "Lanang Premiere Doctors Hospital", lat: 7.0971, lon: 125.6333 },
    { name: "Tebow CURE Children's Hospital (Bajada)", lat: 7.0962, lon: 125.6184 },
    { name: "Malta Medical Center (Toril)", lat: 7.0195, lon: 125.4955 },
    // Malls & Commercial Hubs
    { name: "Gaisano Mall of Davao (GMall Bajada)", lat: 7.0780, lon: 125.6137 },
    { name: "Victoria Plaza / NCCC Mall VP", lat: 7.0866, lon: 125.6118 },
    { name: "NCCC Mall Buhangin", lat: 7.1106, lon: 125.6119 },
    { name: "Gaisano Grand Citimall (Ilustre)", lat: 7.0693, lon: 125.6064 },
    { name: "Gaisano Grand Citygate Mall (Buhangin)", lat: 7.1109, lon: 125.6119 },
    { name: "Gaisano Mall of Toril", lat: 7.0167, lon: 125.4939 },
    { name: "Sta. Lucia Mall Davao", lat: 7.1331, lon: 125.6421 },
    { name: "Felcris Centrale (Quimpo Blvd)", lat: 7.0595, lon: 125.6088 },
    { name: "Matina Town Square (MTS)", lat: 7.0638, lon: 125.5966 },
    { name: "S&R Membership Shopping (Matina)", lat: 7.0562, lon: 125.5924 },
    { name: "CityMall Northtown (Cabantian)", lat: 7.1310, lon: 125.6165 },
    { name: "Vista Mall Davao (Mintal / Tugbok)", lat: 7.0812, lon: 125.5125 },
    // IT Parks, Business Hubs & Estates
    { name: "Damosa Gateway / Damosa IT Park", lat: 7.1020, lon: 125.6325 },
    { name: "Azuela Cove (Lanang)", lat: 7.1023, lon: 125.6448 },
    { name: "Davao Park District (Lanang)", lat: 7.0978, lon: 125.6322 },
    { name: "Davao Global Township (DGT Matina)", lat: 7.0518, lon: 125.5965 },
    { name: "Matina Enclaves", lat: 7.0528, lon: 125.5938 },
    { name: "Pryce Business Park (Bajada)", lat: 7.0908, lon: 125.6118 },
    // Airport, Terminals & Ports
    { name: "Francisco Bangoy Int'l Airport (Davao Airport)", lat: 7.1253, lon: 125.6458 },
    { name: "Ecoland Bus Terminal (DCOTT)", lat: 7.0553, lon: 125.6012 },
    { name: "Sasa Ferry Wharf", lat: 7.1262, lon: 125.6620 },
    { name: "Sta. Ana Wharf", lat: 7.0767, lon: 125.6269 },
    // Parks, Markets, Civic & Major Barangays
    { name: "People's Park Davao", lat: 7.0706, lon: 125.6086 },
    { name: "San Pedro Cathedral", lat: 7.0647, lon: 125.6095 },
    { name: "Roxas Night Market", lat: 7.0704, lon: 125.6134 },
    { name: "Magsaysay Park", lat: 7.0744, lon: 125.6256 },
    { name: "Bankerohan Public Market", lat: 7.0687, lon: 125.6007 },
    { name: "Agdao Public Market", lat: 7.0817, lon: 125.6232 },
    { name: "Toril Public Market", lat: 7.0180, lon: 125.4982 },
    { name: "Mintal Public Market", lat: 7.0925, lon: 125.5020 },
    { name: "Ma-a Proper", lat: 7.0815, lon: 125.5880 },
    { name: "Bangkal / Central Park", lat: 7.0575, lon: 125.5765 },
    { name: "Catalunan Grande", lat: 7.0850, lon: 125.5480 },
    { name: "Catalunan Pequeno", lat: 7.0640, lon: 125.5420 },
    { name: "Talomo Proper", lat: 7.0465, lon: 125.5580 },
    { name: "Matina Aplaya", lat: 7.0485, lon: 125.5995 },
    { name: "Matina Pangi", lat: 7.0735, lon: 125.5845 },
    { name: "Cabantian (Buhangin)", lat: 7.1245, lon: 125.6120 },
    { name: "Indangan (Buhangin)", lat: 7.1510, lon: 125.5910 },
    { name: "Tibungco", lat: 7.1850, lon: 125.6550 },
    { name: "Bunawan", lat: 7.2320, lon: 125.6480 },
    { name: "Lasang", lat: 7.2600, lon: 125.6600 },
    { name: "Bago Oshiro (Tugbok)", lat: 7.0680, lon: 125.5090 }
  ];

  const mapContainer = document.getElementById("map");

  const mapState = {
    mode: "leaflet",
    leafletMap: null,
    tileLayer: null,
    tilesLoaded: 0,
    tileErrors: 0,
    layers: {
      rings: null,
      hubs: null,
      listings: null,
      target: null,
      route: null
    },
    target: { lat: DAVAO_CENTER.lat, lon: DAVAO_CENTER.lon, name: "UM Matina Campus" },
    hubs: [],
    results: [],
    listingMarkers: [],
    selectedIndex: -1,
    reopenIdx: -1,
    pickCallback: null,
    onTargetClick: null,
    onSelectListing: null,
    isSaved: null,
    toggleSaved: null
  };

  function walkMinutes(distanceM) {
    return Math.max(1, Math.round(Number(distanceM || 0) / WALK_M_PER_MIN));
  }

  function formatDistance(distanceM) {
    const m = Number(distanceM || 0);
    return m < 1000 ? m + " m away" : (m / 1000).toFixed(2) + " km away";
  }

  const DISTANCE_HINT = "Straight-line distance. Walking time is an estimate (about 80 m per minute); real routes may be longer.";

  // The ONE place that builds a Google Maps directions link (walking mode, from your pin).
  function directionsUrl(item) {
    const dest = Number(item.lat) + "," + Number(item.lon);
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest) +
      "&origin=" + encodeURIComponent(mapState.target.lat + "," + mapState.target.lon) +
      "&travelmode=walking";
  }

  function textEl(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  }

  function buildSaveButton(item) {
    const btn = textEl("button", "popup-btn popup-save", "");
    btn.type = "button";
    const paint = function () {
      const on = typeof mapState.isSaved === "function" && mapState.isSaved(item);
      btn.textContent = on ? "\u2665 Saved" : "\u2661 Save";
    };
    btn.addEventListener("click", function () {
      if (typeof mapState.toggleSaved === "function") {
        mapState.toggleSaved(item);
      }
      paint();
    });
    paint();
    return btn;
  }

  function buildPopupElement(item, rank) {
    const box = document.createElement("div");
    box.className = "map-popup";
    box.appendChild(textEl("h3", "", "#" + rank + " " + String(item.name || "Listing")));
    box.appendChild(textEl("p", "popup-price", "\u20B1" + Number(item.monthly_rent || 0).toLocaleString() + " per month"));
    box.appendChild(textEl("p", "", formatDistance(item.distance_m) + " \u00B7 ~" + walkMinutes(item.distance_m) + " min walk"));
    if (item.coord_accuracy === "street" || item.coord_accuracy === "approximate") {
      box.appendChild(textEl("p", "popup-approx", "Pin is approximate (street/area level)."));
    }
    box.appendChild(textEl("p", "", DISTANCE_HINT));

    const actions = textEl("div", "popup-actions", "");
    const dirLink = textEl("a", "popup-btn", "Directions");
    dirLink.href = directionsUrl(item);
    dirLink.target = "_blank";
    dirLink.rel = "noopener noreferrer";
    actions.appendChild(dirLink);
    actions.appendChild(buildSaveButton(item));
    box.appendChild(actions);
    return box;
  }

  function buildPinIcon(rank, item, isSelected) {
    const el = document.createElement("div");
    el.className = "map-pin";
    if (Number(item.available_slots) <= 0) {
      el.classList.add("pin-full");
    }
    if (item.stale) {
      el.classList.add("pin-stale");
    }
    if (isSelected) {
      el.classList.add("pin-selected");
    }
    el.textContent = String(rank);
    return L.divIcon({
      html: el,
      className: "map-pin-wrapper",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20]
    });
  }

  function buildClusterIcon(count) {
    const el = document.createElement("div");
    el.className = "map-pin pin-cluster";
    el.textContent = String(count);
    return L.divIcon({ html: el, className: "map-pin-wrapper", iconSize: [40, 40], iconAnchor: [20, 20] });
  }

  function buildTargetIcon() {
    const el = document.createElement("div");
    el.className = "map-target";
    el.appendChild(Object.assign(document.createElement("div"), { className: "map-target-pin" }));
    const label = document.createElement("span");
    label.className = "map-target-label";
    label.textContent = mapState.target.name === "Custom" ? "Your pin" : String(mapState.target.name).replace(/ Campus$/, "");
    el.appendChild(label);
    return L.divIcon({
      html: el,
      className: "map-pin-wrapper",
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  // The panel (left on desktop, bottom sheet on phones) and the search bar cover part of the map.
  // This is the strip that is really visible, so fitting and centering use it instead of the whole map.
  function coveredEdges() {
    const panel = document.getElementById("resultsSection");
    const box = panel ? panel.getBoundingClientRect() : null;
    const phone = window.matchMedia("(max-width: 767px)").matches;
    if (!box) {
      return { left: 0, bottom: 0, top: 90 };
    }
    return phone
      ? { left: 0, bottom: Math.round(window.innerHeight - box.top), top: 90 }
      : { left: Math.round(box.right), bottom: 0, top: 90 };
  }

  function handleCoordinatePick(lat, lon, label) {
    const clampedLat = Math.max(DAVAO_BOUNDS.lat_min, Math.min(DAVAO_BOUNDS.lat_max, lat));
    const clampedLon = Math.max(DAVAO_BOUNDS.lon_min, Math.min(DAVAO_BOUNDS.lon_max, lon));
    if (typeof mapState.pickCallback === "function") {
      const cb = mapState.pickCallback;
      setPickMode(false, null);
      cb(clampedLat, clampedLon);
      return;
    }
    if (typeof mapState.onTargetClick === "function") {
      mapState.onTargetClick(clampedLat, clampedLon, label);
    }
  }

  function initLeaflet() {
    if (typeof L === "undefined") {
      switchToOfflineSvg();
      return;
    }

    const bounds = L.latLngBounds(
      [DAVAO_BOUNDS.lat_min, DAVAO_BOUNDS.lon_min],
      [DAVAO_BOUNDS.lat_max, DAVAO_BOUNDS.lon_max]
    );

    const map = L.map(mapContainer, {
      center: [DAVAO_CENTER.lat, DAVAO_CENTER.lon],
      zoom: 13,
      minZoom: 10,
      maxZoom: 18,
      maxBounds: bounds.pad(0.08),
      zoomControl: false
    });
    L.control.zoom({ position: "topright" }).addTo(map);

    const tileLayer = L.tileLayer(OSM_TILE_URL, {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19
    });

    tileLayer.on("tileload", function () {
      mapState.tilesLoaded += 1;
    });

    tileLayer.on("tileerror", function () {
      mapState.tileErrors += 1;
      if (mapState.tilesLoaded === 0 && mapState.tileErrors >= 3 && mapState.mode === "leaflet") {
        switchToOfflineSvg();
      }
    });

    tileLayer.addTo(map);

    mapState.leafletMap = map;
    mapState.tileLayer = tileLayer;
    mapState.layers.rings = L.layerGroup().addTo(map);
    mapState.layers.hubs = L.layerGroup().addTo(map);
    mapState.layers.listings = L.layerGroup().addTo(map);
    mapState.layers.target = L.layerGroup().addTo(map);
    mapState.layers.route = L.layerGroup().addTo(map);

    map.on("click", function (ev) {
      handleCoordinatePick(ev.latlng.lat, ev.latlng.lng);
    });

    map.on("zoomend", function () {
      if (mapState.mode === "leaflet") {
        renderLeaflet();
      }
    });
  }

  function switchToOfflineSvg() {
    if (mapState.leafletMap) {
      mapState.leafletMap.remove();
      mapState.leafletMap = null;
    }
    mapState.mode = "svg";
    renderAll();
  }

  // Indexes of the FIT_NEAREST rooms closest to the pin (simple repeated pick; no array sort).
  function nearestIndexes() {
    const picked = [];
    const want = Math.min(FIT_NEAREST, mapState.results.length);
    while (picked.length < want) {
      let best = -1;
      for (let i = 0; i < mapState.results.length; i += 1) {
        if (picked.indexOf(i) === -1 && (best === -1 || mapState.results[i].distance_m < mapState.results[best].distance_m)) {
          best = i;
        }
      }
      picked.push(best);
    }
    return picked;
  }

  function drawRing() {
    const near = nearestIndexes();
    let radius = 300;
    for (let i = 0; i < near.length; i += 1) {
      radius = Math.max(radius, mapState.results[near[i]].distance_m);
    }
    L.circle([mapState.target.lat, mapState.target.lon], {
      radius: radius, color: "#0E6B73", weight: 1.5, dashArray: "5 6", fillOpacity: 0.04, interactive: false
    }).addTo(mapState.layers.rings);
  }

  // Landmark dots: shown only when zoomed in. Clicking one shows its name and a "Search here" button.
  function drawHubs(map) {
    if (map.getZoom() < HUB_MIN_ZOOM) {
      return;
    }
    mapState.hubs.forEach(function (hub) {
      const dot = L.circleMarker([hub.lat, hub.lon], {
        radius: 6, color: "#ffffff", weight: 1.5, fillColor: "#7c3aed", fillOpacity: 0.9
      });
      const box = textEl("div", "map-popup", "");
      box.appendChild(textEl("h3", "", hub.name));
      const here = textEl("button", "popup-btn", "Search here");
      here.type = "button";
      here.addEventListener("click", function () {
        map.closePopup();
        handleCoordinatePick(hub.lat, hub.lon, hub.name);
      });
      box.appendChild(here);
      dot.bindPopup(box);
      dot.addTo(mapState.layers.hubs);
    });
  }

  // Simple grid clustering: rooms whose pins land in the same 44px square become one bubble.
  function groupResults(map) {
    const cells = {};
    const groups = [];
    const canCluster = map.getZoom() < MAX_CLUSTER_ZOOM;
    for (let idx = 0; idx < mapState.results.length; idx += 1) {
      if (!canCluster || idx === mapState.selectedIndex) {
        groups.push([idx]);
        continue;
      }
      const p = map.latLngToContainerPoint([mapState.results[idx].lat, mapState.results[idx].lon]);
      const key = Math.floor(p.x / CLUSTER_CELL_PX) + ":" + Math.floor(p.y / CLUSTER_CELL_PX);
      if (!cells[key]) {
        cells[key] = [];
        groups.push(cells[key]);
      }
      cells[key].push(idx);
    }
    return groups;
  }

  function addSinglePin(idx) {
    const item = mapState.results[idx];
    const rank = idx + 1;
    const marker = L.marker([item.lat, item.lon], { icon: buildPinIcon(rank, item, idx === mapState.selectedIndex) });
    marker.bindPopup(buildPopupElement(item, rank), { maxWidth: 260, minWidth: 190, autoPan: true, autoPanPadding: [30, 30], keepInView: true });
    marker.on("click", function () {
      mapState.selectedIndex = idx;
      drawRoute();
      if (typeof mapState.onSelectListing === "function") {
        mapState.onSelectListing(idx);
      }
    });
    marker.addTo(mapState.layers.listings);
    mapState.listingMarkers[idx] = marker;
  }

  function addClusterPin(group) {
    const bounds = L.latLngBounds([]);
    group.forEach(function (idx) {
      bounds.extend([mapState.results[idx].lat, mapState.results[idx].lon]);
    });
    const marker = L.marker(bounds.getCenter(), { icon: buildClusterIcon(group.length) });
    marker.bindTooltip(group.length + " rooms here. Tap to zoom in.");
    marker.on("click", function () {
      fitVisible(bounds, MAX_CLUSTER_ZOOM);
    });
    marker.addTo(mapState.layers.listings);
  }

  function renderLeaflet() {
    const map = mapState.leafletMap;
    if (!map) {
      return;
    }
    ["rings", "hubs", "listings", "target", "route"].forEach(function (name) {
      mapState.layers[name].clearLayers();
    });
    mapState.listingMarkers = [];

    drawRing();
    drawHubs(map);

    const targetMarker = L.marker([mapState.target.lat, mapState.target.lon], { icon: buildTargetIcon() });
    targetMarker.bindTooltip("Your pin");
    targetMarker.addTo(mapState.layers.target);

    groupResults(map).forEach(function (group) {
      if (group.length === 1) {
        addSinglePin(group[0]);
      } else {
        addClusterPin(group);
      }
    });
    drawRoute();

    if (mapState.reopenIdx >= 0 && mapState.listingMarkers[mapState.reopenIdx]) {
      mapState.listingMarkers[mapState.reopenIdx].openPopup();
    }
    mapState.reopenIdx = -1;
  }

  function routeIndex() {
    if (mapState.results.length === 0) {
      return -1;
    }
    return mapState.selectedIndex >= 0 ? mapState.selectedIndex : 0;
  }

  function drawRoute() {
    if (!mapState.leafletMap || !mapState.layers.route) {
      return;
    }
    mapState.layers.route.clearLayers();
    const ri = routeIndex();
    if (ri < 0) {
      return;
    }
    const item = mapState.results[ri];
    L.polyline(
      [[mapState.target.lat, mapState.target.lon], [item.lat, item.lon]],
      { color: "#1d4ed8", weight: 4, dashArray: "8 8", opacity: 0.85, interactive: false }
    ).addTo(mapState.layers.route);
  }

  function projectToMeters(lat, lon, lat0, lon0) {
    const cosLat0 = Math.cos((lat0 * Math.PI) / 180);
    const x = (lon - lon0) * cosLat0 * 111320;
    const y = -(lat - lat0) * 110540;
    return { x: x, y: y };
  }

  function unprojectFromMeters(x, y, lat0, lon0) {
    const cosLat0 = Math.cos((lat0 * Math.PI) / 180) || 1;
    const lon = lon0 + x / (cosLat0 * 111320);
    const lat = lat0 - y / 110540;
    return { lat: lat, lon: lon };
  }

  function createSvgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    const keys = Object.keys(attrs || {});
    for (let i = 0; i < keys.length; i += 1) {
      el.setAttribute(keys[i], String(attrs[keys[i]]));
    }
    return el;
  }

  function renderOfflineSvg() {
    mapContainer.textContent = "";

    const width = mapContainer.clientWidth || 720;
    const height = mapContainer.clientHeight || 360;
    const lat0 = mapState.target.lat;
    const lon0 = mapState.target.lon;

    let maxMeters = 3500;
    for (let i = 0; i < mapState.results.length; i += 1) {
      const p = projectToMeters(mapState.results[i].lat, mapState.results[i].lon, lat0, lon0);
      const d = Math.hypot(p.x, p.y);
      if (d * 1.15 > maxMeters) {
        maxMeters = d * 1.15;
      }
    }
    if (maxMeters > 35000) {
      maxMeters = 35000;
    }

    const halfMinPx = Math.min(width, height) * 0.44;
    const pxPerMeter = halfMinPx / maxMeters;
    const cx = width / 2;
    const cy = height / 2;

    const svg = createSvgEl("svg", {
      class: "svg-map",
      viewBox: "0 0 " + width + " " + height
    });

    // Subtle 1 km grid lines
    const stepPx = 1000 * pxPerMeter;
    if (stepPx >= 18) {
      for (let gx = cx % stepPx; gx < width; gx += stepPx) {
        svg.appendChild(createSvgEl("line", {
          x1: gx, y1: 0, x2: gx, y2: height, stroke: "#e2e8f0", "stroke-width": 1
        }));
      }
      for (let gy = cy % stepPx; gy < height; gy += stepPx) {
        svg.appendChild(createSvgEl("line", {
          x1: 0, y1: gy, x2: width, y2: gy, stroke: "#e2e8f0", "stroke-width": 1
        }));
      }
    }

    // Distance rings
    for (let r = 0; r < RING_RADII_KM.length; r += 1) {
      const km = RING_RADII_KM[r];
      const radPx = km * 1000 * pxPerMeter;
      svg.appendChild(createSvgEl("circle", {
        cx: cx,
        cy: cy,
        r: radPx,
        fill: "none",
        stroke: "#60a5fa",
        "stroke-width": 1,
        "stroke-dasharray": "4 4"
      }));
      const lbl = createSvgEl("text", {
        x: cx + 4,
        y: cy - radPx + 12,
        fill: "#3b82f6",
        "font-size": 11
      });
      lbl.textContent = km + " km";
      svg.appendChild(lbl);
    }

    // Hubs
    for (let h = 0; h < mapState.hubs.length; h += 1) {
      const hub = mapState.hubs[h];
      const hp = projectToMeters(hub.lat, hub.lon, lat0, lon0);
      const hx = cx + hp.x * pxPerMeter;
      const hy = cy + hp.y * pxPerMeter;
      if (hx >= 0 && hx <= width && hy >= 0 && hy <= height) {
        const dot = createSvgEl("circle", {
          cx: hx, cy: hy, r: 4, fill: "#7c3aed", stroke: "#ffffff", "stroke-width": 1
        });
        const titleEl = createSvgEl("title", {});
        titleEl.textContent = hub.name;
        dot.appendChild(titleEl);
        svg.appendChild(dot);
      }
    }

    // Target pin
    svg.appendChild(createSvgEl("circle", {
      cx: cx, cy: cy, r: 7, fill: "#1B5FD1", stroke: "#ffffff", "stroke-width": 2
    }));

    // Dashed route line to selected (or #1) listing
    const ri = routeIndex();
    if (ri >= 0) {
      const rp = projectToMeters(mapState.results[ri].lat, mapState.results[ri].lon, lat0, lon0);
      svg.appendChild(createSvgEl("line", {
        x1: cx, y1: cy, x2: cx + rp.x * pxPerMeter, y2: cy + rp.y * pxPerMeter,
        stroke: "#1d4ed8", "stroke-width": 3, "stroke-dasharray": "8 8"
      }));
    }

    // Ranked listings
    for (let idx = 0; idx < mapState.results.length; idx += 1) {
      const item = mapState.results[idx];
      const lp = projectToMeters(item.lat, item.lon, lat0, lon0);
      const lx = cx + lp.x * pxPerMeter;
      const ly = cy + lp.y * pxPerMeter;
      const rank = idx + 1;
      const isSelected = idx === mapState.selectedIndex;

      const group = createSvgEl("g", { class: "svg-pin-group" });
      const fill = Number(item.available_slots) > 0 ? "#1D2B36" : "#707A82";
      const stroke = item.stale ? "#C77700" : (isSelected ? "#1B5FD1" : "#ffffff");
      const strokeW = item.stale || isSelected ? 3 : 2;

      group.appendChild(createSvgEl("circle", {
        cx: lx,
        cy: ly,
        r: isSelected ? 14 : 11,
        fill: fill,
        stroke: stroke,
        "stroke-width": strokeW
      }));

      const num = createSvgEl("text", {
        x: lx,
        y: ly + 4,
        "text-anchor": "middle",
        fill: "#ffffff",
        "font-size": 11,
        "font-weight": "bold"
      });
      num.textContent = String(rank);
      group.appendChild(num);

      const tip = createSvgEl("title", {});
      tip.textContent = "#" + rank + " " + String(item.name || "") + " (PHP " + item.monthly_rent + ")";
      group.appendChild(tip);

      group.addEventListener("click", function (ev) {
        ev.stopPropagation();
        mapState.selectedIndex = idx;
        renderOfflineSvg();
        if (typeof mapState.onSelectListing === "function") {
          mapState.onSelectListing(idx);
        }
      });

      svg.appendChild(group);
    }

    // 1 km scale bar
    const barPx = 1000 * pxPerMeter;
    const barY = height - 18;
    const barX = 16;
    svg.appendChild(createSvgEl("line", {
      x1: barX, y1: barY, x2: barX + barPx, y2: barY, stroke: "#0f172a", "stroke-width": 2.5
    }));
    const barLbl = createSvgEl("text", {
      x: barX, y: barY - 6, fill: "#0f172a", "font-size": 11, "font-weight": "bold"
    });
    barLbl.textContent = "1 km";
    svg.appendChild(barLbl);

    svg.addEventListener("click", function (ev) {
      const rect = svg.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const mx = (px - cx) / pxPerMeter;
      const my = (py - cy) / pxPerMeter;
      const coords = unprojectFromMeters(mx, my, lat0, lon0);
      handleCoordinatePick(coords.lat, coords.lon);
    });

    mapContainer.appendChild(svg);
  }

  function renderAll() {
    if (mapState.mode === "leaflet" && mapState.leafletMap) {
      renderLeaflet();
    } else {
      renderOfflineSvg();
    }
  }

  function setHubs(hubs) {
    const base = Array.isArray(hubs) ? hubs.slice() : [];
    const seen = {};
    for (let i = 0; i < base.length; i += 1) {
      seen[String(base[i].name).toLowerCase()] = true;
    }
    for (let j = 0; j < EXTRA_DAVAO_LANDMARKS.length; j += 1) {
      const extra = EXTRA_DAVAO_LANDMARKS[j];
      if (!seen[extra.name.toLowerCase()]) {
        base.push(extra);
        seen[extra.name.toLowerCase()] = true;
      }
    }
    mapState.hubs = base;
    renderAll();
  }

  function updateView(target, results) {
    if (target && typeof target.lat === "number" && typeof target.lon === "number") {
      mapState.target = {
        lat: target.lat,
        lon: target.lon,
        name: target.name || "Custom"
      };
    }
    mapState.results = Array.isArray(results) ? results : [];
    mapState.selectedIndex = -1;
    mapState.reopenIdx = -1;
    renderAll();
    fitToContent();
  }

  function fitToContent() {
    const map = mapState.leafletMap;
    if (mapState.mode !== "leaflet" || !map) {
      return;
    }
    map.invalidateSize();
    const bounds = L.latLngBounds([[mapState.target.lat, mapState.target.lon]]);
    nearestIndexes().forEach(function (idx) {
      bounds.extend([mapState.results[idx].lat, mapState.results[idx].lon]);
    });
    if (mapState.results.length === 0) {
      map.setView([mapState.target.lat, mapState.target.lon], 14);
      centerInVisible();
    } else {
      fitVisible(bounds, 16);
    }
  }

  function fitVisible(bounds, maxZoom) {
    const c = coveredEdges();
    mapState.leafletMap.fitBounds(bounds, {
      paddingTopLeft: [c.left + 40, c.top],
      paddingBottomRight: [50, c.bottom + 40],
      maxZoom: maxZoom
    });
  }

  // Move the view so the current center sits in the middle of the uncovered part of the map.
  function centerInVisible() {
    const c = coveredEdges();
    mapState.leafletMap.panBy([-c.left / 2, (c.bottom - c.top) / 2], { animate: false });
  }

  function focusListing(index) {
    if (index < 0 || index >= mapState.results.length) {
      return;
    }
    mapState.selectedIndex = index;
    if (mapState.mode === "leaflet" && mapState.leafletMap) {
      const item = mapState.results[index];
      mapState.reopenIdx = index;
      mapState.leafletMap.setView([item.lat, item.lon], Math.max(mapState.leafletMap.getZoom(), 16), { animate: false });
      centerInVisible();
      if (mapState.reopenIdx >= 0) {
        renderAll();  // the zoom did not change, so redraw here (this also opens the popup)
      }
    } else {
      renderAll();
    }
  }

  function setPickMode(enabled, callback) {
    mapState.pickCallback = enabled ? callback : null;
    if (enabled) {
      mapContainer.classList.add("is-picking");
    } else {
      mapContainer.classList.remove("is-picking");
    }
  }

  function setHandlers(handlers) {
    if (handlers) {
      mapState.onTargetClick = handlers.onTargetClick || null;
      mapState.onSelectListing = handlers.onSelectListing || null;
      mapState.isSaved = handlers.isSaved || null;
      mapState.toggleSaved = handlers.toggleSaved || null;
    }
  }

  /* ---------- place search: local index first, then Photon / Nominatim ---------- */

  const PHOTON_BASE =
    "https://photon.komoot.io/api/?limit=8&lat=7.07&lon=125.61&bbox=125.20,6.90,125.75,7.60&q=";
  const MIN_REQUEST_GAP_MS = 250;     // never call an online service more than once per 250 ms
  const MAX_SUGGESTIONS = 8;

  // alias -> a whole-word fragment of the place name it stands for (matched against the normalized name)
  const PLACE_ALIASES = {
    "um": "um", "university of mindanao": "um",
    "addu": "ateneo de davao", "ateneo": "ateneo de davao",
    "spc": "san pedro college", "spmc": "spmc",
    "usep": "usep", "university of southeastern philippines": "usep",
    "up mindanao": "up mindanao", "upmin": "up mindanao", "upm": "up mindanao",
    "ddc": "davao doctors", "hcdc": "holy cross",
    "sm": "sm", "sm city": "sm city davao", "sm lanang": "sm lanang",
    "abreeza": "abreeza", "gaisano": "gaisano", "nccc": "nccc", "roxas": "roxas",
    "uic": "uic", "bangkal": "bangkal", "maa": "ma a",
    "matina": "matina", "toril": "toril", "mintal": "mintal", "buhangin": "buhangin",
    "obrero": "obrero", "bajada": "bajada", "agdao": "agdao", "lanang": "lanang",
    "sasa": "sasa", "panacan": "panacan"
  };

  // Barangay centers. Every coordinate here is one already used elsewhere in this project; others are left to the online search.
  const DAVAO_BARANGAYS = [
    { name: "Agdao", lat: 7.0817, lon: 125.6232 },
    { name: "Bajada", lat: 7.0915, lon: 125.6114 },
    { name: "Lanang", lat: 7.0990, lon: 125.6305 },
    { name: "Matina", lat: 7.0657, lon: 125.5966 },
    { name: "Obrero", lat: 7.0861, lon: 125.6169 },
    { name: "Buhangin", lat: 7.0980, lon: 125.6190 },
    { name: "Talomo", lat: 7.0465, lon: 125.5580 },
    { name: "Bangkal", lat: 7.0575, lon: 125.5765 },
    { name: "Ma-a", lat: 7.0815, lon: 125.5880 },
    { name: "Toril", lat: 7.0185, lon: 125.4970 },
    { name: "Mintal", lat: 7.0848, lon: 125.4843 },
    { name: "Calinan", lat: 7.1880, lon: 125.4510 },
    { name: "Sasa", lat: 7.1262, lon: 125.6620 },
    { name: "Panacan", lat: 7.1515, lon: 125.6587 }
  ];

  // lower case, no accents, punctuation turned into spaces: "Ma-a" -> "ma a"
  function normalizeText(text) {
    return String(text || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function primaryName(name) {
    return normalizeText(String(name).replace(/\(.*?\)/g, ""));
  }

  function aliasWordsFor(normName) {
    const padded = " " + normName + " ";
    let extra = "";
    Object.keys(PLACE_ALIASES).forEach(function (alias) {
      if (padded.indexOf(" " + PLACE_ALIASES[alias] + " ") !== -1) {
        extra += " " + alias;
      }
    });
    return extra;
  }

  function makeEntry(name, sub, lat, lon, order) {
    const norm = normalizeText(name);
    const words = (norm + aliasWordsFor(norm) + " " + normalizeText(sub)).split(" ");
    return { name: name, sub: sub, lat: Number(lat), lon: Number(lon), norm: norm, words: words, order: order };
  }

  // one letter wrong, missing or extra still counts: "ateno" ~ "ateneo"
  function oneEditAway(a, b) {
    if (Math.abs(a.length - b.length) > 1) {
      return false;
    }
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
      i += 1;
    }
    if (i === a.length || i === b.length) {
      return true;
    }
    return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
  }

  // cost of matching one typed word against a place's words: 0 exact, 1 prefix, 2 typo, -1 no match
  function wordCost(token, words) {
    let best = -1;
    for (let i = 0; i < words.length; i += 1) {
      const w = words[i];
      let cost = -1;
      if (w === token) {
        cost = 0;
      } else if (w.indexOf(token) === 0) {
        cost = 1;
      } else if (token.length >= 4 && (oneEditAway(token, w) || oneEditAway(token, w.slice(0, token.length)))) {
        cost = 2;
      }
      if (cost !== -1 && (best === -1 || cost < best)) {
        best = cost;
      }
    }
    return best;
  }

  // lower score = better. Exact and prefix matches come before partial ones, typos come last.
  function scoreEntry(entry, query, tokens) {
    let sum = 0;
    for (let i = 0; i < tokens.length; i += 1) {
      const c = wordCost(tokens[i], entry.words);
      if (c === -1) {
        return -1;
      }
      sum += c;
    }
    let tier = 2;                                    // every word matches the start of some word
    if (entry.norm === query || (tokens.length === 1 && sum === 0)) {
      tier = 0;                                      // exact name or exact alias
    } else if (entry.norm.indexOf(query) === 0) {
      tier = 1;                                      // name starts with what was typed
    } else if (sum >= tokens.length * 2) {
      tier = 3;                                      // only typo matches
    }
    return tier * 100 + sum * 10 + entry.order + Math.min(entry.norm.length, 99) / 100;
  }

  function distanceMeters(a, b) {
    const dLat = (a.lat - b.lat) * 111320;
    const dLon = (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }

  function inDavaoBox(lat, lon) {
    return lat >= DAVAO_BOUNDS.lat_min && lat <= DAVAO_BOUNDS.lat_max &&
      lon >= DAVAO_BOUNDS.lon_min && lon <= DAVAO_BOUNDS.lon_max;
  }

  // Merge lists in order, dropping a place that has the same name as an earlier one within ~100 m.
  function mergeSuggestions(lists) {
    const out = [];
    lists.forEach(function (list) {
      list.forEach(function (p) {
        const key = primaryName(p.name);
        const dup = out.some(function (q) { return primaryName(q.name) === key && distanceMeters(p, q) < 100; });
        if (!dup) {
          out.push(p);
        }
      });
    });
    return out.slice(0, MAX_SUGGESTIONS);
  }

  // Instant, offline-safe matches from landmarks, barangays and the loaded listings.
  function searchLocal(query, listings) {
    const q = normalizeText(query);
    if (q.length < 2) {
      return [];
    }
    const tokens = q.split(" ");
    const entries = [];
    mapState.hubs.forEach(function (h) { entries.push(makeEntry(h.name, "Davao City", h.lat, h.lon, 0)); });
    DAVAO_BARANGAYS.forEach(function (b) { entries.push(makeEntry(b.name, "Barangay, Davao City", b.lat, b.lon, 1)); });
    (listings || []).forEach(function (l) {
      const lat = Number(l.lat);
      const lon = Number(l.lon);
      if (l.name && isFinite(lat) && isFinite(lon)) {
        entries.push(makeEntry(l.name, l.address || "Room listing", lat, lon, 2));
      }
    });
    const scored = [];
    entries.forEach(function (e) {
      const s = scoreEntry(e, q, tokens);
      if (s !== -1) {
        scored.push({ score: s, place: { name: e.name, sub: e.sub, lat: e.lat, lon: e.lon, source: "local" } });
      }
    });
    // typo-only matches are a last resort: hide them when something matches properly
    const proper = scored.filter(function (x) { return x.score < 300; });
    const pool = proper.length > 0 ? proper : scored;
    // insertion sort (the project does not use the built-in sort)
    for (let i = 1; i < pool.length; i += 1) {
      const item = pool[i];
      let j = i - 1;
      while (j >= 0 && pool[j].score > item.score) {
        pool[j + 1] = pool[j];
        j -= 1;
      }
      pool[j + 1] = item;
    }
    return mergeSuggestions([pool.map(function (x) { return x.place; })]);
  }

  function photonPlace(f) {
    const p = f.properties || {};
    const c = (f.geometry && f.geometry.coordinates) || [];
    const name = p.name || p.street || "";
    if (!name || c.length < 2) {
      return null;
    }
    const sub = [p.street && p.street !== name ? p.street : "", p.suburb || p.district, p.city || p.county]
      .filter(Boolean).join(", ");
    return { name: name, sub: sub || "Davao City", lat: Number(c[1]), lon: Number(c[0]), source: "photon" };
  }

  function nominatimPlace(r) {
    const parts = String(r.display_name || "").split(",").map(function (s) { return s.trim(); });
    const name = r.name || parts[0];
    if (!name) {
      return null;
    }
    return { name: name, sub: parts.slice(1, 3).join(", ") || "Davao City", lat: Number(r.lat), lon: Number(r.lon), source: "nominatim" };
  }

  let nextOnlineAt = 0;

  // Space online requests at least 250 ms apart. Rejects with AbortError if the caller cancels meanwhile.
  function waitForTurn(signal) {
    const wait = Math.max(nextOnlineAt - Date.now(), 0);
    nextOnlineAt = Date.now() + wait + MIN_REQUEST_GAP_MS;
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(resolve, wait);
      signal.addEventListener("abort", function () {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }

  async function getJson(url, signal) {
    const resp = await fetch(url, { headers: { Accept: "application/json" }, signal: signal });
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }
    return resp.json();
  }

  // Online fallback. Typing uses Photon only; the Search button also asks Nominatim (options.nominatim),
  // because Nominatim's usage policy does not allow search-as-you-type.
  // Resolves { places, failed }. An abort rejects so the caller can drop the stale answer.
  async function searchOnline(query, signal, options) {
    const q = String(query || "").trim();
    await waitForTurn(signal);
    const jobs = [getJson(PHOTON_BASE + encodeURIComponent(q), signal).then(function (data) {
      return (data.features || []).map(photonPlace);
    })];
    if (options && options.nominatim) {
      jobs.push(getJson(NOMINATIM_BASE + encodeURIComponent(q), signal).then(function (data) {
        return Array.isArray(data) ? data.map(nominatimPlace) : [];
      }));
    }
    const settled = await Promise.allSettled(jobs);
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const lists = [];
    let failed = 0;
    settled.forEach(function (s) {
      if (s.status === "fulfilled") {
        lists.push(s.value.filter(function (p) { return p && inDavaoBox(p.lat, p.lon); }));
      } else {
        failed += 1;
      }
    });
    return { places: mergeSuggestions(lists), failed: failed === settled.length };
  }

  initLeaflet();

  window.BoardMap = {
    directionsUrl: directionsUrl,
    refit: fitToContent,
    formatDistance: formatDistance,
    walkMinutes: walkMinutes,
    distanceHint: DISTANCE_HINT,
    setHubs: setHubs,
    updateView: updateView,
    focusListing: focusListing,
    setPickMode: setPickMode,
    setHandlers: setHandlers,
    searchLocal: searchLocal,
    searchOnline: searchOnline,
    mergeSuggestions: mergeSuggestions,
    placeAliases: PLACE_ALIASES
  };
})();