import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { KanbanService } from './kanban.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import {
  CreateKanbanColumnDto,
  UpdateKanbanColumnDto,
  ReorderColumnsDto,
  KanbanColumnResponseDto,
  KanbanColumnsListResponseDto,
} from './dto/kanban-column.dto';

@ApiTags('kanban')
@ApiBearerAuth('JWT-auth')
@Controller('kanban')
@UseGuards(JwtAuthGuard)
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Get('columns')
  @ApiOperation({ summary: 'Get all kanban columns for the current user' })
  @ApiResponse({
    status: 200,
    description: 'List of kanban columns',
    type: KanbanColumnsListResponseDto,
  })
  async getColumns(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<KanbanColumnsListResponseDto> {
    const columns = await this.kanbanService.getColumns(user.userId);
    return { columns };
  }

  @Get('columns/:id')
  @ApiOperation({ summary: 'Get a specific kanban column by ID' })
  @ApiParam({ name: 'id', description: 'Column ID' })
  @ApiResponse({
    status: 200,
    description: 'Kanban column details',
    type: KanbanColumnResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Column not found' })
  async getColumn(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) columnId: number,
  ): Promise<KanbanColumnResponseDto> {
    return this.kanbanService.getColumnById(user.userId, columnId);
  }

  @Post('columns')
  @ApiOperation({ summary: 'Create a new kanban column' })
  @ApiBody({ type: CreateKanbanColumnDto })
  @ApiResponse({
    status: 201,
    description: 'Column created successfully',
    type: KanbanColumnResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Column name already exists' })
  async createColumn(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateKanbanColumnDto,
  ): Promise<KanbanColumnResponseDto> {
    return this.kanbanService.createColumn(user.userId, dto);
  }

  @Put('columns/:id')
  @ApiOperation({ summary: 'Update a kanban column' })
  @ApiParam({ name: 'id', description: 'Column ID' })
  @ApiBody({ type: UpdateKanbanColumnDto })
  @ApiResponse({
    status: 200,
    description: 'Column updated successfully',
    type: KanbanColumnResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Column not found' })
  async updateColumn(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) columnId: number,
    @Body() dto: UpdateKanbanColumnDto,
  ): Promise<KanbanColumnResponseDto> {
    return this.kanbanService.updateColumn(user.userId, columnId, dto);
  }

  @Delete('columns/:id')
  @ApiOperation({ summary: 'Delete a kanban column' })
  @ApiParam({ name: 'id', description: 'Column ID' })
  @ApiResponse({
    status: 200,
    description: 'Column deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Cannot delete default columns' })
  @ApiResponse({ status: 404, description: 'Column not found' })
  async deleteColumn(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) columnId: number,
  ): Promise<{ message: string }> {
    await this.kanbanService.deleteColumn(user.userId, columnId);
    return { message: 'Column deleted successfully' };
  }

  @Post('columns/reorder')
  @ApiOperation({ summary: 'Reorder kanban columns' })
  @ApiBody({ type: ReorderColumnsDto })
  @ApiResponse({
    status: 200,
    description: 'Columns reordered successfully',
    type: KanbanColumnsListResponseDto,
  })
  async reorderColumns(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReorderColumnsDto,
  ): Promise<KanbanColumnsListResponseDto> {
    const columns = await this.kanbanService.reorderColumns(user.userId, dto.columnIds);
    return { columns };
  }
}
