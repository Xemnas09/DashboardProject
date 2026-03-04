import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const RealtimeContext = createContext(null)

export function RealtimeProvider({ children }) {
    const [onlineUsers, setOnlineUsers] = useState([])
    const [notifications, setNotifications] = useState([])

    const addNotification = useCallback((notif) => {
        setNotifications(prev =>
            [{ id: Date.now(), ...notif }, ...prev].slice(0, 30)
        )
    }, [])

    const value = useMemo(() => ({
        onlineUsers,
        setOnlineUsers,
        notifications,
        addNotification,
    }), [onlineUsers, notifications, addNotification])

    return (
        <RealtimeContext.Provider value={value}>
            {children}
        </RealtimeContext.Provider>
    )
}

export const useRealtime = () => {
    const ctx = useContext(RealtimeContext)
    if (!ctx) throw new Error('useRealtime must be inside RealtimeProvider')
    return ctx
}
