/* SkillGap Radar — frontend logic (vanilla JS, no build step). */

const API = "/api";

/* ---------------- Tabs ----------------
   Profile storage, theme, score rings and the Home dashboard live in
   dashboard.js (loaded after this file). */
function showTab(name) {
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  const panel = document.getElementById(`panel-${name}`);
  if (!tab || !panel) return;
  document.querySelectorAll(".tab").forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  tab.classList.add("active");
  tab.setAttribute("aria-selected", "true");
  panel.classList.add("active");
  SGR.onTabShown(name);
  if (name === "opportunities") refreshSaveButtons();   // a bookmark may have been removed from Home
  window.scrollTo({ top: 0 });
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));

/* ---------------- State ---------------- */
let roles = [];
let knownSkills = []; // restored from the saved profile by dashboard.js
let currentGap = null; // last gap-analysis response

/* ---------------- Init ---------------- */
async function init() {
  roles = await fetchJSON(`${API}/roles`);
  populateRoleSelect(document.getElementById("role-select"), roles, "Select a role…");
  populateRoleSelect(document.getElementById("compare-role-a"), roles, "Select role A…");
  populateRoleSelect(document.getElementById("compare-role-b"), roles, "Select role B…");
  populateRoleSelect(document.getElementById("opp-role-select"), roles, "Select a role…");
  populateRoleSelect(document.getElementById("rc-role"), roles, "No target role");
}

function populateRoleSelect(select, roleList, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>` +
    roleList.map((r) => `<option value="${r.id}">${r.title}</option>`).join("");
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

/* ---------------- Role description ---------------- */
document.getElementById("role-select").addEventListener("change", async (e) => {
  SGR.rememberRole(e.target.value);
  const box = document.getElementById("role-description");
  if (!e.target.value) { box.hidden = true; return; }
  const role = await fetchJSON(`${API}/roles/${e.target.value}`);
  box.hidden = false;
  box.textContent = role.description || "";
});

/* ---------------- Skill tag input (Sprint 2 search) ---------------- */
const skillSearch = document.getElementById("skill-search");
const suggestionsBox = document.getElementById("skill-suggestions");
let searchDebounce;

skillSearch.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const q = skillSearch.value.trim();
  if (!q) { suggestionsBox.hidden = true; return; }
  searchDebounce = setTimeout(async () => {
    const results = await fetchJSON(`${API}/skills?query=${encodeURIComponent(q)}&limit=8`);
    renderSuggestions(results.filter((s) => !knownSkills.includes(s.name)));
  }, 180);
});

function renderSuggestions(results) {
  if (!results.length) { suggestionsBox.hidden = true; return; }
  suggestionsBox.hidden = false;
  suggestionsBox.innerHTML = results
    .map((s) => `<button type="button" data-name="${s.name}">${s.name} <span style="color:var(--text-dim)">· ${s.category}</span></button>`)
    .join("");
  suggestionsBox.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => addSkill(btn.dataset.name));
  });
}

skillSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const val = skillSearch.value.trim();
    if (val) addSkill(val);
  }
});

function addSkill(name) {
  if (!knownSkills.some((s) => s.toLowerCase() === name.toLowerCase())) {
    knownSkills.push(name);
    renderTags();
  }
  skillSearch.value = "";
  suggestionsBox.hidden = true;
  skillSearch.focus();
}

function removeSkill(name) {
  knownSkills = knownSkills.filter((s) => s !== name);
  renderTags();
}

function renderTags() {
  SGR.onSkillsChanged();
  const box = document.getElementById("skill-tags");
  box.innerHTML = knownSkills
    .map((s) => `<span class="tag">${escapeHtml(s)}<button type="button" data-name="${escapeHtml(s)}" aria-label="Remove ${escapeHtml(s)}">×</button></span>`)
    .join("");
  box.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => removeSkill(btn.dataset.name)));
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".skill-search-wrap")) suggestionsBox.hidden = true;
});

/* ---------------- Run scan (Sprint 3) ---------------- */
document.getElementById("scan-btn").addEventListener("click", runScan);

async function runScan() {
  const roleId = document.getElementById("role-select").value;
  const hint = document.getElementById("scan-hint");
  if (!roleId) { hint.textContent = "Pick a target role first."; hint.style.color = "var(--coral)"; return; }
  hint.style.color = "var(--text-dim)";
  hint.textContent = "Scanning…";

  SGR.setBusy("scan", true);

  try {
    currentGap = await fetchJSON(`${API}/gap-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: Number(roleId), known_skills: knownSkills }),
    });
    SGR.setBusy("scan", false);
    renderGapResults(currentGap);
    SGR.onScan(currentGap, Number(roleId));
    hint.textContent = "Scan complete.";
  } catch (err) {
    SGR.setBusy("scan", false);
    document.getElementById(currentGap ? "results-content" : "results-empty").hidden = false;
    hint.style.color = "var(--coral)";
    hint.textContent = "Something went wrong running the scan.";
    console.error(err);
  }
}

