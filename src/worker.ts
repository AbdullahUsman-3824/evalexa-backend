import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const RUN_DURATION_MS = 4.5 * 60 * 1000;

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['log', 'warn', 'error'],
    });
    app.enableShutdownHooks();

    console.log('Worker context up — draining queues for 4.5 minutes...');
    await new Promise((resolve) => setTimeout(resolve, RUN_DURATION_MS));

    console.log('Window elapsed, shutting down...');
    await app.close();
    process.exit(0);
}

bootstrap().catch((err) => {
    console.error('Worker bootstrap failed', err);
    process.exit(1);
});