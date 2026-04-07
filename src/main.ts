import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.use(
    json({
      strict: false,
    }),
  );

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body) as unknown;
        if (parsed !== null && typeof parsed === 'object') {
          req.body = parsed;
        }
      } catch {
        // Keep original body so downstream validation still rejects invalid payloads.
      }
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
