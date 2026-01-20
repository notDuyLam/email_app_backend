import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KanbanColumn } from '../../entities/kanban-column.entity';
import { Label } from '../../entities/label.entity';
import { KanbanService } from './kanban.service';
import { KanbanController } from './kanban.controller';

@Module({
  imports: [TypeOrmModule.forFeature([KanbanColumn, Label])],
  controllers: [KanbanController],
  providers: [KanbanService],
  exports: [KanbanService],
})
export class KanbanModule {}
