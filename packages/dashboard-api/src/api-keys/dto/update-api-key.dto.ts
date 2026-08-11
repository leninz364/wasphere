import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateApiKeyDto {
  @ApiPropertyOptional({ example: 'Staging key', maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: ['messages:send'],
    description: 'Replace permission scopes. Use ["*"] for full access.',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissions?: string[];
  @ApiPropertyOptional({
    example: 'abc123',
    description: 'Restrict key to a single session ID. Pass null to remove restriction.',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  sessionId?: string | null;
}
