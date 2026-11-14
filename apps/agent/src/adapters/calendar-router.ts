import type { CalendarWriter } from "@syllabus-crew/core";

/**
 * Which calendar a write goes to. Real Google writes happen only for the demo student (the owner of the connected
 * account). Anyone else who texts the public line gets a local stand-in, so a stranger can never put events on the
 * presenter's real calendar.
 */
export function calendarRouter(o: {
  google: { isConnected(): boolean } & Required<Pick<CalendarWriter, "deleteEvent">> & Pick<CalendarWriter, "createEvent">;
  local: CalendarWriter & Required<Pick<CalendarWriter, "deleteEvent">>;
  owner: string;
  log: (s: string) => void;
}): CalendarWriter {
  return {
    async createEvent(e) {
      if (o.google.isConnected() && e.owner === o.owner) {
        const r = await o.google.createEvent(e);
        o.log(`CALENDAR google createEvent ok: ${r.link ?? r.id}`);
        return r;
      }
      o.log(`CALENDAR local createEvent (${e.owner === o.owner ? "Google not connected" : "not the demo student"}): ${e.title}`);
      return o.local.createEvent(e);
    },
    async deleteEvent(id) {
      if (id.startsWith("sc")) {
        if (!o.google.isConnected()) throw new Error("Google Calendar is not connected, cannot delete the event");
        await o.google.deleteEvent(id);
        o.log(`CALENDAR google deleteEvent ok: ${id}`);
      } else await o.local.deleteEvent(id);
    },
  };
}
