import { IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyApiKeyDto {
  @IsString()
  @MinLength(17)
  @MaxLength(256)
  key!: string;
}
