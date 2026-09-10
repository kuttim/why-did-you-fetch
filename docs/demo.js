import { consoleReporter, init } from "https://cdn.jsdelivr.net/npm/why-did-you-fetch/dist/index.js";
const DEMO_OPTIONS = {
  dedupeWindowMs: 1500,
  chainGapMs: 50,
  chainMinLength: 3,
  retainMs: 5e3,
  rapidCallWindowMs: 1e4,
  nPlusOneWindowMs: 1e4
};
const LABEL = {
  "duplicate-inflight": "DUPLICATE \xB7 IN-FLIGHT",
  "duplicate-recent": "DUPLICATE \xB7 RECENT",
  "sequential-chain": "SEQUENTIAL CHAIN",
  "rapid-calls": "RAPID CALLS",
  "n-plus-one": "N+1"
};
const SEV_CLASS = {
  "duplicate-inflight": "a",
  "duplicate-recent": "b",
  "sequential-chain": "c",
  "rapid-calls": "d",
  "n-plus-one": "e"
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
  },
  rapid: {
    label: "Rapid same-endpoint calls",
    desc: "SearchBox fires a new request on every keystroke with no debounce \u2014 five different queries to the same endpoint inside a second.",
    latency: 180,
    files: [
      {
        name: "SearchBox.tsx",
        code: `function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!query) return;
    fetch(\`/api/search?q=` + esc("query") + `\`)
      .then((r) => r.json())
      .then((data) => setResults(data.results));
  }, [query]); // fires on every keystroke \u2014 no debounce

  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}`
      }
    ],
    async run(target) {
      for (const q of ["r", "re", "rea", "reac", "react"]) {
        logged(target, "GET", "/api/search?q=" + q);
        await wait(70);
      }
      await wait(300);
    }
  },
  nplusone: {
    label: "N+1 list fetch",
    desc: "UserList renders five rows, each fetching its own user record on mount instead of one batched request.",
    latency: 200,
    files: [
      {
        name: "UserList.tsx",
        code: `function UserList({ ids }) {
  return (
    <ul>
      {ids.map((id) => (
        <UserRow key={id} id={id} />
      ))}
    </ul>
  );
}

function UserRow({ id }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Each row fetches its own record \u2014 five ids means five requests,
    // instead of one GET /api/users?ids=` + esc('ids.join(",")') + `
    fetch(\`/api/users/` + esc("id") + `\`)
      .then((r) => r.json())
      .then(setUser);
  }, [id]);

  return <li>{user?.name ?? 'Loading\u2026'}</li>;
}`
      }
    ],
    async run(target) {
      for (const id of [1, 2, 3, 4, 5]) {
        logged(target, "GET", "/api/users/" + id);
        await wait(15);
      }
      await wait(300);
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
  consoleReporter(issue);
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

init(); // no-ops automatically in production

// Full runnable version: examples/vanilla`
  },
  {
    name: "Vite + React",
    code: `// main.tsx \u2014 called at the true entry point, before React renders
// anything. React fires effects children-before-parents, so calling
// useWhyDidYouFetch() inside App would only install the patch *after*
// App's own children had already fired their first-mount fetches.
import { createRoot } from 'react-dom/client';
import { init } from 'why-did-you-fetch';
import { App } from './App';

init();

createRoot(document.getElementById('root')!).render(<App />);

// Full runnable version: examples/vite-react`
  },
  {
    name: "Next.js App Router",
    code: `// app/wdyf-init.tsx \u2014 a client-only sibling, not a parent, of the
// rest of the tree: Next renders Client Component code on the server
// too, where fetch is already patched for Next's own cache/revalidate
// layer. useWhyDidYouFetch() installs inside a useEffect, which React
// never runs on the server, so only client-side fetches get patched.
'use client';
import { useWhyDidYouFetch } from 'why-did-you-fetch/react';

export function WhyDidYouFetchInit() {
  useWhyDidYouFetch();
  return null;
}

// app/layout.tsx \u2014 rendered as an early sibling of {children}, so its
// effect (React fires siblings' effects in document order) completes
// before the page's own fetching components mount:
//
//   <body>
//     <WhyDidYouFetchInit />
//     {children}
//   </body>

// Full runnable version: examples/nextjs-app-router`
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
