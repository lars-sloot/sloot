import { handleCallback } from "@vercel/queue";
import { processDeliveryNote } from "@/lib/ai/process-delivery-note";

type DeliveryNoteJob = { noteId: string; actorId: string };

export const maxDuration = 60;

const queueHandler = handleCallback<DeliveryNoteJob>(
  async (job) => {
    if (!job?.noteId || !job?.actorId) throw new Error("Ongeldige AI-queueopdracht.");
    await processDeliveryNote(job.noteId, job.actorId);
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (_error, metadata) => {
      if (metadata.deliveryCount >= 5) return { acknowledge: true };
      return { afterSeconds: Math.min(300, 10 * (2 ** Math.max(0, metadata.deliveryCount - 1))) };
    },
  },
);

export async function POST(request: Request) {
  return queueHandler(request);
}
