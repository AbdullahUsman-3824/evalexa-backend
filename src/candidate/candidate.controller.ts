import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CandidateService } from './candidate.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Controller('candidate')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  @Post()
  createCandidate(@Body() dto: CreateCandidateDto) {
    return this.candidateService.createCandidate(dto);
  }

  @Get('search')
  findByEmail(@Query('email') email?: string) {
    return this.candidateService.findByEmail(email);
  }

  @Get(':id/profile')
  getCandidateProfile(@Param('id') id: string) {
    return this.candidateService.getCandidateProfile(id);
  }

  @Patch(':id')
  updateCandidate(@Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    return this.candidateService.updateCandidate(id, dto);
  }
}
