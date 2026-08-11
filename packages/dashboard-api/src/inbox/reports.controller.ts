import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
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
@Controller('workspaces/:workspaceId/agent-work')
@UseGuards(CombinedAuthGuard, ApiKeyPermissionGuard)
export class ReportsController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @RequiresPermission('messages:read')
  @ApiOperation({
    summary: 'Per-agent daily-work report (takeovers, attention marks, messages sent)',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({ status: 200, description: '{ from, to, agents: AgentWorkRow[] }' })
  agentWork(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inbox.agentWork(req.user.userId, workspaceId, from, to);
  }
}
