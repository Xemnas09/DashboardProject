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
