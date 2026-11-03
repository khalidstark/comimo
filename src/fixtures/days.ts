import type { Day } from "@/lib/types";
import { sampleComics } from "./sampleComics";

/**
 * Invented sample days, written the way people actually talk: Egyptian Arabic
 * and English in the same breath. None of this is a real diary.
 *
 * Each comic is what the real pipeline made of its transcript, run once per
 * day with the starter cast (03.2-06, scripts/sample-comics.mjs): Muse
 * Spark's script, Muse Image's panels drawn from the starter sheets, SAM
 * 3.1's boxes and face check, and what it cost (sampleComics.ts). The pages
 * show these before anyone records, and the mock model layer answers from them.
 */

type SampleId = keyof typeof sampleComics;

/** What was said on each sample day: the input the comics were made from. */
const notes: (Pick<Day, "date" | "transcript" | "createdAt"> & { id: SampleId })[] = [
  {
    id: "sample-teta",
    date: "2026-10-04",
    transcript:
      "النهارده كان عيد ميلاد تيتا، round two بقى، عشان هي قررت إن الكيكة اللي عملناها الأسبوع اللي فات كانت «تجربة بس». So we did the whole thing again. Mishmish قعد تحت الترابيزة طول الوقت مستني حد يوقّع حتة. وبالليل طلعت السطح شوية لوحدي. Honestly, best day this month.",
    createdAt: "2026-10-04T20:30:00.000Z",
  },
  {
    id: "sample-deadline",
    date: "2026-10-12",
    transcript:
      "مش عارفة أبدأ منين. I had two deadlines today، الـ report والـ presentation، وكنت فاتحة تلات tabs وكل شوية أقفل واحدة وأرجع أفتحها تاني. بالليل تيتا دخلت عليا وسألتني كلتي حاجة؟ وأنا ما كنتش واكلة من الصبح. At 9:40 at night I was still on slide four. بعتّهم الساعة 11:52 بالليل، and after that I just sat there. حاسة إني مخلّصة خالص.",
    createdAt: "2026-10-12T22:10:00.000Z",
  },
  {
    id: "sample-rooftop",
    date: "2026-10-21",
    transcript:
      "Karim عدّى عليا بعد الشغل وطلعنا السطح. The golden hour was unreal today. عمل شاي في الكوبايات الإزاز وقال إن الشاي ده أحسن من أي café. We said we should do this every Thursday. We won't, بس برضه. وفي الآخر قالي same time next week? وقلتله أكيد.",
    createdAt: "2026-10-21T19:45:00.000Z",
  },
  {
    id: "sample-sunday",
    date: "2026-10-25",
    transcript:
      "It rained all day النهارده، والـ plan بتاعنا اتلغى عشان عربية Karim عطلت. So I stayed home. حاولت أذاكر بس Mishmish نام على الكشكول بتاعي ومارضيش يتحرك خالص. تيتا عملت شوربة عدس وقعدنا نتفرج على فيلم أبيض وإسود هي حافظاه كلمة كلمة. Kind of a grey day، بس مش وحش.",
    createdAt: "2026-10-25T21:00:00.000Z",
  },
  {
    id: "sample",
    date: "2026-10-29",
    transcript:
      "الصبح كنت واقفة في المحطة من 7:40، already late. والباص ما جاش. يلا يا باص، any minute now… لحد الساعة 8:15 وبقت personal خلاص. Karim كلمني وقال اركبي معايا أنا جاي، ووصّلني. And in the evening we got shawarma, so worst morning, best shawarma.",
    createdAt: "2026-10-29T20:15:00.000Z",
  },
];

/** Sample days, oldest first. */
export const sampleDays: Day[] = notes.map((note) => ({ ...note, ...sampleComics[note.id], sample: true }));

export function getSampleDay(id: string): Day | undefined {
  return sampleDays.find((day) => day.id === id);
}

const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

/** The last sample week (Saturday to Friday), each day with the weather its comic was given: the visitor's week strip. */
export function sampleWeek(): { day: string; mood?: Day["mood"] }[] {
  const [y, m, d] = sampleDays.at(-1)!.date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1, d));
  const saturday = Date.UTC(y, m - 1, d - ((last.getUTCDay() + 1) % 7));
  return WEEKDAYS.map((day, i) => {
    const iso = new Date(saturday + i * 86_400_000).toISOString().slice(0, 10);
    const mood = sampleDays.findLast((sample) => sample.date === iso)?.mood;
    return mood ? { day, mood } : { day };
  });
}

/** The heavy sample day's check-in questions (Muse Spark's, from its run), used as the example card. */
export const sampleCheckInQuestions: string[] = sampleDays.find((day) => day.heavy && day.checkIn)?.checkIn?.questions ?? [];
