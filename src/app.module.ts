import { Module } from '@nestjs/common';
import { OpenPaymentsService } from './open-payments/open-payments.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';

/**
 * Módulo raíz. Registra:
 * - OpenPaymentsService: crea y comparte el cliente autenticado del SDK.
 * - PaymentsService:     contiene los pasos del flujo de pago.
 * - PaymentsController:  expone los endpoints HTTP.
 */
@Module({
  controllers: [PaymentsController],
  providers: [OpenPaymentsService, PaymentsService],
})
export class AppModule {}
