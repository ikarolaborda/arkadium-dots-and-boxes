import { Injectable, Logger } from '@nestjs/common';
import { Uuid } from '../../domain/shared/Identifier';

interface PendingForfeit {
  readonly timer: NodeJS.Timeout;
  readonly scheduledAt: number;
}

@Injectable()
export class DisconnectionScheduler {
  private readonly logger = new Logger(DisconnectionScheduler.name);
  private readonly pending = new Map<string, PendingForfeit>();

  public schedule(
    gameId: Uuid,
    playerId: Uuid,
    delayMs: number,
    forfeit: () => Promise<void>,
  ): void {
    const key = DisconnectionScheduler.keyFor(gameId, playerId);
    this.cancel(gameId, playerId);
    const timer = setTimeout(() => {
      forfeit().catch((err) => {
        this.logger.error(
          `forfeit handler failed game=${gameId} player=${playerId}`,
          err as Error,
        );
      });
      this.pending.delete(key);
    }, delayMs);
    timer.unref();
    this.pending.set(key, { timer, scheduledAt: Date.now() });
  }

  public cancel(gameId: Uuid, playerId: Uuid): void {
    const key = DisconnectionScheduler.keyFor(gameId, playerId);
    const existing = this.pending.get(key);
    if (existing === undefined) {
      return;
    }
    clearTimeout(existing.timer);
    this.pending.delete(key);
  }

  private static keyFor(gameId: Uuid, playerId: Uuid): string {
    return `${gameId}:${playerId}`;
  }
}
