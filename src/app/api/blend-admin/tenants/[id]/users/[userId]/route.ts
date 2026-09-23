import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

// Restablece la contraseña de un usuario de un tenant, desde
// /blend-admin/tenants/[id]. No existe forma de "ver" la contraseña actual
// (queda solo el hash, mismo criterio que el alta de un local nuevo) — esto
// es lo más parecido: el super-admin elige una nueva y se la pasa al local
// por otro medio (WhatsApp, etc.).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; userId: string } }
) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user || user.tenantId !== params.id) {
    return NextResponse.json({ error: "El usuario no existe." }, { status: 404 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
