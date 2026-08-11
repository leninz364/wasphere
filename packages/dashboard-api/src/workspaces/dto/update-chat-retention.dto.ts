import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateChatRetentionDto {
  @ApiPropertyOptional({
    description:
      'Number of days a resolved (SOLUCIONADO/RESOLVED) chat remains visible before it is automatically archived. Null or 0 disables auto-archiving.',
    minimum: 0,
    maximum: 3650,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'chatRetentionResolvedDays must be an integer' })
  @Min(0)
  @Max(3650)
  chatRetentionResolvedDays?: number | null;

  @ApiPropertyOptional({
    description:
      'Number of days an archived chat is kept before it is permanently deleted. Null or 0 disables auto-deletion.',
    minimum: 0,
    maximum: 3650,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'chatRetentionArchivedDays must be an integer' })
  @Min(0)
  @Max(3650)
  chatRetentionArchivedDays?: number | null;
}
