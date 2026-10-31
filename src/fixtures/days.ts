import type { SceneKey } from "@/art/manifest";
import type { Beat, Day, DialogueLine, LanguageMix, Panel, Shot, TextDir } from "@/lib/types";

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
  caption: string | undefined,
  shot: Shot,
  beat: Beat,
): Panel {
  return {
    index,
    scene,
    caption,
    dialogue,
    characterIds,
    shot,
    beat,
    image: { kind: "art", path: `scenes.${background}` },
    consistency: { checked: false, driftedCharacterIds: [], fixedCharacterIds: [], beforeImage: null },
  };
}

/** Gentle reflection only: no advice, no diagnosis, no scores. */
const DEADLINE_QUESTIONS = [
  "What took the most out of you today?",
  "Was there a moment today, even a small one, that felt lighter?",
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
        "establishing",
        "setup",
      ),
      panel(
        1,
        "home",
        "Nour, fork in hand, stares at Teta across the half-eaten cake in disbelief.",
        ["nour", "teta"],
        [say("nour", "A test? We ate all of it.", "ltr")],
        undefined,
        "closeup",
        "build",
      ),
      panel(
        2,
        "home",
        "Under the table, between everyone's feet, Mishmish eyes a crumb of cake on the floor.",
        ["mishmish"],
        [say("mishmish", "Mrrp.", "ltr")],
        "Meanwhile, under the table.",
        "detail",
        "turn",
      ),
      panel(
        3,
        "rooftop",
        "Nour alone on the rooftop at dusk with a slice of cake on a plate, the city lights coming on below.",
        ["nour"],
        [say("nour", "Best day this month, honestly.", "ltr")],
        "Later.",
        "splash",
        "climax",
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
        [say("nour", "I won't make it, مش هلحق", "ltr")],
        "Three tabs. Two deadlines. One me.",
        "wide",
        "setup",
      ),
      panel(
        1,
        "desk",
        "Teta Samia peeks around the bedroom door holding a plate, Nour still facing the screen.",
        ["teta", "nour"],
        [say("teta", "كلتي حاجة؟", "rtl")],
        undefined,
        "medium",
        "build",
      ),
      panel(
        2,
        "desk",
        "Close on the laptop: slide four of the presentation, a cold glass of tea beside it.",
        ["nour"],
        [say("nour", "Still on slide four.", "ltr")],
        "9:40 pm.",
        "detail",
        "turn",
      ),
      panel(
        3,
        "desk",
        "Nour slumped back in her chair, laptop showing 'Sent', the room dark except for the screen.",
        ["nour"],
        [say("nour", "Sent. Nobody talk to me.", "ltr")],
        "11:52 pm.",
        "splash",
        "climax",
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
        "wide",
        "setup",
      ),
      panel(
        1,
        "rooftop",
        "Nour leans on the rooftop ledge holding her tea, grinning at Karim.",
        ["nour", "karim"],
        [say("nour", "We should do this every Thursday.", "ltr")],
        undefined,
        "medium",
        "build",
      ),
      panel(
        2,
        "rooftop",
        "Wide shot: two small figures on the rooftop raising their tea glasses, the sun low behind the water tanks.",
        ["nour", "karim"],
        [],
        "We won't.",
        "splash",
        "climax",
      ),
      panel(
        3,
        "rooftop",
        "Karim heading for the stairs, looking back over his shoulder with a wave.",
        ["karim", "nour"],
        [say("karim", "Same time next week?", "ltr")],
        "But still.",
        "medium",
        "release",
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
        "wide",
        "setup",
      ),
      panel(
        1,
        "desk",
        "Nour at her desk with a textbook open while Mishmish sleeps stretched across her notebook.",
        ["nour", "mishmish"],
        [say("nour", "Mishmish, those are my notes.", "ltr")],
        "Attempted: studying.",
        "medium",
        "build",
      ),
      panel(
        2,
        "home",
        "Teta Samia and Nour on the sofa with bowls of lentil soup, an old black-and-white film on the TV.",
        ["teta", "nour"],
        [say("teta", "استني، دلوقتي هيقولها", "rtl")],
        "Teta knows every line.",
        "splash",
        "climax",
      ),
      panel(
        3,
        "home",
        "Night: Nour wrapped in a blanket by the rainy window, Mishmish curled up on her lap.",
        ["nour", "mishmish"],
        [say("nour", "Grey، بس مش وحش.", "ltr")],
        "Not a bad day. Just a grey one.",
        "closeup",
        "release",
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
        "establishing",
        "setup",
      ),
      panel(
        1,
        "street",
        "Same bus stop, Nour glaring down the empty road with her arms crossed.",
        ["nour"],
        [say("nour", "OK, now it's personal.", "ltr")],
        "8:15 am.",
        "closeup",
        "build",
      ),
      panel(
        2,
        "street",
        "Karim pulls up to the bus stop in a small dusty car, leaning out of the window.",
        ["karim", "nour"],
        [say("karim", "اركبي معايا، أنا جاي", "rtl")],
        undefined,
        "splash",
        "climax",
      ),
      panel(
        3,
        "rooftop",
        "Evening on the rooftop: Nour and Karim with shawarma wraps, the bus stop tiny in the distance.",
        ["nour", "karim"],
        [say("nour", "Worst morning. Best shawarma.", "ltr")],
        "Evening.",
        "wide",
        "release",
      ),
    ],
  },
];

