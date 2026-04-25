import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  const normalizeOrigin = (value?: string): string =>
    (value ?? '')
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/\/+$/, '')
      .toLowerCase();

  // JSON parser
  app.use(
    json({
      strict: false,
    }),
  );

  // Optional: handle form data
  app.use(
    urlencoded({
      extended: true,
    }),
  );

  // Handle stringified JSON bodies
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        if (parsed && typeof parsed === 'object') {
          req.body = parsed;
        }
      } catch {
        // Let validation handle invalid JSON
      }
    }
    next();
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS setup
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean)
    : null;

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin || corsOrigins === null) {
        return callback(null, true);
      }

      const normalizedRequestOrigin = normalizeOrigin(requestOrigin);

      if (corsOrigins.includes(normalizedRequestOrigin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  });

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Evalexa API')
    .setDescription('Evalexa backend API documentation')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  const appUrl = await app.getUrl();
  console.log(`Server running on ${appUrl} (port: ${port})`);
}

void bootstrap();