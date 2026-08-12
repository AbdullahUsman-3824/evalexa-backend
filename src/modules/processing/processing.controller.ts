import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApplicationProcessingProducer } from './producers/application-processing.producer';
// TODO: swap these two imports for your actual guard/decorator names
// if they differ (e.g. JwtAuthGuard, RolesGuard, @Roles from your auth module).
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('processing')
// @UseGuards(JwtAuthGuard)
export class ProcessingController {
  constructor(
    private readonly applicationProcessingProducer: ApplicationProcessingProducer,
  ) {}

  @Post('applications/:id/retry')
  retryApplication(@Param('id') applicationId: string) {
    return this.applicationProcessingProducer.retryFailedApplication(
      applicationId,
    );
  }
}
