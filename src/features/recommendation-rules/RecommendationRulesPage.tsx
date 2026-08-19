import { useEffect, useState } from "react";
import type { Dispatch, InputHTMLAttributes, ReactNode, SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiSave, FiSliders } from "react-icons/fi";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { supabase } from "../../lib/supabase";
import { errorMessage } from "../../lib/utils";

type SettingsRow = {
  id: string;
  acceptable_battery_shortfall_percent: number;
  battery_usable_factor: number;
  battery_safety_margin_percent: number;
  extended_backup_step_percent: number;
  minimum_budget_coverage_percent: number;
  expert_review_battery_threshold_kwh: number;
  configured_installation_cost: number;
  configured_structure_cost: number;
  configured_accessories_cost: number;
  preliminary_recommendation_disclaimer: string;
  is_active: boolean;
};

type LoadRuleRow = {
  id: string;
  min_running_load_kw: number;
  max_running_load_kw: number | null;
  base_inverter_kw: number | null;
  base_pv_kwp: number | null;
  requires_expert_review: boolean;
  label: string;
  priority: number;
  is_active: boolean;
};

type BatteryRuleRow = {
  id: string;
  min_battery_bank_kwh: number;
  max_battery_bank_kwh: number | null;
  minimum_inverter_kw: number | null;
  minimum_pv_kwp: number | null;
  requires_expert_review: boolean;
  label: string;
  priority: number;
  is_active: boolean;
};

type RulesData = {
  settings: SettingsRow;
  loadRules: LoadRuleRow[];
  batteryRules: BatteryRuleRow[];
};

const numeric = (value: string) => value === "" ? null : Number(value);

async function fetchRules(): Promise<RulesData> {
  const [settings, loadRules, batteryRules] = await Promise.all([
    supabase.from("recommendation_settings").select("id, acceptable_battery_shortfall_percent, battery_usable_factor, battery_safety_margin_percent, extended_backup_step_percent, minimum_budget_coverage_percent, expert_review_battery_threshold_kwh, configured_installation_cost, configured_structure_cost, configured_accessories_cost, preliminary_recommendation_disclaimer, is_active").eq("is_active", true).order("updated_at", { ascending: false }).limit(1).single(),
    supabase.from("load_sizing_rules").select("*").order("priority"),
    supabase.from("battery_uplift_rules").select("*").order("priority"),
  ]);
  if (settings.error) throw settings.error;
  if (loadRules.error) throw loadRules.error;
  if (batteryRules.error) throw batteryRules.error;
  return {
    settings: settings.data as SettingsRow,
    loadRules: (loadRules.data ?? []) as LoadRuleRow[],
    batteryRules: (batteryRules.data ?? []) as BatteryRuleRow[],
  };
}

