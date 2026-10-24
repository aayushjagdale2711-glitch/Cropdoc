document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  /* ============================================================
     CONFIG
     ============================================================ */

  const API_ENDPOINT = "/api/diagnose";
  const FOLLOWUP_ENDPOINT = "/api/followup";
  const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
  const GEOCODE_ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";
  const IP_GEOLOCATION_ENDPOINT = "https://ipapi.co/json/";
  const PDF_LIBRARY_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

  /* ============================================================
     DOM REFERENCES
     ============================================================ */

  // Upload
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-btn");

  // Tabs
  const tabUploadBtn = document.getElementById("tab-upload-btn");
  const tabCameraBtn = document.getElementById("tab-camera-btn");
  const tabIndicator = document.getElementById("tab-indicator");
  const uploadModeContainer = document.getElementById("upload-mode-container");
  const cameraModeContainer = document.getElementById("camera-mode-container");

  // Camera
  const cameraViewport = document.getElementById("camera-viewport-container");
  const cameraStream = document.getElementById("camera-stream");
  const cameraCanvas = document.getElementById("camera-canvas");
  const cameraPlaceholder = document.getElementById("camera-placeholder");
  const cameraFlash = document.getElementById("camera-flash");
  const startCameraBtn = document.getElementById("start-camera-btn");
  const stopCameraBtn = document.getElementById("stop-camera-btn");
  const switchCameraBtn = document.getElementById("switch-camera-btn");
  const shutterBtn = document.getElementById("shutter-btn");

  // Preview
  const previewContainer = document.getElementById("preview-container");
  const imagePreview = document.getElementById("image-preview");
  const fileName = document.getElementById("file-name");
  const removeBtn = document.getElementById("remove-btn");

  // Context
  const descriptionInput = document.getElementById("description-input");
  const charCount = document.getElementById("char-count");
  const quickChips = document.querySelectorAll(".quick-chips .chip");

  // Analyze
  const analyzeBtn = document.getElementById("analyze-btn");
  const btnText = document.getElementById("btn-text");
  const analysisProgress = document.getElementById("analysis-progress");
  const progressFill = document.getElementById("progress-fill");
  const progressLabel = document.getElementById("progress-label");

  // Results
  const resultsSection = document.getElementById("results-section");
  const resultsContent = document.getElementById("results-content");
  const scanAgainBtn = document.getElementById("scan-again-btn");

  // Follow-up chat
  const followupContainer = document.getElementById("followup-container");
  const chatThread = document.getElementById("chat-thread");
  const followupForm = document.getElementById("followup-input-form");
  const followupField = document.getElementById("followup-text-field");
  const sendFollowupBtn = document.getElementById("send-followup-btn");
  const chatSuggestions = document.getElementById("chat-suggestions");

  // Theme / weather
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");
  const weatherWidget = document.getElementById("weather-widget");
  const weatherIcon = document.getElementById("weather-icon");
  const weatherTemp = document.getElementById("weather-temp");
  const weatherLocation = document.getElementById("weather-location");
  const fieldAdvisory = document.getElementById("field-advisory");
  const advisoryIcon = document.getElementById("advisory-icon");
  const advisoryTitle = document.getElementById("advisory-title");
  const advisoryText = document.getElementById("advisory-text");

  // Misc
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toast-message");
  const scrollTopBtn = document.getElementById("scroll-top-btn");

  /* ============================================================
     STATE
     ============================================================ */

  let currentFile = null;
  let currentDiagnosisData = null;
  let currentImageBase64 = null;
  let currentImageMime = null;
  let toastTimeout = null;

  let activeStream = null;
  let facingMode = "environment";

  let chatHistory = [];
  let chatBusy = false;

  let weatherState = null;
  let themeManuallySet = false;
  let progressTimer = null;

  /* ============================================================
     SMALL UTILITIES
     ============================================================ */

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* ignore */
    }
  }

  function createLucideIcon(iconName, className = "") {
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", iconName);
    if (className) icon.className = className;
    return icon;
  }

  function clearContainer(container) {
    if (container) container.replaceChildren();
  }

  function extractBase64FromDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return { base64: null, mime: null };
    }
    const [meta, encoded] = dataUrl.split(",");
    const match = meta.match(/data:(.*?);/);
    return {
      base64: encoded || null,
      mime: match ? match[1] : null
    };
  }

  /* ============================================================
     THEME : DAY / NIGHT
     ============================================================ */

  function getTimeBasedTheme() {
    const hour = new Date().getHours();
    return hour >= 6 && hour < 18 ? "day" : "night";
  }

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute("data-theme", theme);

    if (themeIcon) {
      themeIcon.setAttribute("data-lucide", theme === "day" ? "sun" : "moon");
      lucide.createIcons();
    }

    if (persist) {
      safeSet("cropscan-theme", theme);
      safeSet("cropscan-theme-manual", "1");
      themeManuallySet = true;
    }

    refreshWeatherVisual();
  }

  (function initTheme() {
    const manual = safeGet("cropscan-theme-manual") === "1";
    const stored = safeGet("cropscan-theme");

    themeManuallySet = manual;

    if (manual && stored) {
      applyTheme(stored, false);
    } else {
      applyTheme(getTimeBasedTheme(), false);
    }
  })();

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "day" ? "night" : "day";
      applyTheme(next, true);
      showToast(
        next === "day" ? "Day mode enabled." : "Night mode enabled.",
        "success"
      );
    });
  }

  setInterval(() => {
    if (!themeManuallySet) applyTheme(getTimeBasedTheme(), false);
  }, 300000);

  /* ============================================================
     WEATHER
     ============================================================ */

  function mapWeatherCode(code, isNight) {
    const c = Number(code);

    if (c === 0) {
      return isNight
        ? { icon: "moon", label: "Clear night", cls: "w-night", body: "" }
        : { icon: "sun", label: "Clear sky", cls: "w-clear", body: "" };
    }

    if (c === 1 || c === 2) {
      return isNight
        ? { icon: "cloud-moon", label: "Partly cloudy", cls: "w-night", body: "weather-cloud" }
        : { icon: "cloud-sun", label: "Partly cloudy", cls: "w-clear", body: "weather-cloud" };
    }

    if (c === 3) {
      return { icon: "cloudy", label: "Overcast", cls: "w-cloud", body: "weather-cloud" };
    }

    if (c === 45 || c === 48) {
      return { icon: "cloud-fog", label: "Fog", cls: "w-fog", body: "weather-fog" };
    }

    if ([51, 53, 55, 56, 57].includes(c)) {
      return { icon: "cloud-drizzle", label: "Drizzle", cls: "w-rain", body: "weather-rain" };
    }

    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) {
      return { icon: "cloud-rain", label: "Rain", cls: "w-rain", body: "weather-rain" };
    }

    if ([71, 73, 75, 77, 85, 86].includes(c)) {
      return { icon: "cloud-snow", label: "Snow", cls: "w-snow", body: "weather-snow" };
    }

    if ([95, 96, 99].includes(c)) {
      return { icon: "cloud-lightning", label: "Thunderstorm", cls: "w-storm", body: "weather-storm" };
    }

    return { icon: "cloud-sun", label: "Weather", cls: "w-clear", body: "" };
  }

  function buildAdvisory(w) {
    if (!w) {
      return {
        tone: "",
        icon: "cloud-sun",
        title: "Field conditions unavailable",
        text: "Weather data could not be loaded. Click the weather widget to retry."
      };
    }

    const code = Number(w.code);
    const wind = Number(w.wind) || 0;
    const humidity = Number(w.humidity);
    const temp = Number(w.temp);

    if ([95, 96, 99].includes(code)) {
      return {
        tone: "tone-bad",
        icon: "cloud-lightning",
        title: "Storm warning — avoid field work",
        text: "Thunderstorms nearby. Postpone spraying and secure equipment."
      };
    }

    if ([61, 63, 65, 66, 67, 80, 81, 82, 51, 53, 55].includes(code)) {
      return {
        tone: "tone-bad",
        icon: "cloud-rain",
        title: "Rain detected — do not spray now",
        text: "Rainfall will wash off foliar treatments. Wait for a dry window of 4–6 hours."
      };
    }

    if (code === 45 || code === 48) {
      return {
        tone: "tone-warn",
        icon: "cloud-fog",
        title: "Foggy conditions — high fungal risk",
        text: "Prolonged leaf wetness favours fungal disease. Scout lower canopy closely."
      };
    }

    if (wind > 20) {
      return {
        tone: "tone-warn",
        icon: "wind",
        title: "Windy — spray drift risk",
        text: `Wind at ${Math.round(wind)} km/h. Delay spraying until it drops below 15 km/h.`
      };
    }

    if (!Number.isNaN(humidity) && humidity >= 85) {
      return {
        tone: "tone-warn",
        icon: "droplets",
        title: "High humidity — disease pressure rising",
        text: `Humidity at ${Math.round(humidity)}%. Improve airflow and inspect for mildew or blight.`
      };
    }

    if (!Number.isNaN(temp) && temp >= 36) {
      return {
        tone: "tone-warn",
        icon: "thermometer-sun",
        title: "Heat stress likely",
        text: `${Math.round(temp)}°C recorded. Irrigate early morning and avoid midday chemical application.`
      };
    }

    if (!Number.isNaN(temp) && temp <= 5) {
      return {
        tone: "tone-info",
        icon: "snowflake",
        title: "Cold stress risk",
        text: `${Math.round(temp)}°C recorded. Protect sensitive seedlings from frost damage overnight.`
      };
    }

    return {
      tone: "",
      icon: "sun",
      title: "Good conditions for field work",
      text: "Calm, dry weather — a suitable window for scouting, spraying, and photographing crops."
    };
  }

  function refreshWeatherVisual() {
    if (!weatherState || !weatherWidget) return;

    const isNight = document.documentElement.getAttribute("data-theme") === "night";
    const info = mapWeatherCode(weatherState.code, isNight);

    weatherWidget.classList.remove(
      "is-loading",
      "w-clear",
      "w-cloud",
      "w-rain",
      "w-storm",
      "w-snow",
      "w-fog",
      "w-night"
    );
    weatherWidget.classList.add(info.cls);

    if (weatherIcon) {
      weatherIcon.setAttribute("data-lucide", info.icon);
      lucide.createIcons();
    }

    if (weatherTemp) {
      weatherTemp.textContent = `${Math.round(weatherState.temp)}°C`;
    }

    if (weatherLocation) {
      weatherLocation.textContent = `${info.label} • ${weatherState.place}`;
    }

    document.body.classList.remove(
      "weather-rain",
      "weather-storm",
      "weather-snow",
      "weather-fog",
      "weather-cloud"
    );
    if (info.body) document.body.classList.add(info.body);

    const adv = buildAdvisory(weatherState);

    if (fieldAdvisory) {
      fieldAdvisory.classList.remove("tone-warn", "tone-bad", "tone-info");
      if (adv.tone) fieldAdvisory.classList.add(adv.tone);
    }

    if (advisoryIcon) {
      advisoryIcon.setAttribute("data-lucide", adv.icon);
      lucide.createIcons();
    }

    if (advisoryTitle) advisoryTitle.textContent = adv.title;
    if (advisoryText) advisoryText.textContent = adv.text;
  }

  function setWeatherLoading() {
    if (!weatherWidget) return;
    weatherWidget.classList.add("is-loading");
    if (weatherIcon) {
      weatherIcon.setAttribute("data-lucide", "loader-circle");
      lucide.createIcons();
    }
    if (weatherLocation) weatherLocation.textContent = "Fetching weather…";
  }

  function setWeatherFailed() {
    if (!weatherWidget) return;
    weatherWidget.classList.remove("is-loading");
    if (weatherIcon) {
      weatherIcon.setAttribute("data-lucide", "cloud-off");
      lucide.createIcons();
    }
    if (weatherTemp) weatherTemp.textContent = "--°";
    if (weatherLocation) weatherLocation.textContent = "Weather unavailable";

    const adv = buildAdvisory(null);
    if (advisoryIcon) {
      advisoryIcon.setAttribute("data-lucide", adv.icon);
      lucide.createIcons();
    }
    if (advisoryTitle) advisoryTitle.textContent = adv.title;
    if (advisoryText) advisoryText.textContent = adv.text;
  }

  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(
        `${GEOCODE_ENDPOINT}?latitude=${lat}&longitude=${lon}&localityLanguage=en`
      );
      if (!res.ok) throw new Error("geocode failed");
      const data = await res.json();
      return (
        data.city ||
        data.locality ||
        data.principalSubdivision ||
        data.countryName ||
        "Your area"
      );
    } catch (e) {
      return "Your area";
    }
  }

  async function fetchWeather(lat, lon, placeHint) {
    setWeatherLoading();

    try {
      const url =
        `${WEATHER_ENDPOINT}?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
        `&timezone=auto`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("weather failed");

      const data = await res.json();
      if (!data || !data.current) throw new Error("bad weather payload");

      const place = placeHint || (await reverseGeocode(lat, lon));

      weatherState = {
        temp: data.current.temperature_2m,
        humidity: data.current.relative_humidity_2m,
        code: data.current.weather_code,
        wind: data.current.wind_speed_10m,
        isDay: data.current.is_day === 1,
        place: place
      };

      if (!themeManuallySet) {
        applyTheme(weatherState.isDay ? "day" : "night", false);
      }

      refreshWeatherVisual();
    } catch (e) {
      setWeatherFailed();
    }
  }

  /**
   * Get the user's approximate location from their IP address.
   * Returns { latitude, longitude, city } or null on failure.
   */
  async function getLocationByIP() {
    try {
      const res = await fetch(IP_GEOLOCATION_ENDPOINT);
      if (!res.ok) throw new Error("IP geolocation failed");
      const data = await res.json();

      if (data && data.latitude && data.longitude) {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          city: data.city || data.region || data.country_name || null
        };
      }

      throw new Error("No coordinates in IP response");
    } catch (e) {
      // Try fallback IP service
      try {
        const fallbackRes = await fetch("https://ip-api.com/json/?fields=lat,lon,city,regionName,country");
        if (!fallbackRes.ok) throw new Error("fallback IP geolocation failed");
        const fallbackData = await fallbackRes.json();

        if (fallbackData && fallbackData.lat && fallbackData.lon) {
          return {
            latitude: fallbackData.lat,
            longitude: fallbackData.lon,
            city: fallbackData.city || fallbackData.regionName || fallbackData.country || null
          };
        }
      } catch (fallbackError) {
        /* both services failed */
      }

      return null;
    }
  }

  /**
   * Initialize weather using a layered strategy:
   * 1. Try browser Geolocation API (most accurate)
   * 2. Fall back to IP-based geolocation (automatic, no permission needed)
   * 3. Fall back to a hardcoded default (New Delhi)
   */
  async function initWeather() {
    // Strategy 1: Browser geolocation (requires user permission)
    if (navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 6000,
            maximumAge: 900000,
            enableHighAccuracy: false
          });
        });

        await fetchWeather(position.coords.latitude, position.coords.longitude, null);
        return;
      } catch (geoError) {
        // Permission denied or timeout — fall through to IP lookup
      }
    }

    // Strategy 2: IP-based geolocation (no permission required)
    const ipLocation = await getLocationByIP();

    if (ipLocation) {
      await fetchWeather(ipLocation.latitude, ipLocation.longitude, ipLocation.city);
      return;
    }

    // Strategy 3: Hardcoded fallback
    await fetchWeather(28.6139, 77.209, "New Delhi");
  }

  initWeather();

  if (weatherWidget) {
    weatherWidget.addEventListener("click", () => {
      initWeather();
      showToast("Refreshing local weather…", "success");
    });
  }

  setInterval(initWeather, 900000);

  /* ============================================================
     SCROLL REVEAL + BACK TO TOP
     ============================================================ */

  const revealTargets = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    revealTargets.forEach((el) => observer.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("is-visible"));
  }

  if (scrollTopBtn) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 520) scrollTopBtn.classList.remove("hidden");
      else scrollTopBtn.classList.add("hidden");
    });

    scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ============================================================
     MODE TABS (UPLOAD / CAMERA)
     ============================================================ */

  function setMode(mode) {
    const isCamera = mode === "camera";

    tabUploadBtn.classList.toggle("active", !isCamera);
    tabCameraBtn.classList.toggle("active", isCamera);

    tabUploadBtn.setAttribute("aria-selected", String(!isCamera));
    tabCameraBtn.setAttribute("aria-selected", String(isCamera));

    if (tabIndicator) tabIndicator.classList.toggle("right", isCamera);

    if (currentFile) {
      uploadModeContainer.classList.add("hidden");
      cameraModeContainer.classList.add("hidden");
    } else {
      uploadModeContainer.classList.toggle("hidden", isCamera);
      cameraModeContainer.classList.toggle("hidden", !isCamera);
    }

    if (!isCamera) stopCamera();
  }

  tabUploadBtn.addEventListener("click", () => setMode("upload"));
  tabCameraBtn.addEventListener("click", () => {
    setMode("camera");
    if (!currentFile) startCamera();
  });

  /* ============================================================
     CAMERA CONTROL
     ============================================================ */

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast("Camera access is not supported on this device or browser.");
      setMode("upload");
      return;
    }

    stopCamera();

    try {
      activeStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      cameraStream.srcObject = activeStream;
      cameraViewport.classList.add("live");
      cameraPlaceholder.classList.add("hidden");
    } catch (error) {
      cameraViewport.classList.remove("live");
      cameraPlaceholder.classList.remove("hidden");

      let msg = "Could not access the camera.";
      if (error && error.name === "NotAllowedError") {
        msg = "Camera permission was denied. Allow access or use file upload.";
      } else if (error && error.name === "NotFoundError") {
        msg = "No camera was found on this device.";
      }
      showToast(msg);
    }
  }

  function stopCamera() {
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
      activeStream = null;
    }

    if (cameraStream) cameraStream.srcObject = null;
    if (cameraViewport) cameraViewport.classList.remove("live");
    if (cameraPlaceholder) cameraPlaceholder.classList.remove("hidden");
  }

  if (startCameraBtn) startCameraBtn.addEventListener("click", startCamera);
  if (stopCameraBtn) stopCameraBtn.addEventListener("click", stopCamera);

  if (switchCameraBtn) {
    switchCameraBtn.addEventListener("click", () => {
      facingMode = facingMode === "environment" ? "user" : "environment";
      startCamera();
    });
  }

  if (shutterBtn) {
    shutterBtn.addEventListener("click", () => {
      if (!activeStream) {
        showToast("Start the camera before capturing a photo.");
        return;
      }

      const width = cameraStream.videoWidth;
      const height = cameraStream.videoHeight;

      if (!width || !height) {
        showToast("The camera is still warming up. Try again in a moment.");
        return;
      }

      cameraCanvas.width = width;
      cameraCanvas.height = height;

      const ctx = cameraCanvas.getContext("2d");
      ctx.drawImage(cameraStream, 0, 0, width, height);

      if (cameraFlash) {
        cameraFlash.classList.remove("fire");
        void cameraFlash.offsetWidth;
        cameraFlash.classList.add("fire");
      }

      cameraCanvas.toBlob(
        (blob) => {
          if (!blob) {
            showToast("The snapshot could not be created. Please try again.");
            return;
          }

          const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);

          const captured = new File([blob], `crop-capture-${stamp}.jpg`, {
            type: "image/jpeg"
          });

          stopCamera();
          handleFiles([captured]);
        },
        "image/jpeg",
        0.92
      );
    });
  }

  /* ============================================================
     DRAG & DROP
     ============================================================ */

  const preventDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(
      eventName,
      () => dropZone.classList.add("drag-active"),
      false
    );
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(
      eventName,
      () => dropZone.classList.remove("drag-active"),
      false
    );
  });

  dropZone.addEventListener("drop", (event) => {
    handleFiles(event.dataTransfer.files);
  });

  dropZone.addEventListener("click", (event) => {
    if (!event.target.closest("button")) fileInput.click();
  });

  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });

  browseBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener("change", function () {
    handleFiles(this.files);
  });

  /* ============================================================
     BUTTON EVENTS
     ============================================================ */

  removeBtn.addEventListener("click", resetUploader);

  scanAgainBtn.addEventListener("click", () => {
    resetUploader();
    document.querySelector(".diagnostic-section").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  analyzeBtn.addEventListener("click", performAnalysis);

  descriptionInput.addEventListener("input", () => {
    charCount.textContent = `${descriptionInput.value.length} / 500`;
  });

  quickChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const phrase = chip.dataset.chip || chip.textContent.trim();
      const current = descriptionInput.value.trim();

      if (current.toLowerCase().includes(phrase.toLowerCase())) return;

      const next = current ? `${current}, ${phrase}` : phrase;
      descriptionInput.value = next.slice(0, 500);
      charCount.textContent = `${descriptionInput.value.length} / 500`;
      descriptionInput.focus();
    });
  });

  /* ============================================================
     HANDLE IMAGE
     ============================================================ */

  function handleFiles(files) {
    if (!files || files.length === 0) return;

    const file = files[0];

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const maxFileSize = 10 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      showToast("Please upload a JPG, JPEG, PNG, or WEBP image.");
      return;
    }

    if (file.size > maxFileSize) {
      showToast("Please upload an image smaller than 10 MB.");
      return;
    }

    currentFile = file;
    currentDiagnosisData = null;
    currentImageBase64 = null;
    currentImageMime = null;

    const reader = new FileReader();

    reader.onload = (event) => {
      const dataUrl = event.target.result;
      imagePreview.src = dataUrl;
      fileName.textContent = file.name;

      const parts = extractBase64FromDataUrl(dataUrl);
      currentImageBase64 = parts.base64;
      currentImageMime = parts.mime || file.type || "image/jpeg";

      uploadModeContainer.classList.add("hidden");
      cameraModeContainer.classList.add("hidden");
      previewContainer.classList.remove("hidden");

      analyzeBtn.disabled = false;
      resultsSection.classList.add("hidden");
      hideFollowup();
    };

    reader.onerror = () => {
      showToast("The image could not be read. Please try another file.");
      resetUploader();
    };

    reader.readAsDataURL(file);
  }

  /* ============================================================
     RESET
     ============================================================ */

  function resetUploader() {
    currentFile = null;
    currentDiagnosisData = null;
    currentImageBase64 = null;
    currentImageMime = null;

    fileInput.value = "";
    imagePreview.src = "";
    fileName.textContent = "crop-image.jpg";

    previewContainer.classList.add("hidden");

    const cameraActive = tabCameraBtn.classList.contains("active");
    uploadModeContainer.classList.toggle("hidden", cameraActive);
    cameraModeContainer.classList.toggle("hidden", !cameraActive);

    analyzeBtn.disabled = true;
    resultsSection.classList.add("hidden");

    descriptionInput.value = "";
    charCount.textContent = "0 / 500";

    hideProgress();
    removePdfButton();
    hideFollowup();
    resetChat();
    stopCamera();
  }

  /* ============================================================
     PROGRESS FEEDBACK
     ============================================================ */

  const PROGRESS_STEPS = [
    { pct: 18, label: "Uploading crop image…" },
    { pct: 38, label: "Checking image quality…" },
    { pct: 58, label: "Detecting crop & symptoms…" },
    { pct: 76, label: "Matching disease patterns…" },
    { pct: 90, label: "Preparing treatment plan…" }
  ];

  function showProgress() {
    if (!analysisProgress) return;

    analysisProgress.classList.remove("hidden");
    progressFill.style.width = "6%";
    progressLabel.textContent = "Preparing image…";

    let index = 0;
    clearInterval(progressTimer);

    progressTimer = setInterval(() => {
      if (index >= PROGRESS_STEPS.length) return;
      const step = PROGRESS_STEPS[index];
      progressFill.style.width = `${step.pct}%`;
      progressLabel.textContent = step.label;
      index += 1;
    }, 900);
  }

  function completeProgress() {
    if (!analysisProgress) return;
    clearInterval(progressTimer);
    progressFill.style.width = "100%";
    progressLabel.textContent = "Analysis complete";
    setTimeout(hideProgress, 700);
  }

  function hideProgress() {
    if (!analysisProgress) return;
    clearInterval(progressTimer);
    analysisProgress.classList.add("hidden");
    progressFill.style.width = "0%";
  }

  /* ============================================================
     ANALYSIS
     ============================================================ */

  async function performAnalysis() {
    if (!currentFile) {
      showToast("Please upload a crop image before running diagnostics.");
      return;
    }

    setLoadingState(true);
    showProgress();

    resultsSection.classList.add("hidden");
    hideFollowup();
    removePdfButton();

    const formData = new FormData();
    formData.append("image", currentFile);

    const description = descriptionInput.value.trim();
    if (description) formData.append("description", description);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        body: formData
      });

      let data = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const errorMessage =
          data?.message ||
          data?.error ||
          "The diagnostic engine could not process this image right now.";
        throw new Error(errorMessage);
      }

      if (!data || typeof data !== "object") {
        throw new Error("The diagnostic engine returned an invalid response.");
      }

      currentDiagnosisData = data;
      completeProgress();
      renderResults(data);
    } catch (error) {
      currentDiagnosisData = null;
      hideProgress();
      renderErrorState(error.message);
    } finally {
      setLoadingState(false);
    }
  }

  /* ============================================================
     LOADING STATE
     ============================================================ */

  function setLoadingState(isLoading) {
    const icon = analyzeBtn.querySelector("svg, i");

    if (isLoading) {
      analyzeBtn.classList.add("loading");
      analyzeBtn.disabled = true;
      btnText.textContent = "Analyzing crop image…";
      if (icon) icon.setAttribute("data-lucide", "loader-circle");
    } else {
      analyzeBtn.classList.remove("loading");
      analyzeBtn.disabled = !currentFile;
      btnText.textContent = "Run diagnostics";
      if (icon) icon.setAttribute("data-lucide", "scan");
    }

    lucide.createIcons();
  }

  /* ============================================================
     RENDER RESULTS
     ============================================================ */

  function renderResults(data) {
    clearContainer(resultsContent);

    const acceptable = data.image_quality_acceptable === true;

    if (!acceptable) {
      renderRejectedResult(data);
      removePdfButton();
      hideFollowup();
    } else {
      renderDiagnosisResults(data);
      createPdfButton();
      showFollowup(data);
    }

    resultsSection.classList.remove("hidden");
    lucide.createIcons();

    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderRejectedResult(data) {
    const rejectionCard = document.createElement("article");
    rejectionCard.className = "result-card rejection";

    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = "Analysis rejected";

    const value = document.createElement("div");
    value.className = "result-value";
    value.textContent =
      data.rejection_reason ||
      "The image is not suitable for analysis. Please upload a clearer photo of the affected crop area.";

    const meta = document.createElement("div");
    meta.className = "result-meta";

    const icon = createLucideIcon("camera");
    const text = document.createElement("span");
    text.textContent = "Try using a clear, close-up image in natural light.";

    meta.append(icon, text);
    rejectionCard.append(label, value, meta);

    resultsContent.appendChild(rejectionCard);
  }

  function renderDiagnosisResults(data) {
    // ---------- Primary diagnosis ----------
    const diagnosisCard = document.createElement("article");
    diagnosisCard.className = "result-card diagnosis-card";

    const headerFlex = document.createElement("div");
    headerFlex.className = "result-header-flex";

    const diagnosisWrapper = document.createElement("div");

    const diagnosisLabel = document.createElement("span");
    diagnosisLabel.className = "result-label";
    diagnosisLabel.textContent = "Primary diagnosis";

    const diagnosisValue = document.createElement("div");
    diagnosisValue.className = "result-value";
    diagnosisValue.textContent =
      data.diagnosis || "No clear diagnosis identified";

    diagnosisWrapper.append(diagnosisLabel, diagnosisValue);

    const badgeGroup = document.createElement("div");
    badgeGroup.className = "badge-group";
    badgeGroup.appendChild(createSeverityBadge(data.severity));

    if (data.confidence_score !== undefined && data.confidence_score !== null) {
      const confBadge = document.createElement("span");
      confBadge.className = "confidence-badge";
      confBadge.textContent = formatConfidence(data.confidence_score);
      badgeGroup.appendChild(confBadge);
    }

    headerFlex.append(diagnosisWrapper, badgeGroup);
    diagnosisCard.appendChild(headerFlex);

    if (data.crop_identified || data.scientific_name) {
      const grid = document.createElement("div");
      grid.className = "crop-info-grid";

      if (data.crop_identified) {
        const cell = document.createElement("div");
        const t = document.createElement("span");
        t.className = "grid-title";
        t.textContent = "Crop identified";
        const v = document.createElement("strong");
        v.textContent = data.crop_identified;
        cell.append(t, v);
        grid.appendChild(cell);
      }

      if (data.scientific_name) {
        const cell = document.createElement("div");
        const t = document.createElement("span");
        t.className = "grid-title";
        t.textContent = "Scientific name";
        const v = document.createElement("strong");
        v.className = "scientific";
        v.textContent = data.scientific_name;
        cell.append(t, v);
        grid.appendChild(cell);
      }

      diagnosisCard.appendChild(grid);
    }

    const meta = document.createElement("div");
    meta.className = "result-meta";

    const metaIcon = createLucideIcon("badge-check");
    const metaText = document.createElement("span");
    metaText.textContent = "Result generated from the uploaded crop image.";

    meta.append(metaIcon, metaText);
    diagnosisCard.appendChild(meta);

    resultsContent.appendChild(diagnosisCard);

    if (Array.isArray(data.symptoms_observed) && data.symptoms_observed.length > 0) {
      resultsContent.appendChild(
        createListCard("Symptoms observed", data.symptoms_observed, "eye", "list-icon focus-icon")
      );
    }

    if (
      Array.isArray(data.environmental_factors) &&
      data.environmental_factors.length > 0
    ) {
      resultsContent.appendChild(
        createListCard(
          "Environmental factors",
          data.environmental_factors,
          "cloud-sun",
          "list-icon alert-icon"
        )
      );
    }

    if (Array.isArray(data.next_steps) && data.next_steps.length > 0) {
      resultsContent.appendChild(
        createListCard(
          "Recommended actions & prevention",
          data.next_steps,
          "circle-check",
          "list-icon"
        )
      );
    }

    const hasOrganic =
      Array.isArray(data.organic_solutions) && data.organic_solutions.length > 0;
    const hasChemical =
      Array.isArray(data.chemical_solutions) && data.chemical_solutions.length > 0;

    if (hasOrganic && hasChemical) {
      const split = document.createElement("div");
      split.className = "treatment-split-grid";

      const organicCard = createListCard(
        "Organic / biological solutions",
        data.organic_solutions,
        "leaf",
        "list-icon organic-icon"
      );
      organicCard.classList.add("organic-treatment-card");

      const chemicalCard = createListCard(
        "Chemical / conventional solutions",
        data.chemical_solutions,
        "flask-conical",
        "list-icon chemical-icon"
      );
      chemicalCard.classList.add("chemical-treatment-card");

      split.append(organicCard, chemicalCard);
      resultsContent.appendChild(split);
    } else {
      if (hasOrganic) {
        const c = createListCard(
          "Organic / biological solutions",
          data.organic_solutions,
          "leaf",
          "list-icon organic-icon"
        );
        c.classList.add("organic-treatment-card");
        resultsContent.appendChild(c);
      }

      if (hasChemical) {
        const c = createListCard(
          "Chemical / conventional solutions",
          data.chemical_solutions,
          "flask-conical",
          "list-icon chemical-icon"
        );
        c.classList.add("chemical-treatment-card");
        resultsContent.appendChild(c);
      }
    }

    if (
      Array.isArray(data.prevention_techniques) &&
      data.prevention_techniques.length > 0
    ) {
      resultsContent.appendChild(
        createListCard(
          "Prevention techniques",
          data.prevention_techniques,
          "shield-check",
          "list-icon"
        )
      );
    }

    if (
      Array.isArray(data.follow_up_questions) &&
      data.follow_up_questions.length > 0
    ) {
      resultsContent.appendChild(
        createListCard(
          "Follow-up considerations",
          data.follow_up_questions,
          "circle-help",
          "list-icon question-icon"
        )
      );
    }

    if (data.additional_notes) {
      const notesCard = document.createElement("article");
      notesCard.className = "result-card info";

      const notesLabel = document.createElement("span");
      notesLabel.className = "result-label";
      notesLabel.textContent = "Additional note";

      const notesValue = document.createElement("div");
      notesValue.className = "result-value";
      notesValue.style.fontFamily = '"DM Sans", sans-serif';
      notesValue.style.fontSize = "1rem";
      notesValue.style.letterSpacing = "0";
      notesValue.style.lineHeight = "1.6";
      notesValue.textContent = data.additional_notes;

      notesCard.append(notesLabel, notesValue);
      resultsContent.appendChild(notesCard);
    }
  }

  /* ============================================================
     FOLLOW-UP CHAT
     ============================================================ */

  function showFollowup(data) {
    if (!followupContainer) return;

    followupContainer.classList.remove("hidden");
    resetChat();

    const intro =
      `I've reviewed your crop image. The likely issue is ` +
      `"${data.diagnosis || "an unidentified condition"}"` +
      `${data.crop_identified ? ` on ${data.crop_identified}` : ""}. ` +
      `Ask me anything about treatment, dosage, timing, or prevention.`;

    appendChatBubble("assistant", intro);
  }

  function hideFollowup() {
    if (followupContainer) followupContainer.classList.add("hidden");
  }

  function resetChat() {
    chatHistory = [];
    clearContainer(chatThread);
  }

  function appendChatBubble(role, text) {
    const container = document.createElement("div");
    container.className = `chat-bubble-container ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "speaker-avatar";
    avatar.appendChild(createLucideIcon(role === "user" ? "user" : "sprout"));

    const frame = document.createElement("div");
    frame.className = "bubble-content-frame";

    const p = document.createElement("p");
    p.className = "bubble-text";
    p.textContent = text;

    frame.appendChild(p);
    container.append(avatar, frame);

    chatThread.appendChild(container);
    lucide.createIcons();

    chatThread.scrollTop = chatThread.scrollHeight;

    return container;
  }

  function appendThinkingBubble() {
    const container = document.createElement("div");
    container.className = "chat-bubble-container assistant thinking-placeholder";

    const avatar = document.createElement("div");
    avatar.className = "speaker-avatar spinning";
    avatar.appendChild(createLucideIcon("loader-circle"));

    const frame = document.createElement("div");
    frame.className = "bubble-content-frame";

    const wrap = document.createElement("span");
    wrap.className = "thinking-text";
    wrap.textContent = "Consulting the agronomic model";

    const dots = document.createElement("span");
    dots.className = "typing-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";

    wrap.appendChild(dots);
    frame.appendChild(wrap);
    container.append(avatar, frame);

    chatThread.appendChild(container);
    lucide.createIcons();
    chatThread.scrollTop = chatThread.scrollHeight;

    return container;
  }

  async function sendFollowup(question) {
    if (chatBusy) return;
    if (!question || !question.trim()) return;

    if (!currentDiagnosisData) {
      showToast("Run a diagnosis first so the assistant has context.");
      return;
    }

    chatBusy = true;
    sendFollowupBtn.disabled = true;
    followupField.value = "";

    appendChatBubble("user", question);
    chatHistory.push({ role: "user", content: question });

    const thinking = appendThinkingBubble();

    if ((!currentImageBase64 || !currentImageMime) && imagePreview && imagePreview.src) {
      const parts = extractBase64FromDataUrl(imagePreview.src);
      currentImageBase64 = currentImageBase64 || parts.base64;
      currentImageMime = currentImageMime || parts.mime;
    }

    try {
      const response = await fetch(FOLLOWUP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          image: currentImageBase64,
          mime_type: currentImageMime,
          previous_diagnosis: currentDiagnosisData,
          chat_history: chatHistory,
          description: descriptionInput.value.trim() || null,
          weather: weatherState
            ? {
                temperature_c: weatherState.temp,
                humidity: weatherState.humidity,
                wind_kmh: weatherState.wind,
                condition_code: weatherState.code,
                location: weatherState.place
              }
            : null
        })
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      thinking.remove();

      if (!response.ok) {
        const msg =
          data?.message ||
          data?.error ||
          "The assistant is unavailable right now. Please try again shortly.";
        appendChatBubble("assistant", msg);
      } else {
        const answer =
          data?.answer ||
          data?.response ||
          data?.message ||
          data?.reply ||
          "I couldn't generate a response for that question. Try rephrasing it.";

        appendChatBubble("assistant", answer);
        chatHistory.push({ role: "assistant", content: answer });
      }
    } catch (error) {
      thinking.remove();
      appendChatBubble(
        "assistant",
        "I couldn't reach the consultation service. Please check your connection and try again."
      );
    } finally {
      chatBusy = false;
      sendFollowupBtn.disabled = false;
      followupField.focus();
    }
  }

  if (followupForm) {
    followupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sendFollowup(followupField.value.trim());
    });
  }

  if (chatSuggestions) {
    chatSuggestions.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      sendFollowup(chip.dataset.ask || chip.textContent.trim());
    });
  }

  /* ============================================================
     PDF BUTTON
     ============================================================ */

  function createPdfButton() {
    removePdfButton();

    const resultsHeading = document.querySelector(
      "#results-section .results-heading"
    );

    if (!resultsHeading) return;

    const buttonGroup = document.createElement("div");
    buttonGroup.id = "pdf-button-group";
    buttonGroup.style.display = "flex";
    buttonGroup.style.alignItems = "center";
    buttonGroup.style.gap = "10px";
    buttonGroup.style.flexWrap = "wrap";

    const pdfButton = document.createElement("button");
    pdfButton.id = "download-pdf-btn";
    pdfButton.type = "button";
    pdfButton.className = "secondary-btn";

    const icon = createLucideIcon("file-down");
    const text = document.createElement("span");
    text.textContent = "Download PDF report";

    pdfButton.append(icon, text);
    pdfButton.addEventListener("click", generatePdfReport);

    buttonGroup.appendChild(pdfButton);
    resultsHeading.appendChild(buttonGroup);

    lucide.createIcons();
  }

  function removePdfButton() {
    const existingButton = document.getElementById("pdf-button-group");
    if (existingButton) existingButton.remove();
  }

  /* ============================================================
     LOAD PDF LIBRARY
     ============================================================ */

  function loadPdfLibrary() {
    return new Promise((resolve, reject) => {
      if (window.jspdf && typeof window.jspdf.jsPDF === "function") {
        resolve(window.jspdf.jsPDF);
        return;
      }

      const existingScript = document.querySelector(
        'script[data-crop-doctor-pdf="true"]'
      );

      if (existingScript) {
        existingScript.addEventListener(
          "load",
          () => {
            if (window.jspdf && typeof window.jspdf.jsPDF === "function") {
              resolve(window.jspdf.jsPDF);
            } else {
              reject(new Error("PDF library loaded but could not be initialized."));
            }
          },
          { once: true }
        );

        existingScript.addEventListener(
          "error",
          () => reject(new Error("Could not load the PDF generator.")),
          { once: true }
        );

        return;
      }

      const script = document.createElement("script");
      script.src = PDF_LIBRARY_URL;
      script.async = true;
      script.dataset.cropDoctorPdf = "true";

      script.onload = () => {
        if (window.jspdf && typeof window.jspdf.jsPDF === "function") {
          resolve(window.jspdf.jsPDF);
        } else {
          reject(new Error("PDF library loaded but could not be initialized."));
        }
      };

      script.onerror = () => {
        reject(
          new Error(
            "Could not load the PDF generator. Please check your internet connection."
          )
        );
      };

      document.head.appendChild(script);
    });
  }

  /* ============================================================
     GENERATE PDF REPORT
     ============================================================ */

  async function generatePdfReport() {
    if (!currentDiagnosisData || !currentFile) {
      showToast("Please complete a crop diagnosis before creating the report.");
      return;
    }

    const pdfButton = document.getElementById("download-pdf-btn");

    if (pdfButton) {
      pdfButton.disabled = true;
      const buttonText = pdfButton.querySelector("span");
      if (buttonText) buttonText.textContent = "Creating PDF…";
    }

    try {
      const jsPDF = await loadPdfLibrary();

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const margin = 16;
      const contentWidth = pageWidth - margin * 2;

      let y = 18;

      // ---------------- HEADER ----------------
      doc.setFillColor(18, 61, 32);
      doc.rect(0, 0, pageWidth, 30, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("CropScan", margin, 13);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Crop Health Diagnostic Report", margin, 21);

      doc.setFontSize(9);
      doc.text(formatDateTime(new Date()), pageWidth - margin, 17, {
        align: "right"
      });

      y = 40;

      // ---------------- IMAGE ----------------
      if (imagePreview.src) {
        const imageData = await convertImageToJpeg(imagePreview);

        const imageSize = calculatePdfImageSize(
          imageData.width,
          imageData.height,
          contentWidth - 8,
          68
        );

        doc.setFillColor(245, 248, 244);
        doc.roundedRect(margin, y, contentWidth, imageSize.height + 8, 4, 4, "F");
        doc.addImage(
          imageData.dataUrl,
          "JPEG",
          margin + 4,
          y + 4,
          imageSize.width,
          imageSize.height
        );

        y += imageSize.height + 17;
      }

      // ---------------- WEATHER CONTEXT ----------------
      if (weatherState) {
        y = ensurePdfSpace(doc, y, 22, pageHeight, margin);

        doc.setFillColor(237, 246, 255);
        doc.roundedRect(margin, y, contentWidth, 14, 3, 3, "F");

        doc.setTextColor(33, 103, 168);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text("Field conditions at scan time", margin + 5, y + 5.5);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 80, 100);
        doc.text(
          `${weatherState.place} • ${Math.round(weatherState.temp)}°C • ` +
            `Humidity ${Math.round(weatherState.humidity)}% • ` +
            `Wind ${Math.round(weatherState.wind)} km/h`,
          margin + 5,
          y + 10.5
        );

        y += 20;
      }

      // ---------------- DIAGNOSIS ----------------
      y = ensurePdfSpace(doc, y, 35, pageHeight, margin);
      addPdfSectionTitle(doc, "Diagnosis", margin, y);
      y += 9;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(23, 35, 26);

      y = addWrappedText(
        doc,
        dataValue(currentDiagnosisData.diagnosis, "No clear diagnosis identified"),
        margin,
        y,
        contentWidth,
        15,
        6
      );

      y += 3;

      const severityText = formatSeverityText(currentDiagnosisData.severity);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Severity: ${severityText}`, margin, y);
      y += 7;

      if (currentDiagnosisData.confidence_score !== undefined) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(
          `AI confidence: ${formatConfidence(currentDiagnosisData.confidence_score)}`,
          margin,
          y
        );
        y += 7;
      }

      // ---------------- CROP INFO ----------------
      const cropInfo = [];

      if (currentDiagnosisData.crop_identified) {
        cropInfo.push(["Crop identified", currentDiagnosisData.crop_identified]);
      }

      if (currentDiagnosisData.scientific_name) {
        cropInfo.push(["Scientific name", currentDiagnosisData.scientific_name]);
      }

      if (cropInfo.length > 0) {
        y += 2;
        y = addPdfKeyValueSection(
          doc,
          "Crop information",
          cropInfo,
          margin,
          y,
          contentWidth,
          pageHeight
        );
      }

      // ---------------- SECTIONS ----------------
      const listSections = [
        ["Symptoms observed", currentDiagnosisData.symptoms_observed],
        ["Environmental factors", currentDiagnosisData.environmental_factors],
        ["Recommended actions", currentDiagnosisData.next_steps],
        ["Organic / biological solutions", currentDiagnosisData.organic_solutions],
        [
          "Chemical / conventional solutions",
          currentDiagnosisData.chemical_solutions
        ],
        ["Prevention techniques", currentDiagnosisData.prevention_techniques],
        ["Follow-up considerations", currentDiagnosisData.follow_up_questions]
      ];

      listSections.forEach(([title, items]) => {
        if (Array.isArray(items) && items.length > 0) {
          y = addPdfListSection(
            doc,
            title,
            items,
            margin,
            y,
            contentWidth,
            pageHeight
          );
        }
      });

      // ---------------- NOTES ----------------
      if (currentDiagnosisData.additional_notes) {
        y = addPdfTextSection(
          doc,
          "Additional notes",
          currentDiagnosisData.additional_notes,
          margin,
          y,
          contentWidth,
          pageHeight
        );
      }

      const userDescription = descriptionInput.value.trim();

      if (userDescription) {
        y = addPdfTextSection(
          doc,
          "User-provided symptoms",
          userDescription,
          margin,
          y,
          contentWidth,
          pageHeight
        );
      }

      // ---------------- CHAT TRANSCRIPT ----------------
      if (chatHistory.length > 0) {
        const transcript = chatHistory
          .map((m) => `${m.role === "user" ? "Q" : "A"}: ${m.content}`)
          .join("\n\n");

        y = addPdfTextSection(
          doc,
          "Consultation transcript",
          transcript,
          margin,
          y,
          contentWidth,
          pageHeight
        );
      }

      // ---------------- DISCLAIMER ----------------
      y = ensurePdfSpace(doc, y, 34, pageHeight, margin);

      doc.setFillColor(255, 247, 223);

      const disclaimerText =
        "This report is generated using AI-assisted crop image analysis. AI predictions can contain mistakes. Review the result carefully and consult a qualified agricultural expert before taking action, especially for serious crop damage.";

      const disclaimerLines = doc.splitTextToSize(
        disclaimerText,
        contentWidth - 12
      );
      const disclaimerHeight = 12 + disclaimerLines.length * 4.5;

      doc.roundedRect(margin, y, contentWidth, disclaimerHeight, 3, 3, "F");

      doc.setTextColor(110, 78, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Important", margin + 6, y + 7);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(disclaimerLines, margin + 6, y + 12);

      // ---------------- FOOTERS ----------------
      addPdfFooters(doc, pageWidth, pageHeight, margin);

      // ---------------- SAVE ----------------
      const safeName = sanitizeFileName(
        currentFile.name.replace(/\.[^/.]+$/, "")
      );
      const dateStamp = new Date().toISOString().slice(0, 10);

      doc.save(`CropScan-Report-${safeName}-${dateStamp}.pdf`);

      showToast("PDF diagnostic report downloaded successfully.", "success");
    } catch (error) {
      console.error("PDF generation error:", error);
      showToast(error.message || "Could not create the PDF report.");
    } finally {
      if (pdfButton) {
        pdfButton.disabled = false;
        const buttonText = pdfButton.querySelector("span");
        if (buttonText) buttonText.textContent = "Download PDF report";
      }
      lucide.createIcons();
    }
  }

  /* ============================================================
     PDF HELPERS
     ============================================================ */

  function formatDateTime(date) {
    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function dataValue(value, fallback = "") {
    if (value === null || value === undefined || String(value).trim() === "") {
      return fallback;
    }
    return String(value);
  }

  function formatSeverityText(severity) {
    const normalized = String(severity || "Low").toLowerCase();

    if (normalized === "high" || normalized === "severe") return "High";
    if (normalized === "medium" || normalized === "moderate") return "Medium";
    return "Low";
  }

  function addPdfSectionTitle(doc, title, x, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(35, 118, 56);
    doc.text(title, x, y);
  }

  function addWrappedText(
    doc,
    text,
    x,
    y,
    width,
    fontSize = 10,
    lineHeight = 5
  ) {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(String(text), width);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
  }

  function addPdfKeyValueSection(
    doc,
    title,
    items,
    margin,
    y,
    contentWidth,
    pageHeight
  ) {
    y = ensurePdfSpace(doc, y, 30, pageHeight, margin);
    addPdfSectionTitle(doc, title, margin, y);
    y += 7;

    items.forEach(([label, value]) => {
      y = ensurePdfSpace(doc, y, 16, pageHeight, margin);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(86, 100, 90);
      doc.text(`${label}:`, margin, y);

      const labelWidth = doc.getTextWidth(`${label}:`);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(23, 35, 26);

      const valueLines = doc.splitTextToSize(
        String(value),
        contentWidth - labelWidth - 4
      );

      doc.text(valueLines, margin + labelWidth + 4, y);

      y += Math.max(1, valueLines.length) * 4.5 + 4;
    });

    return y;
  }

  function addPdfListSection(
    doc,
    title,
    items,
    margin,
    y,
    contentWidth,
    pageHeight
  ) {
    y = ensurePdfSpace(doc, y, 30, pageHeight, margin);
    addPdfSectionTitle(doc, title, margin, y);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(23, 35, 26);

    items.forEach((item) => {
      if (item === null || item === undefined || String(item).trim() === "")
        return;

      const bullet = "• ";
      const lines = doc.splitTextToSize(String(item), contentWidth - 7);

      y = ensurePdfSpace(doc, y, lines.length * 4.8 + 5, pageHeight, margin);

      doc.text(bullet, margin, y);
      doc.text(lines, margin + 5, y);

      y += lines.length * 4.8 + 3;
    });

    return y + 2;
  }

  function addPdfTextSection(
    doc,
    title,
    text,
    margin,
    y,
    contentWidth,
    pageHeight
  ) {
    y = ensurePdfSpace(doc, y, 30, pageHeight, margin);
    addPdfSectionTitle(doc, title, margin, y);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(23, 35, 26);

    const lines = doc.splitTextToSize(String(text), contentWidth);
    let index = 0;

    while (index < lines.length) {
      if (y > pageHeight - margin - 15) {
        doc.addPage();
        y = margin;

        addPdfSectionTitle(doc, title + " (continued)", margin, y);
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(23, 35, 26);
      }

      const remaining = Math.floor((pageHeight - margin - y) / 4.8);
      const chunk = lines.slice(index, index + Math.max(1, remaining));

      doc.text(chunk, margin, y);

      y += chunk.length * 4.8;
      index += chunk.length;

      if (index < lines.length) {
        doc.addPage();
        y = margin;
      }
    }

    return y + 7;
  }

  function ensurePdfSpace(doc, y, requiredHeight, pageHeight, margin) {
    if (y + requiredHeight > pageHeight - margin) {
      doc.addPage();
      return margin;
    }
    return y;
  }

  function addPdfFooters(doc, pageWidth, pageHeight, margin) {
    const pageCount = doc.getNumberOfPages();

    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);

      doc.setDrawColor(223, 233, 223);
      doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(123, 136, 126);

      doc.text(
        "CropScan • AI-assisted crop health report",
        margin,
        pageHeight - 6
      );

      doc.text(
        `Page ${page} of ${pageCount}`,
        pageWidth - margin,
        pageHeight - 6,
        {
          align: "right"
        }
      );
    }
  }

  function sanitizeFileName(name) {
    return (
      String(name)
        .replace(/[^a-z0-9-_]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "crop-image"
    );
  }

  /* ============================================================
     IMAGE CONVERSION FOR PDF
     ============================================================ */

  function convertImageToJpeg(imageElement) {
    return new Promise((resolve, reject) => {
      if (!imageElement || !imageElement.src) {
        reject(new Error("The crop image could not be loaded for the PDF."));
        return;
      }

      const image = new Image();

      image.onload = () => {
        try {
          const maxDimension = 1600;

          let width = image.naturalWidth;
          let height = image.naturalHeight;

          if (!width || !height) {
            reject(
              new Error("The crop image dimensions could not be detected.")
            );
            return;
          }

          if (width > maxDimension || height > maxDimension) {
            const scale = Math.min(maxDimension / width, maxDimension / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);

          resolve({
            dataUrl: canvas.toDataURL("image/jpeg", 0.88),
            width,
            height
          });
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => {
        reject(
          new Error("The crop image could not be converted for the PDF.")
        );
      };

      image.src = imageElement.src;
    });
  }

  function calculatePdfImageSize(imageWidth, imageHeight, maxWidth, maxHeight) {
    const ratio = Math.min(
      maxWidth / imageWidth,
      maxHeight / imageHeight,
      1
    );
    return {
      width: imageWidth * ratio,
      height: imageHeight * ratio
    };
  }

  /* ============================================================
     CARD BUILDERS
     ============================================================ */

  function createInfoCard(title, value, iconName) {
    const card = document.createElement("article");
    card.className = "result-card";

    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = title;

    const valueElement = document.createElement("div");
    valueElement.className = "result-value";
    valueElement.textContent = value;

    const meta = document.createElement("div");
    meta.className = "result-meta";

    const icon = createLucideIcon(iconName);
    const text = document.createElement("span");
    text.textContent = title;

    meta.append(icon, text);
    card.append(label, valueElement, meta);

    return card;
  }

  function formatConfidence(value) {
    if (value === null || value === undefined) return "Not available";

    let number = Number(value);
    if (Number.isNaN(number)) return String(value);

    if (number <= 1) number = number * 100;

    number = Math.max(0, Math.min(100, number));

    return `${Math.round(number)}% confidence`;
  }

  function createSeverityBadge(severity) {
    const badge = document.createElement("span");
    badge.className = "severity-badge";

    const normalizedSeverity = String(severity || "Low").toLowerCase();

    if (normalizedSeverity === "high" || normalizedSeverity === "severe") {
      badge.classList.add("severity-high");
      badge.textContent = "High severity";
    } else if (
      normalizedSeverity === "medium" ||
      normalizedSeverity === "moderate"
    ) {
      badge.classList.add("severity-medium");
      badge.textContent = "Medium severity";
    } else {
      badge.classList.add("severity-low");
      badge.textContent = "Low severity";
    }

    return badge;
  }

  function createListCard(title, items, iconName, iconClass) {
    const card = document.createElement("article");
    card.className = "result-card";

    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = title;

    const list = document.createElement("ul");
    list.className = "result-list";

    items.forEach((item) => {
      if (!item) return;

      const listItem = document.createElement("li");
      const icon = createLucideIcon(iconName, iconClass);

      const text = document.createElement("span");
      text.textContent = String(item);

      listItem.append(icon, text);
      list.appendChild(listItem);
    });

    card.append(label, list);
    return card;
  }

  /* ============================================================
     ERROR STATE
     ============================================================ */

  function renderErrorState(message) {
    clearContainer(resultsContent);
    removePdfButton();
    hideFollowup();

    const errorCard = document.createElement("article");
    errorCard.className = "result-card error";

    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = "Diagnostic system unavailable";

    const value = document.createElement("div");
    value.className = "result-value";
    value.textContent =
      message ||
      "An error occurred while connecting to the diagnostic engine. Please try again shortly.";

    const meta = document.createElement("div");
    meta.className = "result-meta";

    const icon = createLucideIcon("refresh-cw");
    const text = document.createElement("span");
    text.textContent = "Your image remains selected, so you can retry the scan.";

    meta.append(icon, text);
    errorCard.append(label, value, meta);

    resultsContent.appendChild(errorCard);
    resultsSection.classList.remove("hidden");

    lucide.createIcons();

    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ============================================================
     TOAST
     ============================================================ */

  function showToast(message, type = "error") {
    toastMessage.textContent = message;

    toast.classList.remove("hidden", "success");
    if (type === "success") toast.classList.add("success");

    const icon = toast.querySelector("svg, i");
    if (icon) {
      icon.setAttribute(
        "data-lucide",
        type === "success" ? "circle-check" : "circle-alert"
      );
    }

    lucide.createIcons();

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add("hidden");
    }, 4200);
  }

  /* ============================================================
     CLEANUP
     ============================================================ */

  window.addEventListener("beforeunload", stopCamera);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
  });
});
