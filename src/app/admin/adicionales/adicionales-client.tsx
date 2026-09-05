"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ModifierGroupDTO } from "@/types";
import GroupForm from "./group-form";

const TYPE_SHORT_LABELS: Record<string, string> = {
  SINGLE: "Único",
  MULTIPLE: "Múltiple",
  REMOVE: "Quitar",
};

export default function AdicionalesClient() {
  const [groups, setGroups] = useState<ModifierGroupDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModifierGroupDTO | null>(null);

  function load() {
    apiFetch<ModifierGroupDTO[]>("/api/admin/modifier-groups")
      .then(setGroups)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, []);

  function handleSaved() {
    setFormOpen(false);
    setEditing(null);
    load();
  }

  async function handleDelete(group: ModifierGroupDTO) {
    if (
      !confirm(
        `¿Eliminar "${group.name}"? Si está asignado a algún producto, se desasignará.`
      )
    )
      return;
    setError(null);
    try {
      await apiFetch(`/api/admin/modifier-groups/${group.id}`, {
        method: "DELETE",
      });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-navy-900">Adicionales</h2>
        {!formOpen && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700"
          >
            Nuevo grupo
          </button>
        )}
      </div>

      {formOpen && (
        <GroupForm
          initial={editing}
          onSaved={handleSaved}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {groups === null ? (
        <p className="text-neutral-500">Cargando...</p>
      ) : groups.length === 0 ? (
        <p className="text-neutral-500">Todavía no hay grupos de adicionales.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div>
                <p className="font-medium text-neutral-900">
                  {group.name}
                  {!group.active && (
                    <span className="ml-2 text-sm text-neutral-400">
                      (inactivo)
                    </span>
                  )}
                </p>
                <p className="text-sm text-neutral-500">
                  {TYPE_SHORT_LABELS[group.type]} · min {group.min} / max{" "}
                  {group.max} · {group.options.length} opción(es)
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEditing(group);
                    setFormOpen(true);
                  }}
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(group)}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
