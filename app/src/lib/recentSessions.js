const STORAGE_KEY = 'bearings_recent_sessions';
const MAX_RECENT = 20;

export function getRecentSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentSession({ id, name }) {
  try {
    const sessions = getRecentSessions().filter((s) => s.id !== id);
    sessions.unshift({ id, name, lastVisited: Date.now() });
    if (sessions.length > MAX_RECENT) sessions.length = MAX_RECENT;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage may be unavailable
  }
}

export function removeRecentSession(id) {
  try {
    const sessions = getRecentSessions().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage may be unavailable
  }
}
