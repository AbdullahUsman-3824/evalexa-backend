import { Body, Controller, Post } from '@nestjs/common';
import { ApplyWithParsedDto } from './dto/apply-with-parsed.dto';
import { ApplicationService } from './application.service';

@Controller('application')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post('apply')
  applyWithParsedData(@Body() dto: ApplyWithParsedDto) {
    return this.applicationService.applyWithParsedData(dto);
  }
}
