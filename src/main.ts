import {
  Logger,
  UnprocessableEntityException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor.js';

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): { field: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints
      ? Object.values(error.constraints).map((message) => ({ field, message }))
      : [];
    const children = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];

    return [...own, ...children];
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const trustProxy = config.get<number>('TRUST_PROXY') ?? 0;
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  app.disable('x-powered-by');
  app.use(helmet());
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new UnprocessableEntityException({
          message: 'Validasi gagal.',
          details: { fields: flattenValidationErrors(errors) },
        }),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) app.enableCors({ origin: origins });

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`PriVis Track API listening on http://0.0.0.0:${port}`);
}

await bootstrap();
