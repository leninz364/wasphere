import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const NAME_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export const NAME_FONTS = ['sans', 'serif', 'mono', 'script', 'impact'] as const;

export class UpdateBrandingDto {
  @ApiPropertyOptional({
    description: 'Custom dashboard logo as a base64 image data URI (png/jpeg/webp/svg/gif). Empty string removes it. ~500KB max.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(700000)
  logo?: string;

  @ApiPropertyOptional({ description: 'Workspace display name.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ description: 'Sidebar name color as #rrggbb. Empty string resets to the theme default.' })
  @IsOptional()
  @IsString()
  @Matches(/^(#[0-9a-fA-F]{6})?$/, { message: 'nameColor must be a #rrggbb hex color' })
  nameColor?: string;

  @ApiPropertyOptional({ enum: NAME_SIZES, description: 'Sidebar name size. Empty string resets to the default.' })
  @IsOptional()
  @IsIn([...NAME_SIZES, ''])
  nameSize?: string;

  @ApiPropertyOptional({ enum: NAME_FONTS, description: 'Sidebar name font family. Empty string resets to the default.' })
  @IsOptional()
  @IsIn([...NAME_FONTS, ''])
  nameFont?: string;
}
