import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useRealtime } from '../contexts/RealtimeContext'

const PING_INTERVAL_MS = 30_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

export function useWebSocketInit() {
    const { currentUser, updateUser } = useAuth()
    const { setOnlineUsers, addNotification } = useRealtime()
    const navigate = useNavigate()

    const wsRef = useRef(null)
    const reconnectAttempts = useRef(0)
    const pingTimerRef = useRef(null)
    const shouldReconnect = useRef(true)
    const reconnectTimeoutRef = useRef(null)

    const handleMessage = useCallback((raw) => {
        let parsed
        try { parsed = JSON.parse(raw) } catch { return }

        const { event, payload } = parsed

        switch (event) {

            case 'ONLINE_USERS_LIST':
                setOnlineUsers(payload?.users ?? [])
                break

            case 'USER_ONLINE':
                setOnlineUsers(prev => {
                    const exists = prev.find(u => u.username === payload.username)
                    if (exists) {
                        return prev.map(u =>
                            u.username === payload.username ? { ...u, ...payload } : u
                        )
                    }
                    return [...prev, payload]
                })
                break

            case 'USER_OFFLINE':
                setOnlineUsers(prev =>
                    prev.filter(u => u.username !== payload.username)
                )
                break

            case 'NOTIFICATION':
                addNotification({
                    message: payload.message,
                    title: payload.title,
                    category: payload.category ?? 'info',
                    from: payload.from,
                })
                break

            case 'SESSION_REVOKED':
            case 'USER_DELETED':
                shouldReconnect.current = false
                updateUser(null)
                navigate('/login', {
                    state: { reason: payload?.reason ?? 'Votre session a été révoquée.' }
                })
                break

            case 'PASSWORD_RESET':
                shouldReconnect.current = false
                updateUser(null)
                navigate('/login', {
                    state: { reason: 'Votre mot de passe a été réinitialisé.' }
                })
                break

            case 'ROLE_CHANGED':
                try {
                    const stored = sessionStorage.getItem('dv_user')
                    if (stored) {
                        const updated = { ...JSON.parse(stored), role: payload.new_role }
                        updateUser(updated)
                    }
                } catch { }
                break

            default:
                break
        }
    }, [setOnlineUsers, addNotification, updateUser, navigate])

    const connect = useCallback(async () => {
        if (!currentUser || !shouldReconnect.current) return

        try {
            const { customFetch } = await import('../utils/session')
            const res = await customFetch('/api/auth/ws-token')
            if (!res.ok) return
            const { token } = await res.json()

            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
            const url = `${protocol}://${window.location.host}/ws?token=${token}`

            // Avoid edge-case where the user navigates away before the fetch completes
            if (!shouldReconnect.current) return;

            const ws = new WebSocket(url)
            wsRef.current = ws

            ws.onopen = () => {
                console.log('[WS] Connected')
                reconnectAttempts.current = 0
                pingTimerRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ event: 'ping' }))
                    }
                }, PING_INTERVAL_MS)
            }

            ws.onmessage = (e) => handleMessage(e.data)

            ws.onclose = () => {
                console.log('[WS] Disconnected')
                clearInterval(pingTimerRef.current)
                setOnlineUsers([])

                if (!shouldReconnect.current) return

                const delay = Math.min(
                    RECONNECT_BASE_MS * 2 ** reconnectAttempts.current,
                    RECONNECT_MAX_MS
                )
                reconnectAttempts.current += 1
                console.log(`[WS] Reconnecting in ${delay}ms...`)

                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current)
                }
                reconnectTimeoutRef.current = setTimeout(connect, delay)
            }

            ws.onerror = () => ws.close()

        } catch (err) {
            console.error('[WS] Connection failed:', err)
        }
    }, [currentUser, handleMessage, setOnlineUsers])

    // ── Logout watcher ────────────────────────────────────────────────────────
    // When the user logs out (currentUser → null), immediately close the
    // WebSocket BEFORE React's normal effect cleanup fires (which only runs on
    // component unmount / navigate away). Without this, the backend may not
    // register the disconnect in time → admin's "OnlineUsers" doesn't refresh.
    useEffect(() => {
        if (!currentUser) {
            // Stop any pending reconnect timer immediately
            shouldReconnect.current = false
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current)
            }
            // Close the WebSocket now — this triggers WebSocketDisconnect on
            // the server which broadcasts USER_OFFLINE to other users.
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close()
            }
        }
    }, [currentUser])

    useEffect(() => {
        shouldReconnect.current = true
        connect()
        return () => {
            shouldReconnect.current = false
            clearInterval(pingTimerRef.current)
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current)
            }
            wsRef.current?.close()
        }
    }, [connect])
}
