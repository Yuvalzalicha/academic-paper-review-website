const OPENALEX_BASE_URL = "https://api.openalex.org/works";
const STORAGE_KEY = "papertrail-reading-list";
const VIEW_STATE_KEY = "papertrail-view-state";
const SEARCH_STATE_KEY = "papertrail-last-search";
const RECOMMENDATION_STATE_KEY = "papertrail-last-recommendations";
const SHORTS_STATE_KEY = "papertrail-last-short";
const VIDEO_JOB_STATE_KEY = "papertrail-last-video-job";
const INGEST_STATE_KEY = "papertrail-last-ingested-paper";
const SESSION_KEY = "papertrail-session-id";
const SUPABASE_FALLBACK_CONFIG = {
  url: "https://iijjknxythzulznyisdt.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpamprbnh5dGh6dWx6bnlpc2R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMzQ5NDcsImV4cCI6MjA5NzYxMDk0N30.Wxh3WAlFGtl_zJjpJaZs7ZVnlSfxhnHx4XP28zSL2xY",
};
const RESULT_LIMIT = 9;
const CANDIDATE_LIMIT = 25;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "based",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "paper",
  "study",
  "the",
  "to",
  "using",
  "with",
]);

const els = {
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchStatus: document.querySelector("#search-status"),
  searchResults: document.querySelector("#search-results"),
  ingestForm: document.querySelector("#ingest-form"),
  paperPdfInput: document.querySelector("#paper-pdf-input"),
  paperTitleInput: document.querySelector("#paper-title-input"),
  ingestStatus: document.querySelector("#ingest-status"),
  ingestResults: document.querySelector("#ingest-results"),
  interestForm: document.querySelector("#interest-form"),
  interestInput: document.querySelector("#interest-input"),
  recommendationStatus: document.querySelector("#recommendation-status"),
  recommendationResults: document.querySelector("#recommendation-results"),
  shortsForm: document.querySelector("#shorts-form"),
  shortsTitle: document.querySelector("#shorts-title"),
  shortsAbstract: document.querySelector("#shorts-abstract"),
  shortsDuration: document.querySelector("#shorts-duration"),
  shortsStatus: document.querySelector("#shorts-status"),
  shortsOutput: document.querySelector("#shorts-output"),
  authForm: document.querySelector("#auth-form"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  signUpButton: document.querySelector("#sign-up-button"),
  signInButton: document.querySelector("#sign-in-button"),
  signOutButton: document.querySelector("#sign-out-button"),
  accountState: document.querySelector("#account-state"),
  accountStatus: document.querySelector("#account-status"),
  accountCopy: document.querySelector("#account-copy"),
  readingListCopy: document.querySelector("#reading-list-copy"),
  readingListResults: document.querySelector("#reading-list-results"),
  clearListButton: document.querySelector("#clear-list-button"),
  adminSection: document.querySelector("#admin"),
  adminNavLink: document.querySelector("#admin-nav-link"),
  adminRefreshButton: document.querySelector("#admin-refresh-button"),
  adminAccessCard: document.querySelector("#admin-access-card"),
  adminAccessTitle: document.querySelector("#admin-access-title"),
  adminAccessStatus: document.querySelector("#admin-access-status"),
  adminDashboard: document.querySelector("#admin-dashboard"),
  adminMetrics: document.querySelector("#admin-metrics"),
  adminUsageCount: document.querySelector("#admin-usage-count"),
  adminUsageTable: document.querySelector("#admin-usage-table"),
  adminSubscriptionCount: document.querySelector("#admin-subscription-count"),
  adminSubscriptionsTable: document.querySelector("#admin-subscriptions-table"),
  adminEventsCount: document.querySelector("#admin-events-count"),
  adminEventsTable: document.querySelector("#admin-events-table"),
  adminCampaignCount: document.querySelector("#admin-campaign-count"),
  adminCampaignsTable: document.querySelector("#admin-campaigns-table"),
  campaignForm: document.querySelector("#campaign-form"),
  campaignName: document.querySelector("#campaign-name"),
  campaignChannel: document.querySelector("#campaign-channel"),
  cardTemplate: document.querySelector("#paper-card-template"),
  reviewModal: document.querySelector("#review-modal"),
  reviewModalTitle: document.querySelector("#review-modal-title"),
  reviewModalMeta: document.querySelector("#review-modal-meta"),
  reviewModalContent: document.querySelector("#review-modal-content"),
  reviewModalEmail: document.querySelector("#review-modal-email"),
  reviewModalDownload: document.querySelector("#review-modal-download"),
  reviewModalEmailButton: document.querySelector("#review-modal-email-button"),
  reviewModalBackdrop: document.querySelector("#review-modal-backdrop"),
  reviewCloseButton: document.querySelector("#review-close-button"),
};

let readingList = loadReadingList();
let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let isAdminUser = false;
let viewRestoreQueued = true;
let currentShortPlan = null;
let currentVideoJob = loadStoredJson(VIDEO_JOB_STATE_KEY);
let videoJobPollTimer = null;

function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

const sessionId = getSessionId();

function loadReadingList() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveReadingList() {
  readingList = readingList.map(normalizePaperMath);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readingList));
  renderReadingList();
}

function loadStoredJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getCurrentViewState() {
  return loadStoredJson(VIEW_STATE_KEY, {});
}

function saveViewState(nextState) {
  const currentState = getCurrentViewState();
  saveStoredJson(VIEW_STATE_KEY, {
    ...currentState,
    ...nextState,
    hash: nextState.hash || window.location.hash || currentState.hash || "#top",
    updatedAt: Date.now(),
  });
}

function rememberSection(hash) {
  if (!hash) return;
  if (!["#ingest", "#search", "#recommendations", "#visual-shorts", "#reading-list"].includes(hash)) {
    saveViewState({ hash, paperId: null, reviewOpen: false, source: null });
    return;
  }
  saveViewState({ hash });
}

function paperCardId(source, paperId) {
  return `paper-${source}-${encodeURIComponent(paperId).replace(/%/g, "")}`;
}

function restoreSavedView() {
  if (!viewRestoreQueued) return;

  const state = getCurrentViewState();
  const activeHash = window.location.hash || state.hash;
  if (activeHash && !["#ingest", "#search", "#recommendations", "#reading-list"].includes(activeHash)) {
    viewRestoreQueued = false;
    return;
  }
  const selectedCard =
    state.paperId && state.source ? document.getElementById(paperCardId(state.source, state.paperId)) : null;

  if (selectedCard) {
    selectedCard.scrollIntoView({ behavior: "auto", block: "start" });
    if (state.reviewOpen) {
      selectedCard.querySelector(".review-open-button")?.click();
    }
    viewRestoreQueued = false;
    return;
  }

  if (state.paperId) return;

  if (activeHash) {
    let target = null;
    try {
      target = document.querySelector(activeHash);
    } catch {
      target = null;
    }
    if (target) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
      viewRestoreQueued = false;
    }
  }
}

function isSupabaseConfigured() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey);
}

function getSupabaseConfig() {
  const configured = window.PAPERTRAIL_SUPABASE || {};
  return {
    url: configured.url || SUPABASE_FALLBACK_CONFIG.url,
    anonKey: configured.anonKey || SUPABASE_FALLBACK_CONFIG.anonKey,
  };
}

function setAccountStatus(message, state = "Browser-only mode") {
  els.accountState.textContent = state;
  els.accountStatus.textContent = message;
}

function setAuthUiForUser(user) {
  const isSignedIn = Boolean(user);
  els.authForm.hidden = isSignedIn;
  els.signOutButton.hidden = !isSignedIn;
  els.accountCopy.textContent = isSignedIn
    ? "Your research library is synced to your PaperTrail workspace."
    : "Create a workspace account to sync your research library, dossiers, and usage across sessions.";
  els.readingListCopy.textContent = isSignedIn
    ? `Synced to ${user.email}.`
    : "Saved locally in this browser with no account required.";
}

function setAdminVisibility() {
  if (!els.adminSection) return;

  const canShowPanel = Boolean(currentUser);
  els.adminSection.hidden = !canShowPanel && window.location.hash !== "#admin";
  els.adminNavLink.hidden = false;
  els.adminDashboard.hidden = !isAdminUser;
  els.adminRefreshButton.hidden = !isAdminUser;
  els.adminAccessCard.hidden = isAdminUser;

  if (!currentUser) {
    els.adminAccessTitle.textContent = "Admin access required";
    els.adminAccessStatus.textContent = "Sign in with an admin account to view backend controls.";
  } else if (!isAdminUser) {
    els.adminAccessTitle.textContent = "No admin role";
    els.adminAccessStatus.textContent =
      "Your account is active, but it has not been granted the admin role in Supabase.";
  }
}

function showAdminRoute() {
  if (!els.adminSection || window.location.hash !== "#admin") return;
  els.adminSection.hidden = false;
  const scrollToAdmin = () => {
    const headerHeight = document.querySelector(".site-header")?.offsetHeight || 0;
    const top = els.adminSection.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  };
  window.requestAnimationFrame(scrollToAdmin);
  window.setTimeout(scrollToAdmin, 250);
}

async function trackEvent(eventName, properties = {}) {
  if (!supabaseClient) return;

  try {
    await supabaseClient.rpc("track_app_event", {
      event_name: eventName,
      event_properties: {
        ...properties,
        path: window.location.pathname,
        hash: window.location.hash || "#top",
      },
      client_session_id: sessionId,
    });
  } catch {
    // Analytics must never interrupt the research workflow.
  }
}

async function syncUserProfile() {
  if (!supabaseClient || !currentUser) {
    currentProfile = null;
    isAdminUser = false;
    setAdminVisibility();
    return;
  }

  const { data, error } = await supabaseClient
    .from("user_profiles")
    .select("id,email,full_name,role,subscription_status")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    currentProfile = null;
    isAdminUser = false;
  } else {
    currentProfile = data;
    isAdminUser = data?.role === "admin";
  }

  setAdminVisibility();

  if (isAdminUser || window.location.hash === "#admin") {
    await loadAdminDashboard();
  }
  showAdminRoute();
}

function formatShortDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function appendTableEmpty(tableBody, message, columns) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columns;
  cell.textContent = message;
  row.append(cell);
  tableBody.append(row);
}

function renderAdminMetrics(metrics = {}) {
  const cards = [
    ["Users", metrics.total_users || 0],
    ["Active subscribers", metrics.active_subscriptions || 0],
    ["Events 30 days", metrics.events_30_days || 0],
    ["Saved papers", metrics.saved_papers || 0],
    ["PDF dossiers", metrics.pdf_guides || 0],
    ["Video jobs", metrics.video_jobs || 0],
    ["Completed videos", metrics.completed_videos || 0],
    ["Campaigns", metrics.campaigns || 0],
  ];

  els.adminMetrics.replaceChildren();
  cards.forEach(([label, value]) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    const number = document.createElement("strong");
    number.textContent = Number(value).toLocaleString();
    const caption = document.createElement("span");
    caption.textContent = label;
    card.append(number, caption);
    els.adminMetrics.append(card);
  });
}

function renderAdminTableRows(tableBody, rows, columns, emptyMessage) {
  tableBody.replaceChildren();
  if (!rows.length) {
    appendTableEmpty(tableBody, emptyMessage, columns.length);
    return;
  }

  rows.forEach((rowData) => {
    const row = document.createElement("tr");
    columns.forEach((column) => {
      const cell = document.createElement("td");
      cell.textContent = column(rowData);
      row.append(cell);
    });
    tableBody.append(row);
  });
}

function renderAdminDashboard(payload = {}) {
  const usage = payload.usage || [];
  const subscriptions = payload.subscriptions || [];
  const events = payload.events || [];
  const campaigns = payload.campaigns || [];

  renderAdminMetrics(payload.metrics || {});
  els.adminUsageCount.textContent = `${usage.length} rows`;
  els.adminSubscriptionCount.textContent = `${subscriptions.length} subscriptions`;
  els.adminEventsCount.textContent = `${events.length} event types`;
  els.adminCampaignCount.textContent = `${campaigns.length} campaigns`;

  renderAdminTableRows(
    els.adminUsageTable,
    usage,
    [
      (row) => row.email || "Anonymous",
      (row) => row.period || "Current",
      (row) => Number(row.searches || 0).toLocaleString(),
      (row) => Number(row.review_opens || 0).toLocaleString(),
      (row) => Number(row.pdf_guides || 0).toLocaleString(),
    ],
    "No usage rows yet."
  );

  renderAdminTableRows(
    els.adminSubscriptionsTable,
    subscriptions,
    [
      (row) => row.email || "Unknown",
      (row) => row.plan_name || "Free",
      (row) => row.status || "active",
      (row) => formatShortDate(row.current_period_end),
    ],
    "No subscriptions yet."
  );

  renderAdminTableRows(
    els.adminEventsTable,
    events,
    [
      (row) => row.event_name || "unknown",
      (row) => Number(row.total || 0).toLocaleString(),
      (row) => formatShortDate(row.last_seen_at),
    ],
    "No analytics events yet."
  );

  renderAdminTableRows(
    els.adminCampaignsTable,
    campaigns,
    [
      (row) => row.name || "Untitled",
      (row) => row.channel || "email",
      (row) => row.status || "draft",
    ],
    "No campaigns yet."
  );
}

async function loadAdminDashboard() {
  if (!supabaseClient || !currentUser) {
    setAdminVisibility();
    return;
  }

  els.adminAccessStatus.textContent = "Checking backend access...";

  const { data, error } = await supabaseClient.rpc("get_admin_dashboard");
  if (error) {
    isAdminUser = false;
    setAdminVisibility();
    els.adminAccessStatus.textContent = error.message || "Admin dashboard is unavailable.";
    return;
  }

  isAdminUser = true;
  setAdminVisibility();
  renderAdminDashboard(data || {});
  await trackEvent("admin_dashboard_viewed");
}

async function createCampaign(event) {
  event.preventDefault();
  if (!supabaseClient || !isAdminUser || !els.campaignForm.reportValidity()) return;

  const campaign = {
    name: cleanText(els.campaignName.value, ""),
    channel: els.campaignChannel.value,
    status: "draft",
  };

  const { error } = await supabaseClient.from("marketing_campaigns").insert(campaign);
  if (error) {
    els.adminAccessStatus.textContent = `Could not create campaign: ${error.message}`;
    return;
  }

  els.campaignForm.reset();
  await trackEvent("campaign_created", campaign);
  await loadAdminDashboard();
}

