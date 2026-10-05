/* SkillGap Radar — shared profile, dashboard and UI helpers.
   Loaded after app.js. Everything the user does is remembered in this
   browser (localStorage) so the Home dashboard, Scan, Jobs and Resume
   tabs all work from one profile. Nothing here leaves the browser. */

/* ---------------- Store: one profile, kept in localStorage ---------------- */
const Store = (() => {
  const KEY = "sgr.profile";
  const DRAFT = "sgr.resumeDraft";
  const read = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch (e) { return fallback; }
  };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  let profile = read(KEY, {});
  return {
    get: () => profile,
    patch(p) { profile = { ...profile, ...p }; write(KEY, profile); },
    draft: () => read(DRAFT, null),
    saveDraft: (d) => write(DRAFT, d),
    clear() { try { localStorage.removeItem(KEY); localStorage.removeItem(DRAFT); } catch (e) { /* ignore */ } profile = {}; },
  };
})();

/* ---------------- Toasts ---------------- */
function toast(message) {
  let box = document.getElementById("toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.classList.add("out"), 2600);
  setTimeout(() => t.remove(), 3100);
}

/* ---------------- Theme (light / dark) ---------------- */
function effectiveTheme() {
  return document.documentElement.getAttribute("data-theme")
    || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function syncThemeButton() {
  const dark = effectiveTheme() === "dark";
  const btn = document.getElementById("theme-toggle");
  btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  btn.setAttribute("aria-pressed", String(dark));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0E1220" : "#F3F5FB");
}
document.getElementById("theme-toggle").addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("sgr.theme", next); } catch (e) { /* ignore */ }
  syncThemeButton();
});
syncThemeButton();

