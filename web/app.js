const $ = (id) => document.getElementById(id);

const state = {
  eventId: localStorage.getItem("eventId") || "",
  participantId: localStorage.getItem("participantId") || "",
  participantKey: localStorage.getItem("participantKey") || "",
  participantName: localStorage.getItem("participantName") || "",
  event: null,
};

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function apiBase() {
  // ローカル開発: http://localhost:8001
  // 本番: backend のエンドポイント（または relative URL）
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isDev ? 'http://localhost:8001' : '';
}

async function api(path, options = {}) {
  const res = await fetch(apiBase() + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.detail ? `: ${j.detail}` : "";
    } catch {
      // ignore
    }
    throw new Error(`${res.status}${detail}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function parseLines(text) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function loadEvent() {
  if (!state.eventId) return;
  try {
    const event = await api(`/api/events/${encodeURIComponent(state.eventId)}`);
    state.event = event;
    renderScoreForm();
    showSections();
  } catch (e) {
    console.warn("Failed to load event (REST API not available):", e.message);
    // REST API が実装されていない場合はスキップ
  }
}

function showSections() {
  const score = $("score-section");
  const results = $("results-section");

  if (state.eventId && state.participantId && state.participantKey && state.event) {
    score.hidden = false;
    results.hidden = false;
    const me = state.participantName
      ? `${state.participantName} (${state.participantId})`
      : state.participantId;
    setText("score-meta", `イベント: ${state.event.title} / あなた: ${me}`);
  } else {
    score.hidden = true;
    results.hidden = true;
  }

  $("join-event-id").value = state.eventId || "";
  $("join-name").value = state.participantName || $("join-name").value;
}

function renderScoreForm() {
  const root = $("score-form");
  root.innerHTML = "";
  if (!state.event) return;

  for (const entry of state.event.entries) {
    const row = document.createElement("div");
    row.className = "score-row";

    const name = document.createElement("div");
    name.textContent = entry.name;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.inputMode = "numeric";
    input.placeholder = "0-100";
    input.dataset.entryId = entry.id;

    row.appendChild(name);
    row.appendChild(input);
    root.appendChild(row);
  }
}

function readScoresFromForm() {
  const inputs = $("score-form").querySelectorAll("input[data-entry-id]");
  const scores = [];
  for (const input of inputs) {
    const entryId = input.dataset.entryId;
    const v = input.value === "" ? 0 : Number(input.value);
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error("score must be 0-100");
    scores.push({ entry_id: entryId, score: Math.trunc(v) });
  }
  return scores;
}

function renderTable(headers, rows) {
  const table = document.createElement("table");
  table.className = "table";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    for (const c of r) {
      const td = document.createElement("td");
      td.textContent = String(c);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

async function refreshResults() {
  const root = $("results");
  root.innerHTML = "";

  const r = await api(`/api/events/${encodeURIComponent(state.eventId)}/results`);

  const h3a = document.createElement("h3");
  h3a.textContent = "全員合計（合計点と順位）";
  root.appendChild(h3a);
  root.appendChild(
    renderTable(
      ["順位", "対象", "合計点"],
      r.overall.map((x) => [x.rank, x.entry_name, x.total_score])
    )
  );

  for (const p of r.per_participant) {
    const h3 = document.createElement("h3");
    h3.textContent = `${p.participant_name} の順位`;
    root.appendChild(h3);
    root.appendChild(
      renderTable(
        ["順位", "対象", "点数"],
        p.rankings.map((x) => [x.rank, x.entry_name, x.score])
      )
    );
  }
}

$("btn-create").addEventListener("click", async () => {
  setText("create-result", "");
  try {
    const title = $("create-title").value.trim();
    const entries = parseLines($("create-entries").value);
    const r = await api("/api/events", { method: "POST", body: JSON.stringify({ title, entries }) });
    state.eventId = r.event_id;
    localStorage.setItem("eventId", state.eventId);
    setText("create-result", `イベントID: ${state.eventId}`);
    await loadEvent();
  } catch (e) {
    setText("create-result", `失敗: ${e.message}`);
  }
});

$("btn-join").addEventListener("click", async () => {
  setText("join-result", "");
  try {
    const eventId = $("join-event-id").value.trim();
    const name = $("join-name").value.trim();
    const r = await api(`/api/events/${encodeURIComponent(eventId)}/join`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    state.eventId = eventId;
    state.participantId = r.participant_id;
    state.participantKey = r.participant_key;
    state.participantName = name;

    localStorage.setItem("eventId", state.eventId);
    localStorage.setItem("participantId", state.participantId);
    localStorage.setItem("participantKey", state.participantKey);
    localStorage.setItem("participantName", state.participantName);

    setText("join-result", `参加OK: ${state.participantId}`);
    await loadEvent();
  } catch (e) {
    setText("join-result", `失敗: ${e.message}`);
  }
});

$("btn-save-scores").addEventListener("click", async () => {
  setText("score-result", "");
  try {
    const scores = readScoresFromForm();
    await api(`/api/events/${encodeURIComponent(state.eventId)}/participants/${encodeURIComponent(state.participantId)}/scores`, {
      method: "PUT",
      headers: { "X-Participant-Key": state.participantKey },
      body: JSON.stringify({ scores }),
    });
    setText("score-result", "保存しました");
  } catch (e) {
    setText("score-result", `失敗: ${e.message}`);
  }
});

$("btn-refresh-results").addEventListener("click", async () => {
  try {
    await refreshResults();
  } catch (e) {
    $("results").textContent = `失敗: ${e.message}`;
  }
});

(async function boot() {
  try {
    // REST API の代わりに GraphQL を使う場合は、amplify_outputs.json を読み込んで
    // Amplify Data client を初期化する必要があります。
    // 現在は REST API エンドポイントが実装されていないため、UI 表示のみです。
    await loadEvent();
    showSections();
  } catch (e) {
    // ignore
  }
})();