function renderGapResults(gap) {
  document.getElementById("results-empty").hidden = true;
  document.getElementById("results-content").hidden = false;
  document.getElementById("plan-section").hidden = true;

  document.getElementById("result-role-title").textContent = gap.role;
  const ringSlot = document.getElementById("match-ring");
  ringSlot.innerHTML = ringHTML(gap.match_percentage, { size: 124, label: "match", suffix: "%" });
  animateRings(ringSlot);

  document.getElementById("matched-count").textContent = gap.matched.length;
  document.getElementById("missing-count").textContent = gap.missing.length;

  const matchedList = document.getElementById("matched-list");
  matchedList.innerHTML = gap.matched.length
    ? gap.matched.map((s) => `<li>${s.skill}</li>`).join("")
    : `<li class="no-gap">None yet</li>`;

  const missingList = document.getElementById("missing-list");
  missingList.innerHTML = gap.missing.length
    ? gap.missing.map((s) => `<li>${s.skill}</li>`).join("")
    : `<li class="no-gap">No gaps — full coverage!</li>`;

  const planBtn = document.getElementById("plan-btn");
  planBtn.hidden = gap.missing.length === 0;

  drawRadarChart(gap.category_breakdown);
  drawBarChart(gap.matched.length, gap.missing.length);
}

/* ---------------- Learning plan (Sprint 4) ----------------
   Rendering and progress tracking are in dashboard.js (SGR.onPlan). */
