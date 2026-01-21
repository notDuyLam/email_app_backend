import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SortOption } from '../../search/search.service';

export class EmailSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  q: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 20;

  // Filtering options (F3)
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  unreadOnly?: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  hasAttachment?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  sender?: string;

  @IsString()
  @IsOptional()
  status?: string;

  // Sorting options (F3)
  @IsEnum(SortOption)
  @IsOptional()
  sort?: SortOption = SortOption.RELEVANCE;
}
