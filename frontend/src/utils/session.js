// src/utils/session.js

const SESSION_KEY = 'dv_user'

/**
 * Read user info synchronously from sessionStorage.
 * Returns null if not found or invalid.
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
 * Store user info synchronously.
 */
export function storeUser(username, role) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username, role }))
}

/**
 * Clear user info on logout.
 */
export function clearStoredUser() {
    sessionStorage.removeItem(SESSION_KEY)
}

/**
 * Get display name (first letter capitalized).
 * "paul" → "Paul"
 */
export function getDisplayName(user) {
    if (!user?.username) return null
    const n = user.username
    return n.charAt(0).toUpperCase() + n.slice(1)
}
