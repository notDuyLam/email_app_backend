import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional } from 'class-validator';

export class ModifyEmailDto {
  @ApiProperty({
    description: 'Label IDs to add (e.g., ["STARRED", "UNREAD"])',
    example: ['STARRED'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addLabelIds?: string[];

  @ApiProperty({
    description: 'Label IDs to remove (e.g., ["UNREAD"] to mark as read)',
    example: ['UNREAD'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeLabelIds?: string[];
}

