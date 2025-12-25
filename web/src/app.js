import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';

const $ = (id) => document.getElementById(id);

const state = {
  eventId: localStorage.getItem('eventId') || '',
  participantName: localStorage.getItem('participantName') || '',
  identityId: localStorage.getItem('identityId') || '',
  event: null,
  candidates: [],
  subs: [],
};

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function parseLines(text) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function requireNonBlank(label, value) {
  const v = String(value ?? '').trim();
  if (!v) throw new Error(`${label}を入力してください`);
  return v;
}

function competitionRankDesc(pairs) {
  // pairs: [{ id, score }]
  const sorted = [...pairs].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.id).localeCompare(String(b.id));
  });

  const ranks = new Map();
  let lastScore = null;
  let lastRank = null;

  for (let i = 0; i < sorted.length; i++) {
    const position = i + 1;
    const { id, score } = sorted[i];
    if (lastScore !== null && score === lastScore) {
      ranks.set(id, lastRank);
      continue;
    }
    ranks.set(id, position);
    lastScore = score;
    lastRank = position;
  }

  return ranks;
}

async function loadAmplifyOutputs() {
  const res = await fetch('/amplify_outputs.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('amplify_outputs.json not found. Run `npx ampx sandbox`.');
  return res.json();
}

async function ensureAmplifyConfigured() {
  const outputs = await loadAmplifyOutputs();
  Amplify.configure(outputs);
}

async function ensureIdentity() {
  const session = await fetchAuthSession();
  if (!session.identityId) throw new Error('identityId not available (guest access disabled?)');
  state.identityId = session.identityId;
  localStorage.setItem('identityId', state.identityId);
}

const client = generateClient();

async function createEvent(title, entryNames) {
  if (!title.trim()) throw new Error('タイトルを入力してください');
  if (!entryNames.length) throw new Error('採点対象を1件以上入力してください');

  const { data: event, errors } = await client.models.Event.create({ title });
  if (errors?.length) throw new Error(errors[0].message);
  if (!event) throw new Error('failed to create event');

  const candidates = [];
  for (const name of entryNames) {
    const { data: cand, errors: candErrors } = await client.models.Candidate.create({
      eventId: event.id,
      name,
      totalScore: 0,
    });
    if (candErrors?.length) throw new Error(candErrors[0].message);
    if (cand) candidates.push(cand);
  }

  return { eventId: event.id, candidates };
}

async function joinEvent(eventId, displayName) {
  if (!eventId.trim()) throw new Error('イベントIDを入力してください');
  if (!displayName.trim()) throw new Error('名前を入力してください');

  const participantId = `${eventId}#${state.identityId}`;
  const { data, errors } = await client.models.Participant.create({
    id: participantId,
    eventId,
    voterId: state.identityId,
    displayName,
  });

  // idempotent join: if already exists, just accept.
  if (errors?.length) {
    const msg = errors[0].message || '';
    if (!msg.includes('ConditionalCheckFailed') && !msg.includes('already exists')) {
      throw new Error(msg);
    }
  }
  return data ?? { id: participantId, eventId, voterId: state.identityId, displayName };
}

async function loadEventAndCandidates() {
  if (!state.eventId) return;

  const { data: event, errors: eventErrors } = await client.models.Event.get({ id: state.eventId });
  if (eventErrors?.length) throw new Error(eventErrors[0].message);
  state.event = event;

  const { data: candidates, errors: candErrors } = await client.models.Candidate.listCandidatesByEvent({
    eventId: state.eventId,
  });
  if (candErrors?.length) throw new Error(candErrors[0].message);
  state.candidates = candidates ?? [];

  renderScoreForm();
  showSections();
  setupRealtime();
}

function showSections() {
  const score = $('score-section');
  const results = $('results-section');

  if (state.eventId && state.identityId && state.event) {
    score.hidden = false;
    results.hidden = false;
    const me = state.participantName ? `${state.participantName} (${state.identityId})` : state.identityId;
    setText('score-meta', `イベント: ${state.event.title} / あなた: ${me}`);
  } else {
    score.hidden = true;
    results.hidden = true;
  }

  $('join-event-id').value = state.eventId || '';
  $('join-name').value = state.participantName || $('join-name').value;
}

function renderScoreForm() {
  const root = $('score-form');
  root.innerHTML = '';
  if (!state.event) return;

  for (const entry of state.candidates) {
    const row = document.createElement('div');
    row.className = 'score-row';

    const name = document.createElement('div');
    name.textContent = entry.name;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.inputMode = 'numeric';
    input.placeholder = '0-100';
    input.dataset.candidateId = entry.id;

    row.appendChild(name);
    row.appendChild(input);
    root.appendChild(row);
  }
}

function readScoresFromForm() {
  const inputs = $('score-form').querySelectorAll('input[data-candidate-id]');
  const scores = [];
  for (const input of inputs) {
    const candidateId = input.dataset.candidateId;
    const v = input.value === '' ? 0 : Number(input.value);
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error('score must be 0-100');
    scores.push({ candidateId, score: Math.trunc(v) });
  }
  return scores;
}

function renderTable(headers, rows) {
  const table = document.createElement('table');
  table.className = 'table';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    for (const c of r) {
      const td = document.createElement('td');
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
  const root = $('results');
  root.innerHTML = '';

  const [{ data: candidates, errors: candErrors }, { data: participants, errors: partErrors }, { data: votes, errors: voteErrors }] =
    await Promise.all([
      client.models.Candidate.listCandidatesByEvent({ eventId: state.eventId }),
      client.models.Participant.listParticipantsByEvent({ eventId: state.eventId }),
      client.models.Vote.listVotesByEvent({ eventId: state.eventId }),
    ]);

  if (candErrors?.length) throw new Error(candErrors[0].message);
  if (partErrors?.length) throw new Error(partErrors[0].message);
  if (voteErrors?.length) throw new Error(voteErrors[0].message);

  const candList = (candidates ?? []).map((c) => ({ ...c, totalScore: Number(c.totalScore ?? 0) }));
  const totalsPairs = candList.map((c) => ({ id: c.id, score: Number(c.totalScore ?? 0) }));
  const totalRanks = competitionRankDesc(totalsPairs);

  const overallRows = candList
    .slice()
    .sort((a, b) => {
      const da = Number(a.totalScore ?? 0);
      const db = Number(b.totalScore ?? 0);
      if (db !== da) return db - da;
      return String(a.id).localeCompare(String(b.id));
    })
    .map((c) => [totalRanks.get(c.id), c.name, Number(c.totalScore ?? 0)]);

  const h3a = document.createElement('h3');
  h3a.textContent = '全員合計（合計点と順位）';
  root.appendChild(h3a);
  root.appendChild(renderTable(['順位', '対象', '合計点'], overallRows));

  const votesByVoter = new Map();
  for (const v of votes ?? []) {
    const voterId = v.voterId;
    if (!votesByVoter.has(voterId)) votesByVoter.set(voterId, new Map());
    votesByVoter.get(voterId).set(v.candidateId, Number(v.score ?? 0));
  }

  const participantsSorted = (participants ?? []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
  for (const p of participantsSorted) {
    const scoreMap = votesByVoter.get(p.voterId) ?? new Map();
    const pairs = candList.map((c) => ({ id: c.id, score: Number(scoreMap.get(c.id) ?? 0) }));
    const ranks = competitionRankDesc(pairs);

    const rows = pairs
      .slice()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.id).localeCompare(String(b.id));
      })
      .map((x) => {
        const cand = candList.find((c) => c.id === x.id);
        return [ranks.get(x.id), cand ? cand.name : x.id, x.score];
      });

    const h3 = document.createElement('h3');
    h3.textContent = `${p.displayName} の順位`;
    root.appendChild(h3);
    root.appendChild(renderTable(['順位', '対象', '点数'], rows));
  }
}

