import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyService } from './company.service';
import { RecruiterRoleGuard } from './guards/recruiter-role.guard';

@UseGuards(JwtAuthGuard, RecruiterRoleGuard)
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  create(@User() user: JwtPayload, @Body() dto: CreateCompanyDto) {
    return this.companyService.create(user.sub, dto);
  }

  @Get()
  findAll(@User() user: JwtPayload) {
    return this.companyService.findAll(user.sub);
  }

  @Get(':id')
  findOne(@User() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.companyService.findOne(user.sub, id);
  }

  @Patch(':id')
  update(
    @User() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companyService.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@User() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.companyService.remove(user.sub, id);
  }
}
