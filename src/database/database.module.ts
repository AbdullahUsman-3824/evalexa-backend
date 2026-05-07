import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { SupabaseService } from './supabase.service.js';

@Module({
  providers: [DatabaseService, SupabaseService],
  exports: [DatabaseService, SupabaseService],
})
export class DatabaseModule {}
