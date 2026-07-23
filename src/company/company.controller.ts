import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { User } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyService } from './company.service';
import { RecruiterRoleGuard } from './guards/recruiter-role.guard';
import { Express } from 'express';

interface CompanyUploadedFiles {
  logo?: Express.Multer.File[];
  banner?: Express.Multer.File[];
  verificationDocuments?: Express.Multer.File[];
}

const companyFileFields = FileFieldsInterceptor(
  [
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'verificationDocuments', maxCount: 5 },
  ],
  {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB per file
    },
  },
);

@UseGuards(JwtAuthGuard, RecruiterRoleGuard)
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @UseInterceptors(companyFileFields)
  create(
    @User() user: JwtPayload,
    @Body() dto: CreateCompanyDto,
    @UploadedFiles() files: CompanyUploadedFiles,
  ) {
    return this.companyService.create(user.sub, dto, {
      logo: files.logo?.[0],
      banner: files.banner?.[0],
      verificationDocuments: files.verificationDocuments,
    });
  }

  @Get()
  findAll(@User() user: JwtPayload) {
    return this.companyService.findAll(user.sub);
  }

  @Get(':id')
  findOne(@User() user: JwtPayload, @Param('id') id: string) {
    return this.companyService.findOne(user.sub, id);
  }

  @Get(':id/verification-documents')
  getVerificationDocumentUrls(
    @User() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.companyService.getVerificationDocumentSignedUrls(user.sub, id);
  }

  @Get(':id/stats')
  getStats(@User() user: JwtPayload, @Param('id') id: string) {
    return this.companyService.getCompanyStats(user.sub, id);
  }

  @Patch(':id')
  @UseInterceptors(companyFileFields)
  update(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @UploadedFiles() files: CompanyUploadedFiles,
  ) {
    return this.companyService.update(user.sub, id, dto, {
      logo: files.logo?.[0],
      banner: files.banner?.[0],
      verificationDocuments: files.verificationDocuments,
    });
  }

  @Delete(':id')
  remove(@User() user: JwtPayload, @Param('id') id: string) {
    return this.companyService.remove(user.sub, id);
  }
}
