import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../AppModule';

const DEV_JWT_SECRET = 'dev-secret-change-me';

function assertProductionSafety(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  /*
   * Hard fail if a production deploy still uses the dev JWT default.
   * Anyone who could read the source could mint tokens for any player —
   * we'd rather refuse to boot than ship a forgeable signer.
   */
  if (
    process.env.JWT_SECRET === undefined ||
    process.env.JWT_SECRET === DEV_JWT_SECRET
  ) {
    throw new Error(
      'JWT_SECRET must be set to a non-default value in production',
    );
  }
  /*
   * In production we refuse to ship credentialed CORS to a wildcard
   * origin (browsers reject the combo, and shipping it makes the
   * misconfiguration silent at server side).
   */
  if (
    process.env.FRONTEND_ORIGIN === undefined ||
    process.env.FRONTEND_ORIGIN === '*'
  ) {
    throw new Error(
      'FRONTEND_ORIGIN must be a concrete origin (not "*" or unset) in production',
    );
  }
}

async function bootstrap(): Promise<void> {
  assertProductionSafety();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  /*
   * If FRONTEND_ORIGIN is unset the dev fallback is the local Vite
   * server. credentials=true is only safe with a concrete origin —
   * never with '*' (browsers reject the combo). assertProductionSafety
   * already prevents the wildcard in production.
   */
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  app.enableCors({
    origin: frontendOrigin === '*' ? true : frontendOrigin,
    credentials: frontendOrigin !== '*',
  });
  app.setGlobalPrefix('api');
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`server up on :${port}`);
}

bootstrap().catch((err) => {
  /* istanbul ignore next */
  // eslint-disable-next-line no-console
  console.error('fatal bootstrap error', err);
  process.exit(1);
});
