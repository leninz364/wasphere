import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateWebhookDto {
  @ApiProperty({ example: 'Production alerts', maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

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

  @ApiProperty({ example: 'https://example.com/webhook' })
  @IsUrl({ require_tld: false }) // allow localhost in dev
  url!: string;

  @ApiPropertyOptional({
    description: 'Optional token sent as Authorization: Bearer <token>. Stored encrypted.',
    maxLength: 4096,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  @IsOptional()
  bearerToken?: string;

  @ApiProperty({
    example: ['message.sent', 'session.connected'],
    description: 'Event types to subscribe to. Use ["*"] for all events.',
  })
  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  retryMax?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Hold back message events while a human agent is handling the chat ' +
      '(attention EN_PROCESO). Defaults to true; turn off for integrations that ' +
      'need every message regardless of who is answering.',
  })
  @IsBoolean()
  @IsOptional()
  pauseOnHumanTakeover?: boolean;
}