document.getElementById("plan-btn").addEventListener("click", async () => {
  if (!currentGap) return;
  const roleId = document.getElementById("role-select").value;
  const missingNames = currentGap.missing.map((s) => s.skill);

  const section = document.getElementById("plan-section");
  section.hidden = false;
  document.getElementById("plan-list").innerHTML =
    [1, 2, 3].map(() => `<li class="plan-skel" aria-hidden="true"><div class="skel skel-line" style="width:40%"></div><div class="skel skel-line"></div><div class="skel skel-line" style="width:75%"></div></li>`).join("");

  try {
    const rec = await fetchJSON(`${API}/recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: Number(roleId), missing_skills: missingNames }),
    });

    SGR.onPlan(rec, Number(roleId));
  } catch (err) {
    document.getElementById("plan-list").innerHTML = "<li>Couldn't build a plan right now.</li>";
    console.error(err);
  }
});

/* ---------------- Compare roles (Sprint 2) ---------------- */
document.getElementById("compare-btn").addEventListener("click", async () => {
  const a = document.getElementById("compare-role-a").value;
  const b = document.getElementById("compare-role-b").value;
  if (!a || !b || a === b) {
    alert("Pick two different roles to compare.");
    return;
  }

  const data = await fetchJSON(`${API}/roles/compare?role_ids=${a},${b}`);

  document.getElementById("compare-empty").hidden = true;
  document.getElementById("compare-content").hidden = false;

  document.getElementById("compare-common").innerHTML = data.common_skills.length
    ? data.common_skills.map((s) => `<li>${s}</li>`).join("")
    : `<li class="no-gap">No overlap</li>`;

  document.getElementById("compare-a-title").textContent = `Unique to ${data.roles[0]}`;
  document.getElementById("compare-b-title").textContent = `Unique to ${data.roles[1]}`;

  document.getElementById("compare-unique-a").innerHTML =
    data.unique_skills[data.roles[0]].map((s) => `<li>${s}</li>`).join("") || `<li class="no-gap">None</li>`;
  document.getElementById("compare-unique-b").innerHTML =
    data.unique_skills[data.roles[1]].map((s) => `<li>${s}</li>`).join("") || `<li class="no-gap">None</li>`;
});

const rolesReady = init()
  .then(() => {
    // Put the remembered role back in the pickers after a reload.
    SGR.onRolesLoaded();
    const sel = document.getElementById("role-select");
    if (sel.value) sel.dispatchEvent(new Event("change"));   // refresh the role description
  })
  .catch((e) => console.error(e));


/* ==========================================================
   Sprint 5: Internships & Jobs
   ==========================================================
   Every link rendered here points at a live listing on the
   source site - either an individual posting from the jobs
   API, or a pre-filtered search on a real job board. Nothing
   is hard-coded, so links can't go stale.
*/
let oppKind = "internship";

document.querySelectorAll(".seg[data-kind]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg[data-kind]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    oppKind = btn.dataset.kind;
  });
});

document.getElementById("opp-search-btn").addEventListener("click", searchOpportunities);

async function searchOpportunities() {
  const roleId = document.getElementById("opp-role-select").value;
  const location = document.getElementById("opp-location").value.trim() || "India";

  if (!roleId) {
    alert("Please select a target role first.");
    return;
  }

  const empty = document.getElementById("opp-empty");
  const loading = document.getElementById("opp-loading");
  const content = document.getElementById("opp-content");

  empty.hidden = true;
  content.hidden = true;
  loading.hidden = false;

  try {
    const endpoint = oppKind === "internship" ? "internships" : "jobs";
    const data = await fetchJSON(
      `${API}/opportunities/${endpoint}?role_id=${roleId}&location=${encodeURIComponent(location)}`
    );
    renderOpportunities(data);
    loading.hidden = true;
    content.hidden = false;
  } catch (err) {
    loading.hidden = true;
    empty.hidden = false;
    empty.innerHTML = `<p>Could not load openings: ${err.message}</p>`;
  }
}

let lastOpps = { kind: "", role: "", list: [] };
const BOOKMARK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';

function refreshSaveButtons() {
  document.querySelectorAll("#opp-list .save-btn").forEach((btn) => {
    const saved = SGR.isSaved(btn.dataset.url);
    btn.classList.toggle("on", saved);
    btn.setAttribute("aria-pressed", String(saved));
    btn.setAttribute("aria-label", saved ? "Remove from saved" : "Save this opening");
    btn.title = saved ? "Remove from saved" : "Save this opening";
  });
}

document.getElementById("opp-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".save-btn");
  if (!btn) return;
  const opp = lastOpps.list.find((o) => o.url === btn.dataset.url);
  if (opp) SGR.toggleSaved(opp, lastOpps, btn);
});

function renderOpportunities(data) {
  lastOpps = { kind: data.kind, role: data.role, list: data.opportunities };
  const label = data.kind === "internship" ? "Internships" : "Jobs";
  document.getElementById("opp-title").textContent =
    `${label} for ${data.role}`;

  const badge = document.getElementById("opp-source-badge");
  const isLive = data.source === "live-api";
  badge.textContent = isLive ? "Live postings" : "Live board search";
  badge.className = "source-badge " + (isLive ? "badge-live" : "badge-board");

  document.getElementById("opp-subtitle").textContent = isLive
    ? `${data.count} current openings in ${data.location}. Click any card to apply on the employer's site.`
    : `Click a board to see every ${label.toLowerCase().slice(0, -1)} opening for this role in ${data.location}, updated live by that site.`;

  document.getElementById("opp-list").innerHTML = data.opportunities
    .map((o) => {
      const have = SGR.skillMatches(`${o.title} ${o.description || ""}`);
      const meta = [o.company, o.location, o.salary, o.posted]
        .filter(Boolean)
        .map((m) => `<span class="opp-meta-item">${escapeHtml(m)}</span>`)
        .join("");
      return `
        <li class="opp-item">
          <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener noreferrer" class="opp-link">
            <div class="opp-item-main">
              <span class="opp-source">${escapeHtml(o.source)}</span>
              <h4 class="opp-item-title">${escapeHtml(o.title)}</h4>
              ${o.description ? `<p class="opp-desc">${escapeHtml(o.description)}</p>` : ""}
              ${meta ? `<div class="opp-meta">${meta}</div>` : ""}
              ${have.length ? `<p class="opp-match">You have: ${have.map(escapeHtml).join(", ")}</p>` : ""}
            </div>
            <span class="opp-cta" aria-hidden="true">Apply &rarr;</span>
          </a>
          <button type="button" class="save-btn" data-url="${escapeHtml(o.url)}">${BOOKMARK_SVG}</button>
        </li>`;
    })
    .join("");
  refreshSaveButtons();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}


/* ==========================================================
   Resume builder + checker
   ========================================================== */
const $ = (id) => document.getElementById(id);

document.querySelectorAll(".rseg").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".rseg").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const build = btn.dataset.mode === "build";
    $("rs-build").hidden = !build;
    $("rs-check").hidden = build;
    if (build && !$("rb-skills").value && knownSkills.length) $("rb-skills").value = knownSkills.join(", ");
  });
});

