"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import dynamic from "next/dynamic";
import QRCode from "qrcode";

const LocationPicker = dynamic(() => import("./location-picker"), { ssr: false });

const COMPARTMENT_LABELS: Record<string, string[]> = {
  one: ["Recyclable"],
  two: ["Recyclable", "Non-Recyclable"],
  three: ["Recyclable", "Non-Recyclable", "Food Waste"],
  four: ["Plastic", "General", "Paper", "Metal"],
};

const CUSTOM_LABEL_OPTION = "__custom_compartment_label__";

type BinType = keyof typeof COMPARTMENT_LABELS;
type CompartmentDraft = { label: string; custom: boolean };

const UNASSIGNED_CUSTOMER = "__unassigned__";

export function BinForm({
  customers,
  organizationId,
  initial,
  initialCompartments = [],
  compartmentLabelOptions = [],
}: {
  customers: { id: string; name: string }[];
  organizationId: string;
  initial?: Record<string, unknown>;
  initialCompartments?: { compartment_index: number; label: string }[];
  compartmentLabelOptions?: string[];
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialBinType = (initial?.bin_type as BinType) ?? "two";
  const [binType, setBinType] = useState<BinType>(initialBinType);
  const [compartments, setCompartments] = useState<CompartmentDraft[]>(() => {
    const labelsByIndex = new Map(initialCompartments.map(({ compartment_index, label }) => [compartment_index, label]));
    return COMPARTMENT_LABELS[initialBinType].map((defaultLabel, index) => ({
      label: labelsByIndex.get(index) ?? defaultLabel,
      custom: false,
    }));
  });
  const [lat, setLat] = useState((initial?.latitude as number) ?? 27.4728);
  const [lng, setLng] = useState((initial?.longitude as number) ?? 89.639);
  const [deviceId, setDeviceId] = useState((initial?.device_id as string) ?? "");
  const [serialNumber, setSerialNumber] = useState((initial?.serial_number as string) ?? "");
  const [locationName, setLocationName] = useState((initial?.location_name as string) ?? "");
  const [customerId, setCustomerId] = useState<string>((initial?.customer_id as string) ?? UNASSIGNED_CUSTOMER);
  const [deploymentDate, setDeploymentDate] = useState(
    ((initial?.deployment_date as string) ?? new Date().toISOString().split("T")[0])
  );
  const [binHeight, setBinHeight] = useState<number>((initial?.bin_height as number) ?? 100);

  const availableCompartmentLabels = [...new Set([
    ...compartmentLabelOptions,
    ...Object.values(COMPARTMENT_LABELS).flat(),
    ...initialCompartments.map(({ label }) => label),
  ].map((label) => label.trim()).filter(Boolean))];

  function updateCompartment(index: number, patch: Partial<CompartmentDraft>) {
    setCompartments((current) => current.map((compartment, compartmentIndex) =>
      compartmentIndex === index ? { ...compartment, ...patch } : compartment
    ));
  }

  function changeBinType(value: string) {
    const nextType = value as BinType;
    setBinType(nextType);
    setCompartments((current) => COMPARTMENT_LABELS[nextType].map((defaultLabel, index) =>
      current[index] ?? { label: defaultLabel, custom: false }
    ));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const compartmentRows = compartments.map(({ label }, index) => ({
      compartment_index: index,
      label: label.trim(),
    }));
    if (compartmentRows.some(({ label }) => !label)) {
      setError("Enter a label for every compartment.");
      setLoading(false);
      return;
    }

    const payload = {
      customer_id: customerId === UNASSIGNED_CUSTOMER ? null : customerId,
      device_id: deviceId,
      serial_number: serialNumber,
      bin_type: binType,
      latitude: lat,
      longitude: lng,
      location_name: locationName,
      deployment_date: deploymentDate,
      bin_height: binHeight,
    };

    if (isEdit) {
      const { error: updateError } = await supabase.from("bins").update(payload).eq("id", initial!.id as string);
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      const binId = initial!.id as string;
      const { error: compartmentsError } = await supabase
        .from("bin_compartments")
        .upsert(
          compartmentRows.map((compartment) => ({ ...compartment, bin_id: binId })),
          { onConflict: "bin_id,compartment_index" }
        );
      if (compartmentsError) {
        setError(`Failed to save compartments: ${compartmentsError.message}`);
        setLoading(false);
        return;
      }

      const { error: removedCompartmentsError } = await supabase
        .from("bin_compartments")
        .delete()
        .eq("bin_id", binId)
        .gte("compartment_index", compartmentRows.length);
      if (removedCompartmentsError) {
        setError(`Failed to remove extra compartments: ${removedCompartmentsError.message}`);
        setLoading(false);
        return;
      }

      await supabase.from("activity_log").insert({
        organization_id: organizationId,
        bin_id: initial!.id as string,
        action: "bin_updated",
        details: { device_id: deviceId, bin_type: binType },
      });
      router.push(`/bins/${initial!.id}`);
      router.refresh();
      return;
    }

    const qrDataUrl = await QRCode.toDataURL(deviceId, { width: 256 });

    const { data: bin, error: insertError } = await supabase
      .from("bins")
      .insert({
        ...payload,
        organization_id: organizationId,
        qr_code: deviceId,
        qr_code_url: qrDataUrl,
        status: "unregistered",
      })
      .select("id")
      .single();

    if (insertError || !bin) {
      setError(insertError?.message ?? "Failed to create bin");
      setLoading(false);
      return;
    }

    const { error: compartmentsError } = await supabase.from("bin_compartments").insert(
      compartmentRows.map(({ label, compartment_index }) => ({
        bin_id: bin.id,
        label,
        compartment_index,
      }))
    );
    if (compartmentsError) {
      await supabase.from("bins").delete().eq("id", bin.id);
      setError(`Failed to save compartments: ${compartmentsError.message}`);
      setLoading(false);
      return;
    }

    await supabase.from("activity_log").insert({
      organization_id: organizationId,
      bin_id: bin.id,
      action: "bin_created",
      details: { device_id: deviceId },
    });

    router.push(`/bins/${bin.id}`);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Device ID</Label>
              <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required placeholder="SRTX-007" />
            </div>
            <div className="space-y-2">
              <Label>Serial number</Label>
              <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} required placeholder="SN-XXXX-0001" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bin type</Label>
              <Select value={binType} onValueChange={changeBinType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one">1-bin (Recyclable)</SelectItem>
                  <SelectItem value="two">2-bin</SelectItem>
                  <SelectItem value="three">3-bin</SelectItem>
                  <SelectItem value="four">4-bin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED_CUSTOMER}>Unassigned</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-3 rounded-md border p-4">
            <div>
              <h2 className="text-sm font-semibold">Compartments</h2>
              <p className="text-xs text-muted-foreground">Choose a saved label or enter a custom one for each compartment.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {compartments.map((compartment, index) => (
                <div key={index} className="space-y-2">
                  <Label htmlFor={`compartment-label-${index}`}>Compartment {index + 1}</Label>
                  <Select
                    value={compartment.custom ? CUSTOM_LABEL_OPTION : compartment.label}
                    onValueChange={(value) => {
                      if (value === CUSTOM_LABEL_OPTION) {
                        updateCompartment(index, { custom: true, label: "" });
                      } else {
                        updateCompartment(index, { custom: false, label: value });
                      }
                    }}
                  >
                    <SelectTrigger id={`compartment-label-${index}`}>
                      <SelectValue placeholder="Choose a label" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCompartmentLabels.map((label) => (
                        <SelectItem key={label} value={label}>{label}</SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_LABEL_OPTION}>Custom label</SelectItem>
                    </SelectContent>
                  </Select>
                  {compartment.custom && (
                    <Input
                      value={compartment.label}
                      onChange={(event) => updateCompartment(index, { label: event.target.value })}
                      placeholder="Enter a custom label"
                      maxLength={80}
                      required
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Location name</Label>
            <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Deployment date</Label>
            <Input type="date" value={deploymentDate} onChange={(e) => setDeploymentDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Bin height (cm)</Label>
            <Input type="number" min="1" max="500" value={binHeight} onChange={(e) => setBinHeight(Number(e.target.value))} required />
            <p className="text-xs text-muted-foreground">Used to calculate fill level from distance sensors (e.g., TTN LoRaWAN)</p>
          </div>
          <div className="space-y-2">
            <Label>GPS location</Label>
            <p className="text-xs text-muted-foreground">
              Click the map to place the pin. Coordinates are saved when you create the bin.
            </p>
            <LocationPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Saving..." : isEdit ? "Save changes" : "Create bin"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
