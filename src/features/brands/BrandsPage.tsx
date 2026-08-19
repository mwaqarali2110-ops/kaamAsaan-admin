import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FiEdit2, FiImage, FiPlus, FiSearch } from "react-icons/fi";
import { z } from "zod";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { StorageImage } from "../../components/StorageImage";
import { StatusBadge } from "../../components/StatusBadge";
import { displayBrandName } from "../../lib/brand";
import { normalizePublicStorageUrl, uploadPublicFile } from "../../lib/storage";
import { supabase } from "../../lib/supabase";
import { errorMessage, slugify } from "../../lib/utils";
import type { Brand } from "../../types/database";

const schema = z.object({
  name: z.string().min(2, "Brand name is required."),
  slug: z.string().min(2, "Brand slug is required."),
  aliases: z.string(),
  logo_url: z.string().nullable(),
  package_image_url: z.string().nullable(),
  default_compatibility_group: z.string().nullable(),
  priority: z.coerce.number().int().min(0),
  is_active: z.boolean(),
  package_generation_enabled: z.boolean(),
});

type Values = z.infer<typeof schema>;
type InputValues = z.input<typeof schema>;

const emptyValues: InputValues = {
  name: "",
  slug: "",
  aliases: "",
  logo_url: "",
  package_image_url: "",
  default_compatibility_group: "",
  priority: 0,
  is_active: true,
  package_generation_enabled: false,
};

const parseAliases = (value: string) => [
  ...new Set(
    value
      .split(/[,\n]+/)
      .map((alias) => alias.trim().toLowerCase())
      .filter(Boolean),
  ),
];

async function fetchBrands() {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("priority", { ascending: false })
    .order("name");
  if (error) throw error;
  return data as Brand[];
}

