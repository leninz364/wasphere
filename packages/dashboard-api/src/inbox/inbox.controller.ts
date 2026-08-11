import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CombinedAuthGuard } from '../auth/combined-auth.guard';
import { ApiKeyPermissionGuard } from '../auth/api-key-permission.guard';
import { RequiresPermission } from '../auth/requires-permission.decorator';
import { InboxService } from './inbox.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { PatchConversationDto } from './dto/patch-conversation.dto';
import { SendReplyDto } from './dto/send-reply.dto';
import { StartConversationDto } from './dto/start-conversation.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string; sessionScope?: string | null };
}

@ApiTags('Inbox')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/conversations')
@UseGuards(CombinedAuthGuard, ApiKeyPermissionGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @RequiresPermission('messages:read')
  @ApiOperation({ summary: 'List conversations (cursor-paginated, filterable, searchable)' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({ status: 200, description: '{ items: ConversationView[], nextCursor: string | null }' })
  @ApiResponse({ status: 403, description: 'Not a member of this workspace' })
  list(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.inbox.listConversations(
      req.user.userId,
      workspaceId,
      query,
      req.user.sessionScope ?? null,
    );
  }

  @Post()
  @RequiresPermission('messages:send')
  @ApiOperation({ summary: 'Start a new conversation by sending the first message to a number' })
  @ApiResponse({ status: 201, description: '{ conversationId }' })
  start(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: StartConversationDto,
  ) {
    return this.inbox.startConversation(
      req.user.userId,
      workspaceId,
      dto,
      req.user.sessionScope ?? null,
    );
  }

  @Get(':conversationId')
  @RequiresPermission('messages:read')
  @ApiOperation({ summary: 'Get one conversation with its contact' })
  @ApiResponse({ status: 200, description: 'ConversationView' })
  @ApiResponse({ status: 404, description: 'Conversation not found in this workspace' })
  get(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.inbox.getConversation(
      req.user.userId,
      workspaceId,
      conversationId,
      req.user.sessionScope ?? null,
    );
  }

  @Get(':conversationId/events')
  @RequiresPermission('messages:read')
  @ApiOperation({ summary: '"Atención realizada" — attention audit trail of a conversation' })
  @ApiResponse({ status: 200, description: '{ items: ConversationEventView[] }' })
  events(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.inbox.listEvents(
      req.user.userId,
      workspaceId,
      conversationId,
      req.user.sessionScope ?? null,
    );
  }

  @Get(':conversationId/messages')
  @RequiresPermission('messages:read')
  @ApiOperation({ summary: 'List messages in a conversation (newest-first, cursor-paginated)' })
  @ApiResponse({ status: 200, description: '{ items: Message[], nextCursor: string | null }' })
  messages(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.inbox.listMessages(
      req.user.userId,
      workspaceId,
      conversationId,
      query,
      req.user.sessionScope ?? null,
    );
  }

  @Patch(':conversationId')
  @RequiresPermission('messages:read')
  @ApiOperation({ summary: 'Update conversation status and/or tags' })
  @ApiResponse({ status: 200, description: 'Updated ConversationView' })
  patch(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: PatchConversationDto,
  ) {
    return this.inbox.patchConversation(
      req.user.userId,
      workspaceId,
      conversationId,
      dto,
      req.user.sessionScope ?? null,
    );
  }

  @Post(':conversationId/read')
  @RequiresPermission('messages:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a conversation read (zero unreadCount)' })
  @ApiResponse({ status: 200, description: '{ ok: true, unreadCount: 0 }' })
  read(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    // API-key reads must never claim ("take over") a chat — only humans do.
    const viaApiKey = 'permissions' in (req.user as Record<string, unknown>);
    return this.inbox.markRead(
      req.user.userId,
      workspaceId,
      conversationId,
      req.user.sessionScope ?? null,
      viaApiKey,
    );
  }

  @Post(':conversationId/archive')
  @RequiresPermission('messages:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive (hide) a SOLUCIONADO chat — OWNER/ADMIN only' })
  @ApiResponse({ status: 200, description: '{ ok: true, archived: true }' })
  @ApiResponse({ status: 400, description: 'Chat is not SOLUCIONADO' })
  @ApiResponse({ status: 403, description: 'Only an admin can archive chats' })
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.inbox.archiveConversation(
      req.user.userId,
      workspaceId,
      conversationId,
      req.user.sessionScope ?? null,
    );
  }

  @Post(':conversationId/unarchive')
  @RequiresPermission('messages:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived chat back to the inbox — OWNER/ADMIN only' })
  @ApiResponse({ status: 200, description: '{ ok: true, archived: false }' })
  @ApiResponse({ status: 403, description: 'Only an admin can restore chats' })
  unarchive(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.inbox.unarchiveConversation(
      req.user.userId,
      workspaceId,
      conversationId,
      req.user.sessionScope ?? null,
    );
  }

  @Post(':conversationId/messages')
  @RequiresPermission('messages:send')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a text reply (proxies to the WA Server)' })
  @ApiResponse({ status: 201, description: 'The created OUTBOUND message' })
  @ApiResponse({ status: 503, description: 'Session offline/deleted — reply not sent' })
  send(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendReplyDto,
  ) {
    return this.inbox.sendReply(
      req.user.userId,
      workspaceId,
      conversationId,
      dto,
      req.user.sessionScope ?? null,
    );
  }
}
