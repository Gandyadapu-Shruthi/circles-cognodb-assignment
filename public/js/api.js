// public/js/api.js — thin fetch wrapper around the Express API.
const Api = (() => {
  async function request(path, options = {}) {
    let res;
    try {
      res = await fetch(path, options);
    } catch (err) {
      throw new ApiError('The server could not be reached. Is it running?', 0);
    }
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body.error) message = body.error;
      } catch (_) { /* ignore parse failure */ }
      throw new ApiError(message, res.status);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  return {
    health: () => request('/api/health').catch((e) => ({ ok: false, message: e.message })),
    searchUsers: (search = '', limit = 30) =>
      request(`/api/users?search=${encodeURIComponent(search)}&limit=${limit}`),
    getUser: (id) => request(`/api/users/${encodeURIComponent(id)}`),
    getFriends: (id) => request(`/api/users/${encodeURIComponent(id)}/friends`),
    getPeopleRecs: (id) => request(`/api/users/${encodeURIComponent(id)}/recommendations/people`),
    getGroupRecs: (id) => request(`/api/users/${encodeURIComponent(id)}/recommendations/groups`),
    getEventRecs: (id) => request(`/api/users/${encodeURIComponent(id)}/recommendations/events`),
    addFriend: (fromId, toId) =>
      request(`/api/users/${encodeURIComponent(fromId)}/friend/${encodeURIComponent(toId)}`, { method: 'POST' }),
    listGroups: (search = '') => request(`/api/groups?search=${encodeURIComponent(search)}`),
    getGroup: (id) => request(`/api/groups/${encodeURIComponent(id)}`),
    listEvents: (limit = 50) => request(`/api/events?limit=${limit}`),
    getPath: (from, to) =>
      request(`/api/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    ApiError,
  };
})();
