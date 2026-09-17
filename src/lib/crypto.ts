import crypto from "crypto";

// Cifrado simétrico para secretos que hay que poder leer de vuelta (a
// diferencia de un password, que se hashea con bcrypt y nunca se
// desencripta). Hoy el único uso es el access/refresh token de Mercado Pago
// que cada local conecta vía OAuth — un secreto que puede mover dinero en
// su nombre, así que no se guarda en texto plano como bankAlias.
//
// AES-256-GCM: el output es un solo string base64 con IV + auth tag +
// ciphertext concatenados, para no tener que guardar tres columnas por
// secreto. El auth tag hace que un ciphertext manipulado falle al
// desencriptar en vez de devolver basura silenciosamente.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Falta ENCRYPTION_KEY — generala con: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY inválida — debe decodificar a 32 bytes en base64.");
  }
  return key;
}

export function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
