/**
 * A port pool for dynamic per-player UDP "delta" ports, mirroring Impostor's
 * `PortPoolService`.
 *
 * Lifecycle of a port:
 *
 * ```
 * available → (allocate) → leased → (return) → draining → (confirmRecycled) → available
 * ```
 *
 * A port in `draining` is **not** available for allocation until the old socket
 * has been fully disposed. This closes the race in Impostor where a freshly
 * returned port was re-allocated and `bind()` failed because the old socket was
 * still being torn down.
 */
export type PortAllocation = {
    /** The allocated port. `0` when the pool could not allocate a dedicated port. */
    port: number;
    /** True when the pool is exhausted and the shared/default port is being used. */
    isShared: boolean;
};

export class PortPoolService {
    private availablePorts: number[] = [];
    private activeLeases = new Map<number, { puid: string; allocatedAt: number }>();
    private draining = new Set<number>();
    private timeouts = new Map<number, NodeJS.Timeout>();

    /** Called by the owner when a lease expires without ever being confirmed. */
    onLeaseExpired?: (port: number) => void;

    constructor(
        private readonly start: number,
        private readonly end: number,
        defaultPort: number,
        private readonly leaseMs: number = 5 * 60 * 1000
    ) {
        for (let p = start; p <= end; p++) {
            if (p !== defaultPort) this.availablePorts.push(p);
        }
    }

    get isEnabled(): boolean {
        return this.start > 0 && this.end >= this.start;
    }

    get freePorts(): number {
        return this.availablePorts.length;
    }

    /**
     * Allocate a dynamic delta port for a player session. Returns `{ port: 0 }`
     * when the pool is exhausted — there is no IP-based fallback, so the caller
     * must reject the client in that case.
     */
    allocatePort(puid: string): PortAllocation {
        const port = this.availablePorts.shift();
        if (port === undefined) {
            return { port: 0, isShared: false };
        }

        this.activeLeases.set(port, { puid, allocatedAt: Date.now() });
        const timeout = setTimeout(() => {
            this.timeouts.delete(port);
            this.onLeaseExpired?.(port);
        }, this.leaseMs);
        this.timeouts.set(port, timeout);

        return { port, isShared: false };
    }

    /**
     * Mark a port as draining. It will not be re-allocated until
     * {@link confirmRecycled} is called (after the old socket is disposed).
     */
    returnPort(port: number): void {
        if (port <= 0) return;

        const hadLease = this.activeLeases.delete(port);
        const timeout = this.timeouts.get(port);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(port);
        }

        // Shared/default port — nothing to recycle.
        if (!hadLease) return;

        this.draining.add(port);
    }

    /**
     * Move a drained port back to the available pool. Must be called after the
     * old socket has been fully disposed.
     */
    confirmRecycled(port: number): void {
        if (this.draining.delete(port)) {
            this.availablePorts.push(port);
        }
    }

    /** Confirm a lease (cancel the timeout) once the client actually connects. */
    confirmPort(port: number): void {
        const timeout = this.timeouts.get(port);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(port);
        }
    }

    hasLease(port: number): boolean {
        return this.activeLeases.has(port);
    }

    dispose(): void {
        for (const [, timeout] of this.timeouts) clearTimeout(timeout);
        this.timeouts.clear();
        this.activeLeases.clear();
        this.draining.clear();
        this.availablePorts = [];
    }
}
