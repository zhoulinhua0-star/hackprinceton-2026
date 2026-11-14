// Runs the whole demo loop on fakes and prints it as a chat. No network, no keys.
//   npm run demo:loop -w @syllabus-crew/agent
import { FakeCalendar, FakeLLM, FakeMessenger, FixedClock, MemoryStore } from "@syllabus-crew/core";
import { Crew } from "../index.ts";

const ME = "+15555550100";
const calendar = new FakeCalendar();
const messenger = new FakeMessenger((_, t) => console.log(`  agent > ${t.replace(/\n/g, "\n          ")}`));
const crew = new Crew({
  store: new MemoryStore(), messenger, llm: new FakeLLM(), calendar,
  clock: new FixedClock(new Date("2026-11-15T12:00:00-05:00")), tz: "America/New_York", opts: { proposalDelayMs: 0, nextQuestionDelayMs: 0 },
});

const step = (label: string) => console.log(`\n== ${label}`);
const you = async (text: string, extra: { hasImage?: boolean } = {}) => { console.log(`  you   > ${extra.hasImage ? "[syllabus photo]" : text}`); await crew.onInbound(ME, { text, ...extra }); };

step("Day 1: setup");
await you("Hi Syllabus Crew");
await you("", { hasImage: true });
step("Fast forward to week 6 (hidden control: Switch to Week 6)");
await crew.switchToWeek6(ME);
step("Hidden control: Run Scout now");
await crew.runScoutNow(ME);
step("Student answers wrong");
await you("B");
step("Unclear reply");
await you("maybe");
console.log(`  calendar events so far: ${calendar.events.length}`);
step("Approve");
await you("YES");
console.log(`\ncalendar events: ${JSON.stringify(calendar.events)}`);
