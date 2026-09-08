# Impresión de comandas (QZ Tray)

Blend imprime **dos tickets por pedido** en una comandera térmica:

1. **Comanda** (cocina/local): pedido completo — Nº, canal, cliente, ítems con
   adicionales y notas, total y medio de pago.
2. **Ticket del cliente**: nombre del local arriba, detalle de lo comprado con
   precios y un "¡Gracias por su compra!".

En ambos, arriba va el nombre del local (el de **Configuración → Nombre del
local**) y abajo, chico, "gestionado con Blend".

Blend corre en la nube, así que **no puede hablar directo con la impresora**. El
puente es [QZ Tray](https://qz.io/): una appcita gratis que se instala en la PC
del local y expone un WebSocket que la página de `/comanda` usa para imprimir.

---

## 1. Hardware

Cualquier **comandera térmica de 80mm que hable ESC/POS** (USB o de red). Marcas
comunes: 3nStar, PideAquí, Xprinter, genéricas. Instalá su driver en Windows como
cualquier impresora (idealmente el driver "Generic / Text Only" o el del
fabricante).

## 2. Instalar QZ Tray en la PC del local

1. Bajá QZ Tray de <https://qz.io/download/> e instalalo.
2. Que quede **abierto** (ícono en la bandeja del sistema). Conviene ponerlo en
   inicio automático de Windows.
3. QZ Tray instala su propio certificado local para que la página HTTPS pueda
   conectarse a `wss://localhost:8181` — no hay que tocar nada.

## 3. Certificado de firma (para que NO pregunte en cada impresión)

Sin esto, QZ Tray muestra un cartel "Permitir / Bloquear" en cada ticket. Con el
par certificado + clave, las impresiones salen solas.

En cualquier PC con OpenSSL:

```bash
openssl req -x509 -newkey rsa:2048 -keyout private-key.pem \
  -out digital-certificate.txt -days 7300 -nodes \
  -subj "/CN=Blend/O=Blend"
```

Quedan dos archivos:

- `digital-certificate.txt` → contenido va en la env var **`QZ_CERT`**.
- `private-key.pem` → contenido va en la env var **`QZ_PRIVATE_KEY`**.

### 3a. Cargar el certificado en QZ Tray

En la PC del local, copiá `digital-certificate.txt` a la carpeta de override de
QZ Tray para que confíe en él sin preguntar:

```
C:\Program Files\QZ Tray\demo\assets\override.crt
```

(o desde QZ Tray → bandeja → **Advanced → Site Manager → Allowed**, y agregá el
sitio de Blend).

### 3b. Cargar las env vars en Vercel

En el proyecto de Vercel → **Settings → Environment Variables**:

| Nombre            | Valor                                    |
| ----------------- | ---------------------------------------- |
| `QZ_CERT`         | contenido completo de `digital-certificate.txt` |
| `QZ_PRIVATE_KEY`  | contenido completo de `private-key.pem`  |

Pegá el texto tal cual, con los saltos de línea. Redeploy después de guardarlas.

## 4. Elegir la impresora en Blend

1. Entrá a `/comanda` **desde la PC del local** (la impresora es por-PC).
2. Click en el ícono 🖨️ del encabezado.
3. **Buscar** → elegí la comandera de la lista.
4. Tildá **"Imprimir automáticamente al aceptar un pedido"** si querés que salga
   sola al tocar ✓.
5. **Imprimir prueba** para confirmar.

El puntito del ícono 🖨️: verde = QZ Tray conectado, ámbar = hay impresora
elegida pero QZ Tray no responde, gris = sin configurar.

---

## Notas

- **Auto-impresión**: se dispara al **aceptar** un pedido (✓ / paso a
  Confirmado). Los pedidos cargados a mano desde la comanda ya nacen aceptados;
  esos se imprimen con **⋯ → Imprimir tickets** en la tarjeta.
- **Reimpresión**: desde el historial (`/admin/pedidos`) → **⋯ → Imprimir
  comanda**. Usa la comandera si está configurada en esa PC; si no, abre el
  popup de impresión del navegador.
- Si la comandera está sin papel o apagada, el ticket falla y aparece un aviso
  ámbar en `/comanda`. No hay reintento automático: se reimprime a mano.
- **Sin `QZ_CERT` / `QZ_PRIVATE_KEY`**: igual funciona, pero QZ Tray pide
  confirmación manual en cada impresión.
