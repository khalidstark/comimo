import type { SceneKey } from "@/art/manifest";
import type { Day, DialogueLine, LanguageMix, Panel, TextDir } from "@/lib/types";

/**
 * Invented sample days, written the way people actually talk: Egyptian Arabic
 * and English in the same breath. None of this is a real diary. The pages show
 * these before anyone records, and the mock model layer answers from them.
 */

const MIXED_AR: LanguageMix = { spoken: ["ar", "en"], dominant: "ar", mixed: true };
const MIXED_EN: LanguageMix = { spoken: ["en", "ar"], dominant: "en", mixed: true };

function say(speakerId: string, text: string, dir: TextDir): DialogueLine {
  return { speakerId, text, dir };
}

function panel(
  index: number,
  background: SceneKey,
  scene: string,
  characterIds: string[],
  dialogue: DialogueLine[],
  caption?: string,
): Panel {
  return {
    index,
    scene,
    caption,
    dialogue,
    characterIds,
    image: { kind: "art", path: `scenes.${background}` },
    consistency: { checked: false, driftedCharacterIds: [], fixedCharacterIds: [], beforeImage: null },
  };
}

/** Gentle reflection only: no advice, no diagnosis, no scores. */
const DEADLINE_QUESTIONS = [
  "What took the most out of you today?",
  "Is there one thing you can set down until tomorrow?",
  "Who would you want to tell about today?",
];

