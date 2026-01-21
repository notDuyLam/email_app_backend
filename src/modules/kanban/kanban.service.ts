import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { KanbanColumn } from '../../entities/kanban-column.entity';
import { Label } from '../../entities/label.entity';
import {
  CreateKanbanColumnDto,
  UpdateKanbanColumnDto,
  KanbanColumnResponseDto,
} from './dto/kanban-column.dto';

export const DEFAULT_KANBAN_COLUMNS = [
  { name: 'Inbox', order: 0, isDefault: true },
  { name: 'To Do', order: 1, isDefault: true },
  { name: 'In Progress', order: 2, isDefault: true },
  { name: 'Done', order: 3, isDefault: true },
];

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(
    @InjectRepository(KanbanColumn)
    private readonly kanbanColumnRepository: Repository<KanbanColumn>,
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
    private readonly dataSource: DataSource,
  ) {}

  async getColumns(userId: number): Promise<KanbanColumnResponseDto[]> {
    const columns = await this.kanbanColumnRepository.find({
      where: { userId },
      relations: ['label'],
      order: { order: 'ASC' },
    });

    return columns.map((col) => this.mapToResponse(col));
  }

  async getColumnById(
    userId: number,
    columnId: number,
  ): Promise<KanbanColumnResponseDto> {
    const column = await this.kanbanColumnRepository.findOne({
      where: { id: columnId, userId },
      relations: ['label'],
    });

    if (!column) {
      throw new NotFoundException(`Column with ID ${columnId} not found`);
    }

    return this.mapToResponse(column);
  }

  async getDefaultColumn(userId: number): Promise<KanbanColumn | null> {
    return this.kanbanColumnRepository.findOne({
      where: { userId, name: 'Inbox', isDefault: true },
    });
  }

  async createColumn(
    userId: number,
    dto: CreateKanbanColumnDto,
  ): Promise<KanbanColumnResponseDto> {
    const existing = await this.kanbanColumnRepository.findOne({
      where: { userId, name: dto.name },
    });

    if (existing) {
      throw new BadRequestException(
        `Column with name "${dto.name}" already exists`,
      );
    }

    let order = dto.order;
    if (order === undefined) {
      const maxOrderResult = await this.kanbanColumnRepository
        .createQueryBuilder('col')
        .select('MAX(col.order)', 'maxOrder')
        .where('col.userId = :userId', { userId })
        .getRawOne();
      order = (maxOrderResult?.maxOrder ?? -1) + 1;
    }

    const column = this.kanbanColumnRepository.create({
      userId,
      name: dto.name,
      order,
      labelId: dto.labelId || null,
      isDefault: false,
    });

    const saved = await this.kanbanColumnRepository.save(column);
    this.logger.log(`Created kanban column "${dto.name}" for user ${userId}`);

    return this.mapToResponse(saved);
  }

  async updateColumn(
    userId: number,
    columnId: number,
    dto: UpdateKanbanColumnDto,
  ): Promise<KanbanColumnResponseDto> {
    const column = await this.kanbanColumnRepository.findOne({
      where: { id: columnId, userId },
    });

    if (!column) {
      throw new NotFoundException(`Column with ID ${columnId} not found`);
    }

    if (dto.name && dto.name !== column.name) {
      const existing = await this.kanbanColumnRepository.findOne({
        where: { userId, name: dto.name },
      });

      if (existing) {
        throw new BadRequestException(
          `Column with name "${dto.name}" already exists`,
        );
      }
    }

    if (dto.name !== undefined) column.name = dto.name;
    if (dto.order !== undefined) column.order = dto.order;
    if (dto.labelId !== undefined) column.labelId = dto.labelId;

    const saved = await this.kanbanColumnRepository.save(column);
    this.logger.log(`Updated kanban column ${columnId} for user ${userId}`);

    const updated = await this.kanbanColumnRepository.findOne({
      where: { id: saved.id },
      relations: ['label'],
    });

    return this.mapToResponse(updated!);
  }

  async deleteColumn(userId: number, columnId: number): Promise<void> {
    const column = await this.kanbanColumnRepository.findOne({
      where: { id: columnId, userId },
    });

    if (!column) {
      throw new NotFoundException(`Column with ID ${columnId} not found`);
    }

    if (column.isDefault) {
      throw new BadRequestException('Cannot delete default columns');
    }

    const inboxColumn = await this.getDefaultColumn(userId);
    if (inboxColumn) {
      await this.dataSource.query(
        `UPDATE emails SET "kanbanColumnId" = $1 WHERE "kanbanColumnId" = $2`,
        [inboxColumn.id, columnId],
      );
    }

    await this.kanbanColumnRepository.remove(column);
    this.logger.log(`Deleted kanban column ${columnId} for user ${userId}`);
  }

  async reorderColumns(
    userId: number,
    columnIds: number[],
  ): Promise<KanbanColumnResponseDto[]> {
    const columns = await this.kanbanColumnRepository.find({
      where: { userId },
    });

    const columnMap = new Map(columns.map((c) => [c.id, c]));

    for (const id of columnIds) {
      if (!columnMap.has(id)) {
        throw new BadRequestException(
          `Column ${id} not found or does not belong to user`,
        );
      }
    }

    const updates = columnIds.map((id, index) => {
      const column = columnMap.get(id)!;
      column.order = index;
      return column;
    });

    await this.kanbanColumnRepository.save(updates);
    this.logger.log(`Reordered ${columnIds.length} columns for user ${userId}`);

    return this.getColumns(userId);
  }

  async createDefaultColumnsForUser(userId: number): Promise<void> {
    const existing = await this.kanbanColumnRepository.count({
      where: { userId },
    });

    if (existing > 0) {
      this.logger.log(
        `User ${userId} already has kanban columns, skipping default creation`,
      );
      return;
    }

    const columns = DEFAULT_KANBAN_COLUMNS.map((col) =>
      this.kanbanColumnRepository.create({
        userId,
        name: col.name,
        order: col.order,
        isDefault: col.isDefault,
      }),
    );

    await this.kanbanColumnRepository.save(columns);
    this.logger.log(
      `Created ${columns.length} default kanban columns for user ${userId}`,
    );
  }

  private mapToResponse(column: KanbanColumn): KanbanColumnResponseDto {
    return {
      id: column.id,
      name: column.name,
      order: column.order,
      labelId: column.labelId,
      gmailLabelId: column.label?.gmailLabelId || null,
      isDefault: column.isDefault,
      createdAt: column.createdAt,
      updatedAt: column.updatedAt,
    };
  }
}
