import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type BucketDefinition = {
  name: string;
  public: boolean;
};

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase?: SupabaseClient;

  private readonly requiredBuckets: BucketDefinition[] = [
    { name: process.env.SUPABASE_STORAGE_BUCKET ?? 'resumes', public: true },
    { name: 'company-logos', public: true },
    { name: 'company-banners', public: true },
    { name: 'company-verification-docs', public: false },
  ];

  async onModuleInit(): Promise<void> {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return;
    }

    await this.ensureRequiredBuckets();
  }

  getClient(): SupabaseClient {
    if (!this.supabase) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw new Error(
          'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured',
        );
      }

      this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    }

    return this.supabase;
  }

  private async ensureRequiredBuckets(): Promise<void> {
    const client = this.getClient();

    try {
      const { data: buckets, error } = await client.storage.listBuckets();

      if (error) {
        throw new Error(`Failed to list Supabase buckets: ${error.message}`);
      }

      const bucketsByName = new Map(
        buckets.map((bucket) => [bucket.name, bucket]),
      );

      for (const bucket of this.requiredBuckets) {
        const existing = bucketsByName.get(bucket.name);

        if (!existing) {
          const { error: createError } = await client.storage.createBucket(
            bucket.name,
            { public: bucket.public },
          );

          if (createError) {
            throw new Error(
              `Failed to create Supabase bucket "${bucket.name}": ${createError.message}`,
            );
          }

          continue;
        }

        if (existing.public !== bucket.public) {
          const { error: updateError } = await client.storage.updateBucket(
            bucket.name,
            { public: bucket.public },
          );

          if (updateError) {
            throw new Error(
              `Failed to update Supabase bucket "${bucket.name}": ${updateError.message}`,
            );
          }
        }
      }
    } catch (error) {
      console.warn(
        'Supabase storage bucket setup skipped because the storage service is unavailable:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
