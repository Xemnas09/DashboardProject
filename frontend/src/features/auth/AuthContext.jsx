import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { getStoredUser, storeUser, clearStoredUser, clearToken } from './session'

const AuthContext = createContext(null)

/**
 * Authentication context provider managing the current user's state.
 * Syncs with sessionStorage to prevent UI flashing on reload.
 *
 * @param {Object} props - Component props.
 * @param {React.ReactNode} props.children - Child elements.
 */
export function AuthProvider({ children }) {
    // ✅ Synchronous read from sessionStorage — zero flash, no isLoading
    const [currentUser, setCurrentUser] = useState(() => getStoredUser())

    const updateUser = useCallback((userData) => {
        setCurrentUser(userData)
        if (userData) {
            storeUser(userData.username, userData.role)
        } else {
            clearStoredUser()
            clearToken()
        }
    }, [])

    const value = useMemo(() => ({
        currentUser,
        updateUser,
    }), [currentUser, updateUser])

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to access the current authentication state and updater methods.
 * @returns {{ currentUser: Object|null, updateUser: Function }}
 * @throws {Error} If used outside of an AuthProvider.
 */
export const useAuth = () => {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be inside AuthProvider')
    return ctx
}
