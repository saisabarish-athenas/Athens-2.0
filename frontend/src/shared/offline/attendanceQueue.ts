const QUEUE_KEY = 'offline_attendance_queue';

export interface AttendanceEvent {
  client_event_id: string;
  module: string;
  module_ref_id: string;
  event_type: string;
  occurred_at: string;
  device_id: string | null;
  offline: boolean;
  method: string;
  location?: any;
  payload?: Record<string, any>;
}

/** Persist an attendance event to localStorage for later sync. */
export async function enqueueAttendanceEvent(event: AttendanceEvent): Promise<void> {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const queue: AttendanceEvent[] = raw ? JSON.parse(raw) : [];
    queue.push(event);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage quota exceeded or unavailable — silently drop
  }
}

/** Return all queued events and clear the queue. */
export function dequeueAllAttendanceEvents(): AttendanceEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const queue: AttendanceEvent[] = JSON.parse(raw);
    localStorage.removeItem(QUEUE_KEY);
    return queue;
  } catch {
    return [];
  }
}

/** Generate a unique client-side event ID. */
export function generateClientEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Return a stable device ID stored in localStorage. */
export function getAttendanceDeviceId(): string {
  const key = '_attendance_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(key, id);
  }
  return id;
}
