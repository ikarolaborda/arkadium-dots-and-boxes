import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { UnitOfWork } from '../../application/ports/UnitOfWork';
import { PrismaService } from './PrismaService';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  private readonly storage = new AsyncLocalStorage<TxClient>();

  constructor(private readonly prisma: PrismaService) {}

  public transaction<T>(fn: () => Promise<T>): Promise<T> {
    /*
     * Interactive Prisma transaction wrapped in AsyncLocalStorage so any
     * repository called inside `fn` resolves the same TransactionClient
     * via getClient(). This keeps repositories oblivious to whether they
     * are inside a transaction or not — consistent with the Unit of Work
     * pattern (Fowler) and avoids passing a tx argument through every
     * service signature.
     */
    return this.prisma.$transaction(async (tx) => {
      return this.storage.run(tx, fn);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 10_000,
    });
  }

  public getClient(): PrismaService | TxClient {
    const tx = this.storage.getStore();
    return tx !== undefined ? tx : this.prisma;
  }
}
