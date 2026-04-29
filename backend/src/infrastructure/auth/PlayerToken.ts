import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { asUuid, isUuid, Uuid } from '../../domain/shared/Identifier';

export interface PlayerClaims {
  readonly playerId: Uuid;
  readonly nickname: string;
}

interface RawClaims {
  sub: string;
  nickname: string;
}

@Injectable()
export class PlayerTokenService {
  constructor(private readonly jwt: JwtService) {}

  public sign(claims: PlayerClaims): string {
    const payload: RawClaims = {
      sub: claims.playerId,
      nickname: claims.nickname,
    };
    return this.jwt.sign(payload);
  }

  public verify(token: string): PlayerClaims {
    const decoded = this.jwt.verify<RawClaims>(token);
    if (!isUuid(decoded.sub)) {
      throw new Error('invalid playerId in token');
    }
    return {
      playerId: asUuid(decoded.sub),
      nickname: String(decoded.nickname ?? ''),
    };
  }
}
