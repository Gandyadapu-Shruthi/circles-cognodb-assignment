// public/js/app.js — hash router + page controllers.
const { avatar, chips, overlapSvg, skeletons, emptyState, errorState, escapeHtml } = Render;

const main = document.getElementById('main');
const navLinks = document.querySelectorAll('.nav a');
const dbStatusEl = document.getElementById('dbStatus');
const viewerNameEl = document.getElementById('viewerName');

let allUsersCache = null; // lazily loaded, used by the path finder selects

function getViewerId() { return localStorage.getItem('circles_viewer_id'); }
function setViewerId(id) { localStorage.setItem('circles_viewer_id', id); }

// ---------------------------------------------------------------- health --
async function refreshHealth() {
  const status = await Api.health();
  dbStatusEl.classList.toggle('down', !status.ok);
  dbStatusEl.innerHTML = `<span class="dot"></span> ${status.ok ? 'CognoDB connected' : 'Database unreachable'}`;
}
refreshHealth();
setInterval(refreshHealth, 20000);

// ------------------------------------------------------------ viewer bar --
async function refreshViewerBar() {
  const id = getViewerId();
  if (!id) { viewerNameEl.textContent = 'Nobody selected'; return; }
  try {
    const user = await Api.getUser(id);
    viewerNameEl.textContent = user.name;
  } catch {
    viewerNameEl.textContent = 'Nobody selected';
  }
}
document.getElementById('changeViewer').addEventListener('click', () => {
  location.hash = '#/explore?pick=1';
});

