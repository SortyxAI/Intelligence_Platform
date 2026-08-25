import "dotenv/config";
import mqtt from "mqtt";
import { createClient } from "@supabase/supabase-js";
import pino from "pino";
import { createServer } from "http";
import { telemetryPayloadSchema, type TelemetryPayload } from "@sortyx/shared";
import {
  resolveMaterial,
  computeWasteImpact,
  dominantClassificationCategory,
  type MaterialConfigRow,
} from "@sortyx/shared";
import WebSocket from "ws";
import { startTtnClient } from "./ttn-mqtt.js";

type AlertType =
  | "full_bin"
  | "camera_failure"
  | "sensor_failure"
  | "low_battery"
  | "offline"
  | "ad_expiry"
  | string;

const log = pino({
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    realtime: {
      transport: WebSocket as never,
    },
  }
);

const DEDUPE_MINUTES = 15;
const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000;
const FULL_BIN_THRESHOLD = 85;
const LOW_BATTERY_THRESHOLD = 20;

const MATERIAL_CACHE_TTL_MS = 5 * 60 * 1000;
const materialConfigCache = new Map<string, MaterialConfigRow | null>();
let materialConfigCacheAt = 0;

async function getMaterialConfig(material: string): Promise<MaterialConfigRow | null> {
  if (Date.now() - materialConfigCacheAt > MATERIAL_CACHE_TTL_MS || !materialConfigCache.has(material)) {
    const { data } = await supabase
      .from("material_config")
      .select("material, category, co2e_factor, rate_per_kg, method, source, is_proxy");
    materialConfigCache.clear();
    for (const r of data ?? []) {
      materialConfigCache.set(r.material, {
        material: r.material,
        category: r.category,
        co2e_factor: r.co2e_factor != null ? Number(r.co2e_factor) : null,
        rate_per_kg: r.rate_per_kg != null ? Number(r.rate_per_kg) : null,
        method: r.method,
        source: r.source,
        is_proxy: r.is_proxy,
      });
    }
    materialConfigCacheAt = Date.now();
  }
  return materialConfigCache.get(material) ?? null;
}

const recentAlerts = new Map<string, number>();

function alertKey(binId: string, type: string) {
  return `${binId}:${type}`;
}

function shouldCreateAlert(binId: string, type: string) {
  const key = alertKey(binId, type);
  const last = recentAlerts.get(key);

  if (last && Date.now() - last < DEDUPE_MINUTES * 60 * 1000) {
    return false;
  }

  recentAlerts.set(key, Date.now());
  return true;
}

async function processTelemetry(topic: string, payload: Buffer) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload.toString());
  } catch {
    log.warn({ topic }, "Invalid JSON");
    return;
  }

  const result = telemetryPayloadSchema.safeParse(parsed);

  if (!result.success) {
    log.warn({ topic, errors: result.error.flatten() }, "Validation failed");
    return;
  }

  await processTelemetryPayload(result.data);
}

