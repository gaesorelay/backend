import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 설정 추가
  app.enableCors({
    origin: '*', // 실제 배포 시에는 프론트엔드 도메인(예: http://localhost:5173)으로 제한해야 함
    credentials: true, // 쿠키/인증 헤더 허용
  });

  await app.listen(process.env.PORT ?? 8000, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
