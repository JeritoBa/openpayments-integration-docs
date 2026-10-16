# Open Payments + NestJS: pago entre 2 personas

Proyecto mínimo para aprender cómo funciona la API **Open Payments** de Interledger.
La persona **A** (emisor) le envía dinero a la persona **B** (receptor).

---

## 1. ¿Qué es Open Payments?

Es un **estándar de API** (HTTP + JSON) para mover dinero entre cuentas, aunque estén en proveedores distintos o usen monedas distintas. Por debajo, el dinero viaja por la red **Interledger (ILP)**.

Tu aplicación **nunca toca el dinero**. Solo le pide a la wallet de cada persona que haga algo, y para eso necesita **permiso**.

## 2. Conceptos clave (lo único que necesitas memorizar)

| Concepto | Qué es |
|---|---|
| **Wallet address** | URL pública de una cuenta, ej. `https://ilp.interledger-test.dev/ana`. Al consultarla devuelve su moneda (`assetCode`), sus decimales (`assetScale`), su `authServer` y su `resourceServer`. |
| **Authorization Server** (`authServer`) | Entrega **grants** (permisos). Usa el protocolo **GNAP**. |
| **Resource Server** (`resourceServer`) | Donde se crean los recursos: incoming payments, quotes y outgoing payments. |
| **Grant** | Permiso con un `access_token` para hacer una acción concreta. |
| **Incoming payment** | "Cuenta de cobro" en la wallet del **receptor**: "espero recibir X". |
| **Quote** | Cotización en la wallet del **emisor**: cuánto se le debitará (`debitAmount`) para que el receptor reciba lo pedido (`receiveAmount`). Incluye comisiones y conversión de moneda. |
| **Outgoing payment** | La orden de pago en la wallet del **emisor**. Aquí **se mueve el dinero**. |
| **Grant interactivo** | El grant de outgoing payment requiere que el dueño de la wallet lo **apruebe en persona** (redirección a su wallet). |
| **Montos** | Siempre en unidades mínimas y como string: `10.50 USD` con `assetScale: 2` → `"1050"`. |

**Seguridad:** cada petición de tu app va **firmada** con tu llave privada (*HTTP Message Signatures*). El servidor la verifica con tu llave pública, que está publicada en tu wallet address. El SDK `@interledger/open-payments` hace esto por ti.

## 3. El flujo completo (7 pasos)

```
 Navegador            Tu backend (NestJS)            Wallet RECEPTOR (B)     Wallet EMISOR (A)
     │ POST /payments        │                               │                      │
     │──────────────────────>│ 1. GET wallet addresses ─────>│─────────────────────>│
     │                       │ 2. grant incoming-payment ───>│ (sin interacción)    │
     │                       │ 3. crear incoming payment ───>│                      │
     │                       │ 4. grant quote + crear quote ────────────────────────>│
     │                       │ 5. grant outgoing-payment ───────────────────────────>│ (interactivo)
     │<── redirectUrl ───────│                                                      │
     │──── usuario A aprueba el pago en su wallet ─────────────────────────────────>│
     │<─── redirige a /payments/callback/:id?interact_ref=... ──────────────────────│
     │──────────────────────>│ 6. continuar grant (interact_ref → access token) ────>│
     │                       │ 7. crear outgoing payment ──────────────────────────>│ 💸 dinero A → B
     │<── resultado JSON ────│                                                      │
```

¿Por qué solo el paso 5 es interactivo? **Recibir** dinero no es riesgoso; **sacar** dinero de una cuenta sí, por eso su dueño debe autorizarlo.

## 4. Por dónde empezar a leer el código

Lee los archivos en este orden:

| # | Archivo | Qué aprendes |
|---|---|---|
| 1 | `.env` | Qué datos necesita una app de Open Payments. |
| 2 | `src/open-payments/open-payments.service.ts` | Cómo se crea el **cliente autenticado** (llave + keyId). |
| 3 | `src/payments/payments.service.ts` | ⭐ **El corazón**: los 7 pasos, comentados uno por uno. |
| 4 | `src/payments/payments.controller.ts` | Los 2 endpoints: iniciar pago y callback de la wallet. |
| 5 | `public/index.html` | El frontend: formulario + redirección. |
| 6 | `src/main.ts`, `src/app.module.ts` | Arranque estándar de NestJS. |

## 5. Configuración (paso a paso)

1. Crea una cuenta en la wallet de pruebas: **https://wallet.interledger-test.dev** (dinero ficticio).
2. Crea **2 cuentas/wallet addresses**: una para el emisor y otra para el receptor. Deposita saldo de prueba en la del emisor.
3. Ve a **Settings → Developer Keys**, genera una llave y:
   - Copia el **Key ID** → `KEY_ID`.
   - Descarga el archivo **private.key** y colócalo en la raíz del proyecto → `PRIVATE_KEY_PATH=./private.key`.
   - La wallet address asociada a esa llave → `CLIENT_WALLET_ADDRESS_URL`.
4. Completa `SENDER_WALLET_ADDRESS_URL` y `RECEIVER_WALLET_ADDRESS_URL` en `.env`.

> Puedes usar la misma wallet address del emisor como `CLIENT_WALLET_ADDRESS_URL`.

## 6. Ejecutar

```bash
npm install
npm run start:dev
```

Abre **http://localhost:3000**, escribe un monto y pulsa **Pagar**. Serás redirigido a la wallet del emisor para aprobar; al aceptar, volverás a la app y verás el `outgoingPayment` en JSON. Revisa el saldo de ambas cuentas en la wallet de pruebas.

## 7. Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/payments` | Body `{ "amount": "1.00" }`. Ejecuta pasos 1–5 y devuelve `{ redirectUrl }`. |
| `GET` | `/payments/callback/:id` | La wallet redirige aquí. Ejecuta pasos 6–7. |

## 8. Simplificaciones intencionales (no usar así en producción)

- Los pagos pendientes se guardan **en memoria** (se pierden al reiniciar).
- No se valida el parámetro `hash` del callback (en producción se verifica para evitar falsificaciones).
- Sin validación de entrada ni manejo de errores elaborado.

## 9. Para seguir estudiando

- Documentación oficial: https://openpayments.dev
- SDK de Node: https://github.com/interledger/open-payments
- Interledger: https://interledger.org