function lines(id) {
  return $(id).value.split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
}

// Free-form entries: plain lines are headings (role, company | dates); "-" lines are bullets.
// If the text has no "-" bullets at all, every line is treated as a bullet.
function parseEntries(text) {
  const all = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!all.length) return [];
  const isBullet = (l) => /^[-•*]\s*/.test(l);
  if (!all.some(isBullet)) return [{ head: [], bullets: all }];
  const entries = [];
  let cur = null;
  for (const line of all) {
    if (isBullet(line)) {
      if (!cur) { cur = { head: [], bullets: [] }; entries.push(cur); }
      cur.bullets.push(line.replace(/^[-•*]\s*/, ""));
    } else {
      if (!cur || cur.bullets.length) { cur = { head: [], bullets: [] }; entries.push(cur); }
      cur.head.push(line);
    }
  }
  return entries;
}

// Blocks separated by blank lines: first line bold, remaining lines normal.
function parseBlocks(text) {
  return text.split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
}

function buildResume() {
  const contact = [$("rb-email").value, $("rb-phone").value, $("rb-location").value, ...$("rb-links").value.split(",")]
    .map((s) => s.trim()).filter(Boolean);
  return {
    name: $("rb-name").value.trim() || "Your Name",
    title: $("rb-title").value.trim(),
    contact,
    summary: $("rb-summary").value.trim(),
    education: parseBlocks($("rb-education").value),
    skills: $("rb-skills").value.split(",").map((s) => s.trim()).filter(Boolean),
    languages: $("rb-languages").value.split(",").map((s) => s.trim()).filter(Boolean),
    projects: parseEntries($("rb-projects").value),
    experience: parseEntries($("rb-experience").value),
    references: parseBlocks($("rb-references").value),
    photo: resumePhoto,
  };
}

function entriesToText(entries) {
  return entries.flatMap((en) => [...en.head, ...en.bullets.map((b) => `- ${b}`)]);
}

function resumeToText(r) {
  const out = [r.name];
  if (r.title) out.push(r.title);
  out.push(r.contact.join(" | "));
  if (r.summary) out.push("", "Summary", r.summary);
  if (r.education.length) out.push("", "Education", ...r.education.flat());
  if (r.skills.length) out.push("", "Skills", r.skills.join(", "));
  if (r.languages.length) out.push("", "Languages", r.languages.join(", "));
  if (r.projects.length) out.push("", "Projects", ...entriesToText(r.projects));
  if (r.experience.length) out.push("", "Experience", ...entriesToText(r.experience));
  if (r.references.length) out.push("", "References", ...r.references.flat());
  return out.join("\n");
}

let resumeStyle = { layout: "sidebar", color: "#0D9488", bg: "white", shape: "circle" };
let resumePhoto = null;
let lastResume = null;
let colorTouched = false;

const ICONS = {
  phone: "M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z",
  mail: "M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v.5l-10 6.2L2 6.5zm0 2.9V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.9l-10 6.2z",
  pin: "M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
  web: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3a15.7 15.7 0 0 0-1.2-5.2A8 8 0 0 1 18.9 11zM12 4.1c.8 1 1.6 3 1.9 6.9h-3.8c.3-3.9 1.1-5.9 1.9-6.9zM4.1 13h3a15.7 15.7 0 0 0 1.2 5.2A8 8 0 0 1 4.1 13zm3-2h-3a8 8 0 0 1 4.2-5.2A15.7 15.7 0 0 0 7.1 11zM12 19.9c-.8-1-1.6-3-1.9-6.9h3.8c-.3 3.9-1.1 5.9-1.9 6.9zm2.7-1.7A15.7 15.7 0 0 0 15.9 13h3a8 8 0 0 1-4.2 5.2z",
};
function contactIcon(v) {
  let key = "pin";
  if (v.includes("@")) key = "mail";
  else if (/^[+\d(][\d\s().+-]{6,}$/.test(v)) key = "phone";
  else if (/(https?:|www\.|\.com|\.in\b|\.io\b|\.dev\b|github|linkedin)/i.test(v)) key = "web";
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[key]}"/></svg>`;
}

