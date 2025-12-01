import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

class AttachmentDto {
  @ApiProperty({ description: 'Filename of the attachment' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ description: 'Base64 encoded content of the attachment' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: 'MIME type of the attachment' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;
}

export class ReplyEmailDto {
  @ApiProperty({
    description: 'Reply body (HTML or plain text)',
    example: '<p>This is my reply</p>',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({
    description: 'Email attachments',
    type: [AttachmentDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  attachments?: AttachmentDto[];
}

