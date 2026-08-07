import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
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

  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  @Get()
  findAllRecruiterView() {
    return this.candidateService.findAllRecruiterView();
  }

  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  @Get(':id')
  getCandidateRecruiterView(@Param('id') id: string) {
    return this.candidateService.getCandidateRecruiterView(id);
  }

  @Patch(':id')
  updateCandidate(@Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    return this.candidateService.updateCandidate(id, dto);
  }
}
