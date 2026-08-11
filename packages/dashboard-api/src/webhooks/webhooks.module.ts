import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ApiKeyPermissionGuard } from '../auth/api-key-permission.guard';

@Module({
  imports: [WorkspacesModule, ApiKeysModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, ApiKeyPermissionGuard],
  exports: [WebhooksService],
})
export class WebhooksModule {}
