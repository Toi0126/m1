import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';

const UPsertVoteMutation = /* GraphQL */ `
  mutation UpsertVote($eventId: ID!, $candidateId: ID!, $score: Int!) {
    upsertVote(eventId: $eventId, candidateId: $candidateId, score: $score) {
      id
      eventId
      name
      totalScore
      createdAt
      updatedAt
    }
  }
`;

const OnCandidateUpdatedSubscription = /* GraphQL */ `
  subscription OnCandidateUpdated($eventId: ID!) {
    onCandidateUpdated(eventId: $eventId) {
      id
      eventId
      name
      totalScore
      createdAt
      updatedAt
    }
  }
`;

const $ = (id) => document.getElementById(id);

function getEventIdFromUrl() {
  const sp = new URLSearchParams(window.location.search);
  const raw = (sp.get('eventId') || sp.get('event_id') || '').trim();
  return raw;
}

function getParticipantNameFromUrlHash() {
  const raw = String(window.location.hash || '').replace(/^#/, '').trim();
  if (!raw) return '';

  const sp = new URLSearchParams(raw);
  return (sp.get('name') || '').trim();
}

function buildParticipantLink(eventId, participantName) {
  // Best practice: avoid putting personal data in query params (server logs / analytics).
  // Keep eventId in query for routing, and keep participant name in hash.
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('eventId', String(eventId ?? '').trim());

  const name = normalizeDisplayName(participantName);
  if (name) {
    const sp = new URLSearchParams();
    sp.set('name', name);
    url.hash = sp.toString();
  }

  return url.toString();
}

function renderParticipantLink(containerId, eventId, participantName) {
  const root = $(containerId);
  if (!root) return;

  const url = buildParticipantLink(eventId, participantName);
  root.innerHTML = '';

  const line1 = document.createElement('div');
  line1.textContent = 'このリンクをブックマーク/共有すると、次回は名前入力なしで採点できます。';
  root.appendChild(line1);

  const a = document.createElement('a');
  a.href = url;
  a.textContent = url;
  root.appendChild(a);
}

const urlEventId = getEventIdFromUrl();
const isParticipantLinkMode = Boolean(urlEventId);

const state = {
  eventId: urlEventId || localStorage.getItem('eventId') || '',
  participantName: localStorage.getItem('participantName') || '',
  identityId: localStorage.getItem('identityId') || '',
  event: null,
  candidates: [],
  subs: [],
  joined: false,
};

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function firstErrorMessage(errors) {
  const first = errors?.[0];
  if (!first) return '不明なエラーが発生しました';

  const msg = typeof first.message === 'string' ? first.message.trim() : '';
  if (msg) return msg;

  const type = typeof first.errorType === 'string' ? first.errorType.trim() : '';
  if (type) return type;

  try {
    return JSON.stringify(first);
  } catch {
    return '不明なエラーが発生しました';
  }
}

function toErrorMessage(e) {
  if (!e) return '不明なエラーが発生しました';
  if (e instanceof Error) return e.message || '不明なエラーが発生しました';
  if (typeof e === 'string') return e || '不明なエラーが発生しました';
  if (typeof e === 'object' && typeof e.message === 'string' && e.message.trim()) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return '不明なエラーが発生しました';
  }
}

function setParticipantModeUI() {
  const createSection = $('create-section');
  const joinSection = $('join-section');

  if (createSection) createSection.hidden = isParticipantLinkMode;
  if (joinSection) joinSection.hidden = isParticipantLinkMode;
}

