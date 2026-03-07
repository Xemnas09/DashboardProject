import { useWebSocketInit } from './useWebSocketInit'

/**
 * A renderless container component responsible for initializing the global WebSocket connection.
 * It strictly mounts the `useWebSocketInit` hook within the application's provider tree.
 * Must be placed inside both AuthProvider and RealtimeProvider.
 * 
 * @returns {null} Always returns null as it operates statefully without a UI.
 */
export default function WSInitializer() {
    useWebSocketInit()
    return null
}
