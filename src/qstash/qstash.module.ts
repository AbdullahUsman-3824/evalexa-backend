// src/qstash/qstash.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QStashService } from './qstash.service';
import { QUEUE_NAMES } from '../modules/processing/queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.APPLICATION_PROCESSING },
      { name: QUEUE_NAMES.JOB_PROCESSING },
      { name: QUEUE_NAMES.SCHEDULED },
    ),
  ],
  providers: [QStashService],
  exports: [QStashService],
})
export class QStashModule {}