export interface AppConfig {
  readonly httpPort: number;
  readonly frontendOrigin: string;
  readonly jwtSecret: string;
  readonly jwtTtl: string;
  readonly forfeitGraceMs: number;
}

export const loadConfig = (): AppConfig => ({
  httpPort: Number(process.env.PORT ?? 3001),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtTtl: process.env.JWT_TTL ?? '8h',
  forfeitGraceMs: Number(process.env.FORFEIT_GRACE_MS ?? 30000),
});
