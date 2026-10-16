import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Endpoints HTTP del pago. Solo traduce HTTP <-> PaymentsService.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * POST /payments  body: { "amount": "10.50" }
   * Inicia el pago y devuelve la URL donde el emisor debe aprobarlo.
   */
  @Post()
  start(@Body('amount') amount: string) {
    return this.payments.startPayment(amount);
  }

  /**
   * GET /payments/callback/:id?interact_ref=...&hash=...
   * La wallet del emisor redirige aquí después de que aprueba o rechaza.
   * Si aprobó, trae `interact_ref`; si rechazó, trae `result=grant_rejected`.
   */
  @Get('callback/:id')
  async callback(
    @Param('id') id: string,
    @Query('interact_ref') interactRef?: string,
  ) {
    if (!interactRef) return { status: 'Pago rechazado por el emisor' };

    const outgoingPayment = await this.payments.finishPayment(id, interactRef);
    return { status: 'Pago enviado', outgoingPayment };
  }
}
