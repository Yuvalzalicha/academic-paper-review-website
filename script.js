const OPENALEX_BASE_URL = "https://api.openalex.org/works";
const STORAGE_KEY = "papertrail-reading-list";
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
  interestForm: document.querySelector("#interest-form"),
  interestInput: document.querySelector("#interest-input"),
  recommendationStatus: document.querySelector("#recommendation-status"),
  recommendationResults: document.querySelector("#recommendation-results"),
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
  cardTemplate: document.querySelector("#paper-card-template"),
};

let readingList = loadReadingList();
let supabaseClient = null;
let currentUser = null;

function loadReadingList() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveReadingList() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readingList));
  renderReadingList();
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
    ? "Your saved papers are synced to your free PaperTrail account."
    : "Subscribe for free to save papers to your account and return to them later.";
  els.readingListCopy.textContent = isSignedIn
    ? `Synced to ${user.email}.`
    : "Saved locally in this browser with no account required.";
}

function getPaperForStorage(paper) {
  const { relevance, ...paperForStorage } = paper;
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
    setAccountStatus(`Could not clear your cloud reading list: ${error.message}`, "Sync needs attention");
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
    setAuthUiForUser(null);
    setAccountStatus("Account sync is connected. Sign up or sign in to save papers across devices.", "Account ready");
    return;
  }

  currentUser = data.user;
  setAuthUiForUser(currentUser);
  setAccountStatus(`Signed in as ${currentUser.email}. Your reading list is synced.`, "Account active");
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
      setAccountStatus(`Signed in as ${currentUser.email}. Your reading list is synced.`, "Account active");
      loadCloudReadingList();
    } else {
      setAccountStatus("Signed out. Sign in again to sync saved papers across devices.", "Account ready");
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
  setAccountStatus("Creating your free account...", "Working");

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
    setAccountStatus(`Account created for ${currentUser.email}. Your reading list is synced.`, "Account active");
    await loadCloudReadingList();
  } else {
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
  setAccountStatus(`Signed in as ${currentUser.email}. Your reading list is synced.`, "Account active");
  await loadCloudReadingList();
}

async function handleSignOut() {
  if (!supabaseClient) return;

  await supabaseClient.auth.signOut();
  currentUser = null;
  setAuthUiForUser(null);
  setAccountStatus("Signed out. Sign in again to sync saved papers across devices.", "Account ready");
}

