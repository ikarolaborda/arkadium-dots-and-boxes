import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/AuthModule';
import { ApplicationModule } from '../../application/ApplicationModule';
import { GameGateway } from './GameGateway';
import { DisconnectionScheduler } from './DisconnectionScheduler';

/*
 * The SocketIoGameBroadcaster singleton is declared in ApplicationModule
 * so the application services and the gateway share one instance — the
 * gateway calls bind(server) on it during afterInit and the GameService
 * pushes deltas/snapshots through the same object. Declaring it again
 * here would create a second container-scoped instance that never gets
 * bound, silently dropping every server-to-client broadcast.
 */
@Module({
  imports: [AuthModule, ApplicationModule],
  providers: [GameGateway, DisconnectionScheduler],
})
export class GatewayModule {}
