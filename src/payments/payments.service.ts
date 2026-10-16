import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  isFinalizedGrant,
  isPendingGrant,
  PendingGrant,
  Quote,
  WalletAddress,
} from '@interledger/open-payments';
import { OpenPaymentsService } from '../open-payments/open-payments.service';

/** Datos que guardamos mientras el emisor aprueba el pago en su wallet. */
interface PendingPayment {
  sender: WalletAddress;
  quote: Quote;
  grant: PendingGrant;
}

/**
 * Lógica del pago entre 2 personas usando Open Payments.
 *
 * El flujo tiene 2 fases:
 *  - startPayment():   pasos 1 a 5 (preparar y pedir permiso al emisor).
 *  - finishPayment():  pasos 6 y 7 (tras la aprobación, ejecutar el pago).
 */
@Injectable()
export class PaymentsService {
  /** "Base de datos" en memoria: id -> pago pendiente de aprobación. */
  private pending = new Map<string, PendingPayment>();

  constructor(private readonly op: OpenPaymentsService) {}

  /**
   * FASE 1: prepara el pago y devuelve la URL donde el emisor debe aprobarlo.
   * @param amount monto que recibirá el receptor, ej. "10.50"
   */
  async startPayment(amount: string): Promise<{ redirectUrl: string }> {
    const client = this.op.client;

    // PASO 1 — Descubrir las wallets.
    // Una wallet address es una URL pública que devuelve: su moneda (assetCode),
    // sus decimales (assetScale), su servidor de autorización (authServer)
    // y su servidor de recursos (resourceServer).
    const sender = await client.walletAddress.get({
      url: process.env.SENDER_WALLET_ADDRESS_URL!,
    });
    const receiver = await client.walletAddress.get({
      url: process.env.RECEIVER_WALLET_ADDRESS_URL!,
    });

    // PASO 2 — Pedir permiso (grant) para crear un "incoming payment" en el receptor.
    // No requiere interacción humana: recibir dinero no es riesgoso.
    const incomingGrant = await client.grant.request(
      { url: receiver.authServer },
      {
        access_token: {
          access: [{ type: 'incoming-payment', actions: ['create'] }],
        },
      },
    );
    if (!isFinalizedGrant(incomingGrant) || !incomingGrant.access_token) {
      throw new Error('Se esperaba un grant finalizado para incoming-payment');
    }

    // PASO 3 — Crear el incoming payment: una "cuenta de cobro" en la wallet
    // del receptor que dice "espero recibir X".
    // Los montos van en unidades mínimas: 10.50 USD con assetScale 2 => "1050".
    const incomingPayment = await client.incomingPayment.create(
      {
        url: receiver.resourceServer,
        accessToken: incomingGrant.access_token.value,
      },
      {
        walletAddress: receiver.id,
        incomingAmount: {
          assetCode: receiver.assetCode,
          assetScale: receiver.assetScale,
          value: Math.round(Number(amount) * 10 ** receiver.assetScale).toString(),
        },
      },
    );

    // PASO 4 — Pedir grant y crear una "quote" (cotización) en la wallet del emisor.
    // La quote responde: ¿cuánto se le debitará al emisor (debitAmount),
    // incluyendo comisiones y conversión de moneda, para que el receptor
    // reciba exactamente lo pedido (receiveAmount)?
    const quoteGrant = await client.grant.request(
      { url: sender.authServer },
      { access_token: { access: [{ type: 'quote', actions: ['create'] }] } },
    );
    if (!isFinalizedGrant(quoteGrant) || !quoteGrant.access_token) {
      throw new Error('Se esperaba un grant finalizado para quote');
    }

    const quote = await client.quote.create(
      { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
      { walletAddress: sender.id, receiver: incomingPayment.id, method: 'ilp' },
    );

    // PASO 5 — Pedir grant para "outgoing payment" (sacar dinero del emisor).
    // ESTE SÍ es interactivo: el dueño de la wallet debe aprobarlo en persona.
    // `limits.debitAmount` = el máximo que se podrá debitar (lo de la quote).
    // `interact.finish.uri` = a dónde vuelve el usuario tras aprobar.
    const id = randomUUID();
    const outgoingGrant = await client.grant.request(
      { url: sender.authServer },
      {
        access_token: {
          access: [
            {
              type: 'outgoing-payment',
              actions: ['create'],
              identifier: sender.id,
              limits: { debitAmount: quote.debitAmount },
            },
          ],
        },
        interact: {
          start: ['redirect'],
          finish: {
            method: 'redirect',
            uri: `${process.env.APP_URL}/payments/callback/${id}`,
            nonce: randomUUID(),
          },
        },
      },
    );
    if (!isPendingGrant(outgoingGrant)) {
      throw new Error('Se esperaba un grant pendiente (interactivo)');
    }

    // Guardamos lo necesario para continuar cuando el usuario regrese.
    this.pending.set(id, { sender, quote, grant: outgoingGrant });

    // URL de la wallet del emisor donde verá "¿Aprobar este pago?".
    return { redirectUrl: outgoingGrant.interact.redirect };
  }

  /**
   * FASE 2: el emisor ya aprobó; continuamos el grant y ejecutamos el pago.
   * @param id           identificador de nuestro pago pendiente
   * @param interactRef  referencia que la wallet agrega a la URL de retorno
   */
  async finishPayment(id: string, interactRef: string) {
    const client = this.op.client;
    const payment = this.pending.get(id);
    if (!payment) throw new Error('Pago no encontrado');

    // PASO 6 — Continuar el grant: canjeamos interact_ref por el access token final.
    const finalGrant = await client.grant.continue(
      {
        url: payment.grant.continue.uri,
        accessToken: payment.grant.continue.access_token.value,
      },
      { interact_ref: interactRef },
    );
    if (!isFinalizedGrant(finalGrant) || !finalGrant.access_token) {
      throw new Error('El grant no se finalizó');
    }

    // PASO 7 — Crear el outgoing payment: aquí se mueve el dinero de verdad.
    // Se usa la quote, así se debita exactamente lo cotizado.
    const outgoingPayment = await client.outgoingPayment.create(
      {
        url: payment.sender.resourceServer,
        accessToken: finalGrant.access_token.value,
      },
      { walletAddress: payment.sender.id, quoteId: payment.quote.id },
    );

    this.pending.delete(id);
    return outgoingPayment;
  }
}