function getPaperForStorage(paper) {
  const { relevance, ...paperForStorage } = normalizePaperMath(paper);
  return paperForStorage;
}

async function syncPaperToCloud(paper) {
  if (!supabaseClient || !currentUser) return;

  const { error } = await supabaseClient.from("saved_papers").upsert(
    {
      user_id: currentUser.id,
      paper_id: paper.id,
      paper: getPaperForStorage(paper),
    },
    { onConflict: "user_id,paper_id" }
  );

  if (error) {
    setAccountStatus(`Could not sync this paper yet: ${error.message}`, "Sync needs attention");
  }
}

async function removePaperFromCloud(paperId) {
  if (!supabaseClient || !currentUser) return;

  const { error } = await supabaseClient
    .from("saved_papers")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("paper_id", paperId);

  if (error) {
    setAccountStatus(`Could not remove this paper from your account: ${error.message}`, "Sync needs attention");
  }
}

async function clearCloudReadingList() {
  if (!supabaseClient || !currentUser) return;

  const { error } = await supabaseClient.from("saved_papers").delete().eq("user_id", currentUser.id);
  if (error) {
    setAccountStatus(`Could not clear your cloud research library: ${error.message}`, "Sync needs attention");
  }
}

async function loadCloudReadingList() {
  if (!supabaseClient || !currentUser) return;

  const { data, error } = await supabaseClient
    .from("saved_papers")
    .select("paper")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    setAccountStatus(`Signed in, but saved papers could not load: ${error.message}`, "Sync needs attention");
    return;
  }

  const cloudPapers = (data || []).map((row) => row.paper).filter(Boolean);
  const merged = [...cloudPapers, ...readingList].reduce((papers, paper) => {
    if (!papers.some((savedPaper) => savedPaper.id === paper.id)) {
      papers.push(paper);
    }
    return papers;
  }, []);

  readingList = merged;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readingList));
  await Promise.all(readingList.map((paper) => syncPaperToCloud(paper)));
  renderReadingList();
}

async function refreshAuthSession() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data.user) {
    currentUser = null;
    currentProfile = null;
    isAdminUser = false;
    setAuthUiForUser(null);
    setAdminVisibility();
    setAccountStatus("Account sync is connected. Sign up or sign in to save papers across devices.", "Account ready");
    return;
  }

  currentUser = data.user;
  setAuthUiForUser(currentUser);
  setAccountStatus(`Signed in as ${currentUser.email}. Your research library is synced.`, "Account active");
  await syncUserProfile();
  await loadCloudReadingList();
}

function initAuth() {
  if (!isSupabaseConfigured()) {
    setAuthUiForUser(null);
    setAccountStatus(
      "Accounts are not connected yet. Add your Supabase URL and anon key in supabase-config.js, then run supabase-schema.sql in Supabase.",
      "Setup required"
    );
    return;
  }

  if (!window.supabase?.createClient) {
    setAccountStatus("Supabase could not load. Check your connection and refresh.", "Setup required");
    return;
  }

  const config = getSupabaseConfig();
  supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  refreshAuthSession();

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    setAuthUiForUser(currentUser);
    if (currentUser) {
      setAccountStatus(`Signed in as ${currentUser.email}. Your research library is synced.`, "Account active");
      syncUserProfile();
      loadCloudReadingList();
    } else {
      currentProfile = null;
      isAdminUser = false;
      setAdminVisibility();
      setAccountStatus("Signed out. Sign in again to sync your research library across devices.", "Account ready");
      renderReadingList();
    }
  });
}

async function handleSignUp() {
  if (!supabaseClient) {
    setAccountStatus("Account setup is not connected yet. Add Supabase keys first.", "Setup required");
    return;
  }

  if (!els.authForm.reportValidity()) return;

  els.signUpButton.disabled = true;
  setAccountStatus("Creating your PaperTrail workspace...", "Working");

  const { data, error } = await supabaseClient.auth.signUp({
    email: els.authEmail.value,
    password: els.authPassword.value,
  });

  els.signUpButton.disabled = false;

  if (error) {
    setAccountStatus(error.message, "Sign up failed");
    return;
  }

  currentUser = data.user;
  if (currentUser) {
    setAuthUiForUser(currentUser);
    setAccountStatus(`Account created for ${currentUser.email}. Your research library is synced.`, "Account active");
    await trackEvent("signup_completed");
    await syncUserProfile();
    await loadCloudReadingList();
  } else {
    await trackEvent("signup_confirmation_required");
    setAccountStatus("Check your email to confirm your account, then sign in.", "Confirm email");
  }
}

async function handleSignIn(event) {
  event.preventDefault();
  if (!supabaseClient) {
    setAccountStatus("Account setup is not connected yet. Add Supabase keys first.", "Setup required");
    return;
  }

  if (!els.authForm.reportValidity()) return;

  els.signInButton.disabled = true;
  setAccountStatus("Signing in...", "Working");

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: els.authEmail.value,
    password: els.authPassword.value,
  });

  els.signInButton.disabled = false;

  if (error) {
    setAccountStatus(error.message, "Sign in failed");
    return;
  }

  currentUser = data.user;
  setAuthUiForUser(currentUser);
  setAccountStatus(`Signed in as ${currentUser.email}. Your research library is synced.`, "Account active");
  await trackEvent("signin_completed");
  await syncUserProfile();
  await loadCloudReadingList();
}

async function handleSignOut() {
  if (!supabaseClient) return;

  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  isAdminUser = false;
  setAuthUiForUser(null);
  setAdminVisibility();
  setAccountStatus("Signed out. Sign in again to sync your research library across devices.", "Account ready");
}

function cleanText(value, fallback = "Not listed") {
  if (!value || typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim() || fallback;
}

function decodeMathEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function mathOperatorToLatex(operator) {
  const normalized = decodeMathEntities(operator).trim();
  const operators = {
    "(": "(",
    ")": ")",
    "[": "[",
    "]": "]",
    "{": "\\{",
    "}": "\\}",
    "+": "+",
    "-": "-",
    "=": "=",
    "<": "<",
    ">": ">",
    "≤": "\\leq",
    "≥": "\\geq",
    "×": "\\times",
    "⋅": "\\cdot",
    "→": "\\to",
    "∈": "\\in",
  };
  return operators[normalized] || normalized;
}

function mathIdentifierToLatex(content, attributes = "") {
  const identifier = decodeMathEntities(content).trim();
  if (!identifier) return "";
  if (/mathvariant=["']double-struck["']/.test(attributes)) {
    return identifier
      .split("")
      .map((character) => /[A-Za-z]/.test(character) ? `\\mathbb{${character}}` : character)
      .join("");
  }
  if (/mathvariant=["']bold["']/.test(attributes)) {
    return `\\mathbf{${identifier}}`;
  }
  return identifier;
}

function mathMlToLatex(mathMarkup) {
  let latex = decodeMathEntities(mathMarkup)
    .replace(/<[^>]*:?mi\b([^>]*)>(.*?)<\/[^>]*:?mi>/gi, (_match, attributes, content) =>
      mathIdentifierToLatex(content, attributes)
    )
    .replace(/<[^>]*:?mn\b[^>]*>(.*?)<\/[^>]*:?mn>/gi, (_match, content) => decodeMathEntities(content).trim())
    .replace(/<[^>]*:?mo\b[^>]*>(.*?)<\/[^>]*:?mo>/gi, (_match, content) => mathOperatorToLatex(content))
    .replace(/<[^>]*:?mtext\b[^>]*>(.*?)<\/[^>]*:?mtext>/gi, (_match, content) => `\\text{${decodeMathEntities(content).trim()}}`)
    .replace(/<[^>]*:?msup\b[^>]*>\s*([^<]+)\s*([^<]+)\s*<\/[^>]*:?msup>/gi, "$1^{$2}")
    .replace(/<[^>]*:?msub\b[^>]*>\s*([^<]+)\s*([^<]+)\s*<\/[^>]*:?msub>/gi, "$1_{$2}")
    .replace(/<[^>]*:?mfrac\b[^>]*>\s*([^<]+)\s*([^<]+)\s*<\/[^>]*:?mfrac>/gi, "\\frac{$1}{$2}")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  latex = latex
    .replace(/\s*([()=+\-<>])\s*/g, "$1")
    .replace(/\\mathbb\{([A-Za-z])\}\\mathbb\{([A-Za-z])\}/g, "\\mathbb{$1$2}")
    .replace(/([A-Za-z0-9}])\\mathbb/g, "$1 \\mathbb");

  return latex ? `\\(${latex}\\)` : "";
}

function convertEmbeddedMathMarkup(value) {
  if (!value || typeof value !== "string") return "";
  return decodeMathEntities(value)
    .replace(/<[^>\s:]*:?math\b[\s\S]*?<\/[^>\s:]*:?math>/gi, (mathMarkup) => {
      const latex = mathMlToLatex(mathMarkup);
      return latex ? ` ${latex} ` : " ";
    })
    .replace(/<[^>\s:]*:?math\b[\s\S]*$/gi, " ");
}

function normalizeMathText(value) {
  return cleanText(convertEmbeddedMathMarkup(value), "")
    .replace(/\\\(/g, "\\(")
    .replace(/\\\)/g, "\\)")
    .replace(/\\\[/g, "\\[")
    .replace(/\\\]/g, "\\]")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\\\)\s+-/g, "\\)-")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/\b([A-Za-z])\s+\^\s*([0-9A-Za-z+-]+)/g, "$1^$2")
    .replace(/\b([A-Za-z])\s+_\s*([0-9A-Za-z+-]+)/g, "$1_$2")
    .replace(/(^|[^\\])\b(alpha|beta|gamma|delta|epsilon|lambda|mu|pi|sigma|theta|omega)\b/g, (match, prefix, name) => {
      const greek = {
        alpha: "α",
        beta: "β",
        gamma: "γ",
        delta: "δ",
        epsilon: "ε",
        lambda: "λ",
        mu: "μ",
        pi: "π",
        sigma: "σ",
        theta: "θ",
        omega: "ω",
      };
      return `${prefix}${greek[name] || name}`;
    });
}

function normalizePaperMath(paper) {
  if (!paper) return paper;
  return {
    ...paper,
    title: normalizeMathText(paper.title),
    authors: normalizeMathText(paper.authors),
    source: normalizeMathText(paper.source),
    summary: normalizeMathText(paper.summary),
    concepts: (paper.concepts || []).map((concept) => normalizeMathText(concept)),
  };
}

function renderRichText(target, value) {
  target.innerHTML = richTextHtml(value);
}

function richTextHtml(value) {
  const escaped = escapeHtml(normalizeMathText(value));
  return renderMathFallback(escaped);
}

function renderMathFallback(escapedText) {
  return escapedText;
}

function mathHtml(expression, className) {
  return `<span class="${className}">${readableMathExpression(expression)}</span>`;
}

function readableMathExpression(expression) {
  const greek = {
    "\\alpha": "α",
    "\\beta": "β",
    "\\gamma": "γ",
    "\\delta": "δ",
    "\\epsilon": "ε",
    "\\lambda": "λ",
    "\\mu": "μ",
    "\\pi": "π",
    "\\sigma": "σ",
    "\\theta": "θ",
    "\\omega": "ω",
  };
  const operators = {
    "\\sum": "∑",
    "\\prod": "∏",
    "\\int": "∫",
    "\\infty": "∞",
    "\\partial": "∂",
    "\\nabla": "∇",
    "\\approx": "≈",
    "\\neq": "≠",
    "\\leq": "≤",
    "\\geq": "≥",
    "\\times": "×",
    "\\cdot": "·",
    "\\pm": "±",
    "\\rightarrow": "→",
    "\\to": "→",
  };

  return expression
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\(?:left|right)/g, "")
    .replace(/\{([^{}]+)\}/g, "$1")
    .replace(/\\[a-zA-Z]+/g, (command) => greek[command] || operators[command] || command.replace("\\", ""))
    .replace(/\s+/g, " ")
    .replace(/\s*([=+\-*<>≤≥≈≠×·±→])\s*/g, " $1 ")
    .trim();
}

function typesetMath(root = document.body) {
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([root]).catch(() => {});
  }
}

function invertAbstract(index) {
  if (!index) return "";

  const words = [];
  Object.entries(index).forEach(([word, positions]) => {
    positions.forEach((position) => {
      words[position] = word;
    });
  });

  return normalizeMathText(words.filter(Boolean).join(" "));
}

function normalizeSearchText(value) {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueItems(items) {
  return [...new Set(items.filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPdfJs() {
  const pdfjs = window.pdfjsLib;
  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }
  return pdfjs;
}

async function extractPdfText(file) {
  const pdfjs = getPdfJs();
  if (!pdfjs?.getDocument) {
    throw new Error("PDF engine is still loading. Try again in a moment.");
  }

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .map((item) => ({
        text: item.str,
        x: item.transform?.[4] || 0,
        y: item.transform?.[5] || 0,
        width: item.width || 0,
        height: item.height || 0,
        fontName: item.fontName || "",
      }))
      .filter((item) => cleanText(item.text, ""));
    const lines = groupPdfItemsIntoLines(items);
    const text = lines.map((line) => line.text).join("\n").trim();
    if (text) {
      pages.push({
        pageNumber,
        text,
        characterCount: text.length,
        itemCount: items.length,
        lines: lines.slice(0, 140),
      });
    }
  }

  const fullText = normalizeMathText(pages.map((page) => page.text).join("\n\n"));
  return {
    pageCount: pdf.numPages,
    pagesWithText: pages.length,
    emptyPageCount: Math.max(0, pdf.numPages - pages.length),
    averageCharactersPerPage: pages.length
      ? Math.round(pages.reduce((total, page) => total + page.characterCount, 0) / pages.length)
      : 0,
    text: fullText,
    pages,
  };
}

function groupPdfItemsIntoLines(items) {
  const sortedItems = [...items].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
    return a.x - b.x;
  });
  const lines = [];

  sortedItems.forEach((item) => {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (line) {
      line.items.push(item);
      line.y = (line.y + item.y) / 2;
      line.height = Math.max(line.height, item.height);
    } else {
      lines.push({ y: item.y, height: item.height, items: [item] });
    }
  });

  return lines
    .map((line) => {
      const lineItems = line.items.sort((a, b) => a.x - b.x);
      return {
        text: normalizeMathText(lineItems.map((item) => item.text).join(" ").replace(/\s+/g, " ")),
        y: Math.round(line.y),
        height: Math.round(line.height),
      };
    })
    .filter((line) => line.text);
}