/* ---------------- Score ring (animated, red / amber / green) ---------------- */
const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;
function ringTone(v) { return v >= 70 ? "good" : v >= 40 ? "mid" : "low"; }
function ringHTML(value, { size = 96, label = "", suffix = "" } = {}) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="ring ${ringTone(v)}" style="--size:${size}px" data-value="${v}" role="img" aria-label="${v}${suffix || " out of 100"} ${escapeHtml(label)}">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="ring-bg" cx="50" cy="50" r="${RING_R}"/>
      <circle class="ring-fg" cx="50" cy="50" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/>
    </svg>
    <div class="ring-center"><span class="ring-num" data-to="${v}" data-suffix="${suffix}">${v}${suffix}</span><span class="ring-label">${escapeHtml(label)}</span></div>
  </div>`;
}
function animateRings(root = document) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll(".ring").forEach((ring) => {
    const v = Number(ring.dataset.value);
    const fg = ring.querySelector(".ring-fg");
    const num = ring.querySelector(".ring-num");
    const target = RING_C * (1 - v / 100);
    if (reduce) { fg.style.strokeDashoffset = target; return; }
    num.textContent = `0${num.dataset.suffix}`;
    requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = target; }));
    const start = performance.now();
    const dur = 900;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      num.textContent = `${Math.round(v * (1 - Math.pow(1 - p, 3)))}${num.dataset.suffix}`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* ---------------- Charts: dependency-free SVG (no CDN needed) ---------------- */
function drawRadarChart(breakdown) {
  const box = document.getElementById("radar-chart");
  const labels = Object.keys(breakdown);
  const vals = labels.map((c) => {
    const { matched, total } = breakdown[c];
    return total ? Math.round((matched / total) * 100) : 0;
  });
  if (labels.length < 3) {
    // A radar needs at least 3 axes; fall back to simple bars.
    box.innerHTML = `<div class="mini-bars">${labels.map((l, i) => `
      <div class="mini-bar"><span>${escapeHtml(l)}</span><div class="bar-track"><div class="bar-fill" style="width:${vals[i]}%"></div></div><b>${vals[i]}%</b></div>`).join("")}</div>`;
    return;
  }
  const W = 360, H = 300, cx = W / 2, cy = H / 2 + 4, R = 92, n = labels.length;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ring = (f) => labels.map((_, i) => pt(i, R * f).map((x) => x.toFixed(1)).join(",")).join(" ");
  const poly = vals.map((v, i) => pt(i, (R * v) / 100).map((x) => x.toFixed(1)).join(",")).join(" ");
  const short = (s) => (s.length > 14 ? `${s.slice(0, 13)}…` : s);
  const labelEls = labels.map((l, i) => {
    const [x, y] = pt(i, R + 16);
    const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
    return `<text class="rc-label" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}">${escapeHtml(short(l))}</text>`;
  }).join("");
  const dots = vals.map((v, i) => {
    const [x, y] = pt(i, (R * v) / 100);
    return `<circle class="rc-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"><title>${escapeHtml(labels[i])}: ${v}%</title></circle>`;
  }).join("");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="radar-svg" focusable="false">
    ${[0.25, 0.5, 0.75, 1].map((f) => `<polygon class="rc-grid" points="${ring(f)}"/>`).join("")}
    ${labels.map((_, i) => { const [x, y] = pt(i, R); return `<line class="rc-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join("")}
    <polygon class="rc-area" points="${poly}" style="transform-origin:${cx}px ${cy}px"/>
    ${dots}${labelEls}
  </svg>`;
}

function drawBarChart(matched, missing) {
  const box = document.getElementById("bar-chart");
  const total = matched + missing;
  const pct = total ? Math.round((matched / total) * 100) : 0;
  box.innerHTML = `
    <div class="stack-wrap">
      <div class="stack" aria-hidden="true">
        <span class="stack-seg ok" style="flex:${matched}">${matched ? matched : ""}</span>
        <span class="stack-seg miss" style="flex:${missing}">${missing ? missing : ""}</span>
      </div>
      <ul class="legend">
        <li><i class="dot ok"></i><b>${matched}</b> matched</li>
        <li><i class="dot miss"></i><b>${missing}</b> missing</li>
        <li class="legend-note">${pct}% of ${total} required skills covered</li>
      </ul>
    </div>`;
}

/* ---------------- Busy states: skeleton placeholders ---------------- */
function setBusy(which, busy) {
  if (which === "scan") {
    const sk = document.getElementById("results-skeleton");
    document.getElementById("scan-btn").disabled = busy;
    document.getElementById("scan-btn").textContent = busy ? "Scanning…" : "Run scan";
    sk.hidden = !busy;
    if (busy) {
      document.getElementById("results-empty").hidden = true;
      document.getElementById("results-content").hidden = true;
    }
  } else if (which === "resume") {
    document.getElementById("rs-skeleton").hidden = !busy;
    document.getElementById("rc-score").disabled = busy;
    if (busy) {
      document.getElementById("rs-empty").hidden = true;
      document.getElementById("rs-result").hidden = true;
      document.getElementById("rs-preview").hidden = true;
    }
  }
}

/* ---------------- Skill helpers ---------------- */
function skillMatches(text) {
  const t = ` ${String(text).toLowerCase()} `;
  return knownSkills.filter((s) => {
    const k = s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9+#])${k}($|[^a-z0-9+#])`, "i").test(t);
  });
}

/* ---------------- Learning plan with progress ---------------- */
function renderPlan(plan) {
  const section = document.getElementById("plan-section");
  section.hidden = false;
  document.getElementById("plan-source").textContent = plan.source === "llm"
    ? "Generated live for you by the LLM API."
    : "Generated from built-in templates (no LLM API key configured).";
  const list = document.getElementById("plan-list");
  list.innerHTML = plan.items.map((p, i) => `
    <li class="${p.done ? "done" : ""}">
      <div class="plan-card-head">
        <span class="plan-order">${String(p.order).padStart(2, "0")}</span>
        <div class="plan-skill">${escapeHtml(p.skill)}</div>
      </div>
      <p class="plan-why">${escapeHtml(p.why)}</p>
      <p class="plan-how">${escapeHtml(p.how)}</p>
      <ul class="plan-resources">${p.resources.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
      <label class="plan-done"><input type="checkbox" data-i="${i}" ${p.done ? "checked" : ""}> I've learned this</label>
    </li>`).join("");
  list.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener("change", () => {
    const item = plan.items[Number(cb.dataset.i)];
    item.done = cb.checked;
    cb.closest("li").classList.toggle("done", cb.checked);
    const has = knownSkills.some((s) => s.toLowerCase() === item.skill.toLowerCase());
    if (cb.checked && !has) { knownSkills.push(item.skill); renderTags(); toast(`Added "${item.skill}" to your skills. Re-run the scan to update your match.`); }
    if (!cb.checked && has && item.addedByPlan) { removeSkill(knownSkills.find((s) => s.toLowerCase() === item.skill.toLowerCase())); }
    item.addedByPlan = cb.checked && !has ? true : (cb.checked ? item.addedByPlan : false);
    Store.patch({ plan });
    updatePlanProgress(plan);
    SGR.renderHome();
  }));
  updatePlanProgress(plan);
}
function updatePlanProgress(plan) {
  const done = plan.items.filter((p) => p.done).length;
  const pct = plan.items.length ? Math.round((done / plan.items.length) * 100) : 0;
  document.getElementById("plan-progress").hidden = false;
  document.getElementById("plan-progress-fill").style.width = `${pct}%`;
  document.getElementById("plan-progress-text").textContent = `${done} of ${plan.items.length} skills learned`;
}

/* ---------------- Sample data ---------------- */
async function runSampleScan() {
  if (!roles.length) { toast("Roles are still loading. Try again in a moment."); return; }
  const role = roles.find((r) => /backend|software|developer/i.test(r.title)) || roles[0];
  const detail = await fetchJSON(`${API}/roles/${role.id}`);
  const req = [...detail.required_skills].sort((a, b) => b.importance - a.importance).map((s) => s.skill);
  // Know roughly the first third of the requirements, so the result shows real gaps.
  const have = req.filter((_, i) => i % 3 === 0).slice(0, 5);
  knownSkills = have;
  renderTags();
  document.getElementById("role-select").value = String(role.id);
  document.getElementById("role-select").dispatchEvent(new Event("change"));
  showTab("dashboard");
  document.getElementById("scan-btn").click();
}

const SAMPLE_RESUME = {
  "rb-name": "Asha Rao", "rb-title": "Backend Developer", "rb-email": "asha.rao@example.com", "rb-phone": "+91 98765 43210",
  "rb-location": "Hyderabad, India", "rb-links": "github.com/asharao, linkedin.com/in/asharao",
  "rb-summary": "Computer science student who builds data-driven web apps with Python and FastAPI. Looking for a backend internship where I can ship features used by real people.",
  "rb-skills": "Python, SQL, FastAPI, Git, Docker, REST, JavaScript", "rb-languages": "English, Hindi, Telugu",
  "rb-experience": "Backend Intern\nNimbus Labs | Jun 2025 – Aug 2025\n- Built 6 REST endpoints used by 3 internal teams\n- Cut report generation time by 40% by adding SQL indexes\n- Wrote 35 unit tests, raising coverage from 52% to 81%",
  "rb-projects": "SkillGap Radar\n- Built a FastAPI + SQLite app that scores skills against 20+ roles\n- Deployed with Docker; handled 500+ requests in beta week",
  "rb-education": "B.Tech Computer Science\n2022 – 2026 | JNTU Hyderabad",
  "rb-references": "Priya Sharma\nEngineering Manager, Nimbus Labs\npriya.sharma@example.com",
};
function fillSampleResume() {
  Object.entries(SAMPLE_RESUME).forEach(([id, v]) => { document.getElementById(id).value = v; });
  generateResume();
  toast("Sample resume loaded. Edit anything to make it yours.");
}

/* ---------------- Resume: drafts + live mini-template thumbnails ---------------- */
const DRAFT_FIELDS = Object.keys(SAMPLE_RESUME);
let draftTimer, thumbTimer;
function saveDraft() {
  const fields = {};
  DRAFT_FIELDS.forEach((id) => { fields[id] = document.getElementById(id).value; });
  Store.saveDraft({ fields, style: resumeStyle, colorTouched, photo: resumePhoto });
}
function restoreDraft() {
  const d = Store.draft();
  if (!d) return;
  DRAFT_FIELDS.forEach((id) => { if (d.fields && typeof d.fields[id] === "string") document.getElementById(id).value = d.fields[id]; });
  if (d.style) {
    Object.assign(resumeStyle, d.style);
    colorTouched = !!d.colorTouched;
    applyAccent(resumeStyle.color);
    document.querySelectorAll(".lseg").forEach((b) => b.classList.toggle("active", b.dataset.layout === resumeStyle.layout));
    document.querySelectorAll(".bgopt").forEach((b) => b.classList.toggle("active", b.dataset.bg === resumeStyle.bg));
    document.querySelectorAll(".shseg").forEach((b) => b.classList.toggle("active", b.dataset.shape === resumeStyle.shape));
  }
  if (d.photo) setPhoto(d.photo);
}
function thumbData() {
  const r = lastResume && lastResume.name !== "Your Name" ? lastResume : null;
  if (r) return r;
  const v = SAMPLE_RESUME;
  return {
    name: v["rb-name"], title: v["rb-title"], contact: [v["rb-email"], v["rb-phone"], v["rb-location"]],
    summary: v["rb-summary"], education: parseBlocks(v["rb-education"]), skills: v["rb-skills"].split(", "),
    languages: v["rb-languages"].split(", "), projects: parseEntries(v["rb-projects"]),
    experience: parseEntries(v["rb-experience"]), references: parseBlocks(v["rb-references"]), photo: resumePhoto,
  };
}
function renderTemplateThumbs() {
  const data = thumbData();
  document.querySelectorAll(".tplopt").forEach((btn) => {
    const layout = btn.dataset.layout;
    const thumb = btn.querySelector(".tplthumb");
    const base = layout.startsWith("swoosh") ? "swoosh" : layout;
    const cls = `resume-sheet mini layout-${base}${layout === "swoosh-light" ? " tone-light" : ""} rs-bg-${resumeStyle.bg} shape-${resumeStyle.shape}`;
    const color = layout.startsWith("swoosh") && !colorTouched ? "#F59A3C" : resumeStyle.color;
    thumb.innerHTML = `<div class="${cls}" style="--rs-accent:${color}" aria-hidden="true">${resumeToHtml(data, layout)}</div>`;
    scaleThumb(thumb);
  });
}
function scaleThumb(thumb) {
  const w = thumb.clientWidth;
  if (w) thumb.style.setProperty("--k", (w / 760).toFixed(4));
}
const thumbObserver = "ResizeObserver" in window ? new ResizeObserver((es) => es.forEach((e) => scaleThumb(e.target))) : null;
document.querySelectorAll(".tplthumb").forEach((t) => thumbObserver && thumbObserver.observe(t));
document.querySelectorAll(".step").forEach((d) => d.addEventListener("toggle", () => document.querySelectorAll(".tplthumb").forEach(scaleThumb)));

/* ---------------- Saved openings ---------------- */
function savedList() { return Store.get().saved || []; }
function isSaved(url) { return savedList().some((s) => s.url === url); }
function toggleSaved(opp, data, btn) {
  let saved = savedList();
  if (isSaved(opp.url)) {
    saved = saved.filter((s) => s.url !== opp.url);
    toast("Removed from saved openings");
  } else {
    saved = [{ url: opp.url, title: opp.title, source: opp.source, company: opp.company || "", role: data.role, kind: data.kind, savedAt: Date.now() }, ...saved];
    toast("Saved to your dashboard");
  }
  Store.patch({ saved });
  btn.classList.toggle("on", isSaved(opp.url));
  btn.setAttribute("aria-pressed", String(isSaved(opp.url)));
  renderHome();
}

/* ---------------- Home dashboard ---------------- */
function statEmpty(text, btnLabel, tab) {
  return `<p class="stat-empty">${text}</p><button type="button" class="btn-link" data-go="${tab}">${btnLabel} &rarr;</button>`;
}
function renderHome() {
  const p = Store.get();
  const g = p.gap, plan = p.plan, rs = p.resume, saved = p.saved || [];

  document.getElementById("stat-match-body").innerHTML = g
    ? `${ringHTML(g.match, { size: 84, label: "match", suffix: "%" })}<div class="stat-meta"><b>${escapeHtml(g.role)}</b><span>${g.matched} matched · ${g.missing.length} missing</span></div>`
    : statEmpty("Scan your skills against a role to see your match.", "Run a scan", "dashboard");

  document.getElementById("stat-resume-body").innerHTML = rs
    ? `${ringHTML(rs.score, { size: 84, label: "/ 100", suffix: "" })}<div class="stat-meta"><b>${escapeHtml(rs.grade)}</b><span>${rs.role ? `for ${escapeHtml(rs.role)}` : "no target role"}</span></div>`
    : statEmpty("Check your resume to get a score and fixes.", "Check resume", "resume");

  if (plan) {
    const done = plan.items.filter((i) => i.done).length;
    const pct = plan.items.length ? Math.round((done / plan.items.length) * 100) : 0;
    document.getElementById("stat-plan-body").innerHTML = `${ringHTML(pct, { size: 84, label: "done", suffix: "%" })}<div class="stat-meta"><b>${done} of ${plan.items.length}</b><span>skills learned</span></div>`;
  } else {
    document.getElementById("stat-plan-body").innerHTML = statEmpty(g && g.missing.length ? "Turn your gaps into a step-by-step plan." : "Your plan appears here after a scan.", "Open scan", "dashboard");
  }

  document.getElementById("stat-saved-body").innerHTML = saved.length
    ? `<div class="big-count">${saved.length}</div><div class="stat-meta"><b>${saved.length === 1 ? "opening" : "openings"} saved</b><span>listed below</span></div>`
    : statEmpty("Bookmark internships and jobs to keep them here.", "Find openings", "opportunities");

  // Next best step
  const steps = [
    { done: !!g, text: "Scan your skills against a target role", tab: "dashboard" },
    { done: !!plan, text: "Build your learning plan", tab: "dashboard", action: "plan" },
    { done: !!rs, text: "Check your resume", tab: "resume" },
    { done: saved.length > 0, text: "Save an opening you like", tab: "opportunities" },
  ];
  let next;
  if (!g) next = { title: "Run your first scan", body: "Pick a role and add the skills you already have. It takes under a minute.", label: "Start a scan", tab: "dashboard" };
  else if (!plan && g.missing.length) next = { title: `Build a plan for ${g.missing[0]}`, body: `You're missing ${g.missing.length} skills for ${g.role}. A learning plan puts them in the right order.`, label: "Build my plan", tab: "dashboard", action: "plan" };
  else if (plan && plan.items.some((i) => !i.done)) { const n = plan.items.find((i) => !i.done); next = { title: `Next up: ${n.skill}`, body: n.how, label: "Open my plan", tab: "dashboard", action: "openplan" }; }
  else if (!rs) next = { title: "Check your resume", body: `See how your resume scores${g ? ` against ${g.role}` : ""} and what to fix first.`, label: "Check resume", tab: "resume" };
  else if (!saved.length) next = { title: "Find openings to apply to", body: `Search internships and jobs${g ? ` for ${g.role}` : ""}.`, label: "Find openings", tab: "opportunities" };
  else next = { title: "You're on track", body: "Re-run your scan after learning new skills to watch your match climb.", label: "Re-run scan", tab: "dashboard" };

  document.getElementById("next-step").innerHTML = `
    <h3>Your next step</h3>
    <p class="next-title">${escapeHtml(next.title)}</p>
    <p class="next-body">${escapeHtml(next.body)}</p>
    <button type="button" class="btn-primary" data-go="${next.tab}" ${next.action ? `data-action="${next.action}"` : ""}>${escapeHtml(next.label)}</button>
    <ul class="journey">${steps.map((s) => `<li class="${s.done ? "done" : ""}"><span class="tick" aria-hidden="true">${s.done ? "✓" : ""}</span>${s.done ? "<span class='sr-only'>Done: </span>" : ""}${escapeHtml(s.text)}</li>`).join("")}</ul>`;

  const list = document.getElementById("saved-list");
  list.innerHTML = saved.length
    ? saved.map((s, i) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer"><span class="opp-source" data-src="${escapeHtml(String(s.source).toLowerCase())}">${escapeHtml(s.source)}</span><span class="saved-title">${escapeHtml(s.title)}</span><span class="saved-meta">${escapeHtml([s.company, s.role].filter(Boolean).join(" · "))}</span></a><button type="button" class="saved-remove" data-i="${i}" aria-label="Remove ${escapeHtml(s.title)} from saved">×</button></li>`).join("")
    : '<li class="saved-empty">Nothing saved yet. Use the bookmark on any opening.</li>';
  list.querySelectorAll(".saved-remove").forEach((b) => b.addEventListener("click", () => {
    const s = savedList().filter((_, i) => i !== Number(b.dataset.i));
    Store.patch({ saved: s });
    renderHome();
  }));
  animateRings(document.getElementById("panel-home"));
}

document.getElementById("panel-home").addEventListener("click", async (e) => {
  const go = e.target.closest("[data-go]");
  if (!go) return;
  showTab(go.dataset.go);
  const action = go.dataset.action;
  if (action === "plan" || action === "openplan") {
    // Re-run the scan from the stored profile if the results aren't on screen, then show the plan.
    if (!currentGap) await rescanFromProfile();
    if (action === "plan" && currentGap && currentGap.missing.length) document.getElementById("plan-btn").click();
    if (action === "openplan" && Store.get().plan) renderPlan(Store.get().plan);
  }
});
document.getElementById("home-sample").addEventListener("click", runSampleScan);
document.getElementById("home-scan").addEventListener("click", () => showTab("dashboard"));
document.getElementById("scan-sample").addEventListener("click", runSampleScan);
document.getElementById("rb-sample").addEventListener("click", fillSampleResume);
document.getElementById("rc-sample").addEventListener("click", () => {
  const sample = SAMPLE_RESUME;
  document.getElementById("rc-text").value = [
    sample["rb-name"], sample["rb-title"], `${sample["rb-email"]} | ${sample["rb-phone"]} | ${sample["rb-links"].replace(", ", " | ")}`,
    "", "Summary", sample["rb-summary"], "", "Education", sample["rb-education"], "", "Skills", sample["rb-skills"],
    "", "Projects", sample["rb-projects"].replace(/\n- /g, "\n- "), "", "Experience", sample["rb-experience"],
  ].join("\n");
  document.getElementById("rc-hint").textContent = "Sample pasted. Press Score my resume.";
});

async function rescanFromProfile() {
  const p = Store.get();
  if (!p.roleId) return;
  document.getElementById("role-select").value = String(p.roleId);
  document.getElementById("scan-btn").click();
  await new Promise((resolve) => {
    const t = setInterval(() => { if (!document.getElementById("scan-btn").disabled) { clearInterval(t); resolve(); } }, 80);
    setTimeout(() => { clearInterval(t); resolve(); }, 8000);
  });
}

/* ---------------- Hooks called from app.js ---------------- */
const SGR = {
  setBusy,
  skillMatches,
  isSaved,
  toggleSaved,
  renderHome,
  onRolesLoaded() {
    const p = Store.get();
    if (p.roleId && roles.some((r) => r.id === p.roleId)) {
      ["role-select", "opp-role-select", "rc-role"].forEach((id) => { document.getElementById(id).value = String(p.roleId); });
    }
  },
  onSkillsChanged() {
    Store.patch({ skills: knownSkills });
  },
  rememberRole(roleId) {
    if (roleId) Store.patch({ roleId: Number(roleId) });
  },
  onScan(gap, roleId) {
    const prevPlan = Store.get().plan;
    Store.patch({
      roleId,
      skills: knownSkills,
      gap: { role: gap.role, match: gap.match_percentage, matched: gap.matched.length, missing: gap.missing.map((m) => m.skill) },
      // A plan belongs to a role: keep it only while the role is unchanged.
      plan: prevPlan && prevPlan.role === gap.role ? prevPlan : null,
    });
    // One profile across tabs: carry the role to Jobs and Resume checker.
    ["opp-role-select", "rc-role"].forEach((id) => { const el = document.getElementById(id); if (!el.value) el.value = String(roleId); });
    const rb = document.getElementById("rb-skills");
    if (!rb.value && knownSkills.length) rb.value = knownSkills.join(", ");
    renderHome();
  },
  onPlan(rec, roleId) {
    const prev = Store.get().plan;
    const wasDone = (skill) => prev && prev.role === rec.role && (prev.items.find((i) => i.skill === skill) || {}).done;
    const plan = {
      role: rec.role, roleId, source: rec.source,
      items: [...rec.plan].sort((a, b) => a.order - b.order).map((p) => ({
        order: p.order, skill: p.skill, why: p.why_it_matters, how: p.how_to_start, resources: p.resources, done: !!wasDone(p.skill),
      })),
    };
    Store.patch({ plan });
    renderPlan(plan);
    renderHome();
  },
  onResumeScore(res, roleId) {
    const role = roleId ? (roles.find((r) => r.id === roleId) || {}).title || res.role : res.role;
    Store.patch({ resume: { score: res.score, grade: res.grade, role: role || null } });
    renderHome();
  },
  onResumeChanged() {
    clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400);
    clearTimeout(thumbTimer); thumbTimer = setTimeout(renderTemplateThumbs, 350);
  },
  onTabShown(id) {
    if (id === "home") renderHome();
    if (id === "resume") {
      const sk = document.getElementById("rb-skills");
      if (!sk.value && knownSkills.length) sk.value = knownSkills.join(", ");
      if (!lastResume && document.getElementById("rb-name").value.trim()) generateResume();
      renderTemplateThumbs();
    }
    if (id === "opportunities") {
      const sel = document.getElementById("opp-role-select");
      if (!sel.value && Store.get().roleId) sel.value = String(Store.get().roleId);
    }
  },
};

/* ---------------- Boot: restore profile, draft, deep link ---------------- */
(function boot() {
  const p = Store.get();
  if (Array.isArray(p.skills) && p.skills.length) { knownSkills = [...p.skills]; renderTags(); }
  restoreDraft();
  if (p.plan && !p.plan.items) Store.patch({ plan: null });   // ignore an old-format plan
  const hash = location.hash.replace("#", "");
  if (hash && document.getElementById(`panel-${hash}`)) showTab(hash);
  else renderHome();
  renderTemplateThumbs();
  // Reset link in the footer of Home
  const reset = document.getElementById("reset-profile");
  if (reset) reset.addEventListener("click", () => { Store.clear(); location.reload(); });
})();
