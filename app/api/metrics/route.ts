import { prisma } from "@/lib/db/prisma";
import { observabilityIsEnabled } from "@/lib/observability/logger";
import { webhookVerificationFailuresCount } from "@/lib/observability/metrics";

export async function GET() {
  if (!observabilityIsEnabled()) {
    return new Response(null, { status: 404 });
  }

  // 1. Get delivery rate totals (delivered, failed, sent, queued)
  const outboundMessages = await prisma.message.findMany({
    where: { direction: "OUTBOUND" },
    select: { providerStatus: true, createdAt: true, deliveredAt: true }
  });

  const counts: Record<string, number> = {
    delivered: 0,
    failed: 0,
    sent: 0,
    queued: 0
  };

  let queueDepth = 0;
  const latencies: number[] = [];

  for (const msg of outboundMessages) {
    const status = (msg.providerStatus || "queued").toLowerCase();
    if (status === "delivered") {
      counts.delivered++;
      if (msg.deliveredAt) {
        const latencySec = (msg.deliveredAt.getTime() - msg.createdAt.getTime()) / 1000;
        if (latencySec >= 0) {
          latencies.push(latencySec);
        }
      }
    } else if (status === "failed") {
      counts.failed++;
    } else if (status === "sent") {
      counts.sent++;
    } else {
      counts.queued++;
    }

    if (status === "queued" || status === "sending") {
      queueDepth++;
    }
  }

  // Latency buckets: Standard Prometheus histogram buckets
  const buckets = [1, 2, 5, 10];
  const bucketCounts = buckets.map(() => 0);
  let infiniteCount = 0;
  let latencySum = 0;

  for (const lat of latencies) {
    latencySum += lat;
    infiniteCount++;
    for (let i = 0; i < buckets.length; i++) {
      if (lat <= buckets[i]) {
        bucketCounts[i]++;
      }
    }
  }

  // Format into Prometheus plaintext
  let prometheusExposition = "";

  const addMetricMetadata = (name: string, type: string, help: string) => {
    prometheusExposition += `# HELP ${name} ${help}\n`;
    prometheusExposition += `# TYPE ${name} ${type}\n`;
  };

  // Delivery Rate Counter
  addMetricMetadata("signalstack_sms_delivery_rate_total", "counter", "Total count of outbound SMS messages grouped by delivery status.");
  prometheusExposition += `signalstack_sms_delivery_rate_total{status="delivered"} ${counts.delivered}\n`;
  prometheusExposition += `signalstack_sms_delivery_rate_total{status="failed"} ${counts.failed}\n`;
  prometheusExposition += `signalstack_sms_delivery_rate_total{status="sent"} ${counts.sent}\n`;
  prometheusExposition += `signalstack_sms_delivery_rate_total{status="queued"} ${counts.queued}\n\n`;

  // Send Latency Histogram
  addMetricMetadata("signalstack_sms_send_latency_seconds", "histogram", "Time taken for SMS delivery from creation to delivered status in seconds.");
  for (let i = 0; i < buckets.length; i++) {
    prometheusExposition += `signalstack_sms_send_latency_seconds_bucket{le="${buckets[i]}"} ${bucketCounts[i]}\n`;
  }
  prometheusExposition += `signalstack_sms_send_latency_seconds_bucket{le="+Inf"} ${infiniteCount}\n`;
  prometheusExposition += `signalstack_sms_send_latency_seconds_sum ${latencySum}\n`;
  prometheusExposition += `signalstack_sms_send_latency_seconds_count ${infiniteCount}\n\n`;

  // Queue Depth Gauge
  addMetricMetadata("signalstack_sms_queue_depth", "gauge", "Current number of messages in queued or sending status.");
  prometheusExposition += `signalstack_sms_queue_depth ${queueDepth}\n\n`;

  // Webhook Failures Counter
  addMetricMetadata("signalstack_sms_webhook_failures_total", "counter", "Total number of webhook verification signature failures.");
  prometheusExposition += `signalstack_sms_webhook_failures_total ${webhookVerificationFailuresCount}\n`;

  return new Response(prometheusExposition, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8"
    }
  });
}
