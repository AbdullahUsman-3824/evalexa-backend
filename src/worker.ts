import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppModule } from './app.module';
import { QUEUE_NAMES } from './modules/processing/queues/queue-names';

const MAX_RUNTIME_MS = 4.5 * 60 * 1000; // hard ceiling, GH Actions timeout se kam
const CHECK_INTERVAL_MS = 5000;
const IDLE_CONFIRMATIONS_NEEDED = 2; // false-idle blip se bachne ke liye

async function isQueueIdle(queue: Queue) {
    const [active, waiting, delayed] = await Promise.all([
        queue.getActiveCount(),
        queue.getWaitingCount(),
        queue.getDelayedCount(),
    ]);
    return active === 0 && waiting === 0 && delayed === 0;
}

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['log', 'warn', 'error'],
    });
    app.enableShutdownHooks();

    const appQueue = app.get<Queue>(
        getQueueToken(QUEUE_NAMES.APPLICATION_PROCESSING),
    );
    const jobQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.JOB_PROCESSING));

    console.log('Worker context up — draining queues...');

    const startedAt = Date.now();
    let idleStreak = 0;

    while (Date.now() - startedAt < MAX_RUNTIME_MS) {
        await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));

        const [appIdle, jobIdle] = await Promise.all([
            isQueueIdle(appQueue),
            isQueueIdle(jobQueue),
        ]);

        if (appIdle && jobIdle) {
            idleStreak++;
            if (idleStreak >= IDLE_CONFIRMATIONS_NEEDED) {
                console.log('Both queues idle — shutting down early.');
                break;
            }
        } else {
            idleStreak = 0; // koi job active/waiting mili, reset karo
        }
    }

    console.log('Closing worker context gracefully...');
    await app.close(); // ab yeh sirf tab chalega jab koi job active nahi
    process.exit(0);
}

bootstrap().catch((err) => {
    console.error('Worker bootstrap failed', err);
    process.exit(1);
});