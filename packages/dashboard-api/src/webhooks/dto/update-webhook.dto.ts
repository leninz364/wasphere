import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateWebhookDto {
  @ApiPropertyOptional({ example: 'Staging alerts', maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'API key linked to this agent connection.',
  })
  @IsUUID()
  @IsOptional()
  apiKeyId?: string;

  @ApiPropertyOptional({
    description: 'Connection provider used by the simplified Connections UI.',
    enum: ['generic', 'n8n', 'other'],
  })
  @IsIn(['generic', 'n8n', 'other'])
  @IsOptional()
  provider?: 'generic' | 'n8n' | 'other';

  @ApiPropertyOptional({ example: 'https://staging.example.com/webhook' })
  @IsUrl({ require_tld: false })
  @IsOptional()
  url?: string;

  @ApiPropertyOptional({
    description: 'Replace the encrypted token sent as Authorization: Bearer <token>.',
    maxLength: 4096,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  @IsOptional()
  bearerToken?: string;

  @ApiPropertyOptional({ description: 'Remove the stored outbound Bearer token.' })
  @IsBoolean()
  @IsOptional()
  clearBearerToken?: boolean;

  @ApiPropertyOptional({
    example: ['message.sent'],
    description: 'Replace event subscriptions. Use ["*"] for all events.',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  events?: string[];

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  retryMax?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'Hold back message events while a human agent is handling the chat ' +
      '(attention EN_PROCESO).',
  })
  @IsBoolean()
  @IsOptional()
  pauseOnHumanTakeover?: boolean;
}
