/**
 * Cached authentication data for a user, stored after TCP /api/user call
 * and retrieved during UDP handshake matching.
 */
export interface CachedAuth {
    /** EOS ProductUserId extracted from the JWT token. */
    puid: string;
    /** FriendCode in username#discriminator format, from Innersloth backend. */
    friendCode: string;
    /** When this cache entry expires. */
    expiresAt: number;
    /** The username from the /api/user request body. */
    username: string;
    /** The client version reported by the user. */
    clientVersion: number;
}

/**
 * In-memory cache that maps a dynamic delta port → CachedAuth.
 *
 * Dynamic per-player UDP ports are the primary way to associate a UDP connection
 * with the authentication data obtained during the prior TCP /api/user call.
 * When a client connects to the shared socket (rather than its assigned delta
 * port), the auth is matched by the session's username — never by IP.
 */
export class AuthCache {
    /** Delta port index: port → CachedAuth (for dynamic per-player port matching) */
    private byPort = new Map<number, CachedAuth>();

    /** Username index: username → CachedAuth (shared-socket fallback, no IP) */
    private byUsername = new Map<string, CachedAuth>();

    /** Default cache TTL: 10 minutes */
    static readonly DEFAULT_TTL_MS = 10 * 60 * 1000;

    constructor(private ttlMs: number = AuthCache.DEFAULT_TTL_MS) {}

    /**
     * Store an authentication entry keyed by a dynamic delta port.
     */
    addAuthByPort(port: number, username: string, puid: string, friendCode: string, clientVersion: number): CachedAuth {
        this.cleanExpired();

        const entry: CachedAuth = {
            puid,
            friendCode,
            expiresAt: Date.now() + this.ttlMs,
            username,
            clientVersion,
        };

        this.byPort.set(port, entry);
        this.byUsername.set(username, entry);

        return entry;
    }

    /**
     * Store an authentication entry keyed by the session's username.
     * Used when dynamic delta ports are disabled — the client connects to the
     * shared socket and is matched by username (never by IP).
     */
    addAuthByUsername(username: string, puid: string, friendCode: string, clientVersion: number): CachedAuth {
        this.cleanExpired();

        const entry: CachedAuth = {
            puid,
            friendCode,
            expiresAt: Date.now() + this.ttlMs,
            username,
            clientVersion,
        };

        this.byUsername.set(username, entry);
        return entry;
    }

    /**
     * Look up an authentication entry by its dynamic delta port.
     */
    findByPort(port: number): CachedAuth | null {
        this.cleanExpired();
        const entry = this.byPort.get(port);
        if (entry && entry.expiresAt > Date.now()) {
            return entry;
        }
        return null;
    }

    /**
     * Look up an authentication entry by the session's username.
     * Used when a client connects to the shared socket instead of its delta port.
     * Deliberately NOT IP-based.
     */
    findByUsername(username: string): CachedAuth | null {
        this.cleanExpired();
        const entry = this.byUsername.get(username);
        if (entry && entry.expiresAt > Date.now()) {
            return entry;
        }
        return null;
    }

    /**
     * Refresh a port-keyed entry's expiry (called once the client connects).
     */
    confirmPort(port: number): void {
        const entry = this.byPort.get(port);
        if (entry) {
            entry.expiresAt = Date.now() + this.ttlMs;
        }
    }

    /**
     * Remove a port-keyed entry (called when the delta port is returned).
     */
    removeByPort(port: number): void {
        const entry = this.byPort.get(port);
        if (entry) {
            this.byPort.delete(port);
            if (this.byUsername.get(entry.username) === entry) {
                this.byUsername.delete(entry.username);
            }
        }
    }

    /**
     * Remove expired entries.
     */
    cleanExpired(): void {
        const now = Date.now();
        for (const [port, entry] of this.byPort) {
            if (entry.expiresAt <= now) {
                this.byPort.delete(port);
                if (this.byUsername.get(entry.username) === entry) {
                    this.byUsername.delete(entry.username);
                }
            }
        }
    }

    /**
     * Get the number of active cache entries.
     */
    get size(): number {
        this.cleanExpired();
        return this.byPort.size;
    }
}
