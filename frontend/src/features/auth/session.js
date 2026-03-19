// src/utils/session.js

const SESSION_KEY = 'dv_user'

/**
 * Read user info synchronously from sessionStorage.
 * @returns {Object|null} The user object or null if not found.
 */
export function getStoredUser() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

/**
 * Store user info synchronously to persist session state on page reloads.
 * @param {string} username - The user's username.
 * @param {string} role - The user's assigned role.
 */
export function storeUser(username, role) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username, role }))
}

/**
 * Clears user info from sessionStorage on logout.
 */
export function clearStoredUser() {
    sessionStorage.removeItem(SESSION_KEY)
}

const TOKEN_KEY = 'dv_token'

/**
 * Retrieves the JWT access token.
 * @returns {string|null} The stored token.
 */
export function getToken() {
    return localStorage.getItem(TOKEN_KEY)
}

/**
 * Stores the JWT access token in localStorage.
 * @param {string} token - The raw JWT token string.
 */
export function storeToken(token) {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token)
    }
}

/**
 * Clears the JWT access token.
 */
export function clearToken() {
    localStorage.removeItem(TOKEN_KEY)
}

/**
 * Get display name (first letter capitalized).
 * e.g., "paul" → "Paul"
 * @param {Object} user - The user object containing the username.
 * @returns {string|null} Capitalized username.
 */
export function getDisplayName(user) {
    if (!user?.username) return null
    const n = user.username
    return n.charAt(0).toUpperCase() + n.slice(1)
}

/**
 * Custom fetch wrapper that automatically attaches the stored JWT token
 * to the Authorization header, facilitating authenticated backend calls.
 * 
 * @param {string|URL} url - Target URL.
 * @param {Object} [options={}] - Standard Fetch options.
 * @returns {Promise<Response>} Resolution of the fetch response.
 */
export async function customFetch(url, options = {}) {
    const token = getToken()
    const headers = { ...options.headers }
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }
    // We keep credentials: 'include' as a fallback pattern
    return fetch(url, { credentials: 'include', ...options, headers })
}

/**
 * Custom XHR wrapper for file uploads to track exact progress and distinct phases (Sending vs Processing).
 * It intercepts the network upload events that `fetch` cannot see.
 * 
 * @param {string} url - Target URL.
 * @param {FormData} formData - The payload containing the file.
 * @param {Object} callbacks - Contains onUploadProgress(pct), onUploadComplete(), and signal.
 */
export function customXHRUpload(url, formData, { onUploadProgress, onUploadComplete, signal }) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.withCredentials = true;

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onUploadProgress) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                onUploadProgress(percentComplete);
            }
        };

        xhr.upload.onload = () => {
            // Fired precisely when the last byte is sent over the network
            if (onUploadComplete) onUploadComplete();
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const responseJson = JSON.parse(xhr.responseText);
                    resolve({ ok: true, status: xhr.status, json: async () => responseJson });
                } catch (e) {
                    reject(new Error("Format de réponse invalide"));
                }
            } else {
                try {
                    const responseJson = JSON.parse(xhr.responseText);
                    resolve({ ok: false, status: xhr.status, json: async () => responseJson });
                } catch {
                    reject(new Error(`Erreur HTTP: ${xhr.status}`));
                }
            }
        };

        xhr.onerror = () => reject(new Error("Erreur réseau pendant l'upload"));
        xhr.onabort = () => {
            const err = new Error("AbortError");
            err.name = "AbortError";
            reject(err);
        };

        if (signal) {
            signal.addEventListener('abort', () => xhr.abort());
        }

        xhr.open('POST', url, true);
        const token = getToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
    });
}
