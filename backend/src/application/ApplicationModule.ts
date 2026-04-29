import { Module, forwardRef } from '@nestjs/common';
import { GAME_BROADCASTER } from './ports/GameBroadcaster';
import { PersistenceModule } from '../infrastructure/persistence/PersistenceModule';
import { GameService } from './services/GameService';
import { LobbyService } from './services/LobbyService';
import { MatchHistoryService } from './services/MatchHistoryService';
import { SocketIoGameBroadcaster } from '../infrastructure/gateway/SocketIoGameBroadcaster';

@Module({
  imports: [PersistenceModule],
  providers: [
    LobbyService,
    GameService,
    MatchHistoryService,
    SocketIoGameBroadcaster,
    { provide: GAME_BROADCASTER, useExisting: SocketIoGameBroadcaster },
  ],
  exports: [
    LobbyService,
    GameService,
    MatchHistoryService,
    SocketIoGameBroadcaster,
    GAME_BROADCASTER,
  ],
})
export class ApplicationModule {}

void forwardRef;
