import { init } from "https://cdn.jsdelivr.net/npm/why-did-you-fetch@0.3.0/dist/index.js";
const DEMO_OPTIONS = { dedupeWindowMs: 1500, chainGapMs: 50, chainMinLength: 3, retainMs: 5e3 };
const LABEL = {
  "duplicate-inflight": "DUPLICATE \xB7 IN-FLIGHT",
  "duplicate-recent": "DUPLICATE \xB7 RECENT",
  "sequential-chain": "SEQUENTIAL CHAIN",
  "rapid-calls": "RAPID CALLS"
};
const BADGE_STYLE = {
  "duplicate-inflight": "background:#e11d48;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold",
  "duplicate-recent": "background:#d97706;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold",
  "sequential-chain": "background:#2563eb;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold",
  "rapid-calls": "background:#7c3aed;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold"
};
const SEV_CLASS = {
  "duplicate-inflight": "a",
  "duplicate-recent": "b",
  "sequential-chain": "c",
  "rapid-calls": "d"
};
const els = {
  tabs: Array.from(document.querySelectorAll(".scenario-tabs .tab")),
  desc: document.querySelector(".scenario-desc"),
  rows: document.querySelector(".rows"),
  ruler: document.querySelector(".timeline-ruler"),
  issues: document.querySelector(".issues"),
  runBtn: document.querySelector(".run-btn"),
  fileTabs: document.querySelector(".demo .file-tabs"),
  codeBlock: document.querySelector(".demo .code-block"),
  copyBtn: document.querySelector(".demo .copy-btn")
};
function esc(id) {
  return "${" + id + "}";
}
const SCENARIOS = {
  inflight: {
    label: "Duplicate in-flight",
    desc: "UserCard and Avatar mount at the same time and each independently fetch the same user \u2014 neither knows about the other.",
    latency: 450,
    files: [
      {
        name: "UserCard.tsx",
        code: `function UserCard({ id }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(\`/api/users/` + esc("id") + `\`)
      .then((r) => r.json())
      .then(setUser);
  }, [id]);

  return <div className="card">{user?.name ?? 'Loading\u2026'}</div>;
}`
      },
      {
        name: "Avatar.tsx",
        code: `function Avatar({ id }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Same endpoint as UserCard \u2014 fired independently.
    fetch(\`/api/users/` + esc("id") + `\`)
      .then((r) => r.json())
      .then(setUser);
  }, [id]);

  return <img src={user?.avatarUrl} alt="" />;
}`
      }
    ],
    async run(target) {
      logged(target, "GET", "/api/users/42");
      logged(target, "GET", "/api/users/42");
      await wait(600);
    }
  },
  recent: {
    label: "Duplicate, moments later",
    desc: "StatsWidget refetches on window focus without checking whether its data is still fresh.",
    latency: 150,
    files: [
      {
        name: "StatsWidget.tsx",
        code: `function StatsWidget() {
  const [stats, setStats] = useState(null);

  const loadStats = () =>
    fetch('/api/stats').then((r) => r.json()).then(setStats);

  useEffect(() => {
    loadStats();
    window.addEventListener('focus', loadStats);
    return () => window.removeEventListener('focus', loadStats);
  }, []);

  return <Panel stats={stats} />;
}
// Tabbing away and back a moment later re-fetches
// data that hasn't gone stale.`
      }
    ],
    async run(target) {
      await logged(target, "GET", "/api/stats");
      await wait(700);
      await logged(target, "GET", "/api/stats");
    }
  },
  chain: {
    label: "Sequential chain",
    desc: "Dashboard awaits three unrelated lookups one at a time instead of firing them together.",
    latency: 220,
    files: [
      {
        name: "Dashboard.tsx",
        code: `async function loadDashboard() {
  // None of these three depend on each other\u2019s result.
  const profile = await getProfile();
  const notifications = await getNotificationCount();
  const billing = await getBillingStatus();

  return { profile, notifications, billing };
}
// Promise.all([getProfile(), getNotificationCount(), getBillingStatus()])
// would do the same work in a third of the time.`
      }
    ],
    async run(target) {
      await logged(target, "GET", "/api/profile");
      await logged(target, "GET", "/api/notifications/count");
      await logged(target, "GET", "/api/billing/status");
    }
  }
};
let uninstall = null;
let running = false;
let currentKey = "inflight";
let rowSeq = 0;
let rows = [];
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function makeFakeTarget(latencyMs) {
  return {
    fetch() {
      return new Promise((resolve) => setTimeout(() => resolve(new Response("{}", { status: 200 })), latencyMs));
    }
  };
}
function freshInstall(latencyMs, onIssue) {
  if (uninstall) uninstall();
  const target = makeFakeTarget(latencyMs);
  uninstall = init({ ...DEMO_OPTIONS, onIssue }, target);
  return target;
}
function logged(target, method, url) {
  const id = ++rowSeq;
  const row = { id, method, url, start: performance.now(), end: null };
  rows.push(row);
  renderRows();
  return target.fetch(url, { method }).then(
    () => {
      row.end = performance.now();
      renderRows();
    },
    () => {
      row.end = performance.now();
      renderRows();
    }
  );
}
function renderRows() {
  if (rows.length === 0) {
    els.rows.innerHTML = "";
    els.ruler.innerHTML = "";
    return;
  }
  const t0 = Math.min(...rows.map((r) => r.start));
  const t1 = Math.max(...rows.map((r) => r.end ?? performance.now()));
  const windowMs = Math.max(250, (t1 - t0) * 1.18);
  els.rows.innerHTML = "";
  rows.forEach((r) => {
    const left = (r.start - t0) / windowMs * 100;
    const width = r.end ? Math.max(2, (r.end - r.start) / windowMs * 100) : 4;
    const dur = r.end ? Math.round(r.end - r.start) + "ms" : "\u2026";
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    const method = document.createElement("span");
    method.className = "method";
    method.textContent = r.method;
    const url = document.createElement("span");
    url.className = "url";
    url.textContent = r.url;
    const track = document.createElement("span");
    track.className = "track";
    const bar = document.createElement("span");
    bar.className = "bar" + (r.end ? "" : " pending");
    bar.style.left = left + "%";
    bar.style.width = width + "%";
    track.appendChild(bar);
    const durEl = document.createElement("span");
    durEl.className = "dur";
    durEl.textContent = dur;
    rowEl.append(method, url, track, durEl);
    els.rows.appendChild(rowEl);
  });
  els.ruler.innerHTML = "";
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const tick = document.createElement("span");
    tick.textContent = Math.round(windowMs * f) + "ms";
    els.ruler.appendChild(tick);
  });
}
function addIssueCard(issue) {
  const el = document.createElement("div");
  el.className = "issue sev-" + SEV_CLASS[issue.kind];
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = LABEL[issue.kind];
  const msg = document.createElement("p");
  msg.textContent = issue.message;
  el.append(badge, msg);
  els.issues.prepend(el);
  console.groupCollapsed("%c" + LABEL[issue.kind] + "%c " + issue.message, BADGE_STYLE[issue.kind], "");
  console.log(issue);
  console.groupEnd();
}
function renderFileTabs(files) {
  els.fileTabs.innerHTML = "";
  files.forEach((f, i) => {
    const b = document.createElement("button");
    b.className = "file-tab" + (i === 0 ? " active" : "");
    b.textContent = f.name;
    b.addEventListener("click", () => {
      els.fileTabs.querySelectorAll(".file-tab").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      els.codeBlock.textContent = f.code;
    });
    els.fileTabs.appendChild(b);
  });
  els.codeBlock.textContent = files[0].code;
}
async function runScenario(key) {
  if (running) return;
  running = true;
  els.runBtn.disabled = true;
  els.tabs.forEach((t) => t.disabled = true);
  rows = [];
  els.issues.innerHTML = "";
  renderRows();
  const scenario = SCENARIOS[key];
  const target = freshInstall(scenario.latency, addIssueCard);
  await scenario.run(target);
  running = false;
  els.runBtn.disabled = false;
  els.tabs.forEach((t) => t.disabled = false);
}
function selectScenario(key) {
  currentKey = key;
  els.tabs.forEach((t) => t.classList.toggle("active", t.dataset["scenario"] === key));
  const scenario = SCENARIOS[key];
  els.desc.textContent = scenario.desc;
  renderFileTabs(scenario.files);
  void runScenario(key);
}
els.tabs.forEach((t) => t.addEventListener("click", () => selectScenario(t.dataset["scenario"])));
els.runBtn.addEventListener("click", () => void runScenario(currentKey));
els.copyBtn.addEventListener("click", () => {
  const text = els.codeBlock.textContent ?? "";
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = els.copyBtn.textContent;
      els.copyBtn.textContent = "Copied";
      setTimeout(() => els.copyBtn.textContent = orig, 1400);
    }).catch(() => {
    });
  }
});
selectScenario("inflight");
const FRAMEWORK_SAMPLES = [
  {
    name: "Vanilla / any framework",
    code: `import { init } from 'why-did-you-fetch';

init(); // no-ops automatically in production`
  },
  {
    name: "React",
    code: `import { useWhyDidYouFetch } from 'why-did-you-fetch/react';

function App() {
  useWhyDidYouFetch();
  return <YourApp />;
}`
  },
  {
    name: "Axios / other XHR clients",
    code: `import { init } from 'why-did-you-fetch';

// Covered automatically \u2014 axios (browser build) and most
// HTTP clients sit on top of XMLHttpRequest, which init()
// patches alongside fetch.
init();`
  }
];
const fwTabs = document.getElementById("framework-tabs");
const fwCode = document.getElementById("framework-code");
const fwCopy = document.getElementById("framework-copy");
function renderFrameworkTabs() {
  fwTabs.innerHTML = "";
  FRAMEWORK_SAMPLES.forEach((f, i) => {
    const b = document.createElement("button");
    b.className = "file-tab" + (i === 0 ? " active" : "");
    b.textContent = f.name;
    b.addEventListener("click", () => {
      fwTabs.querySelectorAll(".file-tab").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      fwCode.textContent = f.code;
    });
    fwTabs.appendChild(b);
  });
  fwCode.textContent = FRAMEWORK_SAMPLES[0].code;
}
renderFrameworkTabs();
fwCopy.addEventListener("click", () => {
  const text = fwCode.textContent ?? "";
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = fwCopy.textContent;
      fwCopy.textContent = "Copied";
      setTimeout(() => fwCopy.textContent = orig, 1400);
    }).catch(() => {
    });
  }
});