function resumeToHtml(r, layout = resumeStyle.layout) {
  const e = escapeHtml;
  const entries = (list) => list.map((en) => `<div class="rs-entry">${en.head.length ? `<p class="rs-role">${en.head.map(e).join("<br>")}</p>` : ""}${en.bullets.length ? `<ul>${en.bullets.map((b) => `<li>${e(b)}</li>`).join("")}</ul>` : ""}</div>`).join("");
  const blocks = (list) => list.map((bl) => `<div class="rs-entry"><p class="rs-role">${e(bl[0])}</p>${bl.slice(1).map((l) => `<p>${e(l)}</p>`).join("")}</div>`).join("");
  const sec = (title, body) => body ? `<section><h4>${title}</h4>${body}</section>` : "";
  const bullets = (items) => items.length ? `<ul>${items.map((s) => `<li>${e(s)}</li>`).join("")}</ul>` : "";
  const chips = r.skills.length ? `<div class="rs-chips">${r.skills.map((s) => `<span>${e(s)}</span>`).join("")}</div>` : "";
  const photo = r.photo ? `<img class="rs-photo" src="${r.photo}" alt="">` : "";
  const titleP = r.title ? `<p class="rs-title">${e(r.title)}</p>` : "";

  const summary = sec(layout.startsWith("swoosh") ? "About me" : "Summary", r.summary ? `<p>${e(r.summary)}</p>` : "");
  const education = sec("Education", blocks(r.education));
  const projects = sec("Projects", entries(r.projects));
  const experience = sec("Experience", entries(r.experience));
  const references = sec("Reference", blocks(r.references));
  const languages = sec("Languages", r.languages.length ? `<p>${r.languages.map(e).join(", ")}</p>` : "");
  const placeholder = "<p class='rs-placeholder'>Fill in the form to see your resume here.</p>";

  if (layout.startsWith("swoosh")) {
    const initials = (r.name.match(/\b[A-Za-z]/g) || []).slice(0, 2).join("").toUpperCase();
    const slot = r.photo ? photo : `<span class="rs-monogram">${e(initials)}</span>`;
    const contact = r.contact.map((c) => `<p class="rs-ci"><i>${contactIcon(c)}</i><span>${e(c)}</span></p>`).join("");
    return `
      <svg class="rs-deco rs-deco-top" viewBox="0 0 1131 330" aria-hidden="true">
        <path class="d-dark" d="M520 0H1131V150C960 70 700 50 520 0Z"/>
        <path class="d-a" d="M290 0H610C700 80 860 130 1131 175V262C860 225 560 180 290 0Z"/>
        <path class="d-b" d="M720 0H820C920 45 1030 85 1131 95V150C1010 138 850 85 720 0Z"/>
      </svg>
      <svg class="rs-deco rs-deco-bot" viewBox="0 0 1131 260" aria-hidden="true">
        <path class="d-dark" d="M0 70C140 180 330 235 560 250L0 260Z"/>
        <path class="d-a" d="M180 260C470 215 800 130 1131 45V260Z"/>
        <path class="d-b" d="M520 260C760 235 960 190 1131 120V260Z"/>
      </svg>
      <div class="rs-left">
        <h3 class="rs-name">${e(r.name)}</h3>${titleP}
        ${summary}${experience}${projects}${references}
      </div>
      <div class="rs-panel">
        <div class="rs-photo-slot">${slot}</div>
        ${education}
        ${sec("Skills", bullets(r.skills))}
        ${sec("Language", bullets(r.languages))}
        ${sec("Contact", contact)}
      </div>`;
  }

  if (layout === "sidebar") {
    const main = summary + education + experience + projects + references;
    return `<div class="rs-side">
        ${photo}
        <h3 class="rs-name">${e(r.name)}</h3>${titleP}
        ${r.contact.length ? `<div class="rs-side-block"><h4>Contact</h4>${r.contact.map((c) => `<p>${e(c)}</p>`).join("")}</div>` : ""}
        ${r.skills.length ? `<div class="rs-side-block"><h4>Skills</h4>${chips}</div>` : ""}
        ${r.languages.length ? `<div class="rs-side-block"><h4>Languages</h4><p>${r.languages.map(e).join(", ")}</p></div>` : ""}
      </div>
      <div class="rs-main">${main || placeholder}</div>`;
  }
  const skills = r.skills.length
    ? sec("Skills", layout === "modern" ? chips : `<p>${r.skills.map(e).join(", ")}</p>`)
    : "";
  const head = `<header class="rs-head"><div><h3 class="rs-name">${e(r.name)}</h3>${titleP}
      <p class="rs-contact">${r.contact.map(e).join(" &middot; ")}</p></div>${photo}</header>`;
  return `${head}<div class="rs-body">${summary}${skills}${languages}${education}${experience}${projects}${references}</div>`;
}

