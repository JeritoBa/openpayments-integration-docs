import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AuthenticatedClient,
  createAuthenticatedClient,
} from '@interledger/open-payments';

/**
 * Crea UNA sola vez el cliente autenticado de Open Payments y lo comparte.
 *
 * ¿Por qué "autenticado"? Cada petición que hace tu app a un servidor de
 * Open Payments va FIRMADA con tu llave privada (HTTP Message Signatures).
 * El servidor verifica la firma con tu llave pública, que vive publicada
 * en tu wallet address. Así sabe qué aplicación le está hablando.
 */
@Injectable()
export class OpenPaymentsService implements OnModuleInit {
  client!: AuthenticatedClient;

  /** NestJS ejecuta este método al iniciar el módulo. */
  async onModuleInit(): Promise<void> {
    this.client = await createAuthenticatedClient({
      walletAddressUrl: process.env.CLIENT_WALLET_ADDRESS_URL!, // identidad de la app
      keyId: process.env.KEY_ID!, // qué llave pública debe usar el servidor
      privateKey: process.env.PRIVATE_KEY_PATH!, // ruta a private.key para firmar
    });
  }
}
