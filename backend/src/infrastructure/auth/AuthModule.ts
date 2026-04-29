import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PlayerTokenService } from './PlayerToken';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: {
          expiresIn: cfg.get<string>('JWT_TTL', '8h') as unknown as number,
          issuer: 'dab-backend',
        },
      }),
    }),
  ],
  providers: [PlayerTokenService],
  exports: [PlayerTokenService, JwtModule],
})
export class AuthModule {}
