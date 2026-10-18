interface Receipt {
  status: string;
  [key: string]: unknown;
}
interface Payload {
  requestId: string;
}
interface SubmissionTransport<T extends Payload, R extends Receipt> {
  submission(requestId: string): Promise<R>;
  submit(payload: T): Promise<R>;
}
// A missing receipt permits a retry of the same request. An unknown receipt is not missing.
export async function confirmOrSubmit<T extends Payload, R extends Receipt>(
  client: SubmissionTransport<T, R>,
  payload: T,
  ownership?: { storedDeviceId?: string; currentDeviceId?: string },
): Promise<R> {
  if (
    ownership &&
    (!ownership.storedDeviceId ||
      ownership.storedDeviceId !== ownership.currentDeviceId)
  )
    throw new Error(
      "This send belongs to a previous device pairing. Review it on your host; it cannot be retried from this pairing.",
    );
  try {
    return await client.submission(payload.requestId);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 404
    )
      return client.submit(payload);
    throw error;
  }
}
export function definitelyRejected(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    [400, 404, 409, 413, 415, 422].includes(Number(error.status))
  );
}
