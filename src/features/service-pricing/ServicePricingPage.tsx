import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { errorMessage } from "../../lib/utils";
import type { ServicePricingSettings } from "../../types/database";

type FormValues = {
  transportation_charge: string;
  product_installation_charge: string;
  cleaning_base_visit_charge: string;
  cleaning_standard_rate_per_kw: string;
  cleaning_elevated_rate_per_kw: string;
  cleaning_elevated_height_rate: string;
  cleaning_minimum_charge: string;
  cleaning_tax_rate: string;
};

const fieldsFromSettings = (settings: ServicePricingSettings): FormValues => ({
  transportation_charge: String(settings.transportation_charge),
  product_installation_charge: String(settings.product_installation_charge),
  cleaning_base_visit_charge: String(settings.cleaning_base_visit_charge),
  cleaning_standard_rate_per_kw: String(settings.cleaning_standard_rate_per_kw),
  cleaning_elevated_rate_per_kw: String(settings.cleaning_elevated_rate_per_kw),
  cleaning_elevated_height_rate: String(settings.cleaning_elevated_height_rate),
  cleaning_minimum_charge: String(settings.cleaning_minimum_charge),
  cleaning_tax_rate: String(settings.cleaning_tax_rate),
});

async function fetchSettings() {
  const { data, error } = await supabase.from("service_pricing_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  return data as ServicePricingSettings | null;
}

export function ServicePricingPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["service-pricing-settings"], queryFn: fetchSettings });
  const [form, setForm] = useState<FormValues | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (query.data) setForm(fieldsFromSettings(query.data));
  }, [query.data]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, Number(value)]),
      );
      const { error } = await supabase.from("service_pricing_settings").update(payload).eq("id", true);
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["service-pricing-settings"] });
      setMessage("Service pricing saved.");
    },
    onError: (reason) => setMessage(errorMessage(reason)),
  });

  const field = (key: keyof FormValues) => ({
    value: form?.[key] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => (current ? { ...current, [key]: event.target.value } : current)),
  });

  if (query.isLoading || !form) return <><PageHeader title="Service Pricing" description="Adjust global transportation, installation and cleaning charges used across the mobile app." /><LoadingState /></>;
  if (query.error) return <><PageHeader title="Service Pricing" description="Adjust global transportation, installation and cleaning charges used across the mobile app." /><ErrorState message={query.error.message} /></>;

  return (
    <>
      <PageHeader
        title="Service Pricing"
        description="Adjust global transportation, installation and cleaning charges used across the mobile app."
      />
      {message && (
        <div className={`mb-4 rounded-md p-3 text-sm font-semibold ${message.includes("saved") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message}
        </div>
      )}
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (form) save.mutate(form);
        }}
      >
        <section className="panel p-5">
          <h3 className="mb-1 font-black text-slate-800">Transportation &amp; Installation Charges</h3>
          <p className="mb-4 text-sm text-slate-500">Flat charges applied to standalone product orders placed from the marketplace.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transportation charge (PKR)" {...field("transportation_charge")} />
            <Field label="Product installation charge (PKR)" {...field("product_installation_charge")} />
          </div>
        </section>

        <section className="panel p-5">
          <h3 className="mb-1 font-black text-slate-800">Solar Panel Cleaning Charges</h3>
          <p className="mb-4 text-sm text-slate-500">Used by the mobile app's cleaning estimator (base visit + per-kW rate + elevated-structure surcharges).</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base visit charge (PKR)" {...field("cleaning_base_visit_charge")} />
            <Field label="Minimum charge (PKR)" {...field("cleaning_minimum_charge")} />
            <Field label="Standard rate per kW (PKR)" {...field("cleaning_standard_rate_per_kw")} />
            <Field label="Elevated structure rate per kW (PKR)" {...field("cleaning_elevated_rate_per_kw")} />
            <Field label="Elevated height rate (PKR per ft)" {...field("cleaning_elevated_height_rate")} />
            <Field label="Tax rate (e.g. 0.05 = 5%)" step="0.0001" {...field("cleaning_tax_rate")} />
          </div>
        </section>

        <div className="flex justify-end">
          <button className="btn-primary" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save changes"}</button>
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  step = "0.01",
  value,
  onChange,
}: {
  label: string;
  step?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block text-sm font-bold text-ink">
      {label}
      <input className="field mt-2" type="number" min="0" step={step} value={value} onChange={onChange} />
    </label>
  );
}
