import { Injectable, BadRequestException, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { MulterFile } from '../common/types/multer-file';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private supabase: SupabaseClient | null = null;
  private readonly bucket: string;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get<string>('SUPABASE_STORAGE_BUCKET', 'products');
  }

  private getClient(): SupabaseClient {
    if (this.supabase) return this.supabase;

    const url = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !serviceRoleKey) {
      throw new HttpException(
        'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.',
        500,
      );
    }

    this.supabase = createClient(url, serviceRoleKey);
    return this.supabase;
  }

  private extractPathFromUrl(imageUrl: string): string | null {
    const marker = `/object/public/${this.bucket}/`;
    const index = imageUrl.indexOf(marker);
    if (index === -1) return null;
    return imageUrl.slice(index + marker.length);
  }

  async uploadProductImage(
    merchantId: string,
    productId: string,
    file: MulterFile,
  ): Promise<{ imageUrl: string }> {
    if (!file) {
      throw new BadRequestException('Product image is required.');
    }

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Accepted types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
      );
    }

    const supabase = this.getClient();
    const ext = MIME_TO_EXT[file.mimetype];
    const path = `${merchantId}/${productId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(this.bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw new BadRequestException(`Failed to upload image: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage.from(this.bucket).getPublicUrl(path);

    return {
      imageUrl: urlData.publicUrl,
    };
  }

  async uploadProfilePhoto(
    userId: number,
    file: MulterFile,
  ): Promise<{ imageUrl: string; imagePath: string }> {
    if (!file) {
      throw new BadRequestException('Profile photo is required.');
    }

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Accepted types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
      );
    }

    const supabase = this.getClient();
    const ext = MIME_TO_EXT[file.mimetype];
    const random = randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const path = `profile-photos/user-${userId}/${timestamp}-${random}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(this.bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw new BadRequestException(`Failed to upload profile photo: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage.from(this.bucket).getPublicUrl(path);

    return {
      imageUrl: urlData.publicUrl,
      imagePath: path,
    };
  }

  async deleteProductImage(imageUrl: string): Promise<void> {
    if (!imageUrl) return;

    const imagePath = this.extractPathFromUrl(imageUrl);
    if (!imagePath) {
      this.logger.warn(`Unable to parse storage path from image URL: ${imageUrl}`);
      return;
    }

    try {
      const supabase = this.getClient();
      const { error } = await supabase.storage.from(this.bucket).remove([imagePath]);

      if (error) {
        this.logger.error(`Failed to delete image ${imagePath}: ${error.message}`);
      }
    } catch {
      this.logger.error(`Failed to delete image ${imagePath}: Supabase not configured`);
    }
  }
}
