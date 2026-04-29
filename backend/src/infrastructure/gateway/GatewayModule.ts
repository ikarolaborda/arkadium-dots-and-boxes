import { Module } from '@nestjs/common';
import { GAME_BROADCASTER } from '../../application/ports/GameBroadcaster';
import { AuthModule } from '../auth/AuthModule';
import { ApplicationModule } from '../../application/ApplicationModule';
import { GameGateway } from './GameGateway';
import { DisconnectionScheduler } from './DisconnectionScheduler';
import { SocketIoGameBroadcaster } from './SocketIoGameBroadcaster';

@Module({
  imports: [AuthModule, ApplicationModule],
  providers: [
    GameGateway,
    DisconnectionScheduler,
    SocketIoGameBroadcaster,
    { provide: GAME_BROADCASTER, useExisting: SocketIoGameBroadcaster },
  ],
  exports: [GAME_BROADCASTER],
})
export class GatewayModule {}
