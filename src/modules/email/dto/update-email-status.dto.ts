import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { KanbanStatus } from '../../../entities/email-status.entity';

export class UpdateEmailStatusDto {
  @ApiProperty({
    description: 'Kanban column status',
    enum: KanbanStatus,
    example: KanbanStatus.TODO,
  })
  @IsNotEmpty()
  @IsEnum(KanbanStatus, {
    message: 'Status must be one of: inbox, todo, in-progress, done, snoozed',
  })
  status: KanbanStatus;
}