function cleanText(value, fallback = "Not listed") {
  if (!value || typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim() || fallback;
}

function invertAbstract(index) {
  if (!index) return "";

  const words = [];
  Object.entries(index).forEach(([word, positions]) => {
    positions.forEach((position) => {
      words[position] = word;
    });
  });

  return cleanText(words.filter(Boolean).join(" "), "");
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

  return {
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
    language: work.language || "unknown",
    concepts,
  };
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

  notes.push(`Start by identifying the research question and how it relates to ${conceptText}.`);

  if (paper.summary.length > 240) {
    notes.push("Skim the abstract first, then mark the method, dataset, and main finding separately.");
  } else {
    notes.push("Because the abstract is limited, use the paper link to verify the method and evidence.");
  }

  notes.push(
    paper.citedByCount
      ? `Check why later work cited it; OpenAlex lists ${paper.citedByCount.toLocaleString()} citations.`
      : "Look for related work or replications before relying on the conclusion."
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

function makeFullReview(paper) {
  const concepts = getConceptText(paper);
  const abstractSentences = getSentences(paper.summary, 5);
  const hasAbstract = !paper.summary.startsWith("OpenAlex does not include an abstract");
  const likelyQuestion =
    abstractSentences[0] ||
    `The paper appears to investigate a question in ${concepts}, but the available metadata is not enough to state the exact research question confidently.`;

  return [
    {
      title: "Extensive summary",
      paragraphs: [
        hasAbstract
          ? `This work, "${paper.title}", is best approached as a ${paper.type} in ${concepts}. The available abstract suggests the paper is concerned with the problem space described here: ${paper.summary}`
          : `This work, "${paper.title}", is listed as a ${paper.type} in ${concepts}. OpenAlex does not provide an abstract, so this review is a structured reading guide based on the title, venue, year, citation data, and topic tags rather than a claim that the full paper has been read.`,
        `${getCitationSignal(paper)} It was published in ${paper.year} through ${paper.source}, and the listed access status is ${
          paper.isOpenAccess ? "open access" : "not marked open access"
        } in OpenAlex.`,
      ],
    },
    {
      title: "Theoretical background",
      paragraphs: [
        `Before reading, build a mental map of the field around ${concepts}. Ask what assumptions the field normally makes, what counts as evidence, and which prior methods or theories this paper probably depends on.`,
        `A useful theory-first reading path is: define the central concepts, identify the mechanism or relationship the authors care about, then separate what the paper claims from what the data or argument actually supports.`,
      ],
      bullets: [
        `Core concepts to review first: ${concepts}.`,
        "Look for the paper's definition of its main construct, model, population, or phenomenon.",
        "Track whether the paper is testing a theory, proposing a method, reviewing prior work, or applying an existing idea to a new setting.",
      ],
    },
    {
      title: "For dummies",
      paragraphs: [
        `In plain language, this paper is about a specific problem inside ${concepts}. Read it as if the authors are trying to answer: "What is happening here, how can we study it, and why should anyone believe the answer?"`,
        "Do not try to understand every technical term on the first pass. First find the problem, the proposed approach, the evidence, and the takeaway. The details become easier once those four pieces are visible.",
      ],
      bullets: [
        `The paper's likely starting question: ${likelyQuestion}`,
        "The method is the authors' recipe for answering that question.",
        "The results are the evidence produced by that recipe.",
        "The conclusion is the authors' interpretation, not automatic truth.",
      ],
    },
    {
      title: "Full paper breakdown",
      bullets: [
        `Title: ${paper.title}`,
        `Authors: ${paper.authors}`,
        `Publication context: ${paper.source}, ${paper.date}`,
        `Work type: ${paper.type}`,
        `Topics: ${concepts}`,
        `Citation count in OpenAlex: ${paper.citedByCount.toLocaleString()}`,
        `Access signal: ${paper.isOpenAccess ? "Open access" : "Not marked open access"}`,
        `Language: ${paper.language}`,
      ],
    },
    {
      title: "How to read each section",
      bullets: [
        "Abstract: underline the research question, method, data or source material, and main claim.",
        "Introduction: identify the gap. The gap tells you why the paper exists.",
        "Background or related work: note which theories, studies, or methods the authors treat as foundational.",
        "Methods: ask whether the design can actually answer the question. Watch sample size, assumptions, variables, measures, and evaluation criteria.",
        "Results: separate descriptive results from causal or interpretive claims.",
        "Discussion: look for limitations, future work, and places where the authors move beyond the evidence.",
      ],
    },
    {
      title: "Strengths to look for",
      bullets: [
        "A clearly stated research question or contribution.",
        "A method that matches the stated question.",
        "Transparent data, assumptions, definitions, and evaluation criteria.",
        "Results that are tied back to the theoretical background instead of presented as isolated numbers.",
        "Limitations that honestly describe where the findings may not generalize.",
      ],
    },
    {
      title: "Possible limitations and critique angles",
      bullets: [
        "Does the paper overclaim from limited data, narrow examples, or a single context?",
        "Are important alternative explanations considered?",
        "Are key terms defined consistently?",
        "Would a different dataset, population, theory, or measurement strategy change the conclusion?",
        "If the paper is highly cited, are people citing it for the method, the result, the dataset, or as something to criticize?",
      ],
    },
    {
      title: "What to write in your own review",
      bullets: [
        "One sentence explaining the paper's main question.",
        "Two to three sentences summarizing the method or argument.",
        "One paragraph on the main contribution.",
        "One paragraph on limitations or missing context.",
        "A final judgment: useful, convincing, promising but incomplete, or not reliable enough yet.",
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
    paragraph.textContent = paragraphText;
    wrapper.append(paragraph);
  });

  if (section.bullets?.length) {
    const list = document.createElement("ul");
    section.bullets.forEach((bulletText) => {
      const item = document.createElement("li");
      item.textContent = bulletText;
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
  return normalizeSearchText(title).replace(/\s+/g, "-").slice(0, 70) || "paper-review-guide";
}

function renderReviewSectionHtml(section) {
  const paragraphs = (section.paragraphs || [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  const bullets = section.bullets?.length
    ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
    : "";

  return `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      ${paragraphs}
      ${bullets}
    </section>
  `;
}

function makePrintableReviewHtml(paper, reviewSections) {
  const concepts = getConceptText(paper);
  const generatedAt = new Date().toLocaleString();
  const fileName = `${slugifyTitle(paper.title)}-review-guide.pdf`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(paper.title)} | PaperTrail Review Guide</title>
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
      <p class="label">PaperTrail LaTeX-Style Reading Guide</p>
      <h1>${escapeHtml(paper.title)}</h1>
      <p class="meta">${escapeHtml(paper.authors)}</p>
      <p class="meta">${escapeHtml(paper.source)} · ${escapeHtml(paper.date)} · ${escapeHtml(paper.type)}</p>
      <p class="meta">Topics: ${escapeHtml(concepts)}</p>
    </header>

    <div class="actions">
      <button type="button" onclick="window.print()">Save / Print as PDF</button>
      <p class="small-note">Suggested file name: ${escapeHtml(fileName)}</p>
    </div>

    <div class="abstract-box">
      <h2>Abstract-Based Summary</h2>
      <p>${escapeHtml(paper.summary)}</p>
    </div>

    ${reviewSections.map(renderReviewSectionHtml).join("")}

    <section class="reading-plan">
      <h2>Suggested Reading Workflow</h2>
      <ul>
        <li>First pass: read title, abstract, introduction, section headings, figures, and conclusion.</li>
        <li>Second pass: read methods and results slowly; write down assumptions and unfamiliar terms.</li>
        <li>Third pass: compare claims against evidence and write your own critique before reading other reviews.</li>
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
      <p class="small-note">This guide is generated from OpenAlex metadata and available abstract text. Use it as a structured reading aid, then verify details in the original paper.</p>
    </section>
  </body>
</html>`;
}

function prepareReviewEmail(paper, email, fileName) {
  if (!email) return;

  const subject = `PaperTrail review guide: ${paper.title}`;
  const body = [
    "Hi,",
    "",
    `I prepared a PaperTrail PDF reading guide for: ${paper.title}`,
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
  const fileName = `${slugifyTitle(paper.title)}-review-guide.pdf`;

  if (!printableWindow) {
    alert("Please allow popups for PaperTrail so the printable PDF guide can open.");
    return;
  }

  printableWindow.document.open();
  printableWindow.document.write(makePrintableReviewHtml(paper, reviewSections));
  printableWindow.document.close();
  printableWindow.focus();
  printableWindow.setTimeout(() => printableWindow.print(), 300);

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
  } else {
    readingList = [paper, ...readingList];
    await syncPaperToCloud(paper);
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

function renderPapers(container, papers, emptyMessage) {
  container.replaceChildren();

  if (!papers.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }

  papers.forEach((paper) => {
    const card = els.cardTemplate.content.firstElementChild.cloneNode(true);
    const summary =
      paper.summary.length > 360 ? `${paper.summary.slice(0, 357).trim()}...` : paper.summary;

    card.querySelector(".year").textContent = paper.year;
    card.querySelector(".source").textContent = paper.source;
    card.querySelector("h3").textContent = paper.title;
    card.querySelector(".authors").textContent = paper.authors;
    card.querySelector(".summary").textContent = summary;
    card.querySelector(".paper-link").href = paper.url;

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
      item.textContent = note;
      notesList.append(item);
    });

    const reviewContent = card.querySelector(".review-content");
    makeFullReview(paper).forEach((section) => appendReviewSection(reviewContent, section));

    const reviewEmailInput = card.querySelector(".review-email-input");
    card.querySelector(".review-download-button").addEventListener("click", () => {
      openReviewPdfGuide(paper);
    });

    card.querySelector(".review-email-button").addEventListener("click", () => {
      const email = cleanText(reviewEmailInput.value, "");
      if (!email || !reviewEmailInput.checkValidity()) {
        reviewEmailInput.reportValidity();
        return;
      }
      openReviewPdfGuide(paper, email);
    });

    const saveButton = card.querySelector(".save-button");
    saveButton.dataset.paperId = paper.id;
    saveButton.addEventListener("click", () => toggleSaved(paper));

    container.append(card);
  });

  refreshSaveButtons();
}

function renderReadingList() {
  renderPapers(
    els.readingListResults,
    readingList,
    "Your reading list is empty. Save papers from search or recommendations to see them here."
  );
  els.clearListButton.disabled = readingList.length === 0;
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
    renderPapers(els.searchResults, ranked.papers, "No matching papers found. Try a broader topic.");
  } catch (error) {
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
    renderPapers(
      els.recommendationResults,
      ranked.papers,
      "No recommendations found. Try a more specific mix of methods and topics."
    );
  } catch (error) {
    els.recommendationStatus.textContent =
      "Recommendations are unavailable because OpenAlex could not be reached.";
  }
}

els.searchForm.addEventListener("submit", handleSearch);
els.interestForm.addEventListener("submit", handleRecommendations);
els.authForm.addEventListener("submit", handleSignIn);
els.signUpButton.addEventListener("click", handleSignUp);
els.signOutButton.addEventListener("click", handleSignOut);
els.clearListButton.addEventListener("click", async () => {
  readingList = [];
  await clearCloudReadingList();
  saveReadingList();
  refreshSaveButtons();
});

renderReadingList();
initAuth();