function setScoreUiEnabled(enabled) {
  const joinBlock = $('participant-join-block');
  const scoreForm = $('score-form');
  const saveBtn = $('btn-save-scores');

  if (isParticipantLinkMode) {
    // In participant link mode, the user should be able to score immediately.
    // Participant registration (display name) is optional and must not block scoring.
    if (joinBlock) joinBlock.hidden = true;
    if (scoreForm) scoreForm.hidden = false;
    if (saveBtn) saveBtn.hidden = false;
  } else {
    if (joinBlock) joinBlock.hidden = true;
    if (scoreForm) scoreForm.hidden = false;
    if (saveBtn) saveBtn.hidden = false;
  }
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

function normalizeDisplayName(name) {
  return String(name ?? '').trim();
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

  // Ensure the generated client picks up the configured backend and uses
  // the correct default authorization provider for this app (guest IAM).
  if (!client) {
    client = generateClient({ authMode: 'iam' });
  }
}

async function ensureIdentity() {
  const session = await fetchAuthSession();
  if (!session.identityId) throw new Error('identityId not available (guest access disabled?)');
  state.identityId = session.identityId;
  localStorage.setItem('identityId', state.identityId);
}

let client;

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
  const normalizedEventId = String(eventId ?? '').trim();
  const normalizedName = normalizeDisplayName(displayName);

  if (!normalizedEventId) throw new Error('イベントIDを入力してください');
  if (!normalizedName) throw new Error('名前を入力してください');

  // Idempotent join by (eventId, voterId): if the participant already exists for this voter,
  // return it (or update displayName) instead of creating a new record.
  {
    const { data: existingMine, errors: mineErrors } = await client.models.Participant.listParticipantsByEventAndVoter({
      eventId: normalizedEventId,
      voterId: { eq: state.identityId },
    });
    if (mineErrors?.length) throw new Error(firstErrorMessage(mineErrors));

    const mine = (existingMine ?? [])[0];
    if (mine) {
      const mineName = normalizeDisplayName(mine.displayName);
      if (mineName === normalizedName) {
        return mine;
      }

      // If changing name, still enforce unique name within event.
      let nextToken = undefined;
      do {
        const { data: participants, errors: partErrors, nextToken: nt } = await client.models.Participant.listParticipantsByEvent({
          eventId: normalizedEventId,
          nextToken,
        });
        if (partErrors?.length) throw new Error(firstErrorMessage(partErrors));

        const existsSameNameOtherVoter = (participants ?? []).some(
          (p) => normalizeDisplayName(p.displayName) === normalizedName && p.voterId !== state.identityId,
        );
        if (existsSameNameOtherVoter) {
          throw new Error('同じ名前の参加者が既にいるため参加できません。別の名前にしてください');
        }

        nextToken = nt;
      } while (nextToken);

      const { data: updated, errors: updateErrors } = await client.models.Participant.update({
        id: mine.id,
        eventId: mine.eventId,
        voterId: mine.voterId,
        displayName: normalizedName,
      });
      if (updateErrors?.length) throw new Error(firstErrorMessage(updateErrors));
      return updated ?? mine;
    }
  }

  // 同一イベント内の同名参加者をブロック（ただし自分自身の再joinは許可）
  {
    let nextToken = undefined;
    do {
      const { data: participants, errors: partErrors, nextToken: nt } = await client.models.Participant.listParticipantsByEvent({
        eventId: normalizedEventId,
        nextToken,
      });
      if (partErrors?.length) throw new Error(partErrors[0].message);

      const existsSameNameOtherVoter = (participants ?? []).some(
        (p) => normalizeDisplayName(p.displayName) === normalizedName && p.voterId !== state.identityId,
      );
      if (existsSameNameOtherVoter) {
        throw new Error('同じ名前の参加者が既にいるため参加できません。別の名前にしてください');
      }

      nextToken = nt;
    } while (nextToken);
  }

  const { data, errors } = await client.models.Participant.create({
    eventId: normalizedEventId,
    voterId: state.identityId,
    displayName: normalizedName,
  });

  if (errors?.length) throw new Error(firstErrorMessage(errors));
  return data;
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

  const joinEventId = $('join-event-id');
  const joinName = $('join-name');
  if (joinEventId) joinEventId.value = state.eventId || '';
  if (joinName) joinName.value = state.participantName || joinName.value;

  const participantName = $('participant-name');
  if (participantName) participantName.value = state.participantName || participantName.value;

  setScoreUiEnabled(!isParticipantLinkMode || state.joined);
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
    input.inputMode = 'numeric';
    input.placeholder = '0以上の整数';
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
    if (!candidateId) throw new Error('候補IDが取得できませんでした（再読み込みしてください）');
    const v = input.value === '' ? 0 : Number(input.value);
    if (!Number.isFinite(v) || v < 0) throw new Error('score must be a non-negative integer');
    scores.push({ candidateId, score: Math.trunc(v) });
  }
  return scores;
}

