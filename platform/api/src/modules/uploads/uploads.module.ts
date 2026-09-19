import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { ImageUploadInterceptor } from './image-upload.interceptor';

// MediaRegistryService (storage, registry, audit) comes from the global StorageModule.
@Module({
  controllers: [UploadsController],
  providers: [ImageUploadInterceptor],
})
export class UploadsModule {}