// -------------------------------------------------------------- routing --
function parseHash() {
  const raw = location.hash.replace(/^#\//, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(queryPart || '');
  return { segments, params };
}

async function router() {
  const { segments, params } = parseHash();
  const route = segments[0] || 'explore';

  navLinks.forEach((a) => a.classList.toggle('active', a.dataset.route === route));
  await refreshViewerBar();

  try {
    if (route === 'explore') return renderExplore(params);
    if (route === 'recommendations') return renderRecommendations();
    if (route === 'path') return renderPath(params);
    if (route === 'groups' && segments[1]) return renderGroupDetail(segments[1]);
    if (route === 'groups') return renderGroups(params);
    if (route === 'events') return renderEvents();
    if (route === 'users' && segments[1]) return renderProfile(segments[1]);
    return renderExplore(params);
  } catch (err) {
    main.innerHTML = errorState(err.message || 'Unexpected error.');
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

// -------------------------------------------------------------- explore --
async function renderExplore(params) {
  const picking = params.get('pick') === '1';
  const search = params.get('q') || '';

  main.innerHTML = `
    <div class="page-header">
      <h1>${picking ? 'Choose who you are' : 'Explore people'}</h1>
      <p>${picking
        ? 'Pick a profile to view the app as that person — recommendations and the path finder use this.'
        : 'Search the community by name. Every card links to a full profile.'}</p>
    </div>
    <div class="search-row">
      <input type="text" id="searchInput" placeholder="Search by name…" value="${escapeHtml(search)}" />
    </div>
    <div class="grid" id="results">${skeletons(6)}</div>
  `;

  const input = document.getElementById('searchInput');
  input.focus();
  input.addEventListener('input', debounce(() => {
    const q = input.value;
    history.replaceState(null, '', `#/explore?${picking ? 'pick=1&' : ''}q=${encodeURIComponent(q)}`);
    loadResults(q);
  }, 250));

  loadResults(search);

  async function loadResults(q) {
    const results = document.getElementById('results');
    try {
      const users = await Api.searchUsers(q, 30);
      if (!users.length) {
        results.innerHTML = emptyState('No one found', 'Try a different name or clear the search.');
        return;
      }
      results.innerHTML = users.map((u) => userCard(u, picking)).join('');
      if (picking) {
        results.querySelectorAll('[data-pick-id]').forEach((el) => {
          el.addEventListener('click', () => {
            setViewerId(el.dataset.pickId);
            location.hash = '#/recommendations';
          });
        });
      }
    } catch (err) {
      results.innerHTML = errorState(err.message);
    }
  }
}

function userCard(u, picking) {
  const inner = `
    <div class="person-row">
      ${avatar(u, 46)}
      <div>
        <div class="person-name">${escapeHtml(u.name)}</div>
        <div class="person-sub">${escapeHtml(u.city || 'Unknown city')}${u.age ? ' · ' + u.age : ''}</div>
      </div>
    </div>
    <div style="margin-top:10px">${chips(u.topInterests || [])}</div>
  `;
  return picking
    ? `<div class="card" data-pick-id="${u.id}" style="cursor:pointer">${inner}</div>`
    : `<a class="card" href="#/users/${u.id}">${inner}</a>`;
}

// ---------------------------------------------------------- recommendations --
async function renderRecommendations() {
  const viewerId = getViewerId();
  if (!viewerId) {
    main.innerHTML = `
      <div class="page-header"><h1>For you</h1><p>Recommendations are personalised — pick who you're viewing as first.</p></div>
      ${emptyState('No viewer selected', 'Choose a profile from Explore to see people, groups and events picked for them.')}
      <p style="margin-top:16px"><a class="btn" href="#/explore?pick=1">Choose a viewer</a></p>
    `;
    return;
  }

  main.innerHTML = `
    <div class="page-header"><h1>For you</h1><p>Built from two-hop friend traversals and shared-interest overlap — not a static list.</p></div>
    <div class="section-title">People you may know</div>
    <div class="grid" id="peopleRecs">${skeletons(3)}</div>
    <div class="section-title">Groups your friends are in</div>
    <div class="grid" id="groupRecs">${skeletons(3)}</div>
    <div class="section-title">Events worth checking out</div>
    <div class="grid" id="eventRecs">${skeletons(3)}</div>
  `;

  Api.getPeopleRecs(viewerId).then((people) => {
    const el = document.getElementById('peopleRecs');
    if (!people.length) return (el.innerHTML = emptyState('No suggestions yet', 'This person has no friends-of-friends left to suggest.'));
    el.innerHTML = people.map((p) => `
      <div class="card">
        <a href="#/users/${p.id}" style="display:block">
          <div class="person-row">
            ${avatar(p, 46)}
            <div>
              <div class="person-name">${escapeHtml(p.name)}</div>
              <div class="person-sub">${escapeHtml(p.city || '')}</div>
            </div>
          </div>
        </a>
        <div class="overlap-wrap">
          ${overlapSvg(p.mutualFriends + p.sharedInterests)}
          <div class="overlap-caption">${p.mutualFriends} mutual friend${p.mutualFriends === 1 ? '' : 's'}, ${p.sharedInterests} shared interest${p.sharedInterests === 1 ? '' : 's'}</div>
        </div>
        <div style="margin-top:10px">${chips(p.topInterests || [])}</div>
        <button class="btn secondary" style="margin-top:12px;width:100%" data-add-friend="${p.id}">Add friend</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-add-friend]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.textContent = 'Adding…';
        btn.disabled = true;
        try {
          await Api.addFriend(viewerId, btn.dataset.addFriend);
          btn.textContent = 'Friends ✓';
        } catch (err) {
          btn.textContent = 'Failed — retry';
          btn.disabled = false;
        }
      });
    });
  }).catch((err) => { document.getElementById('peopleRecs').innerHTML = errorState(err.message); });

  Api.getGroupRecs(viewerId).then((groups) => {
    const el = document.getElementById('groupRecs');
    if (!groups.length) return (el.innerHTML = emptyState('No group suggestions', 'None of this person\'s friends belong to a group they haven\'t joined.'));
    el.innerHTML = groups.map((g) => `
      <a class="card" href="#/groups/${g.id}">
        <div class="person-name">${escapeHtml(g.name)}</div>
        <div class="person-sub" style="margin-top:4px">${escapeHtml(g.description || '')}</div>
        <div class="stat-row">
          <span><span class="label">friends in group</span>${g.friendsInGroup}</span>
          <span><span class="label">shared focus</span>${g.sharedInterestCount}</span>
        </div>
      </a>
    `).join('');
  }).catch((err) => { document.getElementById('groupRecs').innerHTML = errorState(err.message); });

  Api.getEventRecs(viewerId).then((events) => {
    const el = document.getElementById('eventRecs');
    if (!events.length) return (el.innerHTML = emptyState('No event suggestions', 'Add a few interests to this person to get event picks.'));
    el.innerHTML = events.map((e) => `
      <div class="card">
        <div class="person-name">${escapeHtml(e.name)}</div>
        <div class="person-sub" style="margin-top:4px">${escapeHtml(e.date)} · ${escapeHtml(e.location)} · hosted by ${escapeHtml(e.groupName || 'a group')}</div>
        <div class="stat-row">
          <span><span class="label">friends going</span>${e.friendsGoing}</span>
          <span><span class="label">interest match</span>${e.interestMatch}</span>
        </div>
      </div>
    `).join('');
  }).catch((err) => { document.getElementById('eventRecs').innerHTML = errorState(err.message); });
}

// ------------------------------------------------------------- path finder --
async function renderPath(params) {
  if (!allUsersCache) {
    try { allUsersCache = await Api.searchUsers('', 500); } catch { allUsersCache = []; }
  }
  const options = allUsersCache.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  const fromDefault = params.get('from') || getViewerId() || (allUsersCache[0] && allUsersCache[0].id) || '';
  const toDefault = params.get('to') || '';

  main.innerHTML = `
    <div class="page-header">
      <h1>Path finder</h1>
      <p>Shortest chain of friendships connecting two people — a variable-length graph traversal with no clean SQL equivalent.</p>
    </div>
    <div class="path-form">
      <div class="field"><label for="fromSelect">From</label>
        <select id="fromSelect">${options}</select></div>
      <div class="field"><label for="toSelect">To</label>
        <select id="toSelect">${options}</select></div>
      <button class="btn" id="findPathBtn">Find path</button>
    </div>
    <div id="pathResult"></div>
  `;
  document.getElementById('fromSelect').value = fromDefault;
  document.getElementById('toSelect').value = toDefault || (allUsersCache[1] && allUsersCache[1].id) || '';

  document.getElementById('findPathBtn').addEventListener('click', runSearch);
  if (fromDefault && toDefault) runSearch();

  async function runSearch() {
    const from = document.getElementById('fromSelect').value;
    const to = document.getElementById('toSelect').value;
    const resultEl = document.getElementById('pathResult');
    resultEl.innerHTML = skeletons(1);
    try {
      const result = await Api.getPath(from, to);
      if (!result.found) {
        resultEl.innerHTML = emptyState('No connection found', 'These two people aren\'t linked within 6 degrees of friendship.');
        return;
      }
      resultEl.innerHTML = `
        <div style="text-align:center;margin-bottom:6px">
          <div class="hop-count">${result.hops}</div>
          <div class="hop-label">degree${result.hops === 1 ? '' : 's'} of separation</div>
        </div>
        <div class="path-chain">
          ${result.path.map((p, i) => `
            ${i > 0 ? '<div class="path-link"></div>' : ''}
            <div class="path-node">${avatar(p, 52)}<div class="name">${escapeHtml(p.name)}</div></div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      resultEl.innerHTML = errorState(err.message);
    }
  }
}

// ---------------------------------------------------------------- groups --
async function renderGroups(params) {
  const search = params.get('q') || '';
  main.innerHTML = `
    <div class="page-header"><h1>Groups</h1><p>Communities formed around shared interests.</p></div>
    <div class="search-row"><input type="text" id="groupSearch" placeholder="Search groups…" value="${escapeHtml(search)}" /></div>
    <div class="grid" id="groupResults">${skeletons(6)}</div>
  `;
  const input = document.getElementById('groupSearch');
  input.addEventListener('input', debounce(() => load(input.value), 250));
  load(search);

  async function load(q) {
    const el = document.getElementById('groupResults');
    try {
      const groups = await Api.listGroups(q);
      if (!groups.length) return (el.innerHTML = emptyState('No groups found', 'Try a different search term.'));
      el.innerHTML = groups.map((g) => `
        <a class="card" href="#/groups/${g.id}">
          <div class="person-name">${escapeHtml(g.name)}</div>
          <div class="person-sub" style="margin-top:4px">${escapeHtml(g.description || '')}</div>
          <div class="stat-row"><span><span class="label">members</span>${g.memberCount}</span></div>
          <div style="margin-top:10px">${chips(g.focusInterests || [])}</div>
        </a>
      `).join('');
    } catch (err) {
      el.innerHTML = errorState(err.message);
    }
  }
}

async function renderGroupDetail(id) {
  main.innerHTML = skeletons(3);
  try {
    const g = await Api.getGroup(id);
    main.innerHTML = `
      <div class="page-header">
        <h1>${escapeHtml(g.name)}</h1>
        <p>${escapeHtml(g.description || '')}</p>
        <div style="margin-top:10px">${chips(g.focusInterests || [])}</div>
      </div>
      <div class="section-title">Upcoming events</div>
      ${g.events.length ? g.events.map((e) => `
        <div class="card" style="margin-bottom:10px">
          <div class="person-name">${escapeHtml(e.name)}</div>
          <div class="person-sub">${escapeHtml(e.date)} · ${escapeHtml(e.location)}</div>
        </div>`).join('') : emptyState('No events scheduled', 'This group hasn\'t posted an event yet.')}
      <div class="section-title">Members (${g.members.length})</div>
      <div class="grid">${g.members.map((m) => `
        <a class="card" href="#/users/${m.id}">
          <div class="person-row">${avatar(m, 42)}<div class="person-name">${escapeHtml(m.name)}</div></div>
        </a>`).join('')}</div>
    `;
  } catch (err) {
    main.innerHTML = errorState(err.message);
  }
}

// ---------------------------------------------------------------- events --
async function renderEvents() {
  main.innerHTML = `
    <div class="page-header"><h1>Events</h1><p>Hosted by groups, tagged to the interests they serve.</p></div>
    <div class="grid" id="eventResults">${skeletons(6)}</div>
  `;
  try {
    const events = await Api.listEvents(60);
    const el = document.getElementById('eventResults');
    if (!events.length) return (el.innerHTML = emptyState('No events yet', 'Check back once groups start posting events.'));
    el.innerHTML = events.map((e) => `
      <a class="card" href="#/groups/${e.groupId}">
        <div class="person-name">${escapeHtml(e.name)}</div>
        <div class="person-sub" style="margin-top:4px">${escapeHtml(e.date)} · ${escapeHtml(e.location)}</div>
        <div class="person-sub">hosted by ${escapeHtml(e.groupName || 'a group')}</div>
        <div class="stat-row"><span><span class="label">attendees</span>${e.attendeeCount}</span></div>
        <div style="margin-top:10px">${chips(e.relatedInterests || [])}</div>
      </a>
    `).join('');
  } catch (err) {
    document.getElementById('eventResults').innerHTML = errorState(err.message);
  }
}

// --------------------------------------------------------------- profile --
async function renderProfile(id) {
  main.innerHTML = skeletons(3);
  try {
    const [user, friends] = await Promise.all([Api.getUser(id), Api.getFriends(id)]);
    const viewerId = getViewerId();
    const isViewer = viewerId === id;
    main.innerHTML = `
      <div class="profile-header">
        ${avatar(user, 64)}
        <div>
          <h1>${escapeHtml(user.name)}</h1>
          <div class="person-sub">${escapeHtml(user.city || '')}${user.age ? ' · ' + user.age : ''} · ${user.friendCount} friend${user.friendCount === 1 ? '' : 's'}</div>
        </div>
      </div>
      <p>${escapeHtml(user.bio || '')}</p>
      <div style="display:flex;gap:10px;margin:16px 0">
        ${isViewer ? '<span class="chip">This is you</span>' : `<button class="btn secondary" id="viewAsBtn">View as ${escapeHtml(user.name.split(' ')[0])}</button>`}
        ${!isViewer && viewerId ? `<button class="btn" id="addFriendBtn">Add friend</button>` : ''}
        ${!isViewer ? `<a class="btn secondary" href="#/path?from=${encodeURIComponent(viewerId || '')}&to=${encodeURIComponent(id)}">Find path</a>` : ''}
      </div>
      <div class="section-title">Interests</div>
      <div>${user.interests.length ? chips(user.interests.map((i) => i.name)) : '<span class="person-sub">No interests listed.</span>'}</div>
      <div class="section-title">Groups</div>
      <div>${user.groups.length ? user.groups.map((g) => `<a class="chip" href="#/groups/${g.id}">${escapeHtml(g.name)}</a>`).join('') : '<span class="person-sub">Not in any groups yet.</span>'}</div>
      <div class="section-title">Friends</div>
      <div class="grid">${friends.length ? friends.map((f) => `
        <a class="card" href="#/users/${f.id}"><div class="person-row">${avatar(f, 42)}<div><div class="person-name">${escapeHtml(f.name)}</div><div class="person-sub">${escapeHtml(f.city || '')}</div></div></div></a>
      `).join('') : emptyState('No friends yet', 'This person hasn\'t connected with anyone.')}</div>
    `;
    const viewAsBtn = document.getElementById('viewAsBtn');
    if (viewAsBtn) viewAsBtn.addEventListener('click', () => { setViewerId(id); location.hash = '#/recommendations'; });
    const addFriendBtn = document.getElementById('addFriendBtn');
    if (addFriendBtn) addFriendBtn.addEventListener('click', async () => {
      addFriendBtn.textContent = 'Adding…';
      addFriendBtn.disabled = true;
      try { await Api.addFriend(viewerId, id); addFriendBtn.textContent = 'Friends ✓'; }
      catch { addFriendBtn.textContent = 'Failed — retry'; addFriendBtn.disabled = false; }
    });
  } catch (err) {
    main.innerHTML = errorState(err.message);
  }
}

// --------------------------------------------------------------- utils --
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
