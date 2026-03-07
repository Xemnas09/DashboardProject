import { useWebSocketInit } from '../hooks/useWebSocketInit'

/**
 * Ne rend rien.
 * Unique rôle : initialiser la connexion WebSocket dans l'arbre des providers.
 * DOIT être placé INSIDE AuthProvider ET RealtimeProvider.
 */
export default function WSInitializer() {
    useWebSocketInit()
    return null
}
