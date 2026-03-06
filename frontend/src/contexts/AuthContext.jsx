import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { getStoredUser, storeUser, clearStoredUser, clearToken } from '../utils/session'

const AuthContext = createContext(null)

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

export const useAuth = () => {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be inside AuthProvider')
    return ctx
}