export async function processTelemetryPayload(data: TelemetryPayload) {
  const recordedAt = data.timestamp ?? new Date().toISOString();

  const { data: bin, error: binError } = await supabase
    .from("bins")
    .select("id, organization_id, device_id, api_key, customer_id")
    .eq("device_id", data.deviceId)
    .single();

  if (binError || !bin) {
    log.warn({ deviceId: data.deviceId }, "Unknown device");
    return;
  }

  if (bin.api_key) {
    if (!data.apiKey || data.apiKey !== bin.api_key) {
      log.warn({ deviceId: data.deviceId }, "Invalid API key - rejecting telemetry");
      return;
    }
  }

  const maxFill = Math.max(...data.compartments.map((c) => c.fillLevel));
  const totalWeight = data.compartments.reduce(
    (sum, c) => sum + (c.weightKg ?? 0),
    0
  );
  const totalWaste = data.compartments.reduce(
    (sum, c) => sum + (c.wasteCount ?? 0),
    0
  );

  const { data: insertedTelemetry } = await supabase
    .from("telemetry_events")
    .insert({
      bin_id: bin.id,
      organization_id: bin.organization_id,
      recorded_at: recordedAt,
      fill_level: maxFill,
      weight_kg: totalWeight,
      waste_count: totalWaste,
      camera_status: data.cameraStatus ?? null,
      sensor_health: data.sensorHealth ?? null,
      internet_status: data.internetStatus ?? null,
      battery_percent: data.batteryPercent,
      compartments: data.compartments,
      raw_payload: data,
    })
    .select("id")
    .single();

  const telemetryEventId = insertedTelemetry?.id ?? null;

  // Environmental Impact: derive a waste record from the dominant material + total weight.
  // Wrapped so a failure here never blocks alert generation.
  try {
    if (telemetryEventId && totalWeight > 0) {
      const dominantCat = dominantClassificationCategory(
        data.compartments.map((c) => c.classification ?? {})
      );
      if (dominantCat) {
        const material = resolveMaterial(dominantCat);
        if (material) {
          const cfg = await getMaterialConfig(material);
          if (cfg) {
            const impact = computeWasteImpact({
              material: cfg.material,
              category: cfg.category,
              weightKg: totalWeight,
              co2eFactor: cfg.co2e_factor,
              ratePerKg: cfg.rate_per_kg,
              method: cfg.method,
              source: cfg.source,
              isProxy: cfg.is_proxy,
            });
            await supabase.from("waste_records").insert({
              organization_id: bin.organization_id,
              bin_id: bin.id,
              telemetry_event_id: telemetryEventId,
              material: impact.material,
              category: impact.category,
              weight_kg: impact.weightKg,
              co2e_factor_used: impact.co2eFactorUsed,
              co2e_avoided_kg: impact.co2eAvoidedKg,
              rate_per_kg_used: impact.ratePerKgUsed,
              estimated_value_inr: impact.estimatedValueInr,
              calculation_method: impact.calculationMethod,
              source: impact.source,
              is_proxy: impact.isProxy,
              recorded_at: recordedAt,
            });
          } else {
            log.warn({ material }, "Material factor not configured - skipping waste record");
          }
        }
      }
    }
  } catch (e) {
    log.error(e, "Failed to create waste record");
  }

  const updatePayload: Record<string, unknown> = {
    last_seen_at: recordedAt,
    latest_fill_level: maxFill,
    latest_battery: data.batteryPercent,
    snapshot_url: data.snapshotUrl ?? null,
    updated_at: new Date().toISOString(),
  };

  if (data.cameraStatus !== undefined) updatePayload.camera_status = data.cameraStatus;
  if (data.sensorHealth !== undefined) updatePayload.sensor_health = data.sensorHealth;
  if (data.internetStatus !== undefined) {
    updatePayload.internet_status = data.internetStatus;
    updatePayload.status = data.internetStatus === "offline" ? "offline" : "active";
  }

  await supabase.from("bins").update(updatePayload).eq("id", bin.id);

  for (const comp of data.compartments) {
    await supabase.rpc("upsert_compartment", {
      p_bin_id: bin.id,
      p_compartment_index: comp.index,
      p_fill_level: comp.fillLevel,
      p_weight_kg: comp.weightKg ?? 0,
      p_waste_count: comp.wasteCount ?? 0,
      p_classification: comp.classification ?? {},
    });
  }

  await supabase.from("activity_log").insert({
    organization_id: bin.organization_id,
    bin_id: bin.id,
    action: "telemetry_received",
    details: {
      fill: maxFill,
      device_id: data.deviceId,
    },
  });

  const alertsToCreate: {
    type: AlertType;
    message: string;
    severity: string;
  }[] = [];

  if (maxFill >= FULL_BIN_THRESHOLD && shouldCreateAlert(bin.id, "full_bin")) {
    alertsToCreate.push({
      type: "full_bin",
      message: `Bin ${data.deviceId} is ${maxFill}% full`,
      severity: "high",
    });
  }

  if (
    data.cameraStatus === "error" &&
    shouldCreateAlert(bin.id, "camera_failure")
  ) {
    alertsToCreate.push({
      type: "camera_failure",
      message: `Camera failure on ${data.deviceId}`,
      severity: "medium",
    });
  }

  if (
    data.sensorHealth === "error" &&
    shouldCreateAlert(bin.id, "sensor_failure")
  ) {
    alertsToCreate.push({
      type: "sensor_failure",
      message: `Sensor failure on ${data.deviceId}`,
      severity: "high",
    });
  }

  if (
    data.batteryPercent != null &&
    data.batteryPercent < LOW_BATTERY_THRESHOLD &&
    shouldCreateAlert(bin.id, "low_battery")
  ) {
    alertsToCreate.push({
      type: "low_battery",
      message: `Low battery (${data.batteryPercent}%) on ${data.deviceId}`,
      severity: "high",
    });
  }

  for (const a of data.alerts ?? []) {
    if (shouldCreateAlert(bin.id, a)) {
      alertsToCreate.push({
        type: a,
        message: `Device reported ${a} on ${data.deviceId}`,
        severity: "medium",
      });
    }
  }

  if (alertsToCreate.length > 0) {
    const { data: insertedAlerts } = await supabase.from("alerts").insert(
      alertsToCreate.map((a) => ({
        organization_id: bin.organization_id,
        bin_id: bin.id,
        alert_type: a.type,
        severity: a.severity,
        message: a.message,
      }))
    ).select("id, alert_type, severity, message");

    if (insertedAlerts && insertedAlerts.length > 0) {
      sendNotifications(bin.organization_id, bin.customer_id, insertedAlerts).catch((err) =>
        log.error(err, "Notification sending failed")
      );
    }
  }

  log.info({ deviceId: data.deviceId }, "Telemetry processed");
}

