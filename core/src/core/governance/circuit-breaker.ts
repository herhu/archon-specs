import { TelemetryEmitter } from '../telemetry/telemetry';
import { EventType, EventCategory } from '../telemetry/telemetry-schema';

export enum BreakerState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
}

export class CircuitBreaker {
    private state: BreakerState = BreakerState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private lastFailureTime?: number;
    private readonly threshold: number;
    private readonly timeoutMs: number;

    constructor(threshold: number = 3, timeoutMs: number = 30000) {
        this.threshold = threshold;
        this.timeoutMs = timeoutMs;
    }

    canRequest(): boolean {
        if (this.state === BreakerState.OPEN) {
            if (Date.now() - (this.lastFailureTime || 0) > this.timeoutMs) {
                this.state = BreakerState.HALF_OPEN;
                return true;
            }
            return false;
        }
        return true;
    }

    onSuccess() {
        if (this.state === BreakerState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= 2) {
                this.state = BreakerState.CLOSED;
                this.failureCount = 0;
                this.successCount = 0;
                this.emitEvent(EventType.CIRCUIT_CLOSED);
            }
        } else {
            this.failureCount = 0;
        }
    }

    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.threshold) {
            this.state = BreakerState.OPEN;
            this.emitEvent(EventType.CIRCUIT_OPENED);
        }
    }

    private emitEvent(type: EventType) {
        TelemetryEmitter.emit({
            event: type,
            eventType: type,
            eventCategory: EventCategory.GOVERNANCE,
            metadata: { state: this.state, failures: this.failureCount }
        });
    }
}

export class CircuitBreakerRegistry {
    private static breakers: Map<string, CircuitBreaker> = new Map();

    static getBreaker(service: string, tool: string): CircuitBreaker {
        const key = `${service}:${tool}`;
        if (!this.breakers.has(key)) {
            this.breakers.set(key, new CircuitBreaker());
        }
        return this.breakers.get(key)!;
    }
}
