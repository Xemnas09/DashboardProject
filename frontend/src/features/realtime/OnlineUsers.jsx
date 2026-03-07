import { useAuth } from '../contexts/AuthContext'
import { useRealtime } from '../contexts/RealtimeContext'

export default function OnlineUsers() {
    const { currentUser } = useAuth()
    const { onlineUsers } = useRealtime()

    if (!['admin', 'super_admin'].includes(currentUser?.role)) return null

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Connectés
                </span>
                <span className="ml-auto text-xs font-black text-bank-600 bg-bank-50
                         px-2 py-0.5 rounded-full">
                    {onlineUsers.length}
                </span>
            </div>

            {onlineUsers.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-4">
                    Aucun utilisateur connecté
                </p>
            ) : (
                <div className="space-y-1">
                    {onlineUsers.map(user => (
                        <div key={user.username}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50
                         transition-colors">
                            {/* Avatar */}
                            <div className="w-8 h-8 rounded-full bg-gray-950 flex items-center
                              justify-center text-white text-xs font-black flex-shrink-0">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-gray-700 truncate">
                                        {user.username.charAt(0).toUpperCase() + user.username.slice(1)}
                                    </span>
                                    {user.username === currentUser?.username && (
                                        <span className="text-[10px] text-gray-400">(vous)</span>
                                    )}
                                </div>
                            </div>
                            {/* Status dot */}
                            <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