export function BrandsPage() {
  const client = useQueryClient();
  const brands = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Brand | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<"logo" | "package" | null>(null);
  const form = useForm<InputValues, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            slug: editing.slug,
            aliases: (editing.aliases ?? []).join(", "),
            logo_url: editing.logo_url ?? "",
            package_image_url: editing.package_image_url ?? "",
            default_compatibility_group:
              editing.default_compatibility_group ?? "",
            priority: editing.priority ?? 0,
            is_active: editing.is_active,
            package_generation_enabled:
              editing.package_generation_enabled ?? false,
          }
        : emptyValues,
    );
  }, [editing, form, open]);

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const payload = {
        name: values.name.trim(),
        slug: slugify(values.slug),
        aliases: parseAliases(values.aliases),
        logo_url:
          normalizePublicStorageUrl("brand-logos", values.logo_url) || null,
        package_image_url:
          normalizePublicStorageUrl("brand-logos", values.package_image_url) ||
          null,
        default_compatibility_group:
          values.default_compatibility_group?.trim().toUpperCase() || null,
        priority: values.priority,
        is_active: values.is_active,
        package_generation_enabled: values.package_generation_enabled,
        ...(!editing ? { category: null } : {}),
      };
      const request = editing
        ? supabase.from("brands").update(payload).eq("id", editing.id)
        : supabase.from("brands").insert(payload);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["brands"] });
      setOpen(false);
    },
    onError: (reason) => setMessage(errorMessage(reason)),
  });

  const toggle = useMutation({
    mutationFn: async (brand: Brand) => {
      const { error } = await supabase
        .from("brands")
        .update({ is_active: !brand.is_active })
        .eq("id", brand.id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["brands"] }),
  });

  async function upload(kind: "logo" | "package", file?: File) {
    if (!file) return;
    setUploading(kind);
    setMessage("");
    try {
      const url = await uploadPublicFile("brand-logos", file);
      form.setValue(kind === "logo" ? "logo_url" : "package_image_url", url, {
        shouldDirty: true,
      });
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setUploading(null);
    }
  }

  const filtered = (brands.data ?? []).filter((brand) => {
    const term = search.toLowerCase();
    return `${brand.name} ${brand.slug} ${(brand.aliases ?? []).join(" ")}`
      .toLowerCase()
      .includes(term);
  });

  const openForm = (brand?: Brand) => {
    setEditing(brand ?? null);
    setMessage("");
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Brand Manager"
        description="Configure aliases, compatibility defaults, package images, and live package-generation state."
        action={
          <button className="btn-primary" onClick={() => openForm()}>
            <FiPlus /> Add brand
          </button>
        }
      />
      <div className="panel mb-4 p-3">
        <label className="relative block">
          <FiSearch className="absolute left-3 top-3 text-slate-400" />
          <input
            className="field pl-9"
            placeholder="Search brands or aliases"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <section className="panel overflow-hidden">
        {brands.isLoading ? (
          <LoadingState />
        ) : brands.error ? (
          <ErrorState message={brands.error.message} />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Package family</th>
                  <th className="px-4 py-3">Package generation</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((brand) => (
                  <tr key={brand.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <StorageImage
                          bucket="brand-logos"
                          value={brand.logo_url}
                          className="h-10 w-10 rounded-md border object-contain p-1"
                          alt={brand.name}
                          fallback={
                            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 font-bold">
                              {displayBrandName(brand.name)[0]}
                            </div>
                          }
                        />
                        <div>
                          <div className="font-bold">
                            {displayBrandName(brand.name)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {brand.aliases?.join(", ") || brand.slug}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-700">
                        {brand.default_compatibility_group || "Per product"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Priority {brand.priority ?? 0}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${brand.package_generation_enabled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                      >
                        {brand.package_generation_enabled ? "Live" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggle.mutate(brand)}>
                        <StatusBadge active={brand.is_active} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="btn-secondary px-3"
                        onClick={() => openForm(brand)}
                        aria-label={`Edit ${brand.name}`}
                      >
                        <FiEdit2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal
        title={editing ? "Edit brand" : "Add brand"}
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
      >
        {message && (
          <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {message}
          </div>
        )}
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <Field label="Brand name">
            <input
              className="field mt-2"
              {...form.register("name")}
              onBlur={(event) =>
                !form.getValues("slug") &&
                form.setValue("slug", slugify(event.target.value))
              }
            />
          </Field>
          <Field label="Brand slug">
            <input className="field mt-2" {...form.register("slug")} />
          </Field>
          <Field
            label="Aliases"
            hint="Comma-separated, for example: kstar, k-star, k star"
          >
            <input className="field mt-2" {...form.register("aliases")} />
          </Field>
          <Field
            label="Default compatibility group"
            hint="Optional, for example: KSTAR-HV"
          >
            <input
              className="field mt-2 uppercase"
              placeholder="BRAND-HV"
              {...form.register("default_compatibility_group")}
            />
          </Field>
          <Field label="Brand priority">
            <input
              className="field mt-2"
              type="number"
              min="0"
              {...form.register("priority")}
            />
          </Field>
          <div />
          <Field
            label="Brand logo"
            hint={
              uploading === "logo"
                ? "Uploading..."
                : "Used in product and brand views"
            }
          >
            <input
              className="field mt-2"
              type="file"
              accept="image/*"
              onChange={(event) => upload("logo", event.target.files?.[0])}
            />
          </Field>
          <Field
            label="Package card image"
            hint={
              uploading === "package"
                ? "Uploading..."
                : "Shown on generated package cards"
            }
          >
            <input
              className="field mt-2"
              type="file"
              accept="image/*"
              onChange={(event) => upload("package", event.target.files?.[0])}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" {...form.register("is_active")} /> Active
            brand
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              {...form.register("package_generation_enabled")}
            />{" "}
            Enable live package generation
          </label>
          <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <FiImage className="mr-1 inline" /> Keep package generation disabled
            while adding and previewing products. Enable it only when the brand
            is ready for customers.
          </div>
          <div className="md:col-span-2 flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={Boolean(uploading) || save.isPending}
            >
              {save.isPending ? "Saving..." : "Save brand"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-bold text-ink">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}
