import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationStatusFilter } from './list-conversations-query.dto';

export enum AttentionStatusValue {
  PENDIENTE = 'PENDIENTE',
  EN_PROCESO = 'EN_PROCESO',
  ATENDIDO = 'ATENDIDO',
  SOLUCIONADO = 'SOLUCIONADO',
}

export class PatchConversationDto {
  @ApiPropertyOptional({ enum: ConversationStatusFilter })
  @IsOptional()
  @IsEnum(ConversationStatusFilter)
  status?: ConversationStatusFilter;

  @ApiPropertyOptional({
    enum: AttentionStatusValue,
    description: 'Agent attention state. SOLUCIONADO also resolves the conversation.',
  })
  @IsOptional()
  @IsEnum(AttentionStatusValue)
  attention?: AttentionStatusValue;

  @ApiPropertyOptional({ type: [String], description: 'Replaces the conversation tag list' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Private operator notes about this customer' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Delegate this chat to an agent group (uuid). null clears the delegation.',
    nullable: true,
  })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsUUID()
  delegatedGroupId?: string | null;

  @ApiPropertyOptional({
    description:
      'Delegate (reserve) this chat directly to a specific agent (uuid). ' +
      'The chat goes to PENDIENTE and becomes exclusive to that agent. null clears it.',
    nullable: true,
  })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsUUID()
  delegatedToUserId?: string | null;

  @ApiPropertyOptional({
    description: 'Optional note attached to a delegation, shown to the target agent.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  delegationNote?: string;
}