/** Sample days, oldest first. */
export const sampleDays: Day[] = [
  {
    id: "sample-teta",
    date: "2026-10-04",
    title: "Teta's birthday, round two",
    transcript:
      "النهارده كان عيد ميلاد تيتا، round two بقى، عشان هي قررت إن الكيكة اللي عملناها الأسبوع اللي فات كانت «تجربة بس». So we did the whole thing again. Mishmish قعد تحت الترابيزة طول الوقت مستني حد يوقّع حتة. وبالليل طلعت السطح شوية لوحدي. Honestly, best day this month.",
    languages: MIXED_AR,
    mood: "rainbow",
    heavy: false,
    safety: "ok",
    sample: true,
    createdAt: "2026-10-04T20:30:00.000Z",
    panels: [
      panel(
        0,
        "home",
        "A kitchen table with a big birthday cake and candles. Teta Samia presents it proudly while Nour leans in.",
        ["teta", "nour"],
        [say("teta", "الكيكة الأولى كانت تجربة بس", "rtl")],
        "Teta insisted on a second cake.",
      ),
      panel(
        1,
        "home",
        "Nour, fork in hand, stares at Teta across the half-eaten cake in disbelief.",
        ["nour", "teta"],
        [say("nour", "A test? We ate all of it.", "ltr")],
      ),
      panel(
        2,
        "home",
        "Under the table, between everyone's feet, Mishmish eyes a crumb of cake on the floor.",
        ["mishmish"],
        [say("mishmish", "Mrrp.", "ltr")],
        "Meanwhile, under the table.",
      ),
      panel(
        3,
        "rooftop",
        "Nour alone on the rooftop at dusk with a slice of cake on a plate, the city lights coming on below.",
        ["nour"],
        [say("nour", "Best day this month, honestly.", "ltr")],
        "Later.",
      ),
    ],
  },
  {
    id: "sample-deadline",
    date: "2026-10-12",
    title: "Two deadlines, one me",
    transcript:
      "مش عارفة أبدأ منين. I had two deadlines today، الـ report والـ presentation، وكنت فاتحة تلات tabs وكل شوية أقفل واحدة وأرجع أفتحها تاني. تيتا دخلت عليا وسألتني كلتي حاجة؟ وأنا ما كنتش واكلة من الصبح. At 9:40 I was still on slide four. بعتّهم الساعة 11:52، and after that I just sat there. حاسة إني مخلّصة خالص.",
    languages: MIXED_AR,
    mood: "stormy",
    heavy: true,
    checkIn: { questions: DEADLINE_QUESTIONS, answers: [] },
    safety: "ok",
    sample: true,
    createdAt: "2026-10-12T22:10:00.000Z",
    panels: [
      panel(
        0,
        "desk",
        "Nour hunched at her desk at night, laptop crowded with tabs, sticky notes everywhere.",
        ["nour"],
        [say("nour", "مش هلحق، I won't make it", "rtl")],
        "Three tabs. Two deadlines. One me.",
      ),
      panel(
        1,
        "desk",
        "Teta Samia peeks around the bedroom door holding a plate, Nour still facing the screen.",
        ["teta", "nour"],
        [say("teta", "كلتي حاجة؟", "rtl")],
      ),
      panel(
        2,
        "desk",
        "Close on the laptop: slide four of the presentation, a cold glass of tea beside it.",
        ["nour"],
        [say("nour", "Still on slide four.", "ltr")],
        "9:40 pm.",
      ),
      panel(
        3,
        "desk",
        "Nour slumped back in her chair, laptop showing 'Sent', the room dark except for the screen.",
        ["nour"],
        [say("nour", "Sent. Nobody talk to me.", "ltr")],
        "11:52 pm.",
      ),
    ],
  },
  {
    id: "sample-rooftop",
    date: "2026-10-21",
    title: "Rooftop tea with Karim",
    transcript:
      "Karim عدّى عليا بعد الشغل وطلعنا السطح. The golden hour was unreal today. عمل شاي في الكوبايات الإزاز وقال إن الشاي ده أحسن من أي café. We said we should do this every Thursday. We won't, بس برضه. وفي الآخر قالي same time next week? وقلتله أكيد.",
    languages: MIXED_EN,
    mood: "sunny",
    heavy: false,
    safety: "ok",
    sample: true,
    createdAt: "2026-10-21T19:45:00.000Z",
    panels: [
      panel(
        0,
        "rooftop",
        "Karim pours tea into two small glasses on the rooftop at golden hour, satellite dishes glowing behind him.",
        ["karim"],
        [say("karim", "الشاي ده أحسن من أي café", "rtl")],
        "Golden hour, finally.",
      ),
      panel(
        1,
        "rooftop",
        "Nour leans on the rooftop ledge holding her tea, grinning at Karim.",
        ["nour", "karim"],
        [say("nour", "We should do this every Thursday.", "ltr")],
      ),
      panel(
        2,
        "rooftop",
        "Wide shot: two small figures on the rooftop raising their tea glasses, the sun low behind the water tanks.",
        ["nour", "karim"],
        [],
        "We won't.",
      ),
      panel(
        3,
        "rooftop",
        "Karim heading for the stairs, looking back over his shoulder with a wave.",
        ["karim", "nour"],
        [say("karim", "Same time next week?", "ltr")],
        "But still.",
      ),
    ],
  },
  {
    id: "sample-sunday",
    date: "2026-10-25",
    title: "A grey Sunday",
    transcript:
      "It rained all day النهارده، والـ plan بتاعنا اتلغى عشان عربية Karim عطلت. So I stayed home. حاولت أذاكر بس Mishmish نام على الكشكول بتاعي ومارضيش يتحرك خالص. تيتا عملت شوربة عدس وقعدنا نتفرج على فيلم أبيض وإسود هي حافظاه كلمة كلمة. Kind of a grey day، بس مش وحش.",
    languages: MIXED_AR,
    mood: "rainy",
    heavy: false,
    safety: "ok",
    sample: true,
    createdAt: "2026-10-25T21:00:00.000Z",
    panels: [
      panel(
        0,
        "home",
        "Nour by a rain-streaked window, reading a message from Karim on her phone.",
        ["nour"],
        [say("karim", "العربية عطلت، I'm so sorry", "rtl")],
        "Sunday. Rain. Plans: cancelled.",
      ),
      panel(
        1,
        "desk",
        "Nour at her desk with a textbook open while Mishmish sleeps stretched across her notebook.",
        ["nour", "mishmish"],
        [say("nour", "Mishmish, those are my notes.", "ltr")],
        "Attempted: studying.",
      ),
      panel(
        2,
        "home",
        "Teta Samia and Nour on the sofa with bowls of lentil soup, an old black-and-white film on the TV.",
        ["teta", "nour"],
        [say("teta", "استني، دلوقتي هيقولها", "rtl")],
        "Teta knows every line.",
      ),
      panel(
        3,
        "home",
        "Night: Nour wrapped in a blanket by the rainy window, Mishmish curled up on her lap.",
        ["nour", "mishmish"],
        [say("nour", "Grey، بس مش وحش.", "ltr")],
        "Not a bad day. Just a grey one.",
      ),
    ],
  },
  {
    id: "sample",
    date: "2026-10-29",
    title: "The bus that never came",
    transcript:
      "الصبح كنت واقفة في المحطة من 7:40، already late. والباص ما جاش. يلا يا باص، any minute now… لحد الساعة 8:15 وبقت personal خلاص. Karim كلمني وقال اركبي معايا أنا جاي، ووصّلني. And in the evening we got shawarma, so worst morning, best shawarma.",
    languages: MIXED_AR,
    mood: "cloudy",
    heavy: false,
    safety: "ok",
    sample: true,
    createdAt: "2026-10-29T20:15:00.000Z",
    panels: [
      panel(
        0,
        "street",
        "Nour at a bus stop on a grey morning, checking the time on her phone, tote bag slipping off her shoulder.",
        ["nour"],
        [say("nour", "يلا يا باص… any minute now", "rtl")],
        "7:40 am. Already late.",
      ),
      panel(
        1,
        "street",
        "Same bus stop, Nour glaring down the empty road with her arms crossed.",
        ["nour"],
        [say("nour", "OK, now it's personal.", "ltr")],
        "8:15 am.",
      ),
      panel(
        2,
        "street",
        "Karim pulls up to the bus stop in a small dusty car, leaning out of the window.",
        ["karim", "nour"],
        [say("karim", "اركبي معايا، أنا جاي", "rtl")],
      ),
      panel(
        3,
        "rooftop",
        "Evening on the rooftop: Nour and Karim with shawarma wraps, the bus stop tiny in the distance.",
        ["nour", "karim"],
        [say("nour", "Worst morning. Best shawarma.", "ltr")],
        "Evening.",
      ),
    ],
  },
];

/** The heavy sample day's check-in questions, used as the example card. */
export const sampleCheckInQuestions = DEADLINE_QUESTIONS;

export function getSampleDay(id: string): Day | undefined {
  return sampleDays.find((day) => day.id === id);
}