/** The heavy sample day's check-in questions, used as the example card. */
export const sampleCheckInQuestions = DEADLINE_QUESTIONS;

export function getSampleDay(id: string): Day | undefined {
  return sampleDays.find((day) => day.id === id);
}

/**
 * First-person narration for each sample day's panels, in the speaker's own
 * language mix, the way the storyteller writes it for Narrated and Both
 * comics. The mock script model uses these; the sample pages keep their bubbles.
 */
export const sampleNarration: Record<string, string[]> = {
  "sample-teta": [
    "تيتا قررت إن الكيكة اللي فاتت كانت «تجربة». The second cake arrived like a verdict.",
    "I looked at her, then at the empty plate from last week, and decided not to argue with a legend.",
    "Under the table, Mishmish kept his own quiet watch, waiting for the world to drop a crumb.",
    "Later, alone on the roof with the last slice, the city lit up below me one window at a time.",
  ],
  "sample-deadline": [
    "Three tabs, two deadlines, and a clock that seemed to run faster every time I looked at it.",
    "تيتا فتحت الباب بهدوء، and I realised I hadn't eaten a thing since morning.",
    "At 9:40 I was still on slide four, the tea beside me long gone cold.",
    "بعتّهم الساعة 11:52. Then I just sat there in the blue light of the screen, completely empty.",
  ],
  "sample-rooftop": [
    "Karim عدّى عليا بعد الشغل, and the roof caught the last gold of the day just for us.",
    "Tea in thin glasses, the city humming below, and for once nobody was in a hurry.",
    "We promised each other every Thursday. We both knew we wouldn't keep it.",
    "But when he turned at the stairs and asked about next week, I said yes before he finished.",
  ],
  "sample-sunday": [
    "The rain started before I woke up, and by noon our plans had quietly drowned with it.",
    "حاولت أذاكر, but Mishmish had claimed my notebook and would not be moved.",
    "تيتا عملت شوربة عدس, and she mouthed every line of the old film a second before the actors did.",
    "Not a bad day. Just a grey one, wrapped in a blanket, with a warm cat on my lap.",
  ],
  sample: [
    "The morning was grey and the bus was late, which, honestly, was nothing new.",
    "Twenty minutes later the road was still empty, and so was my patience.",
    "Then a small dusty car rolled up, and Karim leaned out like he'd planned the whole thing.",
    "By evening the bus stop was a tiny dot from the rooftop, and the shawarma tasted like a win.",
  ],
};
