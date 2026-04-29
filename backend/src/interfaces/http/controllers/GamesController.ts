import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { GameStateMapper } from '../../../application/services/GameStateMapper';
import { LobbyService } from '../../../application/services/LobbyService';
import { MatchHistoryService } from '../../../application/services/MatchHistoryService';
import { GameService } from '../../../application/services/GameService';
import { PlayerTokenService } from '../../../infrastructure/auth/PlayerToken';
import { asUuid } from '../../../domain/shared/Identifier';
import { CreateGameRequest } from '../dto/CreateGameRequest';

@Controller('games')
export class GamesController {
  constructor(
    private readonly lobby: LobbyService,
    private readonly games: GameService,
    private readonly history: MatchHistoryService,
    private readonly tokens: PlayerTokenService,
  ) {}

  @Get('joinable')
  public async listJoinable(): Promise<unknown> {
    const games = await this.lobby.listJoinable();
    return games.map(GameStateMapper.toSnapshot);
  }

  @Get('history')
  public async listHistory(
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ): Promise<unknown> {
    return this.history.list(Number(limit), Number(offset));
  }

  @Post()
  public async create(
    @Headers('authorization') auth: string | undefined,
    @Body() body: CreateGameRequest,
  ): Promise<unknown> {
    const claims = this.requireClaims(auth, body.nickname);
    const state = await this.lobby.createGame({
      hostPlayerId: claims.playerId,
      hostNickname: claims.nickname,
      rules: body.gridSize !== undefined ? { gridSize: body.gridSize } : undefined,
    });
    return GameStateMapper.toSnapshot(state);
  }

  @Get(':id')
  public async get(@Param('id') id: string): Promise<unknown> {
    const state = await this.games.loadSnapshot(asUuid(id));
    return GameStateMapper.toSnapshot(state);
  }

  private requireClaims(
    authHeader: string | undefined,
    fallbackNickname: string,
  ): { playerId: ReturnType<typeof asUuid>; nickname: string } {
    if (authHeader === undefined || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    try {
      const claims = this.tokens.verify(authHeader.substring('Bearer '.length));
      return {
        playerId: claims.playerId,
        nickname: claims.nickname || fallbackNickname,
      };
    } catch {
      throw new UnauthorizedException('invalid token');
    }
  }
}
