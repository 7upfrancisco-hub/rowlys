"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ModifierGroupDTO, ModifierType } from "@/types";

const TYPE_LABELS: Record<ModifierType, string> = {
  SINGLE: "Único (elige una opción)",
  MULTIPLE: "Múltiple (elige varias, con mínimo/máximo)",
  REMOVE: "Quitar (excluir ingredientes, siempre gratis)",
};

interface OptionRow {
  id?: string;
  title: string;
  price: number;
  active: boolean;
}

interface Props {
  initial: ModifierGroupDTO | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function GroupForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<ModifierType>(initial?.type ?? "SINGLE");
  const [min, setMin] = useState(initial?.min ?? 0);
  const [max, setMax] = useState(initial?.max ?? 1);
  const [active, setActive] = useState(initial?.active ?? true);
  const [options, setOptions] = useState<OptionRow[]>(
    initial?.options.map((o) => ({
      id: o.id,
      title: o.title,
      price: o.price,
      active: o.active,
    })) ?? [{ title: "", price: 0, active: true }]
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateOption(index: number, patch: Partial<OptionRow>) {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, ...patch } : opt))
    );
  }

  function addOption() {
    setOptions((prev) => [...prev, { title: "", price: 0, active: true }]);
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name,
        type,
        min,
        max,
        active,
        options: options
          .filter((o) => o.title.trim())
          .map((o) => ({
            id: o.id,
            title: o.title.trim(),
            price: o.price,
            active: o.active,
          })),
      };
      if (initial) {
        await apiFetch(`/api/admin/modifier-groups/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/admin/modifier-groups", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h3 className="font-semibold text-neutral-900">
        {initial ? "Editar grupo de adicionales" : "Nuevo grupo de adicionales"}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Nombre
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">Tipo</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ModifierType)}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Mínimo
          </label>
          <input
            type="number"
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Máximo
          </label>
          <input
            type="number"
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Activo
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-neutral-700">Opciones</p>
        <div className="flex flex-col gap-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={option.title}
                onChange={(e) => updateOption(index, { title: e.target.value })}
                placeholder="Título"
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={option.price}
                onChange={(e) =>
                  updateOption(index, { price: Number(e.target.value) })
                }
                placeholder="Precio"
                className="w-28 rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
              />
              <label className="flex items-center gap-1 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={option.active}
                  onChange={(e) =>
                    updateOption(index, { active: e.target.checked })
                  }
                />
                Activa
              </label>
              <button
                type="button"
                onClick={() => removeOption(index)}
                className="text-sm font-medium text-red-600 hover:underline"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addOption}
          className="mt-2 text-sm font-medium text-brand-600 hover:underline"
        >
          + Agregar opción
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {initial ? "Guardar cambios" : "Crear grupo"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