async function upsertVotesViaModels(scores) {
  if (!state.eventId) throw new Error('イベントIDがありません');
  if (!state.identityId) throw new Error('identityId がありません（ページを再読み込みしてください）');

  const { data: existingVotes, errors: existingVoteErrors } = await client.models.Vote.listVotesByEventAndVoter({
    eventId: state.eventId,
    voterId: { eq: state.identityId },
  });
  if (existingVoteErrors?.length) throw new Error(firstErrorMessage(existingVoteErrors));

  const existingByCandidateId = new Map();
  for (const v of existingVotes ?? []) {
    existingByCandidateId.set(String(v.candidateId), v);
  }

  for (const s of scores) {
    const existing = existingByCandidateId.get(String(s.candidateId));
    if (existing) {
      const { errors } = await client.models.Vote.update({
        id: existing.id,
        eventId: existing.eventId,
        candidateId: existing.candidateId,
        voterId: existing.voterId,
        score: s.score,
      });
      if (errors?.length) throw new Error(firstErrorMessage(errors));
    } else {
      const { errors } = await client.models.Vote.create({
        eventId: state.eventId,
        candidateId: s.candidateId,
        voterId: state.identityId,
        score: s.score,
      });
      if (errors?.length) throw new Error(firstErrorMessage(errors));
    }
  }

  // Recompute totalScore for each candidate from Vote table (MVP: eventual consistency / last-write-wins).
  const [{ data: votes, errors: voteErrors }, { data: candidates, errors: candErrors }] = await Promise.all([
    client.models.Vote.listVotesByEvent({ eventId: state.eventId }),
    client.models.Candidate.listCandidatesByEvent({ eventId: state.eventId }),
  ]);
  if (voteErrors?.length) throw new Error(firstErrorMessage(voteErrors));
  if (candErrors?.length) throw new Error(firstErrorMessage(candErrors));

  const totals = new Map();
  for (const v of votes ?? []) {
    const k = String(v.candidateId);
    totals.set(k, (totals.get(k) ?? 0) + Number(v.score ?? 0));
  }

  for (const c of candidates ?? []) {
    const nextTotal = totals.get(String(c.id)) ?? 0;
    const { errors } = await client.models.Candidate.update({
      id: c.id,
      eventId: c.eventId,
      name: c.name,
      totalScore: nextTotal,
    });
    if (errors?.length) throw new Error(firstErrorMessage(errors));
  }
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

  console.log('votes:', votes);
  console.log('participants:', participants);

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

  // Deduplicate participants by voterId to avoid rendering the same person twice
  // if multiple Participant records exist for the same voter.
  const byVoter = new Map();
  for (const p of participants ?? []) {
    const key = String(p.voterId ?? '');
    if (!key) continue;
    const prev = byVoter.get(key);
    if (!prev) {
      byVoter.set(key, p);
      continue;
    }
    const prevUpdated = prev.updatedAt ? Date.parse(prev.updatedAt) : NaN;
    const nextUpdated = p.updatedAt ? Date.parse(p.updatedAt) : NaN;
    if (Number.isFinite(nextUpdated) && (!Number.isFinite(prevUpdated) || nextUpdated >= prevUpdated)) {
      byVoter.set(key, p);
    }
  }

  const participantsSorted = [...byVoter.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
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

  // NOTE: Custom subscription is not included in model_introspection, so use graphql() directly.
  const observable = client.graphql({
    query: OnCandidateUpdatedSubscription,
    variables: { eventId: state.eventId },
    authMode: 'iam',
  });

  const sub = observable.subscribe({
    next: async ({ data }) => {
      if (!data) return;
      try {
        await refreshResults();
      } catch (e) {
        console.warn('failed to refresh results after subscription event', e);
      }
    },
    error: (err) => {
      console.warn('subscription error', err);
    },
  });

  state.subs.push(sub);
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

    renderParticipantLink('join-result', state.eventId, state.participantName);
    state.joined = true;
    await loadEventAndCandidates();
  } catch (e) {
    setText('join-result', `失敗: ${e.message}`);
  }
});

const joinInlineBtn = $('btn-join-inline');
if (joinInlineBtn) {
  joinInlineBtn.addEventListener('click', async () => {
    setText('participant-join-result', '');
    try {
      const name = requireNonBlank('名前', $('participant-name')?.value);
      if (!state.eventId) throw new Error('イベントIDがURLにありません');

      await joinEvent(state.eventId, name);

      state.participantName = name;
      state.joined = true;

      localStorage.setItem('eventId', state.eventId);
      localStorage.setItem('participantName', state.participantName);

      renderParticipantLink('participant-join-result', state.eventId, state.participantName);
      await loadEventAndCandidates();
      await refreshResults();
    } catch (e) {
      setText('participant-join-result', `失敗: ${e.message}`);
    }
  });
}

$('btn-save-scores').addEventListener('click', async () => {
  setText('score-result', '');
  try {
    if (!state.eventId) throw new Error('イベントIDがありません');
    const scores = readScoresFromForm();

    try {
      for (const s of scores) {
        const { errors } = await client.graphql({
          query: UPsertVoteMutation,
          variables: {
            eventId: state.eventId,
            candidateId: s.candidateId,
            score: s.score,
          },
          authMode: 'iam',
        });
        if (errors?.length) throw new Error(firstErrorMessage(errors));
      }
    } catch (e) {
      // If the custom mutation auth isn't deployed/updated yet, fall back to model operations.
      const msg = toErrorMessage(e);
      if (!msg.includes('Unauthorized')) throw e;
      await upsertVotesViaModels(scores);
    }

    setText('score-result', '保存しました');
    await refreshResults();
  } catch (e) {
    setText('score-result', `失敗: ${toErrorMessage(e)}`);
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
    setParticipantModeUI();

    if (urlEventId) {
      state.eventId = urlEventId;
      localStorage.setItem('eventId', state.eventId);
    }

    // Participant-specific link can carry name in hash.
    // If present, pre-fill and attempt auto-join so the user can start scoring immediately.
    const nameFromHash = getParticipantNameFromUrlHash();
    if (nameFromHash) {
      state.participantName = nameFromHash;
      localStorage.setItem('participantName', state.participantName);
    }

    await ensureAmplifyConfigured();
    await ensureIdentity();

    // Auto-join first so the initial render shows the scoring UI (not the join button).
    if (isParticipantLinkMode && state.eventId && state.participantName) {
      try {
        await joinEvent(state.eventId, state.participantName);
        state.joined = true;
      } catch (e) {
        // joinはユーザー操作でも実行できるため、ここでは落とさない
        console.warn('auto-join failed', e);
        state.joined = false;
      }
    }

    await loadEventAndCandidates();

    if (state.eventId) {
      await refreshResults();
    }
  } catch (e) {
    // initial config errors are shown when user interacts
    console.warn(e);
  }
})();