async function sendNotifications(
  organizationId: string,
  customerId: string | null,
  alerts: { alert_type: string; severity: string; message: string }[]
) {
  const { data: admins } = await supabase
    .from("profiles")
    .select("email, telegram_chat_id, phone, notify_email, notify_telegram, notify_whatsapp")
    .eq("organization_id", organizationId)
    .eq("role", "admin");

  const { data: customer } = customerId
    ? await supabase
        .from("profiles")
        .select("email, telegram_chat_id, phone, notify_email, notify_telegram, notify_whatsapp")
        .eq("customer_id", customerId)
        .single()
    : { data: null };

  const recipients = [...(admins ?? [])];
  if (customer) recipients.push(customer);

  if (recipients.length === 0) return;

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const FROM_EMAIL = process.env.FROM_EMAIL ?? "Sortyx <noreply@sortyx.com>";

  for (const alert of alerts) {
    const severity = (alert.severity ?? "medium").toUpperCase();
    const text = alert.message;

    for (const user of recipients) {
      if (user.notify_email && user.email && RESEND_API_KEY) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: user.email,
              subject: `Sortyx Alert — ${severity}: ${text}`,
              text,
            }),
          });
          if (!res.ok) log.warn({ email: user.email, status: res.status }, "Email send failed");
        } catch (err) {
          log.error({ email: user.email, err }, "Email send error");
        }
      }

      if (user.notify_telegram && user.telegram_chat_id && TELEGRAM_BOT_TOKEN) {
        try {
          const res = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: user.telegram_chat_id,
                text: `⚠️ *${severity}* — ${text}`,
                parse_mode: "Markdown",
              }),
            }
          );
          if (!res.ok) log.warn({ telegram: user.telegram_chat_id, status: res.status }, "Telegram send failed");
        } catch (err) {
          log.error({ telegram: user.telegram_chat_id, err }, "Telegram send error");
        }
      }

      if (user.notify_whatsapp && user.phone) {
        try {
          const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(user.phone)}&text=${encodeURIComponent(`⚠️ ${severity} — ${text}`)}&apikey=${process.env.CALLMEBOT_API_KEY ?? ""}`;
          const res = await fetch(url);
          if (!res.ok) log.warn({ phone: user.phone, status: res.status }, "WhatsApp send failed");
        } catch (err) {
          log.error({ phone: user.phone, err }, "WhatsApp send error");
        }
      }
    }
  }
}

async function checkOfflineBins() {
  const threshold = new Date(
    Date.now() - OFFLINE_THRESHOLD_MS
  ).toISOString();

  const { data: bins } = await supabase
    .from("bins")
    .select("id, organization_id, device_id")
    .eq("status", "active")
    .lt("last_seen_at", threshold);

  for (const bin of bins ?? []) {
    if (!shouldCreateAlert(bin.id, "offline")) continue;

    const { data: insertedAlerts } = await supabase.from("alerts").insert({
      organization_id: bin.organization_id,
      bin_id: bin.id,
      alert_type: "offline",
      severity: "critical",
      message: `Bin ${bin.device_id} has been offline for over ${OFFLINE_THRESHOLD_MS / 60000} minutes`,
    }).select("id, alert_type, severity, message");

    await supabase.from("bins").update({ status: "offline" }).eq("id", bin.id);

    if (insertedAlerts && insertedAlerts.length > 0) {
      const { data: binData } = await supabase
        .from("bins")
        .select("organization_id, customer_id")
        .eq("id", bin.id)
        .single();

      if (binData) {
        sendNotifications(binData.organization_id, binData.customer_id, insertedAlerts).catch((err) =>
          log.error(err, "Offline notification failed")
        );
      }
    }
  }
}

const mqttUrl = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const telemetryTopic =
  process.env.MQTT_TOPIC_TELEMETRY ?? "sortyx/bins/+/telemetry";

const hiveClient = mqtt.connect(mqttUrl, {
  username: process.env.MQTT_USER || undefined,
  password: process.env.MQTT_PASS || undefined,
  reconnectPeriod: 5000,
});

hiveClient.on("connect", () => {
  log.info("Connected to HiveMQ MQTT broker");

  hiveClient.subscribe(telemetryTopic, (err) => {
    if (err) {
      log.error(err, "HiveMQ subscribe failed");
    } else {
      log.info({ topic: telemetryTopic }, "HiveMQ subscribed");
    }
  });
});

hiveClient.on("message", (topic, payload) => {
  processTelemetry(topic, payload).catch((err) =>
    log.error(err, "HiveMQ processing failed")
  );
});

hiveClient.on("error", (err) => {
  log.error(err, "HiveMQ MQTT error");
});

setInterval(() => {
  checkOfflineBins().catch((err) =>
    log.error(err, "Offline check failed")
  );
}, 60000);

let ttnClient: mqtt.MqttClient | null = null;

startTtnClient(processTelemetryPayload).then((client) => {
  ttnClient = client;
});

const port = parseInt(process.env.PORT ?? "8080", 10);

createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        status: "ok",
        mqtt: hiveClient.connected,
        ttn: ttnClient?.connected ?? false,
      })
    );
    return;
  }

  res.writeHead(404);
  res.end();
}).listen(port, () => {
  log.info({ port }, "Health server listening");
});
