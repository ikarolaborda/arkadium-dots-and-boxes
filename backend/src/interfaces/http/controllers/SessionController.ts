import { Body, Controller, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { asUuid } from '../../../domain/shared/Identifier';
import { PlayerTokenService } from '../../../infrastructure/auth/PlayerToken';

class CreateSessionRequest {
  @IsString()
  @Length(1, 40)
  public nickname!: string;
}

@Controller('sessions')
export class SessionController {
  constructor(private readonly tokens: PlayerTokenService) {}

  @Post()
  public create(
    @Body() body: CreateSessionRequest,
  ): { token: string; playerId: string; nickname: string } {
    const playerId = asUuid(randomUUID());
    const token = this.tokens.sign({ playerId, nickname: body.nickname });
    return { token, playerId, nickname: body.nickname };
  }
}
