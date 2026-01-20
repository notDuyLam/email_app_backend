import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateKanbanColumnDto {
  @ApiProperty({ description: 'Column name', example: 'My Custom Column' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Column order position', example: 4 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: 'Associated label ID for Gmail sync' })
  @IsNumber()
  @IsOptional()
  labelId?: number;
}

export class UpdateKanbanColumnDto {
  @ApiPropertyOptional({ description: 'Column name', example: 'Updated Name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Column order position', example: 2 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: 'Associated label ID for Gmail sync' })
  @IsNumber()
  @IsOptional()
  labelId?: number | null;
}

export class ReorderColumnsDto {
  @ApiProperty({
    description: 'Array of column IDs in the desired order',
    example: [1, 3, 2, 4],
  })
  @IsNumber({}, { each: true })
  columnIds: number[];
}

export class KanbanColumnResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Inbox' })
  name: string;

  @ApiProperty({ example: 0 })
  order: number;

  @ApiPropertyOptional({ example: null })
  labelId: number | null;

  @ApiPropertyOptional({ example: 'INBOX' })
  gmailLabelId?: string | null;

  @ApiProperty({ example: true })
  isDefault: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class KanbanColumnsListResponseDto {
  @ApiProperty({ type: [KanbanColumnResponseDto] })
  columns: KanbanColumnResponseDto[];
}
