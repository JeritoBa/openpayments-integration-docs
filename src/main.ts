// Carga las variables del archivo .env en process.env ANTES de todo lo demás.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

/**
 * Punto de entrada de la aplicación.
 * - Crea la app NestJS.
 * - Sirve la carpeta /public (la página web index.html).
 * - Escucha en el puerto definido en .env.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(__dirname, '..', 'public'));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Servidor listo en http://localhost:${port}`);
}

bootstrap();
