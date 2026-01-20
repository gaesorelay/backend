import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // 브라우저에서 http://localhost:3000/test-redis 로 접속하면 실행됨
  @Get('test-redis')
  async testRedis() {
    return await this.appService.createTestRoom();
  }
}