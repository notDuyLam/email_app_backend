import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEmailStatusDto {
  @ApiProperty({
    description: 'Kanban column status (can be custom column ID)',
    example: 'todo',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  status: string;

  @ApiProperty({
    description: 'Gmail label ID to sync (optional)',
    example: 'STARRED',
    required: false,
  })
  @IsOptional()
  @IsString()
  gmailLabelId?: string;

  @ApiProperty({
    description: 'Previous Gmail label ID to remove (optional)',
    example: 'INBOX',
    required: false,
  })
  @IsOptional()
  @IsString()
  oldGmailLabelId?: string;
}

