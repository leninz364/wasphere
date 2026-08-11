import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { CombinedAuthGuard } from '../auth/combined-auth.guard';
import { CAPABILITIES } from '../lib/capabilities';
import { TeamService } from './team.service';

// Member update: a role ref ('ADMIN' | custom-role uuid) and/or profile fields.
class UpdateMemberDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cedula?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  cargo?: string;
}

class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}

// Invite creation: a role ref plus an optional email to send the invite link to.
class CreateInviteDto {
  @IsString()
  @MinLength(1)
  role: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

class CreateRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @IsArray()
  @IsIn(CAPABILITIES, { each: true })
  capabilities: string[];
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsIn(CAPABILITIES, { each: true })
  capabilities?: string[];
}

interface AuthedRequest extends Request {
  user: { userId: string };
}

@ApiTags('Team')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
@UseGuards(CombinedAuthGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('my-role')
  myRole(@Req() req: AuthedRequest, @Param('workspaceId') ws: string) {
    return this.team.myRole(ws, req.user.userId);
  }

  @Get('members')
  members(@Req() req: AuthedRequest, @Param('workspaceId') ws: string) {
    return this.team.listMembers(ws, req.user.userId);
  }

  @Patch('members/:userId')
  updateMember(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Param('userId') userId: string, @Body() dto: UpdateMemberDto) {
    return this.team.updateMember(ws, req.user.userId, userId, dto);
  }

  @Delete('members/:userId')
  removeMember(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Param('userId') userId: string) {
    return this.team.removeMember(ws, req.user.userId, userId);
  }

  // ── Custom roles ─────────────────────────────────────────────────────────

  @Get('roles')
  listRoles(@Req() req: AuthedRequest, @Param('workspaceId') ws: string) {
    return this.team.listRoles(ws, req.user.userId);
  }

  @Post('roles')
  createRole(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Body() dto: CreateRoleDto) {
    return this.team.createRole(ws, req.user.userId, dto.name, dto.capabilities);
  }

  @Patch('roles/:roleId')
  updateRole(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Param('roleId') roleId: string, @Body() dto: UpdateRoleDto) {
    return this.team.updateRole(ws, req.user.userId, roleId, dto.name, dto.capabilities);
  }

  @Delete('roles/:roleId')
  deleteRole(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Param('roleId') roleId: string) {
    return this.team.deleteRole(ws, req.user.userId, roleId);
  }

  // ── Agent groups ─────────────────────────────────────────────────────────

  @Get('groups')
  listGroups(@Req() req: AuthedRequest, @Param('workspaceId') ws: string) {
    return this.team.listGroups(ws, req.user.userId);
  }

  @Post('groups')
  createGroup(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Body() dto: CreateGroupDto) {
    return this.team.createGroup(ws, req.user.userId, dto.name, dto.description);
  }

  @Patch('groups/:groupId')
  updateGroup(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Param('groupId') groupId: string, @Body() dto: UpdateGroupDto) {
    return this.team.updateGroup(ws, req.user.userId, groupId, dto);
  }

  @Delete('groups/:groupId')
  deleteGroup(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Param('groupId') groupId: string) {
    return this.team.deleteGroup(ws, req.user.userId, groupId);
  }

  // ── Invites ──────────────────────────────────────────────────────────────

  @Post('invites')
  createInvite(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Body() dto: CreateInviteDto) {
    return this.team.createInvite(ws, req.user.userId, dto.role, dto.email);
  }

  @Get('invites')
  listInvites(@Req() req: AuthedRequest, @Param('workspaceId') ws: string) {
    return this.team.listInvites(ws, req.user.userId);
  }

  @Delete('invites/:inviteId')
  revokeInvite(@Req() req: AuthedRequest, @Param('workspaceId') ws: string, @Param('inviteId') inviteId: string) {
    return this.team.revokeInvite(ws, req.user.userId, inviteId);
  }
}
