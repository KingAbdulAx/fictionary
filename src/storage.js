// Every game on games.azedlabs.com shares one origin, so every key here is prefixed `fictionary.`.
const PREFIX = 'fictionary.';
const SESSION_KEY = `${PREFIX}session`; // sessionStorage: this tab's online seat, for reloads
const NAME_KEY = `${PREFIX}name`; // localStorage: the last name used, as a convenience

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && typeof s.code === 'string' && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage unavailable (private mode); play still works, just without resume
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // nothing to clear
  }
}

export function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // not worth mentioning
  }
}