function getSectionPatterns() {
  return [
    ["abstract", "(?:abstract)"],
    ["introduction", "(?:introduction)"],
    ["relatedWork", "(?:related work|background|prior work)"],
    ["methods", "(?:methodology|methods?|materials and methods|model|approach)"],
    ["results", "(?:results?|experiments?|evaluation)"],
    ["discussion", "(?:discussion)"],
    ["limitations", "(?:limitations?|threats to validity)"],
    ["conclusion", "(?:conclusions?|concluding remarks)"],
    ["references", "(?:references|bibliography)"],
  ];
}

function extractPaperSections(fullText) {
  const text = normalizeMathText(fullText)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const hits = getSectionPatterns()
    .map(([key, labelPattern]) => {
      const anchoredPattern = new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.?\\s*)?(${labelPattern})\\s*(?:\\n|$)`, "i");
      const loosePattern = new RegExp(`(?:^|[.!?]\\s+|\\n)\\s*(?:\\d+\\.?\\s*)?(${labelPattern})(?=\\s+[A-Z0-9])`, "i");
      const match = anchoredPattern.exec(text) || loosePattern.exec(text);
      return match ? { key, index: match.index + match[0].indexOf(match[1]), label: match[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);

  const sections = {};
  hits.forEach((hit, index) => {
    const next = hits[index + 1];
    const raw = text.slice(hit.index, next ? next.index : undefined).trim();
    const withoutHeading = raw
      .replace(new RegExp(`^(?:\\d+\\.?\\s*)?${escapeRegExp(hit.label)}\\s*`, "i"), "")
      .trim();
    sections[hit.key] = withoutHeading || raw;
  });

  if (!sections.abstract) {
    sections.abstract = getSentences(text, 8).join(" ");
  }

  return sections;
}

function extractMatches(text, pattern, limit = 12) {
  const matches = [];
  let match;
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  while ((match = regex.exec(text)) && matches.length < limit) {
    matches.push(cleanText(match[0], ""));
  }
  return uniqueItems(matches);
}

function getSectionCoverage(sections) {
  const expected = ["abstract", "introduction", "methods", "results", "discussion", "limitations", "conclusion", "references"];
  const detected = expected.filter((key) => cleanText(sections[key] || "", "").length > 120);
  return {
    detected,
    missing: expected.filter((key) => !detected.includes(key)),
    score: Math.round((detected.length / expected.length) * 100),
  };
}

function extractFigureTableIndex(text) {
  const figureCaptions = extractMatches(
    text,
    /\b(?:Figure|Fig\.)\s+[A-Za-z0-9.:-]+\.?\s+[^.\n]*(?:\.[^.\n]*){0,2}/gi,
    16
  );
  const tableCaptions = extractMatches(
    text,
    /\bTable\s+[A-Za-z0-9.:-]+\.?\s+[^.\n]*(?:\.[^.\n]*){0,2}/gi,
    16
  );
  return {
    figureCaptions,
    tableCaptions,
    figureCount: figureCaptions.length,
    tableCount: tableCaptions.length,
  };
}

function extractEquationSignals(pages) {
  const mathSymbols = /[=<>≤≥≈≠∑∫√∂∇∞±×⊗⊕→←↦∈∀∃λθμσαβγδπ]|\b(?:argmax|argmin|log|exp|Pr|Var|Cov|Tr)\b/;
  const equationLines = [];

  pages.forEach((page) => {
    (page.lines || []).forEach((line) => {
      const text = cleanText(line.text, "");
      const symbolHits = (text.match(/[=<>≤≥≈≠∑∫√∂∇∞±×⊗⊕→←↦∈∀∃λθμσ]/g) || []).length;
      const isEquationLike =
        text.length >= 8 &&
        text.length <= 220 &&
        mathSymbols.test(text) &&
        (symbolHits >= 2 || /(?:\^|_|\\|frac|sum|theta|lambda|operatorname)/i.test(text));
      if (isEquationLike) {
        equationLines.push(`p.${page.pageNumber}: ${normalizeMathText(text)}`);
      }
    });
  });

  return uniqueItems(equationLines).slice(0, 18);
}

function extractCitationIndex(text, sections) {
  const bracketCitations = extractMatches(text, /\[[0-9,\s-]{1,24}\]/g, 18);
  const authorYearCitations = extractMatches(
    text,
    /\b[A-Z][A-Za-z-]+(?:\s+et\s+al\.)?\s*\((?:19|20)\d{2}[a-z]?\)/g,
    18
  );
  const referenceText = sections.references || "";
  const referenceEntries = referenceText
    .split(/\n|(?=\[\d+\])|(?=\b[A-Z][A-Za-z-]+,\s+[A-Z]\.)/)
    .map((entry) => cleanText(entry, ""))
    .filter((entry) => entry.length > 40)
    .slice(0, 12);

  return {
    bracketCitations,
    authorYearCitations,
    referenceEntries,
    citationStyle: bracketCitations.length
      ? "numeric bracket citations"
      : authorYearCitations.length
        ? "author-year citations"
        : "citation style not confidently detected",
  };
}

function makeIngestionDiagnostics(extraction, sections) {
  const coverage = getSectionCoverage(sections);
  const textDensity =
    extraction.pageCount > 0 ? Math.round((extraction.text.length / extraction.pageCount) * 10) / 10 : 0;
  const scannedRisk =
    extraction.pagesWithText === 0 ||
    extraction.averageCharactersPerPage < 300 ||
    extraction.emptyPageCount / Math.max(extraction.pageCount, 1) > 0.35;

  return {
    textDensity,
    sectionCoverage: coverage,
    scannedRisk,
    qualityLabel: scannedRisk
      ? "low text-layer confidence"
      : coverage.score >= 60
        ? "strong structured text layer"
        : "usable text layer with weak heading detection",
    warnings: [
      scannedRisk ? "The PDF may be scanned, image-heavy, or protected from extraction." : "",
      coverage.missing.length ? `Missing or weak section detection: ${coverage.missing.join(", ")}.` : "",
    ].filter(Boolean),
  };
}

function analyzePdfStructure(extraction, sections) {
  return {
    diagnostics: makeIngestionDiagnostics(extraction, sections),
    visualIndex: extractFigureTableIndex(extraction.text),
    equationSignals: extractEquationSignals(extraction.pages || []),
    citationIndex: extractCitationIndex(extraction.text, sections),
  };
}

function getLikelyTitleFromPdf(fileName, fullText) {
  const firstLines = fullText
    .split(/\n|\.\s/)
    .map((line) => cleanText(line, ""))
    .filter((line) => line.length > 12 && line.length < 180);
  return firstLines[0] || fileName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
}

function paperFromPdfExtraction(file, extraction, titleOverride = "") {
  const sections = extractPaperSections(extraction.text);
  const structure = analyzePdfStructure(extraction, sections);
  const title = cleanText(titleOverride, "") || getLikelyTitleFromPdf(file.name, extraction.text);
  const summary = sections.abstract || getSentences(extraction.text, 8).join(" ");
  const concepts = uniqueItems(
    [title, sections.abstract || "", sections.introduction || ""]
      .join(" ")
      .match(/\b[A-Z][A-Za-z-]{4,}(?:\s+[A-Z][A-Za-z-]{4,}){0,2}\b/g) || []
  ).slice(0, 8);

  return normalizePaperMath({
    id: `uploaded:${file.name}:${file.size}:${file.lastModified}`,
    title,
    year: "Uploaded paper",
    date: new Date(file.lastModified || Date.now()).toISOString().slice(0, 10),
    type: "full-text PDF",
    source: "Uploaded PDF",
    authors: "Extracted from uploaded paper",
    summary: summary || "PaperTrail extracted full text from this PDF, but could not identify a clean abstract.",
    url: "",
    citedByCount: 0,
    isOpenAccess: true,
    language: "unknown",
    concepts: concepts.length ? concepts : ["Full-text paper"],
    fullText: extraction.text,
    extractedSections: sections,
    extractedStructure: structure,
    extraction: {
      source: "uploaded-pdf",
      fileName: file.name,
      pageCount: extraction.pageCount,
      pagesWithText: extraction.pagesWithText,
      emptyPageCount: extraction.emptyPageCount,
      averageCharactersPerPage: extraction.averageCharactersPerPage,
      characterCount: extraction.text.length,
      extractedAt: new Date().toISOString(),
    },
  });
}

function paperFromRemotePdf(basePaper, extraction, pdfUrl) {
  const sections = extractPaperSections(extraction.text);
  const structure = analyzePdfStructure(extraction, sections);
  const summary = sections.abstract || basePaper.summary || getSentences(extraction.text, 8).join(" ");

  return normalizePaperMath({
    ...basePaper,
    id: `${basePaper.id}:full-text`,
    type: "full-text PDF",
    source: `${basePaper.source} / full text`,
    summary: summary || "PaperTrail extracted full text from this paper, but could not identify a clean abstract.",
    isOpenAccess: true,
    fullText: extraction.text,
    extractedSections: sections,
    extractedStructure: structure,
    extraction: {
      source: "openalex-pdf-url",
      pdfUrl,
      pageCount: extraction.pageCount,
      pagesWithText: extraction.pagesWithText,
      emptyPageCount: extraction.emptyPageCount,
      averageCharactersPerPage: extraction.averageCharactersPerPage,
      characterCount: extraction.text.length,
      extractedAt: new Date().toISOString(),
    },
  });
}

async function extractRemotePdfText(pdfUrl) {
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`The full-text PDF could not be downloaded (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") || "";
  const blob = await response.blob();
  const fileName = pdfUrl.split("/").pop()?.split("?")[0] || "openalex-full-text.pdf";
  const file = new File([blob], fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`, {
    type: contentType.includes("pdf") ? contentType : "application/pdf",
    lastModified: Date.now(),
  });
  return extractPdfText(file);
}

function getBestPdfUrl(work) {
  const locations = [work.best_oa_location, work.primary_location, ...(work.locations || [])].filter(Boolean);
  const pdfUrl =
    locations.find((location) => location.pdf_url)?.pdf_url ||
    (work.open_access?.oa_url?.endsWith(".pdf") ? work.open_access.oa_url : "");
  return pdfUrl || "";
}

function parseSearchQuery(query) {
  const normalized = cleanText(query, "");
  const phrases = [...normalized.matchAll(/"([^"]+)"/g)]
    .map((match) => normalizeSearchText(match[1]))
    .filter(Boolean);
  const queryWithoutQuotes = normalizeSearchText(normalized.replace(/"[^"]+"/g, " "));
  const tokens = uniqueItems(
    queryWithoutQuotes
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  );
  const allTerms = uniqueItems([...tokens, ...phrases.flatMap((phrase) => phrase.split(/\s+/))]);
  const exactPhrase = phrases[0] || normalizeSearchText(normalized);

  return {
    original: normalized,
    apiQuery: normalizeSearchText(normalized.replace(/"/g, " ")),
    exactPhrase,
    phrases,
    tokens,
    allTerms,
  };
}

function getPaperSearchHaystack(paper) {
  const title = normalizeSearchText(paper.title);
  const summary = normalizeSearchText(paper.summary);
  const concepts = normalizeSearchText(paper.concepts.join(" "));
  const authors = normalizeSearchText(paper.authors);
  const source = normalizeSearchText(paper.source);

  return {
    title,
    summary,
    concepts,
    authors,
    source,
    all: [title, summary, concepts, authors, source].join(" "),
  };
}

function countTermMatches(terms, text) {
  return terms.filter((term) => text.includes(term)).length;
}

function scorePaperRelevance(paper, profile, precision) {
  const haystack = getPaperSearchHaystack(paper);
  const terms = profile.allTerms.length ? profile.allTerms : profile.apiQuery.split(/\s+/).filter(Boolean);
  const totalTerms = Math.max(terms.length, 1);
  const titleMatches = countTermMatches(terms, haystack.title);
  const summaryMatches = countTermMatches(terms, haystack.summary);
  const conceptMatches = countTermMatches(terms, haystack.concepts);
  const allMatches = countTermMatches(terms, haystack.all);
  const phraseMatches = [profile.exactPhrase, ...profile.phrases].filter(
    (phrase) => phrase && haystack.all.includes(phrase)
  ).length;
  const coverage = allMatches / totalTerms;

  let score = 0;
  score += titleMatches * 34;
  score += conceptMatches * 18;
  score += summaryMatches * 10;
  score += countTermMatches(terms, haystack.authors) * 7;
  score += countTermMatches(terms, haystack.source) * 5;
  score += phraseMatches * 42;
  score += Math.min(paper.citedByCount, 500) / 100;

  const matchedTerms = terms.filter((term) => haystack.all.includes(term));
  const hasExactPhrase = Boolean(profile.exactPhrase && haystack.all.includes(profile.exactPhrase));
  const enoughCoverage =
    precision === "balanced"
      ? coverage >= 0.35 || titleMatches > 0 || phraseMatches > 0
      : precision === "exact"
        ? hasExactPhrase
        : coverage >= 0.7 || phraseMatches > 0 || (titleMatches >= 2 && coverage >= 0.5);

  return {
    ...paper,
    relevance: {
      score,
      coverage,
      matchedTerms,
      hasExactPhrase,
      label:
        precision === "exact" && hasExactPhrase
          ? "Exact phrase match"
          : `${Math.round(coverage * 100)}% term match`,
      passesPrecision: enoughCoverage,
    },
  };
}

function rankPapers(papers, profile, precision) {
  const ranked = papers
    .map((paper) => scorePaperRelevance(paper, profile, precision))
    .sort((a, b) => b.relevance.score - a.relevance.score);
  const preciseMatches = ranked.filter((paper) => paper.relevance.passesPrecision);

  return {
    papers: (preciseMatches.length ? preciseMatches : ranked).slice(0, RESULT_LIMIT),
    usedFallback: preciseMatches.length === 0 && ranked.length > 0,
    candidateCount: ranked.length,
    preciseCount: preciseMatches.length,
  };
}

function paperFromWork(work) {
  const authors = (work.authorships || [])
    .slice(0, 4)
    .map((authorship) => authorship.author?.display_name)
    .filter(Boolean);

  const source =
    work.primary_location?.source?.display_name ||
    work.locations?.find((location) => location.source?.display_name)?.source?.display_name ||
    "OpenAlex";

  const abstract = invertAbstract(work.abstract_inverted_index);
  const topicNames = [
    work.primary_topic?.display_name,
    ...(work.topics || []).map((topic) => topic.display_name),
  ];
  const conceptNames = (work.concepts || []).map((concept) => concept.display_name);
  const concepts = uniqueItems([...topicNames, ...conceptNames])
    .slice(0, 8)
    .filter(Boolean);

  return normalizePaperMath({
    id: work.id,
    title: cleanText(work.display_name, "Untitled work"),
    year: work.publication_year || "Year unknown",
    date: work.publication_date || "Date unknown",
    type: work.type_crossref || work.type || "academic work",
    source: cleanText(source, "OpenAlex"),
    authors: authors.length ? authors.join(", ") : "Authors not listed",
    summary:
      abstract ||
      "OpenAlex does not include an abstract for this paper yet, so start with the title, venue, authors, and linked source.",
    url: work.doi ? `https://doi.org/${work.doi.replace("https://doi.org/", "")}` : work.id,
    citedByCount: work.cited_by_count || 0,
    isOpenAccess: Boolean(work.open_access?.is_oa),
    pdfUrl: getBestPdfUrl(work),
    language: work.language || "unknown",
    concepts,
  });
}

async function fetchPapers(query, options = {}) {
  const params = new URLSearchParams({
    search: query,
    per_page: String(options.perPage || CANDIDATE_LIMIT),
    sort: options.sort || "relevance_score:desc",
  });

  const response = await fetch(`${OPENALEX_BASE_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`OpenAlex returned ${response.status}`);
  }

  const data = await response.json();
  return (data.results || []).map(paperFromWork);
}

function makeReviewNotes(paper) {
  const notes = [];
  const conceptText = paper.concepts.length ? paper.concepts.join(", ") : "the keywords and title";

  if (paper.fullText) {
    notes.push(
      `Full-text dossier extracted from ${paper.extraction?.pageCount || "unknown"} pages and ${Number(
        paper.extraction?.characterCount || paper.fullText.length
      ).toLocaleString()} characters.`
    );
    notes.push("Prioritize the extracted methods, results, conclusion, and limitations before making a research decision.");
  } else {
    notes.push(`Triage the research question and how it contributes to ${conceptText}.`);

    if (paper.summary.length > 240) {
      notes.push("Separate the abstract into problem, contribution, method, evidence, and conclusion.");
    } else {
      notes.push("Because the abstract is limited, open the source to verify the method, evidence, and contribution.");
    }
  }

  notes.push(
    paper.citedByCount
      ? `Audit its scholarly footprint; OpenAlex lists ${paper.citedByCount.toLocaleString()} citations.`
      : "Check related work, replications, or follow-up papers before treating the conclusion as settled."
  );

  return notes;
}

function getSentences(text, limit = 4) {
  return cleanText(text, "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function getConceptText(paper) {
  return paper.concepts.length ? paper.concepts.join(", ") : "the topic area suggested by the title";
}

function getCitationSignal(paper) {
  if (paper.citedByCount > 500) {
    return "This paper has a very large citation footprint, so it is likely connected to an active or influential research conversation.";
  }

  if (paper.citedByCount > 50) {
    return "This paper has a meaningful citation trail, which makes it useful to inspect both the work itself and the later papers that cite it.";
  }

  if (paper.citedByCount > 0) {
    return "This paper has some citation activity, but you should still check whether the cited work agrees with it, extends it, or challenges it.";
  }

  return "OpenAlex does not list citations yet, so treat the paper as something to evaluate directly rather than as established consensus.";
}

function makeStudentPreview(paper) {
  const concepts = getConceptText(paper);
  const sentences = getSentences(paper.summary, 3);
  const firstClaim = sentences[0] || `This paper sits in the area of ${concepts}.`;
  const secondClaim =
    sentences[1] ||
    "For research triage, identify the exact problem, the evidence used, and the authors' main contribution.";

  return [
    `Intelligence brief: ${firstClaim}`,
    `Why it matters: the paper connects to ${concepts}, so the professional task is to establish field context before judging contribution and evidence.`,
    `Triage target: ${secondClaim}`,
  ].join(" ");
}

function makeExtensiveStudentSummary(paper, abstractSentences, hasAbstract) {
  const concepts = getConceptText(paper);
  const abstractMap = abstractSentences.length
    ? abstractSentences
        .map((sentence, index) => `Sentence ${index + 1}: ${sentence}`)
        .join(" ")
    : "No abstract sentences are available from OpenAlex, so this dossier uses the title, venue, topics, and citation metadata as an intelligence scaffold.";

  return [
    hasAbstract
      ? `This paper, "${paper.title}", should be read as a contribution to ${concepts}. The abstract gives the first version of the authors' argument: ${paper.summary}`
      : `This paper, "${paper.title}", is listed as a ${paper.type} in ${concepts}. OpenAlex does not provide an abstract, so this section is a metadata-based research dossier rather than a substitute for the full paper.`,
    `For a researcher, the most important task is to separate four layers: the problem the authors care about, the theoretical idea or model they use, the evidence they bring, and the conclusion they want the reader to accept. Do not merge those layers too early. A paper can have an interesting problem but weak evidence, or strong technical execution but a narrow conclusion.`,
    `A useful first-pass interpretation is: the paper is trying to move the researcher from "there is a problem or gap in ${concepts}" to "this method, argument, experiment, proof, or analysis gives us a better way to understand it." During analysis, keep asking what exactly changes between the beginning and the end of the paper.`,
    `The abstract can be unpacked into a reading map. ${abstractMap} Treat each sentence as a clue: one usually states the background problem, one introduces the approach, one summarizes evidence or results, and one points toward the conclusion.`,
    `${getCitationSignal(paper)} It was published in ${paper.year} through ${paper.source}, and OpenAlex marks the access status as ${
      paper.isOpenAccess ? "open access" : "not open access or not clearly open"
    }. Citation count is not proof of correctness, but it tells you whether the paper has entered a broader scholarly conversation.`,
    "Before reading the full text, write a one-sentence hypothesis about the paper's contribution. After reading, compare that hypothesis to the authors' conclusion. The difference between those two sentences is the start of the critique.",
  ];
}

function makeEquationGuide(paper) {
  const concepts = getConceptText(paper);
  return [
    `Mathematics in this paper should be read as a compressed language for claims about ${concepts}. Do not start by manipulating symbols. First label every object, then ask what role the equation plays in the argument: definition, model, assumption, objective, constraint, result, or evaluation metric.`,
    "A common structure in technical papers is a model mapping inputs to outputs: \\(\\hat{y}=f_\\theta(x)\\). In words: the model \\(f\\), controlled by parameters \\(\\theta\\), takes an input \\(x\\) and produces a prediction \\(\\hat{y}\\). If the paper is not machine-learning oriented, the same idea still helps: identify the object being transformed and the rule doing the transformation.",
    "If the paper optimizes something, expect an objective such as \\[\\mathcal{L}(\\theta)=\\frac{1}{n}\\sum_{i=1}^{n}\\ell\\big(f_\\theta(x_i),y_i\\big).\\] Read it as: choose parameters \\(\\theta\\) that make the average error or cost small across examples. The audit question is what counts as error, why that objective is appropriate, and what it ignores.",
    "If the paper is probabilistic or statistical, look for expressions like \\(p(y\\mid x)\\), \\(\\mathbb{E}[X]\\), confidence intervals, likelihoods, priors, or estimators. Translate them into plain English: what is uncertain, what is conditioned on what, and what evidence changes the belief?",
    "If the paper is quantum or physics-related, notation may include states, operators, and expectation values, for example \\(|\\psi\\rangle\\), \\(U(\\theta)\\), or \\[\\langle O\\rangle=\\langle\\psi|U(\\theta)^\\dagger O U(\\theta)|\\psi\\rangle.\\] Read this as: prepare a state, transform it, measure an observable, and interpret the resulting quantity.",
    "Build a symbol table as you read. A useful table has columns for symbol, plain-English meaning, units or type, where it is defined, and why it matters. This prevents the common trap of recognizing the equation visually but not knowing what claim it supports.",
  ];
}

function makeTheoreticalBackgroundGuide(paper) {
  const concepts = getConceptText(paper);
  return {
    title: "Theoretical background",
    paragraphs: [
      `Before deep evaluation, reconstruct the field around ${concepts}. Theoretical background is not just "older papers"; it is the set of assumptions, definitions, standard problems, and accepted methods that determine how the current paper should be judged.`,
      "Start by identifying the object of study. Is the paper mainly about a phenomenon, a dataset, a mathematical model, an algorithm, a physical system, a population, a measurement procedure, or a conceptual debate? Once you know the object, the rest of the paper becomes easier to organize.",
      "Next, identify the paper's theoretical tension. Most academic papers exist because something does not fully work yet: a theory fails in some setting, a model has a weakness, an empirical result is unexplained, a method is inefficient, or two parts of the literature do not fit together neatly.",
      "Then separate background from contribution. Background explains the stage; contribution changes something on that stage. When you read the introduction and related work, mark every sentence as either context, gap, tool, assumption, or claim.",
      "Finally, keep track of what would count as success inside this field. In some fields success means predictive accuracy; in others it means interpretability, proof, causal identification, experimental control, computational efficiency, physical plausibility, or explanatory power.",
    ],
    bullets: [
      `Core concepts to review first: ${concepts}.`,
      "Definitions: capture how the paper defines its central terms, not how the terms are used casually elsewhere.",
      "Assumptions: list what the authors must assume for their method or argument to work.",
      "Prior work: identify which earlier ideas the paper depends on and which earlier ideas it criticizes or improves.",
      "Mechanism: state the proposed reason the result should happen, not just the result itself.",
      "Scope: note the conditions under which the theory is supposed to apply.",
      "Evaluation standard: determine what the field accepts as convincing evidence.",
    ],
  };
}

function makeFullPaperBreakdown(paper, likelyQuestion, hasAbstract) {
  const concepts = getConceptText(paper);
  return {
    title: "Paper architecture breakdown",
    paragraphs: [
      "Use this as a section-by-section intelligence map for evaluating the actual paper. It is generated from the available abstract and metadata, so verify each point against the original PDF or publisher page.",
    ],
    bullets: [
      `Title and topic: the title "${paper.title}" places the paper inside ${concepts}. Before deeper analysis, predict what problem the title implies and what kind of contribution would be meaningful.`,
      `Research question: start with this likely question and refine it as you read: ${likelyQuestion}`,
      hasAbstract
        ? `Abstract: break the abstract into problem, method, evidence, and conclusion. The current abstract signal is: ${paper.summary}`
        : "Abstract: OpenAlex does not provide one, so create your own after reading the introduction and conclusion.",
      "Introduction: find the gap. Write one sentence beginning with: \"This paper is needed because...\"",
      "Related work: list the papers, theories, or methods that the authors treat as foundations. Mark whether each one is being extended, corrected, compared against, or used as a tool.",
      "Theory or framework: identify the model of the world the authors are using. Ask what variables, entities, assumptions, symmetries, mechanisms, or relationships matter in that framework.",
      "Data, materials, or objects of study: determine what the paper actually studies. This may be a dataset, proof object, experimental system, simulation, corpus, benchmark, physical apparatus, or conceptual case.",
      "Method: turn the method into a recipe. Step 1, what do they start with? Step 2, what transformation or analysis do they perform? Step 3, what output or evidence do they produce?",
      "Mathematics and notation: create a symbol table and identify which equations are definitions, objectives, constraints, update rules, measurements, or final results.",
      "Results: separate what is directly shown from what is interpreted. A table, theorem, plot, experiment, or benchmark is evidence; the sentence explaining its meaning is interpretation.",
      "Figures and tables: read captions carefully. For each figure, write what changes on the axes or panels and what conclusion the authors want you to draw.",
      "Discussion: look for the authors' own explanation of why the findings matter. This section often reveals the intended contribution more clearly than the results section.",
      "Conclusion: identify the final claim. Ask whether it follows from the evidence or whether it depends on extra assumptions.",
      "Limitations: search for restrictions in scope, data, assumptions, measurement, generalization, computational cost, sample size, or theoretical coverage.",
      "Future work: write two follow-up studies: one that strengthens the paper's claim, and one that tries to break it.",
    ],
  };
}

function makeMasteryChecklist(paper) {
  const concepts = getConceptText(paper);
  return {
    title: "Research-readiness checklist",
    paragraphs: [
      "Use this checklist as the final quality gate for the dossier. If most items are answerable, the paper is ready for serious reading, citation evaluation, lab discussion, or follow-up planning.",
    ],
    bullets: [
      `Can you explain the paper's topic area in one minute, including the role of ${concepts}?`,
      "Can you state the research question without looking at the title?",
      "Can you explain why the question matters to the field?",
      "Can you name the theory, model, method, dataset, experiment, proof, or framework the paper relies on?",
      "Can you translate the most important notation or equation into ordinary language?",
      "Can you describe the authors' evidence and distinguish it from their interpretation?",
      "Can you state the conclusion and the strongest reason to believe it?",
      "Can you state the most important limitation or hidden assumption?",
      "Can you propose one future study that would strengthen the paper and one that might challenge it?",
      "Can you explain the paper to a research colleague without relying on unexplained jargon?",
    ],
  };
}

function makeResearchDecisionGuide(paper) {
  const citationSignal = paper.citedByCount
    ? `OpenAlex lists ${paper.citedByCount.toLocaleString()} citations, so inspect whether the paper is cited for its method, result, dataset, framing, or as a point of critique.`
    : "OpenAlex does not list citations yet, so treat influence and reliability as open questions.";

  return {
    title: "Research decision matrix",
    paragraphs: [
      "Use this section to decide what role the paper should play in a professional research workflow. The goal is not only to understand the paper, but to decide what to do with it.",
      citationSignal,
    ],
    bullets: [
      "Cite: cite it if the paper gives a clear definition, method, dataset, result, or theoretical frame that your own work directly depends on.",
      "Brief: brief it if the paper cleanly demonstrates a concept, method, or controversy that would help a team make sense of the field.",
      "Replicate: replicate it if the claim is important, surprising, under-tested, or depends on data, assumptions, or implementation choices that need verification.",
      "Challenge: challenge it if the conclusion overreaches the evidence, ignores plausible alternatives, or depends on fragile assumptions.",
      "Build on: build on it if the method or theory opens a clear extension, new benchmark, broader domain, or stronger experimental design.",
      "Monitor: monitor it if the paper is promising but too new, narrow, or weakly validated to rely on yet.",
      "Skip: skip deep reading if the paper does not match your research question, lacks enough methodological detail, or contributes little beyond familiar prior work.",
    ],
  };
}

function clippedSection(text, sentenceLimit = 8) {
  return getSentences(text, sentenceLimit).join(" ") || cleanText(text, "").slice(0, 1200);
}

function makeFullTextProvenance(paper) {
  if (!paper.fullText) return null;
  const extraction = paper.extraction || {};
  const sectionNames = Object.keys(paper.extractedSections || {});
  const diagnostics = paper.extractedStructure?.diagnostics;

  return {
    title: "Full-text ingestion provenance",
    paragraphs: [
      `This dossier is based on extracted PDF text, not only OpenAlex metadata. PaperTrail extracted ${Number(
        extraction.characterCount || paper.fullText.length
      ).toLocaleString()} characters across ${extraction.pageCount || "unknown"} pages from ${
        extraction.fileName || "the uploaded PDF"
      }.`,
      diagnostics
        ? `Layer-2 ingestion quality: ${diagnostics.qualityLabel}. The extracted text density is ${diagnostics.textDensity.toLocaleString()} characters per page, with ${diagnostics.sectionCoverage.score}% expected-section coverage.`
        : "Layer-2 ingestion quality could not be computed for this paper.",
    ],
    bullets: [
      `Detected sections: ${sectionNames.length ? sectionNames.join(", ") : "no formal headings detected"}.`,
      `Pages with extractable text: ${extraction.pagesWithText || "unknown"} of ${extraction.pageCount || "unknown"}.`,
      ...(diagnostics?.warnings?.length ? diagnostics.warnings : ["No major text-layer warning was detected."]),
      "Still limited: this browser layer detects captions, equation-like lines, and citation patterns, but it does not yet perform OCR or true figure/table vision reasoning.",
    ],
  };
}

function makeExtractedSectionDossier(paper) {
  if (!paper.fullText) return null;
  const sections = paper.extractedSections || {};
  const bullets = [];

  if (sections.abstract) {
    bullets.push(`Abstract signal: ${clippedSection(sections.abstract, 5)}`);
  }
  if (sections.introduction) {
    bullets.push(`Introduction and gap: ${clippedSection(sections.introduction, 6)}`);
  }
  if (sections.relatedWork) {
    bullets.push(`Prior-work context: ${clippedSection(sections.relatedWork, 5)}`);
  }
  if (sections.methods) {
    bullets.push(`Method architecture: ${clippedSection(sections.methods, 7)}`);
  }
  if (sections.results) {
    bullets.push(`Results and evidence: ${clippedSection(sections.results, 7)}`);
  }
  if (sections.discussion) {
    bullets.push(`Discussion interpretation: ${clippedSection(sections.discussion, 6)}`);
  }
  if (sections.limitations) {
    bullets.push(`Limitations stated in text: ${clippedSection(sections.limitations, 6)}`);
  }
  if (sections.conclusion) {
    bullets.push(`Conclusion signal: ${clippedSection(sections.conclusion, 6)}`);
  }

  return {
    title: "Extracted full-text dossier",
    paragraphs: [
      "These notes are derived from detected paper sections in the uploaded PDF. Use them as the main dossier layer because they come from the paper body rather than abstract metadata.",
    ],
    bullets: bullets.length
      ? bullets
      : [
          `PaperTrail extracted full text but did not detect conventional section headings. High-signal opening text: ${clippedSection(
            paper.fullText,
            10
          )}`,
        ],
  };
}

function makeFullTextEvidenceAudit(paper) {
  if (!paper.fullText) return null;
  const sections = paper.extractedSections || {};
  const methodText = sections.methods || "";
  const resultText = sections.results || "";
  const limitationText = sections.limitations || sections.discussion || "";

  return {
    title: "Full-text evidence audit",
    paragraphs: [
      "This audit uses the extracted body text to separate what the paper appears to do from what it appears to claim.",
    ],
    bullets: [
      methodText
        ? `Method evidence to inspect: ${clippedSection(methodText, 5)}`
        : "Method evidence to inspect: no clearly labeled methods section was detected, so verify method details manually in the PDF.",
      resultText
        ? `Result evidence to inspect: ${clippedSection(resultText, 5)}`
        : "Result evidence to inspect: no clearly labeled results section was detected, so identify tables, experiments, theorems, or evaluation paragraphs manually.",
      limitationText
        ? `Validity threats and caveats: ${clippedSection(limitationText, 5)}`
        : "Validity threats and caveats: no limitations/discussion section was detected, so actively search the full paper for scope restrictions and assumptions.",
      "Research judgment rule: treat a claim as strong only when the method, evidence, and stated limitations all support it.",
    ],
  };
}

function makeStructuredIngestionMap(paper) {
  if (!paper.fullText) return null;
  const structure = paper.extractedStructure || {};
  const diagnostics = structure.diagnostics || {};
  const coverage = diagnostics.sectionCoverage || {};

  return {
    title: "Structured ingestion map",
    paragraphs: [
      "This section summarizes what PaperTrail could structurally recover from the PDF before interpretation. It is the quality-control layer that tells a researcher how much of the dossier is grounded in the paper body.",
    ],
    bullets: [
      `Extraction confidence: ${diagnostics.qualityLabel || "not scored"}.`,
      `Expected sections detected: ${(coverage.detected || []).join(", ") || "none confidently detected"}.`,
      `Expected sections missing or weak: ${(coverage.missing || []).join(", ") || "none"}.`,
      `Figures detected from captions: ${structure.visualIndex?.figureCount || 0}.`,
      `Tables detected from captions: ${structure.visualIndex?.tableCount || 0}.`,
      `Equation-like lines detected: ${(structure.equationSignals || []).length}.`,
      `Citation style: ${structure.citationIndex?.citationStyle || "not detected"}.`,
    ],
  };
}

function makeVisualEvidenceIndex(paper) {
  if (!paper.fullText) return null;
  const visualIndex = paper.extractedStructure?.visualIndex || {};
  const figureCaptions = visualIndex.figureCaptions || [];
  const tableCaptions = visualIndex.tableCaptions || [];

  return {
    title: "Figure and table evidence index",
    paragraphs: [
      figureCaptions.length || tableCaptions.length
        ? "PaperTrail found explicit figure/table captions in the extracted text. Treat these as the evidence objects that likely carry the paper's main empirical, theoretical, or experimental support."
        : "No explicit figure or table captions were detected in the PDF text layer. The paper may have captions embedded as images, unusual formatting, or weak PDF text extraction.",
    ],
    bullets: [
      ...figureCaptions.slice(0, 8).map((caption) => `Figure signal: ${caption}`),
      ...tableCaptions.slice(0, 8).map((caption) => `Table signal: ${caption}`),
      ...(figureCaptions.length || tableCaptions.length
        ? ["Research audit: connect each caption to the claim it supports, then check whether the surrounding results text makes a stronger claim than the visual evidence justifies."]
        : ["Research audit: inspect the original PDF visually for figures and tables because the text layer did not expose them."]),
    ],
  };
}

function makeEquationAndNotationIndex(paper) {
  if (!paper.fullText) return null;
  const equationSignals = paper.extractedStructure?.equationSignals || [];

  return {
    title: "Equation and notation index",
    paragraphs: [
      equationSignals.length
        ? "These are equation-like lines recovered from the PDF text layer. They are not guaranteed to preserve perfect mathematical layout, but they identify where the paper's formal machinery probably lives."
        : "No strong equation-like lines were detected. The paper may be non-mathematical, or its equations may be embedded in a way the browser text layer cannot recover.",
    ],
    bullets: equationSignals.length
      ? [
          ...equationSignals.slice(0, 12),
          "Research audit: for each equation, classify it as a definition, assumption, model, objective, constraint, estimator, theorem, metric, or result.",
        ]
      : [
          "Research audit: if the paper is technical, inspect the PDF for equations manually; this ingestion layer may have missed visual equation objects.",
        ],
  };
}

function makeCitationAndReferenceIndex(paper) {
  if (!paper.fullText) return null;
  const citationIndex = paper.extractedStructure?.citationIndex || {};
  const bracketCitations = citationIndex.bracketCitations || [];
  const authorYearCitations = citationIndex.authorYearCitations || [];
  const referenceEntries = citationIndex.referenceEntries || [];

  return {
    title: "Citation and reference index",
    paragraphs: [
      "This section gives a first map of the paper's scholarly dependencies from the PDF text itself. It helps separate the paper's own contribution from the literature it leans on.",
    ],
    bullets: [
      `Detected citation style: ${citationIndex.citationStyle || "not detected"}.`,
      bracketCitations.length ? `Numeric citation samples: ${bracketCitations.slice(0, 12).join(", ")}.` : "",
      authorYearCitations.length ? `Author-year citation samples: ${authorYearCitations.slice(0, 8).join(", ")}.` : "",
      ...referenceEntries.slice(0, 6).map((entry) => `Reference signal: ${entry}`),
      referenceEntries.length
        ? "Research audit: identify which references are foundations, baselines, competing approaches, datasets, methods, and critiques."
        : "Research audit: references were not cleanly extracted; inspect the references section manually if citation context matters.",
    ].filter(Boolean),
  };
}

function getShortSentences(paper, limit = 5) {
  const sentences = getSentences(paper.summary, limit);
  if (sentences.length) return sentences;
  return [
    `${paper.title} sits inside ${getConceptText(paper)}.`,
    "The useful reading move is to identify the problem, the method, the evidence, and the limitation.",
  ];
}

function makeManualShortPaper() {
  return normalizePaperMath({
    id: `manual-short-${Date.now()}`,
    title: cleanText(els.shortsTitle.value, "Untitled paper"),
    year: new Date().getFullYear(),
    date: "Manual input",
    type: "short script source",
    source: "PaperTrail",
    authors: "Manual input",
    summary: cleanText(els.shortsAbstract.value, ""),
    url: "#visual-shorts",
    citedByCount: 0,
    isOpenAccess: false,
    language: "unknown",
    concepts: parseSearchQuery(`${els.shortsTitle.value} ${els.shortsAbstract.value}`).allTerms.slice(0, 6),
  });
}

function getVisualVocabulary(paper) {
  const haystack = normalizeSearchText(`${paper.title} ${paper.summary} ${paper.concepts.join(" ")}`);

  if (/(quantum|physics|operator|state|particle|wave|hamiltonian)/.test(haystack)) {
    return {
      object: "a glowing state vector rotating through a measurement grid",
      tension: "two possible paths diverging, then collapsing into an observed result",
      evidence: "small probability bars rising beside a simple state diagram",
    };
  }

  if (/(network|graph|node|social|citation|community)/.test(haystack)) {
    return {
      object: "nodes connected by thin lines, with one cluster gradually lighting up",
      tension: "a messy graph being compressed into a cleaner map",
      evidence: "edge weights changing thickness as the claim becomes testable",
    };
  }

  if (/(machine learning|neural|model|classification|prediction|dataset|benchmark|algorithm)/.test(haystack)) {
    return {
      object: "points flowing through a simple model box into an output plane",
      tension: "overlapping data clouds separating as the method learns a boundary",
      evidence: "a loss curve settling while example points snap into groups",
    };
  }

  if (/(causal|treatment|policy|health|medical|clinical|population)/.test(haystack)) {
    return {
      object: "two matched timelines running side by side",
      tension: "a hidden confounder sliding between cause and outcome",
      evidence: "comparison bars narrowing into an estimated effect",
    };
  }

  return {
    object: "a central idea represented as a clean dot, line, and arrow system",
    tension: "a tangled diagram simplifying into one clear relationship",
    evidence: "three evidence tiles appearing one by one beside the main claim",
  };
}

function makeShortPlan(paper, targetDuration = 60) {
  const duration = Number(targetDuration) || 60;
  const concepts = getConceptText(paper);
  const sentences = getShortSentences(paper, 6);
  const likelyQuestion =
    sentences[0] || `What does this paper change about how we understand ${concepts}?`;
  const methodSignal =
    sentences.find((sentence) => /method|approach|model|experiment|analysis|estimate|algorithm|data/i.test(sentence)) ||
    "The paper proposes a way to move from a messy research problem to a more testable claim.";
  const resultSignal =
    sentences.find((sentence) => /result|show|find|found|demonstrate|improve|suggest|reveal/i.test(sentence)) ||
    "The key result is the evidence you should verify in the original figures, tables, proofs, or experiments.";
  const caveatSignal =
    sentences.find((sentence) => /limit|however|although|while|future|challenge|may|might/i.test(sentence)) ||
    "The limitation to watch is whether the claim holds beyond the paper's assumptions, data, or setting.";
  const visuals = getVisualVocabulary(paper);
  const sceneLengths =
    duration === 45
      ? [5, 8, 10, 11, 7, 4]
      : duration === 90
        ? [8, 14, 18, 20, 20, 10]
        : [6, 10, 13, 14, 12, 5];
  let cursor = 0;
  const timeRange = (seconds) => {
    const start = cursor;
    cursor += seconds;
    return `${start}-${cursor}s`;
  };

  const scenes = [
    {
      label: "Hook",
      time: timeRange(sceneLengths[0]),
      narration: `What if the whole paper is really asking one question: ${likelyQuestion}`,
      visual: `Start with ${visuals.object}. Fade the title into one central question, then erase every extra word except the main idea.`,
    },
    {
      label: "The problem",
      time: timeRange(sceneLengths[1]),
      narration: `The background is ${concepts}. The paper matters because something in that area is still hard to explain, measure, predict, or prove.`,
      visual: `${visuals.tension}. Add a small "gap" label between what researchers want to know and what current tools can show.`,
    },
    {
      label: "The move",
      time: timeRange(sceneLengths[2]),
      narration: methodSignal,
      visual: "Animate a three-step path: input or assumption, transformation or method, then output or claim. Keep each label short enough for a phone screen.",
    },
    {
      label: "The evidence",
      time: timeRange(sceneLengths[3]),
      narration: resultSignal,
      visual: `${visuals.evidence}. Show evidence as separate from interpretation by placing the measured result on one side and the authors' claim on the other.`,
    },
    {
      label: "The catch",
      time: timeRange(sceneLengths[4]),
      narration: caveatSignal,
      visual: "Dim the confident diagram and highlight one assumption, dataset boundary, model choice, or missing comparison as the pressure point.",
    },
    {
      label: "Research target",
      time: timeRange(sceneLengths[5]),
      narration: "When you read the paper, ask: what exactly changed from the first diagram to the last?",
      visual: "Return to the opening diagram, now simplified. End on a clean paper title card and one reading question.",
    },
  ];

  return {
    paper,
    duration,
    hook: `Explain "${paper.title}" as one visual question, then rebuild the paper as problem, method, evidence, and limitation.`,
    scenes,
    notes: [
      "Use an original geometric explainer style: simple shapes, transformations, labels, motion, and a calm tutorial voice.",
      "Avoid copying any creator's branding, logo, exact color palette, character style, voice, music, or recurring visual gags.",
      "Treat this as an educational script generated from metadata and abstract text; verify technical details in the original paper before publishing.",
    ],
  };
}

function shortPlanToText(plan) {
  return [
    `Title: ${plan.paper.title}`,
    `Target length: ${plan.duration} seconds`,
    "",
    `Hook: ${plan.hook}`,
    "",
    ...plan.scenes.flatMap((scene) => [
      `${scene.time} / ${scene.label}`,
      `Narration: ${scene.narration}`,
      `Visual: ${scene.visual}`,
      "",
    ]),
    "Production notes:",
    ...plan.notes.map((note) => `- ${note}`),
  ].join("\n");
}

function getVideoJobEndpoint(job = null) {
  const config = getSupabaseConfig();
  const baseUrl = `${config.url.replace(/\/$/, "")}/functions/v1/video-jobs`;
  if (!job) return baseUrl;
  const params = new URLSearchParams({
    job_id: job.job_id,
    token: job.public_token,
  });
  return `${baseUrl}?${params.toString()}`;
}

async function getVideoJobHeaders() {
  const config = getSupabaseConfig();
  const headers = {
    "Content-Type": "application/json",
    apikey: config.anonKey,
  };

  if (supabaseClient) {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  }

  return headers;
}

function getVideoJobStatusLabel(status) {
  const labels = {
    queued: "Queued for rendering",
    rendering: "Rendering MP4",
    completed: "Video ready",
    failed: "Render failed",
    canceled: "Canceled",
  };
  return labels[status] || "Preparing video job";
}

function renderVideoJobState(job) {
  const existing = els.shortsOutput.querySelector(".video-job-card");
  const card = existing || document.createElement("article");
  card.className = "video-job-card";

  const title = document.createElement("strong");
  title.textContent = getVideoJobStatusLabel(job.status);
  const details = document.createElement("p");
  details.textContent = job.error
    ? job.error
    : job.status === "completed"
      ? "The vertical research short is ready for download and platform review."
      : "PaperTrail has stored the render package. A configured renderer worker will produce the MP4 and update this job.";

  const actions = document.createElement("div");
  actions.className = "export-actions";
  if (job.preview_url) {
    const preview = document.createElement("a");
    preview.className = "button small";
    preview.href = job.preview_url;
    preview.target = "_blank";
    preview.rel = "noreferrer";
    preview.textContent = "Preview";
    actions.append(preview);
  }
  if (job.video_url) {
    const download = document.createElement("a");
    download.className = "button small";
    download.href = job.video_url;
    download.target = "_blank";
    download.rel = "noreferrer";
    download.textContent = "Download MP4";
    actions.append(download);
  }

  card.replaceChildren(title, details, actions);
  if (!existing) {
    els.shortsOutput.append(card);
  }
}

async function pollVideoJob(job) {
  if (!job?.job_id || !job?.public_token) return;
  window.clearTimeout(videoJobPollTimer);

  try {
    const response = await fetch(getVideoJobEndpoint(job), {
      headers: await getVideoJobHeaders(),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load video job status.");
    }

    currentVideoJob = {
      ...job,
      ...data,
      public_token: job.public_token,
    };
    saveStoredJson(VIDEO_JOB_STATE_KEY, currentVideoJob);
    renderVideoJobState(currentVideoJob);

    if (["queued", "rendering"].includes(currentVideoJob.status)) {
      videoJobPollTimer = window.setTimeout(() => pollVideoJob(currentVideoJob), 8000);
    } else if (currentVideoJob.status === "completed") {
      els.shortsStatus.textContent = "Your vertical research short is ready.";
      trackEvent("visual_short_video_completed", { job_id: currentVideoJob.job_id });
    }
  } catch (error) {
    els.shortsStatus.textContent = error.message || "Video job status is unavailable.";
  }
}

async function createVideoJobFromPlan(includeTts = false) {
  if (!currentShortPlan) {
    els.shortsStatus.textContent = "Generate a visual short storyboard before exporting video.";
    return;
  }

  els.shortsStatus.textContent = includeTts
    ? "Creating video render job with narration..."
    : "Creating video render job...";

  const response = await fetch(getVideoJobEndpoint(), {
    method: "POST",
    headers: await getVideoJobHeaders(),
    body: JSON.stringify({
      paper: currentShortPlan.paper,
      abstract: currentShortPlan.paper.summary,
      duration: currentShortPlan.duration,
      scenePlan: {
        hook: currentShortPlan.hook,
        scenes: currentShortPlan.scenes,
        notes: currentShortPlan.notes,
      },
      sessionId,
      includeTts,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    els.shortsStatus.textContent = data.error || "Could not create video render job.";
    return;
  }

  currentVideoJob = data;
  saveStoredJson(VIDEO_JOB_STATE_KEY, currentVideoJob);
  renderVideoJobState(currentVideoJob);
  els.shortsStatus.textContent = `${getVideoJobStatusLabel(data.status)}.`;
  trackEvent("visual_short_video_requested", {
    job_id: data.job_id,
    include_tts: includeTts,
    duration: currentShortPlan.duration,
  });
  pollVideoJob(currentVideoJob);
}

function renderShortPlan(plan) {
  currentShortPlan = plan;
  const wrapper = document.createElement("article");
  wrapper.className = "short-plan";

  const header = document.createElement("header");
  const kicker = document.createElement("p");
  kicker.className = "reader-kicker";
  kicker.textContent = `${plan.duration}-second visual short`;
  const title = document.createElement("h3");
  renderRichText(title, plan.paper.title);
  const hook = document.createElement("p");
  hook.className = "short-hook";
  hook.textContent = plan.hook;
  header.append(kicker, title, hook);

  const scenes = document.createElement("div");
  scenes.className = "short-scenes";
  plan.scenes.forEach((scene) => {
    const sceneCard = document.createElement("section");
    sceneCard.className = "short-scene";
    const sceneTitle = document.createElement("h4");
    sceneTitle.textContent = `${scene.time} / ${scene.label}`;
    const narration = document.createElement("p");
    narration.className = "short-narration";
    narration.textContent = scene.narration;
    const visual = document.createElement("p");
    visual.textContent = scene.visual;
    sceneCard.append(sceneTitle, narration, visual);
    scenes.append(sceneCard);
  });

  const notes = document.createElement("ul");
  notes.className = "short-notes";
  plan.notes.forEach((noteText) => {
    const note = document.createElement("li");
    note.textContent = noteText;
    notes.append(note);
  });

  const actions = document.createElement("div");
  actions.className = "export-actions";
  const copyButton = document.createElement("button");
  copyButton.className = "button small";
  copyButton.type = "button";
  copyButton.textContent = "Copy script";
  copyButton.addEventListener("click", async () => {
    const text = shortPlanToText(plan);
    try {
      await navigator.clipboard.writeText(text);
      els.shortsStatus.textContent = "Copied the visual short script to your clipboard.";
    } catch {
      els.shortsStatus.textContent = text;
    }
  });
  actions.append(copyButton);
  const videoButton = document.createElement("button");
  videoButton.className = "button small primary";
  videoButton.type = "button";
  videoButton.textContent = "Export MP4";
  videoButton.addEventListener("click", () => createVideoJobFromPlan(false));
  const narratedVideoButton = document.createElement("button");
  narratedVideoButton.className = "button small";
  narratedVideoButton.type = "button";
  narratedVideoButton.textContent = "Export MP4 + TTS";
  narratedVideoButton.addEventListener("click", () => createVideoJobFromPlan(true));
  actions.append(videoButton, narratedVideoButton);

  wrapper.append(header, scenes, notes, actions);
  els.shortsOutput.replaceChildren(wrapper);
  saveStoredJson(SHORTS_STATE_KEY, {
    title: plan.paper.title,
    abstract: plan.paper.summary,
    duration: String(plan.duration),
    plan,
    updatedAt: Date.now(),
  });
  if (currentVideoJob?.job_id) {
    renderVideoJobState(currentVideoJob);
    if (["queued", "rendering"].includes(currentVideoJob.status)) {
      pollVideoJob(currentVideoJob);
    }
  }
  typesetMath(els.shortsOutput);
}

function generateShortForPaper(paper, options = {}) {
  const normalizedPaper = normalizePaperMath(paper);
  const duration = options.duration || els.shortsDuration.value || "60";
  if (window.location.hash !== "#visual-shorts") {
    history.replaceState(null, "", "#visual-shorts");
  }
  els.shortsTitle.value = normalizedPaper.title;
  els.shortsAbstract.value = normalizedPaper.summary;
  els.shortsDuration.value = String(duration);
  const plan = makeShortPlan(normalizedPaper, duration);
  renderShortPlan(plan);
  els.shortsStatus.textContent = `Generated a ${duration}-second visual explainer short for this paper.`;
  saveViewState({ hash: "#visual-shorts", paperId: normalizedPaper.id, reviewOpen: false, source: "shorts" });
  trackEvent("visual_short_generated", { paper_id: normalizedPaper.id, source: options.source || "manual" });
}

function pickSentencesByKeywords(sentences, keywords, limit = 2) {
  return sentences
    .filter((sentence) => keywords.some((keyword) => sentence.toLowerCase().includes(keyword)))
    .slice(0, limit);
}

function makeConclusionLimitationsGuide(paper) {
  const concepts = getConceptText(paper);
  const sentences = getSentences(paper.summary, 8);
  const conclusionSentences = pickSentencesByKeywords(
    sentences,
    ["conclude", "show", "demonstrate", "suggest", "find", "found", "result", "indicate", "reveal", "support"]
  );
  const limitationSentences = pickSentencesByKeywords(
    sentences,
    ["limit", "limitation", "however", "although", "while", "may", "might", "uncertain", "bias", "challenge", "future", "further", "remain"]
  );
  const conclusionText = conclusionSentences.length
    ? `Likely conclusion signal from the available abstract: ${conclusionSentences.join(" ")}`
    : "The abstract does not clearly expose the paper's conclusion, so treat the final claim as something to verify in the original conclusion/discussion section.";
  const limitationText = limitationSentences.length
    ? `Possible limitation or caveat signal from the available abstract: ${limitationSentences.join(" ")}`
    : "The available abstract does not clearly state limitations. When reading the full paper, actively search the discussion section for scope, dataset, assumptions, generalizability, and failure cases.";

  return {
    title: "Conclusions, limitations, and future research",
    paragraphs: [
      conclusionText,
      limitationText,
      "The future-research suggestions below are generated as scholarly prompts. Use them as hypotheses to compare against the authors' own future-work section, not as verified claims about the paper.",
    ],
    bullets: [
      `Replicate or stress-test the main claim in a different setting, dataset, population, period, material system, or benchmark related to ${concepts}.`,
      "Identify the strongest assumption in the method or argument, then design a follow-up study that weakens, removes, or directly tests that assumption.",
      "Compare the paper's approach with at least one alternative theory, model, baseline, or measurement strategy to see whether the conclusion still holds.",
      "Look for boundary conditions: when would the result fail, become less useful, or require a different interpretation?",
      "If data, code, materials, or derivations are not fully transparent, propose a reproducibility-focused follow-up that makes those pieces easier to inspect.",
    ],
  };
}

function makeFullReview(paper) {
  const concepts = getConceptText(paper);
  const abstractSentences = getSentences(paper.summary, 5);
  const hasAbstract = !paper.summary.startsWith("OpenAlex does not include an abstract");
  const fullTextSections = [
    makeFullTextProvenance(paper),
    makeStructuredIngestionMap(paper),
    makeExtractedSectionDossier(paper),
    makeFullTextEvidenceAudit(paper),
    makeVisualEvidenceIndex(paper),
    makeEquationAndNotationIndex(paper),
    makeCitationAndReferenceIndex(paper),
  ].filter(Boolean);
  const likelyQuestion =
    abstractSentences[0] ||
    `The paper appears to investigate a question in ${concepts}, but the available metadata is not enough to state the exact research question confidently.`;

  return [
    ...fullTextSections,
    {
      title: "Executive intelligence brief",
      paragraphs: [
        makeStudentPreview(paper),
        "Use this dossier as a paper reconstruction pass before committing deep reading time. The goal is not to replace the paper, but to expose its structure, vocabulary, equations, assumptions, evidence, and claims so a researcher can decide how to engage with it.",
        "A strong research outcome is this: you should be able to explain the paper's question, why it matters, what the authors did, what evidence they produced, where the argument is fragile, and what a serious follow-up study would test.",
      ],
      bullets: [
        `Probable field context: ${concepts}.`,
        `Likely central question: ${likelyQuestion}`,
        "Intelligence target: reconstruct the paper's argument without copying the abstract.",
        "Research target: identify one strength, one limitation, one hidden assumption, and one future research direction.",
      ],
    },
    {
      title: "Research-grade synthesis",
      paragraphs: makeExtensiveStudentSummary(paper, abstractSentences, hasAbstract),
    },
    {
      title: "Concept and contribution map",
      paragraphs: [
        `Treat ${concepts} as the concept map for the dossier. The objective is to identify which concept is the main object of study, which concepts are tools, and which concepts are background context.`,
      ],
      bullets: [
        "Main object: what phenomenon, model, population, material, or problem is being studied?",
        "Mechanism: what relationship or process do the authors think explains the result?",
        "Evidence: what data, examples, proof, experiment, simulation, or comparison supports the claim?",
        "Boundary: where might the conclusion stop being true?",
      ],
    },
    makeTheoreticalBackgroundGuide(paper),
    {
      title: "Mathematics and notation audit",
      paragraphs: makeEquationGuide(paper),
      bullets: [
        "Identify definitions of variables the first time they appear.",
        "Translate each equation into ordinary research language before interpreting the next paragraph.",
        "Separate definitions, assumptions, objective functions, and final results; they play different roles.",
        "If notation changes between sections, make a small symbol table in your notes.",
      ],
    },
    {
      title: "Plain-language argument reconstruction",
      paragraphs: [
        `In plain language, this paper is about a specific problem inside ${concepts}. Read it as if the authors are trying to answer: "What is happening here, how can we study it, and why should anyone believe the answer?"`,
        "Do not let technical density obscure the core audit. First isolate the problem, proposed approach, evidence, and takeaway; then evaluate the details against those four anchors.",
      ],
      bullets: [
        `The paper's likely starting question: ${likelyQuestion}`,
        "The method is the authors' recipe for answering that question.",
        "The results are the evidence produced by that recipe.",
        "The conclusion is the authors' interpretation, not automatic truth.",
      ],
    },
    makeFullPaperBreakdown(paper, likelyQuestion, hasAbstract),
    makeConclusionLimitationsGuide(paper),
    {
      title: "Section-by-section research workflow",
      bullets: [
        "Abstract: underline the research question, method, data or source material, and main claim.",
        "Introduction: identify the gap. The gap tells you why the paper exists.",
        "Background or related work: note which theories, studies, or methods the authors treat as foundational.",
        "Methods: ask whether the design can actually answer the question. Watch sample size, assumptions, variables, measures, and evaluation criteria.",
        "Equations or model section: define every symbol, identify the objective, and write the equation's purpose in words.",
        "Results: separate descriptive results from causal or interpretive claims.",
        "Discussion: look for limitations, future work, and places where the authors move beyond the evidence.",
      ],
    },
    {
      title: "Evidence and contribution strengths",
      bullets: [
        "A clearly stated research question or contribution.",
        "A method that matches the stated question.",
        "Transparent data, assumptions, definitions, and evaluation criteria.",
        "Results that are tied back to the theoretical background instead of presented as isolated numbers.",
        "Limitations that honestly describe where the findings may not generalize.",
      ],
    },
    {
      title: "Limitations and critique angles",
      bullets: [
        "Does the paper overclaim from limited data, narrow examples, or a single context?",
        "Are important alternative explanations considered?",
        "Are key terms defined consistently?",
        "Would a different dataset, population, theory, or measurement strategy change the conclusion?",
        "If the paper is highly cited, are people citing it for the method, the result, the dataset, or as something to criticize?",
      ],
    },
    makeResearchDecisionGuide(paper),
    makeMasteryChecklist(paper),
    {
      title: "Scholarly assessment output",
      bullets: [
        "A concise statement of the paper's main research question.",
        "A method or argument summary suitable for lab notes or a literature review.",
        "A contribution assessment: what is new, useful, or theoretically important?",
        "A limitations assessment: what remains uncertain, narrow, under-tested, or assumption-dependent?",
        "A future-work paragraph based on the paper's conclusion, limitations, or open assumptions.",
        "A technical note about the most important equation, model, assumption, or definition if the paper is technical.",
        "A final research judgment: cite, teach, replicate, challenge, monitor, or skip.",
      ],
    },
  ];
}

function appendReviewSection(parent, section) {
  const wrapper = document.createElement("section");
  wrapper.className = "review-section";

  const title = document.createElement("h4");
  title.textContent = section.title;
  wrapper.append(title);

  (section.paragraphs || []).forEach((paragraphText) => {
    const paragraph = document.createElement("p");
    renderRichText(paragraph, paragraphText);
    wrapper.append(paragraph);
  });

  if (section.bullets?.length) {
    const list = document.createElement("ul");
    section.bullets.forEach((bulletText) => {
      const item = document.createElement("li");
      renderRichText(item, bulletText);
      list.append(item);
    });
    wrapper.append(list);
  }

  parent.append(wrapper);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugifyTitle(title) {
  return normalizeSearchText(title).replace(/\s+/g, "-").slice(0, 70) || "research-dossier";
}

function renderReviewSectionHtml(section) {
  const paragraphs = (section.paragraphs || [])
    .map((paragraph) => `<p>${richTextHtml(paragraph)}</p>`)
    .join("");
  const bullets = section.bullets?.length
    ? `<ul>${section.bullets.map((bullet) => `<li>${richTextHtml(bullet)}</li>`).join("")}</ul>`
    : "";

  return `
    <section>
      <h2>${richTextHtml(section.title)}</h2>
      ${paragraphs}
      ${bullets}
    </section>
  `;
}

function makePrintableReviewHtml(paper, reviewSections) {
  const concepts = getConceptText(paper);
  const generatedAt = new Date().toLocaleString();
  const fileName = `${slugifyTitle(paper.title)}-research-dossier.pdf`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(paper.title)} | PaperTrail Research Dossier</title>
    <style>
      @page {
        margin: 0.75in;
      }

      * {
        box-sizing: border-box;
      }

      body {
        max-width: 7.4in;
        margin: 0 auto;
        color: #111;
        background: #fff;
        font-family: "Times New Roman", Times, serif;
        font-size: 12pt;
        line-height: 1.52;
      }

      header {
        border-bottom: 1px solid #111;
        margin-bottom: 28px;
        padding-bottom: 18px;
        text-align: center;
      }

      .label {
        margin: 0 0 12px;
        font-family: Arial, sans-serif;
        font-size: 9pt;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 22pt;
        line-height: 1.16;
        font-weight: 700;
      }

      .meta {
        margin: 0;
        font-size: 10.5pt;
      }

      .abstract-box {
        border: 1px solid #222;
        margin: 22px 0 26px;
        padding: 14px 16px;
      }

      .abstract-box h2,
      section h2 {
        margin: 0 0 8px;
        font-size: 15pt;
        line-height: 1.25;
      }

      section {
        break-inside: avoid;
        margin: 0 0 22px;
      }

      p {
        margin: 0 0 10px;
        text-align: justify;
      }

      ul {
        margin: 6px 0 0 22px;
        padding: 0;
      }

      li {
        margin: 0 0 6px;
      }

      .reading-plan {
        border-top: 1px solid #555;
        border-bottom: 1px solid #555;
        margin: 26px 0;
        padding: 16px 0;
      }

      .small-note {
        color: #333;
        font-size: 10pt;
      }

      .math-inline,
      .math-display {
        border: 1px solid #999;
        border-radius: 3px;
        background: #f6f6f6;
        font-family: "Courier New", Courier, monospace;
      }

      .math-inline {
        display: inline-block;
        padding: 0 3px;
      }

      .math-display {
        display: block;
        margin: 8px 0;
        padding: 8px 10px;
        overflow-x: auto;
        white-space: nowrap;
      }

      .actions {
        margin: 24px 0;
        text-align: center;
      }

      button {
        border: 1px solid #111;
        border-radius: 4px;
        padding: 10px 14px;
        color: #fff;
        background: #111;
        font: 700 12px Arial, sans-serif;
        cursor: pointer;
      }

      @media print {
        .actions {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <p class="label">PaperTrail Research Intelligence Dossier</p>
      <h1>${richTextHtml(paper.title)}</h1>
      <p class="meta">${richTextHtml(paper.authors)}</p>
      <p class="meta">${richTextHtml(paper.source)} · ${richTextHtml(paper.date)} · ${richTextHtml(paper.type)}</p>
      <p class="meta">Topics: ${richTextHtml(concepts)}</p>
    </header>

    <div class="actions">
      <button type="button" onclick="window.print()">Save / Print as PDF</button>
      <p class="small-note">Suggested file name: ${escapeHtml(fileName)}</p>
    </div>

    <div class="abstract-box">
      <h2>Abstract-Based Intelligence Summary</h2>
      <p>${richTextHtml(paper.summary)}</p>
    </div>

    ${reviewSections.map(renderReviewSectionHtml).join("")}

    <section class="reading-plan">
      <h2>Research Workflow</h2>
      <ul>
        <li>First pass: read title, abstract, introduction, section headings, figures, and conclusion.</li>
        <li>Second pass: read methods and results slowly; write down assumptions and unfamiliar terms.</li>
        <li>Third pass: compare claims against evidence and write a research judgment before consulting external commentary.</li>
        <li>Final note: decide whether the paper is foundational, useful background, methodologically weak, or worth deeper follow-up.</li>
      </ul>
    </section>

    <section>
      <h2>Source and Metadata</h2>
      <ul>
        <li>Paper URL: ${escapeHtml(paper.url)}</li>
        <li>OpenAlex citations: ${paper.citedByCount.toLocaleString()}</li>
        <li>Access signal: ${paper.isOpenAccess ? "Open access" : "Not marked open access"}</li>
        <li>Generated by PaperTrail on ${escapeHtml(generatedAt)}.</li>
      </ul>
      <p class="small-note">This dossier is generated from OpenAlex metadata and available abstract text. Use it as structured research intelligence, then verify details in the original paper.</p>
    </section>
    <script>
      window.MathJax = {
        tex: {
          inlineMath: [["$", "$"], ["\\\\(", "\\\\)"]],
          displayMath: [["$$", "$$"], ["\\\\[", "\\\\]"]],
          processEscapes: true
        },
        svg: { fontCache: "global" }
      };
    </script>
    <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
  </body>
</html>`;
}

function prepareReviewEmail(paper, email, fileName) {
  if (!email) return;

  const subject = `PaperTrail research dossier: ${paper.title}`;
  const body = [
    "Hi,",
    "",
    `I prepared a PaperTrail research intelligence dossier for: ${paper.title}`,
    "",
    "Please attach the PDF generated from the browser print window before sending.",
    "",
    `Paper link: ${paper.url}`,
  ].join("\n");

  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

function openReviewPdfGuide(paper, email = "") {
  const reviewSections = makeFullReview(paper);
  const printableWindow = window.open("", "_blank");
  const fileName = `${slugifyTitle(paper.title)}-research-dossier.pdf`;

  if (!printableWindow) {
    alert("Please allow popups for PaperTrail so the printable research dossier can open.");
    return;
  }

  printableWindow.document.open();
  printableWindow.document.write(makePrintableReviewHtml(paper, reviewSections));
  printableWindow.document.close();
  printableWindow.focus();
  printableWindow.setTimeout(() => printableWindow.print(), 1000);

  if (email) {
    window.setTimeout(() => prepareReviewEmail(paper, email, fileName), 700);
  }
}

function isSaved(paperId) {
  return readingList.some((paper) => paper.id === paperId);
}

async function toggleSaved(paper) {
  if (isSaved(paper.id)) {
    readingList = readingList.filter((savedPaper) => savedPaper.id !== paper.id);
    await removePaperFromCloud(paper.id);
    await trackEvent("paper_removed", { paper_id: paper.id, title: paper.title });
  } else {
    readingList = [paper, ...readingList];
    await syncPaperToCloud(paper);
    await trackEvent("paper_saved", { paper_id: paper.id, title: paper.title });
  }

  saveReadingList();
  refreshSaveButtons();
}

function refreshSaveButtons() {
  document.querySelectorAll("[data-paper-id]").forEach((button) => {
    const saved = isSaved(button.dataset.paperId);
    button.textContent = saved ? "Remove" : "Save";
    button.setAttribute("aria-pressed", String(saved));
  });
}

function renderExpandableSummary(card, paper) {
  const summaryElement = card.querySelector(".summary");
  const templateToggle = card.querySelector(".summary-toggle");
  const previewLimit = 360;
  const hasLongSummary = paper.summary.length > previewLimit;
  const preview = hasLongSummary ? `${paper.summary.slice(0, previewLimit).trim()}...` : paper.summary;

  renderRichText(summaryElement, preview);

  if (!hasLongSummary) return;

  const toggleButton = templateToggle || document.createElement("button");
  toggleButton.className = "summary-toggle";
  toggleButton.type = "button";
  toggleButton.setAttribute("aria-expanded", "false");
  toggleButton.hidden = false;
  toggleButton.textContent = "Read full abstract";
  summaryElement.append(" ");
  summaryElement.append(toggleButton);

  toggleButton.addEventListener("click", () => {
    const isExpanded = toggleButton.getAttribute("aria-expanded") === "true";
    toggleButton.setAttribute("aria-expanded", String(!isExpanded));
    renderRichText(summaryElement, isExpanded ? preview : paper.summary);
    toggleButton.textContent = isExpanded ? "Read full abstract" : "Show shorter abstract";
    summaryElement.append(" ");
    summaryElement.append(toggleButton);
    typesetMath(summaryElement);
  });
}

function setModalPaperActions(paper) {
  els.reviewModalDownload.onclick = () => {
    trackEvent("pdf_dossier_created", { paper_id: paper.id, delivery: "download" });
    openReviewPdfGuide(paper);
  };
  els.reviewModalEmailButton.onclick = () => {
    const email = cleanText(els.reviewModalEmail.value, "");
    if (!email || !els.reviewModalEmail.checkValidity()) {
      els.reviewModalEmail.reportValidity();
      return;
    }
    trackEvent("pdf_dossier_created", { paper_id: paper.id, delivery: "email" });
    openReviewPdfGuide(paper, email);
  };
}

function openReviewReader(paper, options = {}) {
  const hash = options.hash || window.location.hash || "#search";
  if (window.location.hash !== hash) {
    history.replaceState(null, "", hash);
  }

  saveViewState({
    hash,
    paperId: paper.id,
    reviewOpen: true,
    source: options.source || "papers",
  });

  els.reviewModal.hidden = false;
  document.body.classList.add("modal-open");
  renderRichText(els.reviewModalTitle, paper.title);
  els.reviewModalMeta.textContent = `${paper.authors} / ${paper.source}, ${paper.date}`;
  els.reviewModalContent.replaceChildren();
  makeFullReview(paper).forEach((section) => appendReviewSection(els.reviewModalContent, section));
  els.reviewModalEmail.value = "";
  setModalPaperActions(paper);
  trackEvent("review_opened", { paper_id: paper.id, source: options.source || "papers" });
  typesetMath(els.reviewModal);
  els.reviewCloseButton.focus();
}

function closeReviewReader() {
  if (els.reviewModal.hidden) return;
  els.reviewModal.hidden = true;
  document.body.classList.remove("modal-open");
  els.reviewModalContent.replaceChildren();
  saveViewState({ reviewOpen: false });
}

function renderPapers(container, papers, emptyMessage, options = {}) {
  container.replaceChildren();
  const source = options.source || "papers";

  if (!papers.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }

  papers.map(normalizePaperMath).forEach((paper) => {
    const card = els.cardTemplate.content.firstElementChild.cloneNode(true);

    card.id = paperCardId(source, paper.id);
    card.querySelector(".year").textContent = paper.year;
    card.querySelector(".source").textContent = paper.source;
    renderRichText(card.querySelector("h3"), paper.title);
    renderRichText(card.querySelector(".authors"), paper.authors);
    renderExpandableSummary(card, paper);
    const paperLink = card.querySelector(".paper-link");
    if (paper.url) {
      paperLink.href = paper.url;
    } else {
      paperLink.remove();
    }

    const relevanceBadge = card.querySelector(".relevance-badge");
    if (paper.relevance) {
      const matched = paper.relevance.matchedTerms.slice(0, 5).join(", ");
      relevanceBadge.textContent = matched
        ? `${paper.relevance.label} / matched: ${matched}`
        : paper.relevance.label;
    } else {
      relevanceBadge.remove();
    }

    const notesList = card.querySelector(".review-notes ul");
    makeReviewNotes(paper).forEach((note) => {
      const item = document.createElement("li");
      renderRichText(item, note);
      notesList.append(item);
    });

    card.querySelector(".review-open-button").addEventListener("click", () => {
      openReviewReader(paper, { hash: options.hash || "#search", source });
    });

    const ingestButton = card.querySelector(".ingest-paper-button");
    if (paper.fullText) {
      ingestButton.textContent = "Full text ingested";
      ingestButton.disabled = true;
    } else if (paper.pdfUrl) {
      ingestButton.addEventListener("click", () => handleRemoteIngest(paper, ingestButton));
    } else {
      ingestButton.remove();
    }

    card.querySelector(".short-button").addEventListener("click", () => {
      generateShortForPaper(paper, { source });
      document.querySelector("#visual-shorts")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const saveButton = card.querySelector(".save-button");
    saveButton.dataset.paperId = paper.id;
    saveButton.addEventListener("click", () => toggleSaved(paper));

    container.append(card);
  });

  refreshSaveButtons();
  typesetMath(container);
  restoreSavedView();
}

function renderReadingList() {
  renderPapers(
    els.readingListResults,
    readingList,
    "Your research library is empty. Save papers from search or recommendations to see them here.",
    { hash: "#reading-list", source: "reading-list" }
  );
  els.clearListButton.disabled = readingList.length === 0;
}

function restoreDiscoveryViews() {
  const lastSearch = loadStoredJson(SEARCH_STATE_KEY);
  if (lastSearch?.papers?.length) {
    const restoredPapers = lastSearch.papers.map(normalizePaperMath);
    saveStoredJson(SEARCH_STATE_KEY, { ...lastSearch, papers: restoredPapers });
    els.searchInput.value = lastSearch.query || "";
    const precisionInput = els.searchForm.querySelector(`[name="precision"][value="${lastSearch.precision}"]`);
    if (precisionInput) {
      precisionInput.checked = true;
    }
    els.searchStatus.textContent =
      lastSearch.status || `Restored your last search for "${lastSearch.query}".`;
    renderPapers(els.searchResults, restoredPapers, "No matching papers found. Try a broader topic.", {
      hash: "#search",
      source: "search",
    });
  }

  const lastRecommendations = loadStoredJson(RECOMMENDATION_STATE_KEY);
  if (lastRecommendations?.papers?.length) {
    const restoredPapers = lastRecommendations.papers.map(normalizePaperMath);
    saveStoredJson(RECOMMENDATION_STATE_KEY, { ...lastRecommendations, papers: restoredPapers });
    els.interestInput.value = lastRecommendations.interests || "";
    els.recommendationStatus.textContent =
      lastRecommendations.status || "Restored your last recommendations.";
    renderPapers(
      els.recommendationResults,
      restoredPapers,
      "No recommendations found. Try a more specific mix of methods and topics.",
      { hash: "#recommendations", source: "recommendations" }
    );
  }

  const lastIngestedPaper = loadStoredJson(INGEST_STATE_KEY);
  if (lastIngestedPaper?.paper) {
    const paper = normalizePaperMath(lastIngestedPaper.paper);
    els.ingestStatus.textContent =
      lastIngestedPaper.status || `Restored full-text dossier for "${paper.title}".`;
    renderPapers(els.ingestResults, [paper], "No ingested paper yet.", {
      hash: "#ingest",
      source: "ingest",
    });
  }

  const lastShort = loadStoredJson(SHORTS_STATE_KEY);
  if (lastShort?.plan) {
    els.shortsTitle.value = lastShort.title || "";
    els.shortsAbstract.value = lastShort.abstract || "";
    els.shortsDuration.value = lastShort.duration || "60";
    renderShortPlan(lastShort.plan);
    els.shortsStatus.textContent = "Restored your last generated visual short.";
  }
}

function handleShorts(event) {
  event.preventDefault();
  if (!els.shortsForm.reportValidity()) return;
  generateShortForPaper(makeManualShortPaper(), { source: "manual" });
}

async function finishFullTextIngestion(paper, extraction, trackingPayload = {}) {
  const quality = paper.extractedStructure?.diagnostics?.qualityLabel || "structured extraction complete";
  const status = `Layer-2 ingestion complete: ${quality}; extracted ${extraction.text.length.toLocaleString()} characters across ${
    extraction.pageCount
  } pages.`;
  els.ingestStatus.textContent = status;
  saveStoredJson(INGEST_STATE_KEY, { paper, status, updatedAt: Date.now() });
  saveViewState({ hash: "#ingest", source: "ingest", paperId: paper.id, reviewOpen: true });
  renderPapers(els.ingestResults, [paper], "No ingested paper yet.", {
    hash: "#ingest",
    source: "ingest",
  });
  await trackEvent("paper_pdf_ingested", {
    page_count: extraction.pageCount,
    character_count: extraction.text.length,
    ...trackingPayload,
  });
  els.ingestResults.querySelector(".review-open-button")?.click();
}

async function handleIngest(event) {
  event.preventDefault();
  if (!els.ingestForm.reportValidity()) return;

  const file = els.paperPdfInput.files?.[0];
  if (!file) return;

  els.ingestStatus.textContent = `Extracting full text from "${file.name}"...`;
  els.ingestResults.replaceChildren();

  try {
    const extraction = await extractPdfText(file);
    if (extraction.text.length < 800) {
      throw new Error(
        "PaperTrail extracted very little text. This PDF may be scanned, image-based, or protected from text extraction."
      );
    }

    const paper = paperFromPdfExtraction(file, extraction, els.paperTitleInput.value);
    await finishFullTextIngestion(paper, extraction, { source: "upload" });
  } catch (error) {
    els.ingestStatus.textContent = error.message || "PaperTrail could not ingest this PDF.";
  }
}

async function handleRemoteIngest(paper, button) {
  if (!paper.pdfUrl) return;

  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "Ingesting...";
  els.ingestStatus.textContent = `Downloading open-access PDF for "${paper.title}"...`;
  els.ingestResults.replaceChildren();
  document.querySelector("#ingest")?.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const extraction = await extractRemotePdfText(paper.pdfUrl);
    if (extraction.text.length < 800) {
      throw new Error(
        "PaperTrail found the PDF, but extracted very little text. It may be scanned, image-based, or protected from extraction."
      );
    }
    const fullTextPaper = paperFromRemotePdf(paper, extraction, paper.pdfUrl);
    await finishFullTextIngestion(fullTextPaper, extraction, {
      source: "openalex_pdf_url",
      paper_id: paper.id,
    });
  } catch (error) {
    const message = error.message || "";
    els.ingestStatus.textContent =
      message === "Failed to fetch"
        ? "PaperTrail found an open-access PDF link, but the publisher blocked direct browser ingestion. Download the PDF from the paper page and upload it here, or add the backend ingestion proxy next."
        : message ||
          "PaperTrail could not ingest this paper directly. Download the PDF from the publisher and upload it here instead.";
    await trackEvent("paper_pdf_ingest_failed", { source: "openalex_pdf_url", paper_id: paper.id });
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function handleSearch(event) {
  event.preventDefault();
  const query = cleanText(els.searchInput.value, "");
  if (!query) return;
  const precision = new FormData(els.searchForm).get("precision") || "precise";
  const profile = parseSearchQuery(query);

  els.searchStatus.textContent = `Searching OpenAlex for the most relevant matches to "${query}"...`;
  els.searchResults.replaceChildren();

  try {
    const candidates = await fetchPapers(profile.apiQuery);
    const ranked = rankPapers(candidates, profile, precision);
    els.searchStatus.textContent = ranked.papers.length
      ? ranked.usedFallback
        ? `No strict ${precision} matches found in ${ranked.candidateCount} OpenAlex candidates, so showing the closest matches for "${query}".`
        : `Showing ${ranked.papers.length} precise matches from ${ranked.candidateCount} OpenAlex candidates for "${query}".`
      : `No papers found for "${query}".`;
    const status = els.searchStatus.textContent;
    saveStoredJson(SEARCH_STATE_KEY, {
      query,
      precision,
      status,
      papers: ranked.papers,
      updatedAt: Date.now(),
    });
    await trackEvent("search_completed", {
      query,
      precision,
      result_count: ranked.papers.length,
      candidate_count: ranked.candidateCount,
      used_fallback: ranked.usedFallback,
    });
    saveViewState({ hash: "#search", source: "search", paperId: null, reviewOpen: false });
    renderPapers(els.searchResults, ranked.papers, "No matching papers found. Try a broader topic.", {
      hash: "#search",
      source: "search",
    });
  } catch (error) {
    await trackEvent("search_failed", { query, precision });
    els.searchStatus.textContent =
      "PaperTrail could not reach OpenAlex. Check your connection and try again.";
  }
}

async function handleRecommendations(event) {
  event.preventDefault();
  const interests = cleanText(els.interestInput.value, "");
  if (!interests) return;

  els.recommendationStatus.textContent = "Finding papers that match your interests...";
  els.recommendationResults.replaceChildren();

  try {
    const profile = parseSearchQuery(interests);
    const candidates = await fetchPapers(profile.apiQuery, { sort: "cited_by_count:desc" });
    const ranked = rankPapers(candidates, profile, "balanced");
    els.recommendationStatus.textContent = ranked.papers.length
      ? `Recommended ${ranked.papers.length} papers from ${ranked.candidateCount} OpenAlex candidates.`
      : "No recommendations found yet. Try naming a field, method, and application area.";
    const status = els.recommendationStatus.textContent;
    saveStoredJson(RECOMMENDATION_STATE_KEY, {
      interests,
      status,
      papers: ranked.papers,
      updatedAt: Date.now(),
    });
    await trackEvent("recommendations_completed", {
      interest_length: interests.length,
      result_count: ranked.papers.length,
      candidate_count: ranked.candidateCount,
    });
    saveViewState({
      hash: "#recommendations",
      source: "recommendations",
      paperId: null,
      reviewOpen: false,
    });
    renderPapers(
      els.recommendationResults,
      ranked.papers,
      "No recommendations found. Try a more specific mix of methods and topics.",
      { hash: "#recommendations", source: "recommendations" }
    );
  } catch (error) {
    await trackEvent("recommendations_failed", { interest_length: interests.length });
    els.recommendationStatus.textContent =
      "Recommendations are unavailable because OpenAlex could not be reached.";
  }
}

els.searchForm.addEventListener("submit", handleSearch);
els.ingestForm.addEventListener("submit", handleIngest);
els.interestForm.addEventListener("submit", handleRecommendations);
els.shortsForm.addEventListener("submit", handleShorts);
els.authForm.addEventListener("submit", handleSignIn);
els.signUpButton.addEventListener("click", handleSignUp);
els.signOutButton.addEventListener("click", handleSignOut);
els.reviewModalBackdrop.addEventListener("click", closeReviewReader);
els.reviewCloseButton.addEventListener("click", closeReviewReader);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.reviewModal.hidden) {
    closeReviewReader();
  }
});
els.clearListButton.addEventListener("click", async () => {
  readingList = [];
  await clearCloudReadingList();
  await trackEvent("reading_list_cleared");
  saveReadingList();
  refreshSaveButtons();
});
els.adminRefreshButton.addEventListener("click", loadAdminDashboard);
els.campaignForm.addEventListener("submit", createCampaign);
window.addEventListener("hashchange", () => {
  rememberSection(window.location.hash);
  if (window.location.hash === "#admin") {
    showAdminRoute();
    if (currentUser) {
      loadAdminDashboard();
    } else {
      setAdminVisibility();
    }
  }
});

rememberSection(window.location.hash || getCurrentViewState().hash || "#top");
restoreDiscoveryViews();
renderReadingList();
restoreSavedView();
initAuth();
showAdminRoute();
