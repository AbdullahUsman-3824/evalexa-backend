import { Injectable, Logger } from '@nestjs/common';
import { QStashService } from '../../../qstash/qstash.service';

@Injectable()
export class JobDeadlineProducer {
  private readonly logger = new Logger(JobDeadlineProducer.name);

  constructor(private readonly qstash: QStashService) {}

  async scheduleJobDeadline(jobId: string, deadline: Date | null) {
    if (!deadline) {
      this.logger.debug(`No deadline for job ${jobId}`);
      await this.qstash.cancelJobDeadline(jobId);
      return;
    }

    const delayInSeconds = Math.floor((deadline.getTime() - Date.now()) / 1000);

    await this.qstash.scheduleJobDeadline(jobId, Math.max(delayInSeconds, 0));

    this.logger.log(
      `Scheduled close-job for ${jobId} in ${Math.max(delayInSeconds, 0)}s`,
    );
  }

  async cancelJobDeadline(jobId: string) {
    await this.qstash.cancelJobDeadline(jobId);
  }
}