export function RecommendationRulesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["recommendation-rules", "v1"], queryFn: fetchRules });
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [loadRules, setLoadRules] = useState<LoadRuleRow[]>([]);
  const [batteryRules, setBatteryRules] = useState<BatteryRuleRow[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setSettings(query.data.settings);
    setLoadRules(query.data.loadRules);
    setBatteryRules(query.data.batteryRules);
  }, [query.data]);

  const save = useMutation({
    mutationFn: async ({ table, id, payload }: { table: "recommendation_settings" | "load_sizing_rules" | "battery_uplift_rules"; id: string; payload: Record<string, unknown> }) => {
      const { error } = await supabase.from(table).update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setNotice("Recommendation rules saved. Mobile will use them on its next refresh.");
      await queryClient.invalidateQueries({ queryKey: ["recommendation-rules", "v1"] });
    },
  });

  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState message={`Recommendation Rules require migration 202607290001. ${errorMessage(query.error)}`} />;
  if (!settings) return <ErrorState message="No active recommendation settings record exists." />;

  return (
    <>
      <PageHeader title="Recommendation Rules" description="Configure the preliminary Commercial V1 sizing rules used by Mobile without changing application code." />
      {notice ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div> : null}
      {save.error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage(save.error)}</div> : null}

      <section className="panel mb-5 p-5">
        <div className="mb-4 flex items-center gap-2"><FiSliders className="text-amber-600" /><div><h2 className="font-black text-ink">Global Settings</h2><p className="text-xs text-slate-500">Commercial planning assumptions shared by battery, package and summary screens.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberField label="Battery usable factor" value={settings.battery_usable_factor} min={0.01} max={1} step={0.01} onChange={(value) => setSettings({ ...settings, battery_usable_factor: value ?? 0.85 })} />
          <NumberField label="Customer safety margin (%)" value={settings.battery_safety_margin_percent} min={0} max={100} step={1} onChange={(value) => setSettings({ ...settings, battery_safety_margin_percent: value ?? settings.battery_safety_margin_percent })} />
          <NumberField label="Acceptable battery shortfall (%)" helper="Allows a practical battery option slightly below the calculated target when limited load management is acceptable." value={settings.acceptable_battery_shortfall_percent} min={0} max={100} step={0.1} onChange={(value) => setSettings({ ...settings, acceptable_battery_shortfall_percent: value ?? 5 })} />
          <NumberField label="Extended backup step (%)" value={settings.extended_backup_step_percent} min={0} step={1} onChange={(value) => setSettings({ ...settings, extended_backup_step_percent: value ?? 15 })} />
          <NumberField label="Minimum Budget coverage (%)" value={settings.minimum_budget_coverage_percent} min={1} max={100} step={1} onChange={(value) => setSettings({ ...settings, minimum_budget_coverage_percent: value ?? 75 })} />
          <NumberField label="Expert-review battery threshold (kWh)" value={settings.expert_review_battery_threshold_kwh} min={1} step={1} onChange={(value) => setSettings({ ...settings, expert_review_battery_threshold_kwh: value ?? 32 })} />
          <NumberField label="Installation cost (PKR)" value={settings.configured_installation_cost} min={0} step={1000} onChange={(value) => setSettings({ ...settings, configured_installation_cost: value ?? 0 })} />
          <NumberField label="Structure cost (PKR)" value={settings.configured_structure_cost} min={0} step={1000} onChange={(value) => setSettings({ ...settings, configured_structure_cost: value ?? 0 })} />
          <NumberField label="Accessories cost (PKR)" value={settings.configured_accessories_cost} min={0} step={1000} onChange={(value) => setSettings({ ...settings, configured_accessories_cost: value ?? 0 })} />
          <label className="text-sm font-bold text-ink md:col-span-2 xl:col-span-4">Preliminary recommendation disclaimer<textarea className="field mt-2 min-h-20" value={settings.preliminary_recommendation_disclaimer} onChange={(event) => setSettings({ ...settings, preliminary_recommendation_disclaimer: event.target.value })} /></label>
        </div>
        <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ table: "recommendation_settings", id: settings.id, payload: settings })}><FiSave /> Save Global Settings</button></div>
      </section>

      <RuleSection title="Load Sizing Rules" description="Running-load boundaries determine the base inverter and PV targets.">
        {loadRules.map((rule, index) => (
          <div key={rule.id} className="grid items-end gap-3 border-b border-slate-100 py-4 last:border-0 md:grid-cols-2 xl:grid-cols-8">
            <TextField label="Label" value={rule.label} onChange={(value) => updateAt(setLoadRules, loadRules, index, { label: value })} className="xl:col-span-2" />
            <NumberField label="Min load (kW)" value={rule.min_running_load_kw} min={0} onChange={(value) => updateAt(setLoadRules, loadRules, index, { min_running_load_kw: value ?? 0 })} />
            <NumberField label="Max load (kW)" value={rule.max_running_load_kw} min={0} onChange={(value) => updateAt(setLoadRules, loadRules, index, { max_running_load_kw: value })} />
            <NumberField label="Base inverter (kW)" value={rule.base_inverter_kw} min={0} onChange={(value) => updateAt(setLoadRules, loadRules, index, { base_inverter_kw: value })} />
            <NumberField label="Base PV (kWp)" value={rule.base_pv_kwp} min={0} onChange={(value) => updateAt(setLoadRules, loadRules, index, { base_pv_kwp: value })} />
            <ToggleField label="Expert Review" checked={rule.requires_expert_review} onChange={(value) => updateAt(setLoadRules, loadRules, index, { requires_expert_review: value })} />
            <button className="btn-secondary" disabled={save.isPending} onClick={() => save.mutate({ table: "load_sizing_rules", id: rule.id, payload: rule })}><FiSave /> Save</button>
          </div>
        ))}
      </RuleSection>

      <RuleSection title="Battery Uplift Rules" description="Selected nominal battery-bank capacity can uplift the inverter and PV targets.">
        {batteryRules.map((rule, index) => (
          <div key={rule.id} className="grid items-end gap-3 border-b border-slate-100 py-4 last:border-0 md:grid-cols-2 xl:grid-cols-8">
            <TextField label="Label" value={rule.label} onChange={(value) => updateAt(setBatteryRules, batteryRules, index, { label: value })} className="xl:col-span-2" />
            <NumberField label="Min bank (kWh)" value={rule.min_battery_bank_kwh} min={0} onChange={(value) => updateAt(setBatteryRules, batteryRules, index, { min_battery_bank_kwh: value ?? 0 })} />
            <NumberField label="Max bank (kWh)" value={rule.max_battery_bank_kwh} min={0} onChange={(value) => updateAt(setBatteryRules, batteryRules, index, { max_battery_bank_kwh: value })} />
            <NumberField label="Min inverter (kW)" value={rule.minimum_inverter_kw} min={0} onChange={(value) => updateAt(setBatteryRules, batteryRules, index, { minimum_inverter_kw: value })} />
            <NumberField label="Min PV (kWp)" value={rule.minimum_pv_kwp} min={0} onChange={(value) => updateAt(setBatteryRules, batteryRules, index, { minimum_pv_kwp: value })} />
            <ToggleField label="Expert Review" checked={rule.requires_expert_review} onChange={(value) => updateAt(setBatteryRules, batteryRules, index, { requires_expert_review: value })} />
            <button className="btn-secondary" disabled={save.isPending} onClick={() => save.mutate({ table: "battery_uplift_rules", id: rule.id, payload: rule })}><FiSave /> Save</button>
          </div>
        ))}
      </RuleSection>
    </>
  );
}

function updateAt<T>(setter: Dispatch<SetStateAction<T[]>>, rows: T[], index: number, values: Partial<T>) {
  setter(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row));
}

function RuleSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="panel mb-5 p-5"><h2 className="font-black text-ink">{title}</h2><p className="mt-1 text-xs text-slate-500">{description} A zero minimum is inclusive; later ranges are above the minimum and up to the maximum.</p><div className="mt-3">{children}</div></section>;
}

function NumberField({ label, helper, value, onChange, ...props }: { label: string; helper?: string; value: number | null; onChange: (value: number | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className="text-xs font-bold text-ink">{label}<input className="field mt-2" type="number" value={value ?? ""} onChange={(event) => onChange(numeric(event.target.value))} {...props} />{helper ? <span className="mt-1 block text-[11px] font-normal leading-4 text-slate-500">{helper}</span> : null}</label>;
}

function TextField({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return <label className={`text-xs font-bold text-ink ${className}`}>{label}<input className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 items-center gap-2 text-xs font-bold text-ink"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}
