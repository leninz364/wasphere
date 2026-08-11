import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CombinedAuthGuard } from '../auth/combined-auth.guard';
import { ApiKeyPermissionGuard } from '../auth/api-key-permission.guard';
import { RequiresPermission } from '../auth/requires-permission.decorator';
import { InboxService } from './inbox.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@ApiTags('Inbox')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/inbox')
@UseGuards(CombinedAuthGuard, ApiKeyPermissionGuard)
export class InboxNotificationsController {
  constructor(private readonly inbox: InboxService) {}

  @Get('agents')
  @RequiresPermission('messages:read')
  @ApiOperation({ summary: 'Workspace agents available for delegating a chat' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({ status: 200, description: '[{ id, name, email, role }] (excludes the caller)' })
  agents(@Req() req: AuthenticatedRequest, @Param('workspaceId') workspaceId: string) {
    return this.inbox.listDelegatableAgents(req.user.userId, workspaceId);
  }

  @Get('notifications')
  @RequiresPermission('messages:read')
  @ApiOperation({
    summary: 'Delegation notifications for the inbox bell',
    description:
      'Chats delegated to a group the current user belongs to, newest first, ' +
      'with the delegating agent, group and timestamp. `seen` derives from the ' +
      'per-member cursor set by POST /seen.',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({ status: 200, description: '{ items: NotificationView[], unseenCount: number }' })
  list(@Req() req: AuthenticatedRequest, @Param('workspaceId') workspaceId: string) {
    return this.inbox.listNotifications(req.user.userId, workspaceId);
  }

  @Post('notifications/seen')
  @RequiresPermission('messages:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all delegation notifications as seen' })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  markSeen(@Req() req: AuthenticatedRequest, @Param('workspaceId') workspaceId: string) {
    return this.inbox.markNotificationsSeen(req.user.userId, workspaceId);
  }
}
