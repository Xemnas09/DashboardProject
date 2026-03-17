import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'

const RealtimeContext = createContext(null)

export function RealtimeProvider({ children }) {
    const [onlineUsers, setOnlineUsers] = useState([])
    const [notifications, setNotifications] = useState([])
    const [notifHistory, setNotifHistory] = useState([])
    const lastNotifRef = useRef({ hash: '', time: 0 })

    const removeNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id))
    }, [])

    const addNotification = useCallback((messageOrObj, category = 'info') => {
        const id = Date.now()
        let newNotif;

        if (typeof messageOrObj === 'string') {
            newNotif = {
                id,
                message: messageOrObj,
                category,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        } else {
            newNotif = {
                id,
                ...messageOrObj,
                category: messageOrObj.category || 'info',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        }

        // Deduplicate rapid identical messages (React StrictMode protection)
        const hash = `${newNotif.message}:${newNotif.title || ''}`;
        if (lastNotifRef.current.hash === hash && id - lastNotifRef.current.time < 800) {
            return;
        }
        lastNotifRef.current = { hash, time: id };

        setNotifications(prev => [newNotif, ...prev].slice(0, 30))
        setNotifHistory(prev => [newNotif, ...prev])

        // Auto remove after 5 seconds for toast display match
        setTimeout(() => {
            removeNotification(id)
        }, 5000)
    }, [removeNotification])

    const value = useMemo(() => ({
        onlineUsers,
        setOnlineUsers,
        notifications,
        notifHistory,
        setNotifHistory,
        addNotification,
        removeNotification,
    }), [onlineUsers, notifications, notifHistory, addNotification, removeNotification])

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
