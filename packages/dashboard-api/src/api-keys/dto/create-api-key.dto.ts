import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production key', maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @ApiProperty({
    example: ['messages:send', 'sessions:read'],
    description: 'Permission scopes. Use ["*"] for full access.',
  })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({
    example: 'abc123',
    description: 'Restrict key to a single session ID.',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;
}
