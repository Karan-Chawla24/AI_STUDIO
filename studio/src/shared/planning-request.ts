// Retrying a command is safe only with the exact original key, path and body.
export type PlanningCommand = { path: string; body: object; key: string };
export async function sendPlanningCommand(operation: PlanningCommand, token: string, onRecover: () => void, fetcher: typeof fetch = fetch) {
  const body = JSON.stringify(operation.body);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(operation.path, {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token, "Idempotency-Key": operation.key }, body,
      });
      return { response, body: await response.json() };
    } catch {
      if (attempt === 0) { onRecover(); continue; }
      throw new Error("We couldn’t confirm the response. Your request may already be processing. Check its status below, or retry the same request safely.");
    }
  }
  throw new Error("Could not confirm this request.");
}
export function planningErrorMessage(error: unknown) {
  if (error instanceof Error && !["TimeoutError", "AbortError", "TypeError"].includes(error.name)) return error.message;
  return "The connection was interrupted. Your saved work is safe. Refresh the status or retry the same request.";
}

export async function sendPlanningCancellation(operation: PlanningCommand, token: string, onRecover: () => void, onReplacement: (operation: PlanningCommand) => void, fetcher: typeof fetch = fetch) {
  const result = await sendPlanningCommand(operation, token, onRecover, fetcher);
  if (result.response.status !== 409 || result.body.error?.code !== "VERSION_CONFLICT") return result;
  onRecover();
  const response = await fetcher(operation.path.replace(/\/cancel$/, ""), {cache: "no-store", signal: AbortSignal.timeout(15000)});
  const body = await response.json();
  if (!response.ok) return {response, body};
  const job = body.data;
  // A completed job or an already accepted cancellation needs no new mutation.
  if (job.cancelRequested || !job.allowedActions.includes("CANCEL")) return {response, body};
  // The conflict explicitly rejected the old command. A changed body needs a new key.
  const replacement = {...operation, body: {expectedVersion: job.resourceVersion}, key: crypto.randomUUID()};
  onReplacement(replacement);
  return sendPlanningCommand(replacement, token, onRecover, fetcher);
}