function renderResumeSheet() {
  if (!lastResume) return;
  const sheet = $("rb-sheet");
  const swoosh = resumeStyle.layout.startsWith("swoosh");
  const base = swoosh ? "swoosh" : resumeStyle.layout;
  sheet.className = `resume-sheet layout-${base}${resumeStyle.layout === "swoosh-light" ? " tone-light" : ""} rs-bg-${resumeStyle.bg} shape-${resumeStyle.shape}`;
  sheet.style.setProperty("--rs-accent", resumeStyle.color);
  sheet.innerHTML = resumeToHtml(lastResume);
}

function applyAccent(color) {
  resumeStyle.color = color;
  $("rb-bgs").style.setProperty("--rs-accent", color);
  $("rb-tpls").style.setProperty("--rs-accent", color);
  document.querySelectorAll(".swatch").forEach((b) => b.classList.toggle("active", b.dataset.color.toLowerCase() === color.toLowerCase()));
}

document.querySelectorAll(".lseg").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll(".lseg").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  resumeStyle.layout = btn.dataset.layout;
  // Swoosh looks best in its sunset palette; switch to it unless the user already picked a color.
  if (resumeStyle.layout.startsWith("swoosh") && !colorTouched) applyAccent("#F59A3C");
  renderResumeSheet();
  SGR.onResumeChanged();
}));
document.querySelectorAll(".swatch").forEach((btn) => btn.addEventListener("click", () => {
  colorTouched = true;
  applyAccent(btn.dataset.color);
  renderResumeSheet();
  SGR.onResumeChanged();
}));

document.querySelectorAll(".bgopt").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll(".bgopt").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  resumeStyle.bg = btn.dataset.bg;
  renderResumeSheet();
  SGR.onResumeChanged();
}));
document.querySelectorAll(".shseg").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll(".shseg").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  resumeStyle.shape = btn.dataset.shape;
  renderResumeSheet();
  SGR.onResumeChanged();
}));
applyAccent(resumeStyle.color);

/* Photo: read locally, center-crop to a square, shrink, keep as a data URL (never uploaded). */
function loadPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 320;
      canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 320, 320);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}

function setPhoto(dataUrl) {
  resumePhoto = dataUrl;
  $("rb-photo-thumb").hidden = !dataUrl;
  if (dataUrl) $("rb-photo-thumb").src = dataUrl;
  $("rb-photo-remove").hidden = !dataUrl;
  if (lastResume) { lastResume.photo = dataUrl; renderResumeSheet(); }
  SGR.onResumeChanged();
}

$("rb-photo").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  const hint = $("rb-photo-hint");
  if (!file) return;
  if (!file.type.startsWith("image/")) { hint.textContent = "Please choose an image file (JPG, PNG, WebP)."; hint.style.color = "var(--coral)"; return; }
  try {
    setPhoto(await loadPhoto(file));
    hint.style.color = "var(--text-dim)";
    hint.textContent = "Stays in your browser. It is cropped to a square and never uploaded.";
  } catch (err) {
    hint.textContent = "That image couldn't be read. Try a JPG or PNG.";
    hint.style.color = "var(--coral)";
  }
  ev.target.value = "";
});
$("rb-photo-remove").addEventListener("click", () => setPhoto(null));

let lastResumeText = "";
function generateResume() {
  const r = buildResume();
  lastResume = r;
  lastResumeText = resumeToText(r);
  renderResumeSheet();
  SGR.onResumeChanged();
  if ($("rs-build").hidden) return;   // in Check mode, leave the score on screen
  $("rs-empty").hidden = true;
  $("rs-result").hidden = true;
  $("rs-preview").hidden = false;
}
$("rb-generate").addEventListener("click", generateResume);
$("rs-build").addEventListener("input", () => SGR.onResumeChanged());   // keeps the draft and thumbnails fresh

