import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplicationModule } from './application/ApplicationModule';
import { AuthModule } from './infrastructure/auth/AuthModule';
import { PersistenceModule } from './infrastructure/persistence/PersistenceModule';
import { GatewayModule } from './infrastructure/gateway/GatewayModule';
import { GamesController } from './interfaces/http/controllers/GamesController';
import { SessionController } from './interfaces/http/controllers/SessionController';
import { HealthController } from './health';
import { loadConfig } from './infrastructure/config/ConfigSchema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfig],
    }),
    AuthModule,
    PersistenceModule,
    ApplicationModule,
    GatewayModule,
  ],
  controllers: [GamesController, SessionController, HealthController],
})
export class AppModule {}
