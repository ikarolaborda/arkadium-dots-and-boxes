import { Module } from '@nestjs/common';
import { GAME_REPOSITORY } from '../../application/ports/GameRepository';
import { PLAYER_REPOSITORY } from '../../application/ports/PlayerRepository';
import { UNIT_OF_WORK } from '../../application/ports/UnitOfWork';
import { PrismaService } from './PrismaService';
import { PrismaUnitOfWork } from './PrismaUnitOfWork';
import { PrismaGameRepository } from './repositories/PrismaGameRepository';
import { PrismaPlayerRepository } from './repositories/PrismaPlayerRepository';

@Module({
  providers: [
    PrismaService,
    PrismaUnitOfWork,
    { provide: UNIT_OF_WORK, useExisting: PrismaUnitOfWork },
    { provide: GAME_REPOSITORY, useClass: PrismaGameRepository },
    { provide: PLAYER_REPOSITORY, useClass: PrismaPlayerRepository },
  ],
  exports: [
    PrismaService,
    PrismaUnitOfWork,
    UNIT_OF_WORK,
    GAME_REPOSITORY,
    PLAYER_REPOSITORY,
  ],
})
export class PersistenceModule {}