$("rb-print").addEventListener("click", () => {
  document.body.classList.add("printing-resume");
  window.print();
  document.body.classList.remove("printing-resume");
});

$("rb-check").addEventListener("click", () => {
  $("rc-text").value = lastResumeText;
  document.querySelector('.rseg[data-mode="check"]').click();
  $("rc-score").click();
});

$("rc-score").addEventListener("click", async () => {
  const text = $("rc-text").value.trim();
  const hint = $("rc-hint");
  if (!text) { hint.textContent = "Paste your resume text first."; hint.style.color = "var(--coral)"; return; }
  hint.style.color = "var(--text-dim)";
  hint.textContent = "Scoring…";
  const roleId = $("rc-role").value;
  SGR.setBusy("resume", true);
  try {
    const res = await fetchJSON(`${API}/resume/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, role_id: roleId ? Number(roleId) : null }),
    });
    SGR.setBusy("resume", false);
    renderResumeScore(res);
    SGR.onResumeScore(res, roleId ? Number(roleId) : null);
    hint.textContent = "Done.";
  } catch (err) {
    SGR.setBusy("resume", false);
    $(lastResume && !$("rs-build").hidden ? "rs-preview" : "rs-empty").hidden = false;
    hint.style.color = "var(--coral)";
    hint.textContent = "Couldn't score the resume right now.";
    console.error(err);
  }
});

function renderResumeScore(r) {
  $("rs-empty").hidden = true;
  $("rs-preview").hidden = true;
  $("rs-result").hidden = false;
  $("rc-for").textContent = r.role ? ` for ${r.role}` : "";
  $("rc-grade").textContent = r.grade;
  const ringSlot = $("rc-ring");
  ringSlot.innerHTML = ringHTML(r.score, { size: 124, label: "/ 100" });
  animateRings(ringSlot);
  $("rc-bars").innerHTML = r.breakdown.map((b) => `
    <div class="bar-row">
      <span class="bar-name">${escapeHtml(b.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(100 * b.score / b.max)}%"></div></div>
      <span class="bar-val">${b.score}/${b.max}</span>
    </div>`).join("");
  $("rc-found-n").textContent = r.keywords_found.length;
  $("rc-miss-n").textContent = r.keywords_missing.length;
  $("rc-found").innerHTML = r.keywords_found.length
    ? r.keywords_found.map((s) => `<li>${escapeHtml(s)}</li>`).join("")
    : `<li class="no-gap">${r.role ? "None found" : "Pick a role to check"}</li>`;
  $("rc-miss").innerHTML = r.keywords_missing.length
    ? r.keywords_missing.map((s) => `<li>${escapeHtml(s)}</li>`).join("")
    : `<li class="no-gap">${r.role ? "All covered" : "—"}</li>`;
  $("rc-review-card").hidden = !r.review;
  $("rc-review").textContent = r.review || "";
  $("rc-tips").innerHTML = r.tips.length
    ? r.tips.map((t) => `<li><span class="tip-area">${escapeHtml(t.area)}</span>${escapeHtml(t.tip)}</li>`).join("")
    : `<li><span class="tip-area">Nice</span>No major fixes found.</li>`;
}


/* ==========================================================
   "Try sample data" buttons
   ========================================================== */
function pickSampleRole() {
  return roles.find((r) => /backend|full.?stack|software|developer|data/i.test(r.title)) || roles[0];
}

$("compare-sample").addEventListener("click", async () => {
  await rolesReady;
  if (roles.length < 2) return;
  const first = pickSampleRole();
  const second = roles.find((r) => r.id !== first.id);
  $("compare-role-a").value = String(first.id);
  $("compare-role-b").value = String(second.id);
  $("compare-btn").click();
});

$("opp-sample").addEventListener("click", async () => {
  await rolesReady;
  if (!roles.length) return;
  $("opp-role-select").value = String(pickSampleRole().id);
  $("opp-location").value = "India";
  document.querySelector('.seg[data-kind="internship"]').click();
  searchOpportunities();
});

/* Roles picked on the Jobs and Resume tabs are remembered in the shared profile too. */
["opp-role-select", "rc-role"].forEach((id) => $(id).addEventListener("change", (e) => SGR.rememberRole(e.target.value)));
