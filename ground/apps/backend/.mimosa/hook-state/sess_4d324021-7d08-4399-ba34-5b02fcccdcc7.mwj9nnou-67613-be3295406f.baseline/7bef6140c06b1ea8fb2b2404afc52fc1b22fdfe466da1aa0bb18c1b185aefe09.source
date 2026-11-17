import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import {
  CreateLlmModelDto,
  CreateLlmProviderDto,
  ListRemoteModelsDto,
  ProbeLlmDto,
  UpdateLlmModelDto,
  UpdateLlmProviderDto,
} from './dto/llm-provider.dto';
import { LlmProvidersService } from './llm-providers.service';

@Controller('admin/llm-providers')
@UseGuards(JwtGuard)
export class AdminLlmProvidersController {
  constructor(private llm: LlmProvidersService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.llm.list(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateLlmProviderDto) {
    return this.llm.create(user, dto);
  }

  /** 连通探测（已存或草稿）。须在 :id 路由之前。 */
  @Post('probe')
  probe(@CurrentUser() user: User, @Body() dto: ProbeLlmDto) {
    return this.llm.probe(user, dto);
  }

  /** 拉取上游模型列表（表单草稿或已存厂商）。须在 :id 路由之前。 */
  @Post('list-models')
  listModels(@CurrentUser() user: User, @Body() dto: ListRemoteModelsDto) {
    return this.llm.listRemoteModels(user, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.llm.get(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateLlmProviderDto) {
    return this.llm.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.llm.remove(user, id);
  }

  @Post(':id/models')
  addModel(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CreateLlmModelDto,
  ) {
    return this.llm.addModel(user, id, dto);
  }
}

@Controller('admin/llm-models')
@UseGuards(JwtGuard)
export class AdminLlmModelsController {
  constructor(private llm: LlmProvidersService) {}

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateLlmModelDto) {
    return this.llm.updateModel(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.llm.removeModel(user, id);
  }
}
