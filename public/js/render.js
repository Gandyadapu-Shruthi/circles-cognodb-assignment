// public/js/render.js — small render helpers shared across pages.
const Render = (() => {
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function initials(name = '') {
    return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  }

  function avatar(person, size = 42) {
    const color = person.avatarColor || '#8C7AE6';
    return `<div class="avatar" style="width:${size}px;height:${size}px;background:${color};font-size:${size * 0.34}px">${escapeHtml(initials(person.name))}</div>`;
  }

  function chips(items = []) {
    return items.map((i) => `<span class="chip">${escapeHtml(i)}</span>`).join('');
  }

  // The signature visual: two overlapping circles whose overlap width scales
  // with a "closeness" score (mutual friends + shared interests). This is
  // literally what the app is named after — visualizing how two people's
  // circles intersect.
  function overlapSvg(score, maxScore = 8) {
    const w = 92, h = 44, r = 22;
    const clamped = Math.max(0, Math.min(1, score / maxScore));
    const overlap = 6 + clamped * 30; // px of overlap between the two circles
    const cx1 = w / 2 - r + overlap / 2;
    const cx2 = w / 2 + r - overlap / 2;
    return `<svg class="overlap-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <circle cx="${cx1}" cy="${h / 2}" r="${r * 0.8}" fill="var(--gold)" fill-opacity="0.55"/>
      <circle cx="${cx2}" cy="${h / 2}" r="${r * 0.8}" fill="var(--violet)" fill-opacity="0.55" style="mix-blend-mode:screen"/>
    </svg>`;
  }

  function skeletons(n = 4) {
    return Array.from({ length: n }).map(() => '<div class="skeleton"></div>').join('');
  }

  function emptyState(title, body) {
    return `<div class="state-block"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`;
  }

  function errorState(message) {
    return `<div class="state-block error"><h3>Something went wrong</h3><p>${escapeHtml(message)}</p></div>`;
  }

  return { escapeHtml, initials, avatar, chips, overlapSvg, skeletons, emptyState, errorState };
})();