function teardownRealtime() {
  for (const sub of state.subs) {
    try {
      sub.unsubscribe();
    } catch {
      // ignore
    }
  }
  state.subs = [];
}

function setupRealtime() {
  teardownRealtime();
  if (!state.eventId) return;

  // Realtime updates: disabled for MVP
  // TODO: Implement subscription when GraphQL API is ready
}


$('btn-create').addEventListener('click', async () => {
  setText('create-result', '');
  try {
    const title = requireNonBlank('タイトル', $('create-title').value);
    const entries = parseLines($('create-entries').value);

    const r = await createEvent(title, entries);
    state.eventId = r.eventId;
    localStorage.setItem('eventId', state.eventId);

    setText('create-result', `イベントID: ${state.eventId}`);
    await loadEventAndCandidates();
  } catch (e) {
    setText('create-result', `失敗: ${e.message}`);
  }
});

$('btn-join').addEventListener('click', async () => {
  setText('join-result', '');
  try {
    const eventId = requireNonBlank('イベントID', $('join-event-id').value);
    const name = requireNonBlank('名前', $('join-name').value);

    await joinEvent(eventId, name);

    state.eventId = eventId;
    state.participantName = name;

    localStorage.setItem('eventId', state.eventId);
    localStorage.setItem('participantName', state.participantName);

    setText('join-result', `参加OK: ${state.identityId}`);
    await loadEventAndCandidates();
  } catch (e) {
    setText('join-result', `失敗: ${e.message}`);
  }
});

$('btn-save-scores').addEventListener('click', async () => {
  setText('score-result', '');
  try {
    const scores = readScoresFromForm();

    for (const s of scores) {
      // Create or update Vote record
      const voteId = `${state.eventId}#${s.candidateId}#${state.identityId}`;
      
      // Check if vote exists
      const { data: existingVote, errors: getErrors } = await client.models.Vote.get({ id: voteId });
      if (getErrors?.length && !getErrors[0].message.includes('NotFound')) {
        throw new Error(getErrors[0].message);
      }

      const oldScore = existingVote?.score ?? 0;
      const delta = s.score - oldScore;

      if (existingVote) {
        // Update existing vote
        const { errors: updateErrors } = await client.models.Vote.update({
          id: voteId,
          score: s.score,
        });
        if (updateErrors?.length) throw new Error(updateErrors[0].message);
      } else {
        // Create new vote
        const { errors: createErrors } = await client.models.Vote.create({
          id: voteId,
          eventId: state.eventId,
          candidateId: s.candidateId,
          voterId: state.identityId,
          score: s.score,
        });
        if (createErrors?.length) throw new Error(createErrors[0].message);
      }

      // Update candidate's totalScore
      const { data: candidate } = await client.models.Candidate.get({ id: s.candidateId });
      if (candidate) {
        const newTotalScore = (candidate.totalScore ?? 0) + delta;
        await client.models.Candidate.update({
          id: s.candidateId,
          totalScore: newTotalScore,
        });
      }
    }

    setText('score-result', '保存しました');
    await refreshResults();
  } catch (e) {
    setText('score-result', `失敗: ${e.message}`);
  }
});

$('btn-refresh-results').addEventListener('click', async () => {
  try {
    await refreshResults();
  } catch (e) {
    $('results').textContent = `失敗: ${e.message}`;
  }
});

(async function boot() {
  try {
    await ensureAmplifyConfigured();
    await ensureIdentity();

    await loadEventAndCandidates();
    showSections();

    if (state.eventId) {
      await refreshResults();
    }
  } catch (e) {
    // initial config errors are shown when user interacts
    console.warn(e);
  }
})();
