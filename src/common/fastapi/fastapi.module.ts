import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { FASTAPI_BASE_URL } from '../constants/fastapi.constants';
import { FastApiService } from './fastapi.service';

@Global()
@Module({
  imports: [
    HttpModule.register({
      baseURL: FASTAPI_BASE_URL,
      timeout: 60_000,
      maxRedirects: 3,
    }),
  ],
  providers: [FastApiService],
  exports: [FastApiService],
})
export class FastApiModule {}
